"""Alarm rules added in 2026-09: threshold hysteresis/delay, BOOL rules
with a configurable fault level, the implicit rule for catalog AWARIA
signals, and per-tag evaluation for the admin panel's live view."""
from app.plc.aggregator import build_area_payload, evaluate_tag_alarms
from app.plc.alarm_state import AlarmTracker

PLCS = [{"id": 1, "area_id": "chlodnia-1"}]


def _tag(tag_id, metric_id, tag_type, name=None, label="L"):
    return {"id": tag_id, "plc_id": 1, "name": name or metric_id, "type": tag_type,
            "metric_id": metric_id, "label": label, "unit": "", "decimals": 0}


def _snapshot(**values):
    return {1: {"online": True, "tag_values": values, "error": None}}


def _metric(payload, metric_id):
    area = next(a for a in payload if a["area_id"] == "chlodnia-1")
    return area["metrics"][metric_id]


class Clock:
    def __init__(self):
        self.now = 0.0

    def __call__(self):
        return self.now


# --- threshold hysteresis / delay ---------------------------------------

def _eval_threshold(tracker, value, **rule):
    tag = _tag(1, "chlodnia-1-pressure", "REAL")
    rules = [{"tag_id": 1, "min": None, "max": 9.0, "hysteresis": 0.0, "delay_s": 0.0, **rule}]
    return evaluate_tag_alarms(
        tags=[tag], threshold_rules=rules, bit_alarm_rules=[], bool_alarm_rules=[],
        live_snapshot=_snapshot(**{"chlodnia-1-pressure": value}), tracker=tracker,
    )[1]


def test_hysteresis_keeps_alarm_until_value_is_back_inside_the_band():
    tracker = AlarmTracker(clock=Clock())

    assert _eval_threshold(tracker, 9.1, hysteresis=0.5)[0] is True
    assert _eval_threshold(tracker, 8.9, hysteresis=0.5)[0] is True   # still above 9-0.5
    assert _eval_threshold(tracker, 8.4, hysteresis=0.5)[0] is False


def test_without_hysteresis_alarm_clears_as_soon_as_back_in_range():
    tracker = AlarmTracker(clock=Clock())

    assert _eval_threshold(tracker, 9.1)[0] is True
    assert _eval_threshold(tracker, 8.99)[0] is False


def test_threshold_delay_needs_a_sustained_breach():
    clock = Clock()
    tracker = AlarmTracker(clock=clock)

    assert _eval_threshold(tracker, 9.5, delay_s=3)[0] is False
    clock.now = 3
    alarm, description = _eval_threshold(tracker, 9.5, delay_s=3)
    assert alarm is True
    assert description == "Powyżej maksimum (9.0)"


# --- BOOL rules -----------------------------------------------------------

def _payload_with_bool(value, bool_rules, metric_id="chlodnia-1-v101-awaria"):
    return build_area_payload(
        plcs=PLCS, tags=[_tag(5, metric_id, "BOOL")], threshold_rules=[], bit_alarm_rules=[],
        bool_alarm_rules=bool_rules, live_snapshot=_snapshot(**{metric_id: value}),
    )


def test_awaria_signal_without_a_rule_alarms_on_true_by_default():
    assert _metric(_payload_with_bool(1, []), "chlodnia-1-v101-awaria")["alarm"] is True
    assert _metric(_payload_with_bool(0, []), "chlodnia-1-v101-awaria")["alarm"] is False


def test_awaria_can_be_configured_to_alarm_on_false():
    rule = [{"tag_id": 5, "active_value": 0, "description": "Brak sygnału gotowości", "delay_s": 0}]

    on_false = _metric(_payload_with_bool(0, rule), "chlodnia-1-v101-awaria")
    on_true = _metric(_payload_with_bool(1, rule), "chlodnia-1-v101-awaria")

    assert on_false["alarm"] is True
    assert on_false["alarm_description"] == "Brak sygnału gotowości"
    assert on_true["alarm"] is False


def test_praca_signal_has_no_implicit_alarm():
    payload = _payload_with_bool(1, [], metric_id="chlodnia-1-v101-praca")
    assert _metric(payload, "chlodnia-1-v101-praca")["alarm"] is False


def test_offline_awaria_signal_is_not_an_alarm():
    payload = build_area_payload(
        plcs=PLCS, tags=[_tag(5, "chlodnia-1-v101-awaria", "BOOL")], threshold_rules=[],
        bit_alarm_rules=[], bool_alarm_rules=[], live_snapshot={},
    )
    assert _metric(payload, "chlodnia-1-v101-awaria")["alarm"] is False


# --- per-tag evaluation for the admin live view ---------------------------

def test_evaluate_tag_alarms_covers_diagnostic_tags_too():
    word = _tag(7, "chlodnia-1-diag-aw1", "WORD", name="slowo_awarii")
    bits = [{"tag_id": 7, "bit_index": 0, "description": "Przegrzanie"},
            {"tag_id": 7, "bit_index": 2, "description": "Brak przepływu"}]

    result = evaluate_tag_alarms(
        tags=[word], threshold_rules=[], bit_alarm_rules=bits, bool_alarm_rules=[],
        live_snapshot=_snapshot(slowo_awarii=0b101),
    )

    assert result[7] == (True, "Przegrzanie; Brak przepływu")


def test_build_area_payload_still_accepts_the_old_call_shape():
    payload = build_area_payload(
        plcs=[], tags=[], threshold_rules=[], bit_alarm_rules=[], live_snapshot={}
    )
    assert len(payload) == 5
