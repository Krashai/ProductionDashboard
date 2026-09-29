"""Which alarm rule kinds make sense for which S7 tag type.

Three kinds exist, one per kind of physical signal:
  - "threshold" — an analog/numeric value compared against min/max,
  - "bool"      — a single BOOL signal (e.g. an AWARIA bit) that raises an
                  alarm when it equals a configured level (TRUE or FALSE),
  - "bits"      — an integer status/fault word where individual bits each
                  carry their own alarm description.

Enforced by the API (app.api.alarm_rules and the per-kind CRUD routers) so
a rule that could never fire — bit 20 on a BYTE, a bit alarm on a REAL,
a min/max on a BOOL — is rejected when saved instead of silently doing
nothing on the wallboard.
"""
from __future__ import annotations

from app.domain.areas import AREA_DEFINITIONS

_BIT_WIDTHS: dict[str, int] = {"BYTE": 8, "INT": 16, "WORD": 16, "DINT": 32}
_THRESHOLD_TYPES: frozenset[str] = frozenset({"REAL", "INT", "DINT", "WORD", "BYTE"})

ALARM_KINDS: tuple[str, ...] = ("threshold", "bool", "bits")


def bit_width(tag_type: str) -> int | None:
    """Number of addressable alarm bits in an integer tag, None otherwise."""
    return _BIT_WIDTHS.get(tag_type)


def allowed_alarm_kinds(tag_type: str) -> set[str]:
    kinds: set[str] = set()
    if tag_type in _THRESHOLD_TYPES:
        kinds.add("threshold")
    if tag_type == "BOOL":
        kinds.add("bool")
    if tag_type in _BIT_WIDTHS:
        kinds.add("bits")
    return kinds


_KIND_NAMES = {"threshold": "Próg min/max", "bool": "Alarm dwustanowy", "bits": "Alarmy bitowe"}


def rule_incompatibility(kind: str, tag_type: str, bit_index: int | None = None) -> str | None:
    """Polish, operator-facing reason why `kind` cannot apply to a tag of
    `tag_type` — or None if it can."""
    if kind not in allowed_alarm_kinds(tag_type):
        return f"{_KIND_NAMES.get(kind, kind)} nie pasuje do zmiennej typu {tag_type}."
    if kind == "bits" and bit_index is not None:
        width = _BIT_WIDTHS[tag_type]
        if not 0 <= bit_index < width:
            return f"Zmienna typu {tag_type} ma bity 0–{width - 1}, a wybrano bit {bit_index}."
    return None


def _collect_awaria_metric_ids() -> frozenset[str]:
    ids: set[str] = set()
    for area in AREA_DEFINITIONS:
        for group in area.get("device_groups", []):
            for device in group["devices"]:
                awaria = device["metric_ids"].get("awaria")
                if awaria:
                    ids.update(awaria if isinstance(awaria, list) else [awaria])
    return frozenset(ids)


# Device fault signals from the catalog. A tag bound to one of these gets an
# implicit "alarm when TRUE" rule unless the operator configured an explicit
# BoolAlarmRule (e.g. to make FALSE the fault level) — see
# app.plc.aggregator. That keeps the device tile, the alarm bar and the nav
# alarm dot all driven by the same backend `alarm` flag.
AWARIA_METRIC_IDS: frozenset[str] = _collect_awaria_metric_ids()
