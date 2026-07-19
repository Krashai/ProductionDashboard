"""app.plc.aggregator.build_area_payload — pure function turning
(plcs, tags, threshold_rules, bit_alarm_rules, live_snapshot) into the
area-grouped WS/`/status` payload shape from NewBackendPlan.md §4.
"""
from app.plc.aggregator import build_area_payload
from app.domain.areas import AREA_IDS


def test_payload_always_contains_all_five_known_areas_even_when_unconfigured():
    payload = build_area_payload(
        plcs=[], tags=[], threshold_rules=[], bit_alarm_rules=[], live_snapshot={}
    )
    assert {area["area_id"] for area in payload} == AREA_IDS
    assert len(payload) == 5


def test_area_with_no_plc_is_offline_with_no_metric_values():
    payload = build_area_payload(
        plcs=[], tags=[], threshold_rules=[], bit_alarm_rules=[], live_snapshot={}
    )
    chlodnia1 = next(a for a in payload if a["area_id"] == "chlodnia-1")
    assert chlodnia1["online"] is False
    temp = chlodnia1["metrics"]["chlodnia-1-temp"]
    assert temp["value"] is None
    assert temp["alarm"] is False
    assert temp["alarm_description"] is None
    assert temp["unit"] == "°C"
    assert temp["label"] == "Temperatura wody na halę"


def test_online_plc_value_flows_through_to_metric():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Temp_Hala",
            "metric_id": "chlodnia-1-temp",
            "label": "Temperatura wody na halę",
            "unit": "°C",
            "decimals": 1,
        }
    ]
    live_snapshot = {1: {"online": True, "tag_values": {"Temp_Hala": 4.7}, "error": None}}

    payload = build_area_payload(
        plcs=plcs, tags=tags, threshold_rules=[], bit_alarm_rules=[], live_snapshot=live_snapshot
    )
    chlodnia1 = next(a for a in payload if a["area_id"] == "chlodnia-1")
    assert chlodnia1["online"] is True
    assert chlodnia1["metrics"]["chlodnia-1-temp"]["value"] == 4.7
    assert chlodnia1["metrics"]["chlodnia-1-temp"]["alarm"] is False


def test_area_online_requires_all_contributing_plcs_online():
    plcs = [
        {"id": 1, "area_id": "energia-elektryczna"},
        {"id": 2, "area_id": "energia-elektryczna"},
    ]
    live_snapshot = {
        1: {"online": True, "tag_values": {}, "error": None},
        2: {"online": False, "tag_values": {}, "error": "timeout"},
    }
    payload = build_area_payload(
        plcs=plcs, tags=[], threshold_rules=[], bit_alarm_rules=[], live_snapshot=live_snapshot
    )
    power = next(a for a in payload if a["area_id"] == "energia-elektryczna")
    assert power["online"] is False


def test_threshold_rule_triggers_alarm_when_value_out_of_range():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Temp_Hala",
            "metric_id": "chlodnia-1-temp",
            "label": "Temp",
            "unit": "°C",
            "decimals": 1,
        }
    ]
    threshold_rules = [{"tag_id": 10, "min": 2.0, "max": 8.0}]
    live_snapshot = {1: {"online": True, "tag_values": {"Temp_Hala": 12.0}, "error": None}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=threshold_rules,
        bit_alarm_rules=[],
        live_snapshot=live_snapshot,
    )
    metric = next(a for a in payload if a["area_id"] == "chlodnia-1")["metrics"]["chlodnia-1-temp"]
    assert metric["alarm"] is True
    assert "8.0" in metric["alarm_description"] or "8" in metric["alarm_description"]


def test_threshold_rule_no_alarm_when_within_range():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Temp_Hala",
            "metric_id": "chlodnia-1-temp",
            "label": "Temp",
            "unit": "°C",
            "decimals": 1,
        }
    ]
    threshold_rules = [{"tag_id": 10, "min": 2.0, "max": 8.0}]
    live_snapshot = {1: {"online": True, "tag_values": {"Temp_Hala": 5.0}, "error": None}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=threshold_rules,
        bit_alarm_rules=[],
        live_snapshot=live_snapshot,
    )
    metric = next(a for a in payload if a["area_id"] == "chlodnia-1")["metrics"]["chlodnia-1-temp"]
    assert metric["alarm"] is False
    assert metric["alarm_description"] is None


def test_threshold_rule_one_sided_min_only():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Level",
            "metric_id": "chlodnia-1-level",
            "label": "Level",
            "unit": "cm",
            "decimals": 0,
        }
    ]
    threshold_rules = [{"tag_id": 10, "min": 20.0, "max": None}]
    live_snapshot = {1: {"online": True, "tag_values": {"Level": 5.0}, "error": None}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=threshold_rules,
        bit_alarm_rules=[],
        live_snapshot=live_snapshot,
    )
    metric = next(a for a in payload if a["area_id"] == "chlodnia-1")["metrics"]["chlodnia-1-level"]
    assert metric["alarm"] is True


def test_bit_alarm_tag_not_matching_a_known_metric_id_surfaces_on_the_alarm_bar():
    """Fault-word tags (WORD/BYTE 'status registers') usually don't map to
    one of the 3 frozen per-area metrics (temp/pressure/level) — per
    decision #7 in NewBackendPlan.md their description is meant for the
    UI's alarm bar, not a metric card. So build_area_payload exposes a
    separate `alarms` list, populated from every tag belonging to a PLC
    in that area (matched via plc_id -> plc.area_id), independent of
    whether the tag's metric_id happens to be one of the known ones.
    """
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 20,
            "plc_id": 1,
            "name": "Fault_Word",
            "metric_id": "chlodnia-1-faults",
            "label": "Alarmy",
            "unit": "",
            "decimals": 0,
        }
    ]
    bit_alarm_rules = [
        {"tag_id": 20, "bit_index": 0, "description": "Niski poziom wody"},
        {"tag_id": 20, "bit_index": 1, "description": "Awaria pompy"},
    ]
    # bit 0 set (value=1), bit 1 clear
    live_snapshot = {1: {"online": True, "tag_values": {"Fault_Word": 0b01}, "error": None}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=[],
        bit_alarm_rules=bit_alarm_rules,
        live_snapshot=live_snapshot,
    )
    chlodnia1 = next(a for a in payload if a["area_id"] == "chlodnia-1")
    # known metrics are unaffected — fault word isn't one of them
    assert "chlodnia-1-faults" not in chlodnia1["metrics"]
    assert chlodnia1["alarms"] == [
        {
            "tag_id": 20,
            "metric_id": "chlodnia-1-faults",
            "tag_name": "Fault_Word",
            "label": "Alarmy",
            "description": "Niski poziom wody",
        }
    ]


def test_bit_alarm_rule_no_active_bits_means_no_entry_on_alarm_bar():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 20,
            "plc_id": 1,
            "name": "Fault_Word",
            "metric_id": "chlodnia-1-faults",
            "label": "Alarmy",
            "unit": "",
            "decimals": 0,
        }
    ]
    bit_alarm_rules = [{"tag_id": 20, "bit_index": 0, "description": "Niski poziom wody"}]
    live_snapshot = {1: {"online": True, "tag_values": {"Fault_Word": 0}, "error": None}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=[],
        bit_alarm_rules=bit_alarm_rules,
        live_snapshot=live_snapshot,
    )
    chlodnia1 = next(a for a in payload if a["area_id"] == "chlodnia-1")
    assert chlodnia1["alarms"] == []


def test_threshold_breach_on_a_known_metric_also_appears_on_the_alarm_bar():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Temp_Hala",
            "metric_id": "chlodnia-1-temp",
            "label": "Temp",
            "unit": "°C",
            "decimals": 1,
        }
    ]
    threshold_rules = [{"tag_id": 10, "min": 2.0, "max": 8.0}]
    live_snapshot = {1: {"online": True, "tag_values": {"Temp_Hala": 12.0}, "error": None}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=threshold_rules,
        bit_alarm_rules=[],
        live_snapshot=live_snapshot,
    )
    chlodnia1 = next(a for a in payload if a["area_id"] == "chlodnia-1")
    assert len(chlodnia1["alarms"]) == 1
    assert chlodnia1["alarms"][0]["metric_id"] == "chlodnia-1-temp"


def test_missing_value_never_triggers_alarm():
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Temp_Hala",
            "metric_id": "chlodnia-1-temp",
            "label": "Temp",
            "unit": "°C",
            "decimals": 1,
        }
    ]
    threshold_rules = [{"tag_id": 10, "min": 2.0, "max": 8.0}]
    live_snapshot = {1: {"online": False, "tag_values": {}, "error": "offline"}}

    payload = build_area_payload(
        plcs=plcs,
        tags=tags,
        threshold_rules=threshold_rules,
        bit_alarm_rules=[],
        live_snapshot=live_snapshot,
    )
    metric = next(a for a in payload if a["area_id"] == "chlodnia-1")["metrics"]["chlodnia-1-temp"]
    assert metric["value"] is None
    assert metric["alarm"] is False


def test_tag_from_wrong_area_never_leaks_onto_a_different_areas_metric_card():
    """HIGH finding #5, defense-in-depth: app.api.tags is supposed to
    reject this combination at write time, but build_area_payload itself
    must ALSO refuse to let a tag whose owning PLC is in one area
    populate a metric_id belonging to a different area — e.g. if the row
    were ever written by a path that skips that check (direct DB edit, a
    future bug, a migration). Here a PLC in chlodnia-2 area is
    (incorrectly) given a tag with metric_id="chlodnia-1-temp"; that
    value must not appear on chlodnia-1's card.
    """
    plcs = [{"id": 1, "area_id": "chlodnia-2"}]
    tags = [
        {
            "id": 10,
            "plc_id": 1,
            "name": "Temp_Hala",
            "metric_id": "chlodnia-1-temp",  # mismatched on purpose
            "label": "Temp",
            "unit": "°C",
            "decimals": 1,
        }
    ]
    live_snapshot = {1: {"online": True, "tag_values": {"Temp_Hala": 99.9}, "error": None}}

    payload = build_area_payload(
        plcs=plcs, tags=tags, threshold_rules=[], bit_alarm_rules=[], live_snapshot=live_snapshot
    )

    chlodnia1 = next(a for a in payload if a["area_id"] == "chlodnia-1")
    assert chlodnia1["metrics"]["chlodnia-1-temp"]["value"] is None

    chlodnia2 = next(a for a in payload if a["area_id"] == "chlodnia-2")
    assert "chlodnia-1-temp" not in chlodnia2["metrics"]
