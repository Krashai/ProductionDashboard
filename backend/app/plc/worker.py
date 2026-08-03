"""One background thread per PLC, polling tag values over S7 and
publishing them into a shared LiveStore.

Pattern adapted from ProductionMonitor's gateway/backend/app/plc/worker.py
(thread + python-snap7 + publish-on-change-ish poll loop), rewritten with
two structural differences:

1. Dependency-injected ``client_factory`` instead of hardcoding
   ``snap7.client.Client()`` in ``__init__``. This lets tests exercise the
   full poll cycle (connect / read / decode / error handling) against a
   plain ``MagicMock`` without a real libsnap7.so on the machine — there
   is no physical PLC available in this dev/CI environment.
2. No direct WS broadcast from inside the worker thread. The gateway
   pattern calls `asyncio.run_coroutine_threadsafe` after every cycle;
   here, 8 workers run independently and just write into `LiveStore`
   (thread-safe), and a single asyncio task in app.main reads that store
   on its own ~1s cadence to build and broadcast the area-grouped
   payload. This avoids 8 threads racing to schedule coroutines on the
   loop and keeps broadcast cadence decoupled from each PLC's own poll
   timing/latency.

Timeouts (HIGH #B1): ``python-snap7==3.1.0`` is a pure-Python rewrite.
``Client.connect()`` hardcodes a 5s ISO-TCP timeout via
``socket.settimeout``, and its internal ISO-connect step can block for a
further ~5s — up to ~10s worst case against an unreachable or
blackholed host, longer than ``supervisor.py``'s ``join(timeout=6.0)``,
which is how a stuck connect attempt could leak a worker thread past
``stop()``. To fail fast, ``_connect_if_needed`` runs a bare TCP probe
(``probe``, injectable for tests) against port 102 with a short
``CONNECT_TIMEOUT_S`` *before* ever calling ``client.connect()`` — an
unreachable host now fails in ~2s instead of ~10s. After a successful
connect, ``_tighten_read_timeout`` best-effort tightens the read timeout
too (``READ_TIMEOUT_S``), since different python-snap7 builds expose
different internals for this and it must never raise if the attribute
path isn't present on the installed version.
"""
from __future__ import annotations

import logging
import socket
import threading
import time
from typing import Any, Callable

from app.plc.decode import decode_tag_value
from app.plc.live_store import LiveStore

ClientFactory = Callable[[], Any]
Probe = Callable[[str, float], None]

logger = logging.getLogger(__name__)

# HIGH #B1: fail fast on an unreachable/blackholed PLC host rather than
# waiting on snap7's own much longer internal timeouts (see module
# docstring). CONNECT_TIMEOUT_S bounds the pre-connect TCP probe;
# READ_TIMEOUT_S is applied (best-effort) to the connection after a
# successful connect so a PLC that stops responding mid-session doesn't
# block a read for as long as snap7's own default would.
CONNECT_TIMEOUT_S = 2.0
READ_TIMEOUT_S = 3.0

_S7_TCP_PORT = 102

_FIXED_TYPE_WIDTHS = {
    "BOOL": 1,
    "BYTE": 1,
    "WORD": 2,
    "INT": 2,
    "DINT": 4,
    "REAL": 4,
}
# S7 STRING wire format: 2 header bytes (declared max length, actual
# length) + up to 254 data bytes = 256 bytes max. The Tag schema has no
# per-tag configurable max-length field, so this is a deliberately
# generous fixed upper bound rather than an exact size — db_read()-ing a
# few bytes more than a short string actually needs is harmless (just
# slightly more data transferred), but *under*-reading truncates the
# string or raises inside decode_tag_value. A `Tag.string_max_size`
# column would let this be tightened per-tag if read volume ever became
# a real concern; not needed at this scale (a handful of STRING tags
# across 8 PLCs).
_STRING_BUFFER_WIDTH = 256


def _default_tcp_probe(
    ip: str, timeout: float = CONNECT_TIMEOUT_S, port: int = _S7_TCP_PORT
) -> None:
    """Bare TCP-level reachability check: open and immediately close a
    plain socket to ``(ip, port)`` (102 = ISO-on-TCP, the S7 port),
    bounded by ``timeout`` seconds. Raises (``socket.timeout``/``OSError``)
    on failure. Used both as ``PLCWorker``'s default pre-connect ``probe``
    (called positionally as ``probe(ip, timeout)``, see ``Probe`` alias
    above) and, standalone, by any other caller wanting a fast, bounded
    "is anything even listening" check ahead of a slower S7-level connect
    (e.g. ``app.plc.probe``'s ad-hoc admin "test this address" endpoint).
    """
    with socket.create_connection((ip, port), timeout=timeout):
        pass


def _tighten_read_timeout(client: Any, timeout_s: float = READ_TIMEOUT_S) -> None:
    """Best-effort, module-level: lowers the snap7 client's own low-level
    receive timeout (snap7's library default is far longer than
    acceptable for an ad-hoc admin probe) so a read against an
    unresponsive-but-connected PLC fails within ``timeout_s`` seconds
    instead of hanging. Wrapped in try/except — not every snap7 client
    build necessarily supports every ``Parameter``, and failing to
    tighten the timeout must never be fatal to the read itself. Used by
    ``app.plc.probe``'s one-off reads; ``PLCWorker``'s own long-lived
    polling connection uses the more thorough ``PLCWorker._tighten_read_timeout``
    method below instead, which also falls back to a socket-level timeout
    for builds that don't expose ``set_param`` at all.
    """
    try:
        from snap7.type import Parameter

        client.set_param(Parameter.RecvTimeout, int(timeout_s * 1000))
    except Exception:
        pass


def _tag_width(tag: dict) -> int:
    """Bytes needed from `tag['offset']` to safely decode this tag —
    used to size the single db_read() covering every tag in a DB block.
    Previously hardcoded to a flat +4, which silently truncated (or threw
    inside decode) any STRING tag, since S7 strings can be up to 256
    bytes, not 4.
    """
    tag_type = tag["type"].upper()
    if tag_type == "STRING":
        return _STRING_BUFFER_WIDTH
    return _FIXED_TYPE_WIDTHS.get(tag_type, 4)


def _default_client_factory() -> Any:
    # Imported lazily so importing this module never requires a working
    # libsnap7.so to be present (e.g. in the test environment).
    import snap7.client

    return snap7.client.Client()


class PLCWorker(threading.Thread):
    def __init__(
        self,
        plc: dict,
        tags: list[dict],
        live_store: LiveStore,
        client_factory: ClientFactory = _default_client_factory,
        poll_interval: float = 1.0,
        probe: Probe = _default_tcp_probe,
    ) -> None:
        super().__init__(daemon=True, name=f"plc-worker-{plc['id']}")
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval
        self.probe = probe
        self.running = True
        self.client = client_factory()

    def _connect_if_needed(self) -> None:
        if self.client.get_connected():
            return
        self.probe(self.plc["ip"], CONNECT_TIMEOUT_S)
        self.client.connect(self.plc["ip"], self.plc["rack"], self.plc["slot"])
        self._tighten_read_timeout()

    def _tighten_read_timeout(self) -> None:
        """Best-effort only — never allowed to raise. Different
        python-snap7 builds expose different internals for adjusting the
        post-connect read timeout (some via ``Client.set_param``, some
        only reachable through ``Client.connection``'s underlying
        socket); each attempt is independently guarded since the
        installed version may expose neither, either, or both.
        """
        try:
            import snap7.type as snap7_type

            self.client.set_param(
                snap7_type.Parameter.RecvTimeout, int(READ_TIMEOUT_S * 1000)
            )
        except (AttributeError, Exception):
            pass
        try:
            self.client.connection.socket.settimeout(READ_TIMEOUT_S)
        except (AttributeError, Exception):
            pass

    def _tags_by_db(self) -> dict[int, list[dict]]:
        grouped: dict[int, list[dict]] = {}
        for tag in self.tags:
            grouped.setdefault(tag["db"], []).append(tag)
        return grouped

    def _read_all_tags(self) -> dict[str, Any]:
        values: dict[str, Any] = {}
        for db_num, tags in self._tags_by_db().items():
            max_offset = max(t["offset"] + _tag_width(t) for t in tags)
            raw = self.client.db_read(db_num, 0, max_offset)
            for tag in tags:
                try:
                    value = decode_tag_value(
                        raw, tag["offset"], tag["type"], tag.get("bit", 0)
                    )
                except Exception:
                    # One misconfigured tag (bad offset/type) must not
                    # take the rest of the cycle's valid tags down with
                    # it — log with full context and keep going.
                    logger.exception(
                        "PLCWorker %s: decode error for tag %r (type=%r offset=%s)",
                        self.plc["id"],
                        tag["name"],
                        tag["type"],
                        tag["offset"],
                    )
                    continue
                values[tag["name"]] = value
        return values

    def run_once(self) -> None:
        """Execute a single connect+read+publish cycle. Never raises —
        any failure is caught, logged, and reflected as an offline
        LiveStore entry, so the owning thread (daemon) can never die
        silently (the gateway's worker.py had exactly this bug pre-fix).

        MEDIUM #B3/B5: only a short, generic error code ever reaches
        LiveStore (and therefore /status and /ws) — the real exception
        (which could contain internal hostnames/paths) is logged via
        ``logger.exception`` with full context instead.

        HIGH #B1: every LiveStore write is guarded by ``self.running`` —
        a thread that has already been told to stop() must never write
        again, closing the race where a leaked/slow-to-stop worker keeps
        publishing after the supervisor has moved on.
        """
        try:
            self._connect_if_needed()
        except Exception:
            logger.exception(
                "PLCWorker %s: connect failed (ip=%s)",
                self.plc["id"],
                self.plc.get("ip"),
            )
            if not self.running:
                return
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=False, tag_values={}, error="connect_failed"
            )
            return

        try:
            values = self._read_all_tags()
        except Exception:
            logger.exception("PLCWorker %s: read cycle failed", self.plc["id"])
            try:
                self.client.disconnect()
            except Exception:
                pass
            if not self.running:
                return
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=False, tag_values={}, error="read_failed"
            )
            return

        if not self.running:
            return
        self.live_store.update_plc(
            plc_id=self.plc["id"], online=True, tag_values=values, error=None
        )

    def run(self) -> None:
        while self.running:
            start = time.time()
            try:
                self.run_once()
            except Exception:
                # Safety net: run_once already catches its own errors,
                # this only guards against a bug in run_once itself.
                logger.exception(
                    "PLCWorker %s: unexpected error in run_once", self.plc["id"]
                )
            elapsed = time.time() - start
            time.sleep(max(0.01, self.poll_interval - elapsed))

    def stop(self) -> None:
        self.running = False
        try:
            if self.client.get_connected():
                self.client.disconnect()
        except Exception:
            pass
