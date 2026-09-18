"""Decoding of raw S7 PLC byte buffers into Python values.

Ported/rewritten from the ProductionMonitor gateway pattern
(gateway/backend/app/plc/utils.py) with three deliberate deviations:

1. Adds WORD and BYTE, needed here because bit-alarm tags in this backend
   are typically "fault word" registers (WORD/BYTE) inspected bit-by-bit,
   which the original gateway never modeled.
2. Does NOT swallow decode errors into ``None``. The gateway's
   ``decode_tag_value`` catches every exception and prints+returns None,
   which hides configuration bugs (e.g. wrong offset for a DB) behind a
   silently-missing metric. Per this project's error-handling rule
   ("never silently swallow errors"), this function lets exceptions
   propagate; the PLC worker (the caller) is responsible for catching per
   -tag decode errors, logging them with full context, and marking that
   single tag as unavailable without killing the whole poll cycle.
3. Normalizes BOOL to int 0/1 rather than returning snap7's Python bool.
   Every value produced here is destined for a `value` field that the
   rest of the system (payload schema, threshold rules, the wallboard's
   device tiles) treats as a number; returning a bool made that contract
   silently false. See the BOOL branch below for the full rationale.
"""
from __future__ import annotations

from snap7.util import (
    get_real,
    get_int,
    get_dint,
    get_bool,
    get_string,
    get_word,
    get_byte,
)

SUPPORTED_TAG_TYPES = frozenset(
    {"REAL", "INT", "DINT", "BOOL", "STRING", "WORD", "BYTE"}
)


class UnsupportedTagTypeError(ValueError):
    """Raised when a Tag.type is not one of SUPPORTED_TAG_TYPES."""


def decode_tag_value(
    raw_data: bytearray, offset: int, tag_type: str, bit: int = 0
):
    """Decode a value out of ``raw_data`` at ``offset`` for ``tag_type``.

    Raises:
        UnsupportedTagTypeError: unknown tag_type.
        Exception: whatever the underlying snap7.util getter raises
            (e.g. index errors for an out-of-range offset) — propagated
            on purpose, see module docstring.
    """
    t_type = tag_type.upper()
    if t_type not in SUPPORTED_TAG_TYPES:
        raise UnsupportedTagTypeError(f"Unsupported tag type: {tag_type!r}")

    if t_type == "REAL":
        return get_real(raw_data, offset)
    if t_type == "INT":
        return get_int(raw_data, offset)
    if t_type == "DINT":
        return get_dint(raw_data, offset)
    if t_type == "BOOL":
        # S7 bits are addressed as byte.bit (e.g. DB1.DBX0.3).
        # `int(...)` is load-bearing, not cosmetic: snap7's get_bool returns a
        # Python bool, but the wire contract for a tag value is "number or
        # null" (see BackendMetric in src/lib/backend/payload.ts, and the
        # 0/1 promise in app.domain.areas). A bool serializes to JSON `true`,
        # which the frontend's runtime guard rejects — and because that guard
        # validates the whole STATE_UPDATE envelope, a single BOOL tag used to
        # blank the entire wallboard. Normalize here, at the one point where
        # the tag type is still known, so every consumer (PLCWorker polling
        # and the admin probe wizard alike) sees the same numeric contract.
        return int(get_bool(raw_data, offset, bit))
    if t_type == "STRING":
        return get_string(raw_data, offset)
    if t_type == "WORD":
        return get_word(raw_data, offset)
    if t_type == "BYTE":
        return get_byte(raw_data, offset)
    raise UnsupportedTagTypeError(f"Unsupported tag type: {tag_type!r}")  # pragma: no cover
