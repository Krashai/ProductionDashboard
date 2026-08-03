"""Ad-hoc, one-off PLC address probing for the admin panel's "test this
address before saving it as a Tag" affordance
(VariableAssignmentWizard.md §5.1).

Deliberately independent of PollingSupervisor/PLCWorker: opens its own
short-lived snap7 client, does exactly one connect + one db_read, and
always disconnects in a ``finally`` block — never touches LiveStore or
any already-running per-PLC worker thread/connection.
"""
from __future__ import annotations

from typing import Any

from app.plc.decode import decode_tag_value
from app.plc.worker import (
    CONNECT_TIMEOUT_S,
    READ_TIMEOUT_S,
    ClientFactory,
    Probe,
    _default_client_factory,
    _default_tcp_probe,
    _tag_width,
    _tighten_read_timeout,
)


class ProbeConnectError(Exception):
    """Raised when the short-lived probe connection cannot be established."""


class ProbeReadError(Exception):
    """Raised once connected, when the read or decode step fails (bad
    offset/type, decode error, communication failure mid-read, ...)."""


def _tighten_connect_timeout(client: Any, timeout_s: float = CONNECT_TIMEOUT_S) -> None:
    """Best-effort, secondary mirror of ``worker._tighten_read_timeout``
    for the connect phase: lowers snap7's low-level ping/connect timeout
    so an unreachable PLC fails within ``timeout_s`` seconds rather than
    hanging on the library's own (much longer) default. Same try/except
    discipline — never fatal to the connect attempt itself.

    This is NOT the primary fail-fast mechanism — ``Client.set_param``
    doesn't exist on the installed ``python-snap7==3.1.0`` build (a pure
    -Python rewrite), so against a real client this silently no-ops and
    ``client.connect()`` would otherwise fall through to snap7's own
    hardcoded ~5s default. The actual guarantee comes from the bare-TCP
    ``probe`` call in ``probe_tag_value`` below (the same
    ``_default_tcp_probe`` used by ``PLCWorker``), which runs first and
    uses a plain ``socket`` with a real, honored timeout. Kept here only
    as harmless defense-in-depth for snap7 builds that do expose it.
    """
    try:
        from snap7.type import Parameter

        client.set_param(Parameter.PingTimeout, int(timeout_s * 1000))
    except Exception:
        pass


def probe_tag_value(
    plc: dict,
    db: int,
    offset: int,
    bit: int,
    tag_type: str,
    client_factory: ClientFactory = _default_client_factory,
    probe: Probe = _default_tcp_probe,
) -> Any:
    """Connect to ``plc``, read exactly the bytes needed for ``tag_type``
    at ``db``/``offset``, decode it, and disconnect — always, even on
    error.

    ``probe`` runs a bare, bounded TCP reachability check against the S7
    port *before* ``client.connect()`` — the same fail-fast mechanism
    ``PLCWorker`` uses (see its module docstring, HIGH #B1) — so an
    unreachable/blackholed PLC fails in ~``CONNECT_TIMEOUT_S`` seconds
    instead of snap7's own much longer internal timeout. Injectable so
    tests never attempt a real socket connection.

    Raises:
        ProbeConnectError: the pre-connect probe or the connect step
            failed.
        ProbeReadError: connect succeeded but db_read/decode failed
            (includes app.plc.decode.UnsupportedTagTypeError for an
            invalid tag_type — though the API layer's Pydantic schema
            already rejects that before this is ever called).
    """
    client = client_factory()
    try:
        try:
            probe(plc["ip"], CONNECT_TIMEOUT_S)
            _tighten_connect_timeout(client, CONNECT_TIMEOUT_S)
            client.connect(plc["ip"], plc["rack"], plc["slot"])
        except Exception as exc:
            raise ProbeConnectError(str(exc)) from exc

        try:
            _tighten_read_timeout(client, READ_TIMEOUT_S)
            width = _tag_width({"type": tag_type})
            raw = client.db_read(db, offset, width)
            return decode_tag_value(raw, 0, tag_type, bit)
        except Exception as exc:
            raise ProbeReadError(str(exc)) from exc
    finally:
        try:
            client.disconnect()
        except Exception:
            pass
