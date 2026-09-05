"""Builds the area-grouped payload broadcast over WS and served by
GET /status, per NewBackendPlan.md §4 (decision #4: WS payload is
area-oriented, not per-PLC, so the frontend's AreasDataAdapter needs no
extra aggregation step).

This module is a pure function over plain dicts (not ORM objects) on
purpose: it has zero DB/IO dependencies, which makes every alarm-
evaluation rule trivially unit-testable without a database or a running
event loop.
"""
from __future__ import annotations

from typing import Any

from app.domain.areas import AREA_DEFINITIONS

# The 9 power metrics (moc czynna/bierna/pozorna for each of 3 trafostacje)
# are polled from the PLC in raw Watts/VAr/VA, but MetricDefinition.unit for
# these advertises kW/kVAr/kVA (see app.domain.areas._power_area). Both the
# payload's displayed `value` and the ThresholdRule min/max comparison must
# agree on the same (scaled) number, so the conversion lives here, applied
# once, before either consumer sees the value — see _scale_metric_value.
# `reactive` (moc bierna) was added alongside active/apparent from the same
# power-meter register block and needs the identical raw->kilo scaling.
_POWER_SCALE_FACTOR = 1000.0
_POWER_METRIC_IDS: frozenset[str] = frozenset(
    f"trafostacja-{n}-{kind}" for n in (1, 2, 3) for kind in ("active", "apparent", "reactive")
)


def _tag_value(tag: dict, live_snapshot: dict[int, dict]) -> Any:
    """Raw reading for `tag` from the live PLC snapshot, before any unit
    scaling. Returns None if the tag's PLC is offline / not polled."""
    plc_state = live_snapshot.get(tag["plc_id"], {})
    return plc_state.get("tag_values", {}).get(tag["name"])


def _scale_metric_value(metric_id: str, value: Any) -> Any:
    """Convert a raw PLC reading into the unit advertised by
    MetricDefinition.unit, for the handful of metrics where they differ
    (currently just the 6 power metrics: raw Watts/VA -> kW/kVA).

    A None reading (tag not configured / PLC offline) is always passed
    through unchanged — never coerce a missing value into 0.0.
    """
    if value is None or metric_id not in _POWER_METRIC_IDS:
        return value
    return value / _POWER_SCALE_FACTOR


def _format_range(min_: float | None, max_: float | None) -> str:
    if min_ is not None and max_ is not None:
        return f"Poza zakresem ({min_}-{max_})"
    if min_ is not None:
        return f"Poniżej minimum ({min_})"
    return f"Powyżej maksimum ({max_})"


def _evaluate_threshold(value: Any, rule: dict | None) -> tuple[bool, str | None]:
    if rule is None or value is None:
        return False, None
    min_ = rule.get("min")
    max_ = rule.get("max")
    breached = (min_ is not None and value < min_) or (max_ is not None and value > max_)
    if not breached:
        return False, None
    return True, _format_range(min_, max_)


def _evaluate_bit_alarms(value: Any, rules: list[dict]) -> tuple[bool, str | None]:
    if value is None or not rules:
        return False, None
    active_descriptions = [
        rule["description"]
        for rule in rules
        if (int(value) >> rule["bit_index"]) & 1
    ]
    if not active_descriptions:
        return False, None
    return True, "; ".join(active_descriptions)


def build_area_payload(
    plcs: list[dict],
    tags: list[dict],
    threshold_rules: list[dict],
    bit_alarm_rules: list[dict],
    live_snapshot: dict[int, dict],
) -> list[dict]:
    """Return one entry per known UI area (always all 5, in a stable
    order), each with its metrics populated from whichever tags/PLCs are
    currently configured for that area_id.
    """
    plcs_by_area: dict[str, list[dict]] = {}
    plc_area_by_id: dict[int, str] = {}
    for plc in plcs:
        plcs_by_area.setdefault(plc["area_id"], []).append(plc)
        plc_area_by_id[plc["id"]] = plc["area_id"]

    threshold_by_tag_id: dict[int, dict] = {r["tag_id"]: r for r in threshold_rules}
    bit_alarms_by_tag_id: dict[int, list[dict]] = {}
    for rule in bit_alarm_rules:
        bit_alarms_by_tag_id.setdefault(rule["tag_id"], []).append(rule)

    # Every tag is looked at twice per area (once for `metrics`, once for
    # `alarms`) — memoize the alarm evaluation per tag id so a tag's
    # threshold/bit-alarm rules are only evaluated once per build.
    _alarm_cache: dict[int, tuple[bool, str | None]] = {}

    def _tag_alarm(tag: dict) -> tuple[bool, str | None]:
        cached = _alarm_cache.get(tag["id"])
        if cached is not None:
            return cached
        value = _scale_metric_value(tag["metric_id"], _tag_value(tag, live_snapshot))
        threshold_rule = threshold_by_tag_id.get(tag["id"])
        bit_rules = bit_alarms_by_tag_id.get(tag["id"], [])
        if threshold_rule is not None:
            result = _evaluate_threshold(value, threshold_rule)
        elif bit_rules:
            result = _evaluate_bit_alarms(value, bit_rules)
        else:
            result = (False, None)
        _alarm_cache[tag["id"]] = result
        return result

    result: list[dict] = []
    for area in AREA_DEFINITIONS:
        area_plcs = plcs_by_area.get(area["id"], [])
        area_online = bool(area_plcs) and all(
            live_snapshot.get(plc["id"], {}).get("online", False) for plc in area_plcs
        )

        # Tags scoped to THIS area's PLCs only — not a global metric_id
        # lookup across all tags. Defense in depth: app.api.tags already
        # rejects a tag whose metric_id names a different area than its
        # own PLC's area_id (see _assert_metric_id_matches_plc_area), but
        # scoping here too means even a bypass of that check (direct DB
        # edit, a bug, a future write path that forgets the check) can
        # never leak a value onto the wrong area's wallboard card — a
        # tag only ever contributes to the area its own PLC belongs to.
        tags_in_area = [t for t in tags if plc_area_by_id.get(t["plc_id"]) == area["id"]]
        tags_by_metric_id: dict[str, dict] = {t["metric_id"]: t for t in tags_in_area}

        # `metrics` is strictly the frozen areas.ts contract (always the
        # same known keys) — see app.domain.areas module docstring.
        metrics: dict[str, dict] = {}
        for metric_def in area["metrics"]:
            metric_id = metric_def["id"]
            tag = tags_by_metric_id.get(metric_id)

            value = None
            alarm = False
            alarm_description: str | None = None
            if tag is not None:
                value = _scale_metric_value(metric_id, _tag_value(tag, live_snapshot))
                alarm, alarm_description = _tag_alarm(tag)

            metrics[metric_id] = {
                "label": tag["label"] if tag else metric_def["label"],
                "unit": tag["unit"] if tag else metric_def["unit"],
                "decimals": tag["decimals"] if tag else metric_def["decimals"],
                "value": value,
                "alarm": alarm,
                "alarm_description": alarm_description,
            }

        # `alarms` is the free-form alarm bar (decision #7): every tag
        # belonging to a PLC in this area, whether or not its metric_id
        # is one of the 3 known ones, contributes an entry here if it is
        # currently in alarm. Fault-word/status-byte tags with bit-alarm
        # rules typically only ever appear here, never in `metrics`.
        alarms: list[dict] = []
        for tag in tags_in_area:
            alarm, alarm_description = _tag_alarm(tag)
            if alarm:
                alarms.append(
                    {
                        "tag_id": tag["id"],
                        "metric_id": tag["metric_id"],
                        "tag_name": tag["name"],
                        "label": tag["label"],
                        "description": alarm_description,
                    }
                )

        result.append(
            {
                "area_id": area["id"],
                "area_name": area["name"],
                "online": area_online,
                "metrics": metrics,
                "alarms": alarms,
            }
        )

    return result
