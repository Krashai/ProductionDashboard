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
"""
from __future__ import annotations

import threading
import time
import traceback
from typing import Any, Callable

from app.plc.decode import decode_tag_value
from app.plc.live_store import LiveStore

ClientFactory = Callable[[], Any]

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

# --- Timeouts for short-lived, ad-hoc PLC connections (app.plc.probe) ---
# PLCWorker's own long-lived polling connection deliberately does NOT use
# these: a worker that already has a connection to a known-good PLC would
# rather tolerate a slow/flaky cycle and retry than abandon it after a few
# seconds. A one-off admin "test this address before saving it" probe is
# exactly the opposite case — failing fast matters far more there than
# tolerating a slow link, since an operator is watching and waiting.
CONNECT_TIMEOUT_S = 3.0
READ_TIMEOUT_S = 3.0


def _default_tcp_probe(ip: str, port: int = 102, timeout: float = CONNECT_TIMEOUT_S) -> None:
    """Bare TCP-level reachability check: open and immediately close a
    plain socket to ``(ip, port)`` (102 = ISO-on-TCP, the S7 port),
    bounded by ``timeout`` seconds. Raises (``socket.timeout``/``OSError``)
    on failure. A standalone utility, not wired into PLCWorker's own
    connect path or into app.plc.probe's default flow (which only needs a
    mocked snap7 client in unit tests, never a real socket) — kept here,
    next to the timeout constants it shares, for any caller that wants a
    fast, bounded "is anything even listening" check ahead of a slower
    S7-level connect.
    """
    import socket

    with socket.create_connection((ip, port), timeout=timeout):
        pass


def _tighten_read_timeout(client: Any, timeout_s: float = READ_TIMEOUT_S) -> None:
    """Best-effort: lowers the snap7 client's own low-level receive
    timeout (snap7's library default is far longer than acceptable for an
    ad-hoc admin probe) so a read against an unresponsive-but-connected
    PLC fails within ``timeout_s`` seconds instead of hanging. Wrapped in
    try/except — not every snap7 client/build necessarily supports every
    ``Parameter``, and failing to tighten the timeout must never be fatal
    to the read itself.
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
    ) -> None:
        super().__init__(daemon=True, name=f"plc-worker-{plc['id']}")
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval
        self.running = True
        self.client = client_factory()

    def _connect_if_needed(self) -> None:
        if self.client.get_connected():
            return
        self.client.connect(self.plc["ip"], self.plc["rack"], self.plc["slot"])

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
                except Exception as exc:
                    # One misconfigured tag (bad offset/type) must not
                    # take the rest of the cycle's valid tags down with
                    # it — log with full context and keep going.
                    print(
                        f"PLCWorker {self.plc['id']}: decode error for tag "
                        f"{tag['name']!r} (type={tag['type']!r} offset={tag['offset']}): {exc}",
                        flush=True,
                    )
                    continue
                values[tag["name"]] = value
        return values

    def run_once(self) -> None:
        """Execute a single connect+read+publish cycle. Never raises —
        any failure is caught, logged, and reflected as an offline
        LiveStore entry, so the owning thread (daemon) can never die
        silently (the gateway's worker.py had exactly this bug pre-fix).
        """
        try:
            self._connect_if_needed()
        except Exception as exc:
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=False, tag_values={}, error=str(exc)
            )
            return

        try:
            values = self._read_all_tags()
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=True, tag_values=values, error=None
            )
        except Exception as exc:
            print(
                f"PLCWorker {self.plc['id']}: read cycle failed: {exc}", flush=True
            )
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=False, tag_values={}, error=str(exc)
            )

    def run(self) -> None:
        while self.running:
            start = time.time()
            try:
                self.run_once()
            except Exception:
                # Safety net: run_once already catches its own errors,
                # this only guards against a bug in run_once itself.
                traceback.print_exc()
            elapsed = time.time() - start
            time.sleep(max(0.01, self.poll_interval - elapsed))

    def stop(self) -> None:
        self.running = False
        try:
            if self.client.get_connected():
                self.client.disconnect()
        except Exception:
            pass
