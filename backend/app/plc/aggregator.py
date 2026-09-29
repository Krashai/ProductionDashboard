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

import logging
from typing import Any

from app.domain.alarm_kinds import AWARIA_METRIC_IDS
from app.domain.areas import AREA_DEFINITIONS
from app.plc.alarm_state import AlarmTracker

logger = logging.getLogger(__name__)

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


def tag_display_value(tag: dict, live_snapshot: dict[int, dict]) -> Any:
    """The value exactly as the wallboard shows it (unit-scaled), or None."""
    return _scale_metric_value(tag["metric_id"], _tag_value(tag, live_snapshot))


def _format_range(min_: float | None, max_: float | None) -> str:
    if min_ is not None and max_ is not None:
        return f"Poza zakresem ({min_}-{max_})"
    if min_ is not None:
        return f"Poniżej minimum ({min_})"
    return f"Powyżej maksimum ({max_})"


def _threshold_breached(value: Any, rule: dict, was_active: bool) -> bool:
    """Strict limits to raise; limits pulled in by `hysteresis` to stay
    raised — so an alarm only clears once the value is back inside
    (min + h .. max - h), not the moment it touches the limit again."""
    min_ = rule.get("min")
    max_ = rule.get("max")
    band = (rule.get("hysteresis") or 0.0) if was_active else 0.0
    low = min_ + band if min_ is not None else None
    high = max_ - band if max_ is not None else None
    return (low is not None and value < low) or (high is not None and value > high)


def _active_bit_descriptions(value: Any, rules: list[dict]) -> list[str]:
    return [rule["description"] for rule in rules if (int(value) >> rule["bit_index"]) & 1]


# Catalog AWARIA signals without an explicit BoolAlarmRule behave as if they
# had this one — see app.domain.alarm_kinds.AWARIA_METRIC_IDS.
_IMPLICIT_AWARIA_RULE = {"active_value": 1, "description": None, "delay_s": 0.0}


def evaluate_tag_alarms(
    tags: list[dict],
    threshold_rules: list[dict],
    bit_alarm_rules: list[dict],
    bool_alarm_rules: list[dict],
    live_snapshot: dict[int, dict],
    tracker: AlarmTracker | None = None,
    commit: bool = True,
) -> dict[int, tuple[bool, str | None]]:
    """(alarm, description) for every tag, keyed by tag id.

    Without a `tracker`, evaluation is stateless: delays are ignored and
    hysteresis never applies (no memory of a previous alarm). The broadcast
    loop passes the app's tracker with commit=True; read-only views pass
    commit=False — see app.plc.alarm_state.
    """
    threshold_by_tag = {r["tag_id"]: r for r in threshold_rules}
    bool_by_tag = {r["tag_id"]: r for r in bool_alarm_rules}
    bits_by_tag: dict[int, list[dict]] = {}
    for rule in bit_alarm_rules:
        bits_by_tag.setdefault(rule["tag_id"], []).append(rule)

    def debounce(tag_id: int, raw: bool, delay_s: float) -> bool:
        if tracker is None:
            return raw
        return tracker.step(tag_id, raw, delay_s or 0.0, commit=commit)

    results: dict[int, tuple[bool, str | None]] = {}
    for tag in tags:
        tag_id = tag["id"]
        value = _scale_metric_value(tag["metric_id"], _tag_value(tag, live_snapshot))
        try:
            results[tag_id] = _evaluate_one(
                tag, value, threshold_by_tag.get(tag_id), bool_by_tag.get(tag_id),
                bits_by_tag.get(tag_id, []), tracker, debounce,
            )
        except Exception:
            # A rule that cannot be evaluated against this tag's value —
            # a STRING tag carrying a min/max threshold, say — used to
            # raise straight through build_area_payload and kill the
            # whole broadcast tick (broadcaster.broadcast_loop swallows
            # it), taking EVERY client offline after the 10s staleness
            # timeout. That is the same "one bad tag blanks the wallboard"
            # failure the BOOL fix removed, one layer down. One unusable
            # rule degrades to "no alarm" for that tag alone; every other
            # tag and area still broadcasts normally. Logged with full
            # context, never silent — see the error-handling rule in
            # app.plc.decode's module docstring.
            logger.exception(
                "Alarm rule evaluation failed for tag %r (id=%s, metric_id=%r, "
                "value_type=%s) — degrading this tag to 'no alarm'",
                tag["name"],
                tag_id,
                tag["metric_id"],
                type(value).__name__,
            )
            results[tag_id] = (False, None)
    return results


def _evaluate_one(tag, value, threshold_rule, bool_rule, bit_rules, tracker, debounce):
    tag_id = tag["id"]
    if bool_rule is None and not threshold_rule and not bit_rules:
        if tag["metric_id"] in AWARIA_METRIC_IDS and tag.get("type", "BOOL") == "BOOL":
            bool_rule = _IMPLICIT_AWARIA_RULE

    if value is None:
        # PLC offline / tag not polled: not a fault reading, and any
        # pending delay or active state starts over once data returns.
        debounce(tag_id, False, 0.0)
        return False, None

    if threshold_rule is not None:
        was_active = tracker.is_active(tag_id) if tracker else False
        raw = _threshold_breached(value, threshold_rule, was_active)
        alarm = debounce(tag_id, raw, threshold_rule.get("delay_s") or 0.0)
        return (True, _format_range(threshold_rule.get("min"), threshold_rule.get("max"))) if alarm else (False, None)

    if bool_rule is not None:
        raw = int(value) == int(bool_rule["active_value"])
        alarm = debounce(tag_id, raw, bool_rule.get("delay_s") or 0.0)
        return (True, bool_rule.get("description") or None) if alarm else (False, None)

    if bit_rules:
        descriptions = _active_bit_descriptions(value, bit_rules)
        alarm = debounce(tag_id, bool(descriptions), 0.0)
        return (True, "; ".join(descriptions)) if alarm else (False, None)

    return False, None


def build_area_payload(
    plcs: list[dict],
    tags: list[dict],
    threshold_rules: list[dict],
    bit_alarm_rules: list[dict],
    live_snapshot: dict[int, dict],
    bool_alarm_rules: list[dict] | None = None,
    tracker: AlarmTracker | None = None,
    commit: bool = True,
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

    # Evaluated once per build for every tag: each tag is looked at twice
    # per area (for `metrics` and for `alarms`), and with a tracker the
    # evaluation advances state, so it must happen exactly once per tick.
    tag_alarms = evaluate_tag_alarms(
        tags, threshold_rules, bit_alarm_rules, bool_alarm_rules or [], live_snapshot,
        tracker=tracker, commit=commit,
    )

    def _tag_alarm(tag: dict) -> tuple[bool, str | None]:
        return tag_alarms.get(tag["id"], (False, None))

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
