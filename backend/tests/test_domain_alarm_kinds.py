"""Which alarm kinds fit which tag type (F5 in the 2026-09-29 admin-panel
analysis): bit alarms used to accept bit 0-31 on any type, so bit 20 on a
BYTE — or a bit alarm on a REAL — saved fine and silently never fired."""
import pytest

from app.domain.alarm_kinds import (
    AWARIA_METRIC_IDS,
    allowed_alarm_kinds,
    bit_width,
    rule_incompatibility,
)
from app.domain.areas import AREA_DEFINITIONS


@pytest.mark.parametrize(
    "tag_type,width",
    [("BYTE", 8), ("INT", 16), ("WORD", 16), ("DINT", 32), ("REAL", None), ("BOOL", None), ("STRING", None)],
)
def test_bit_width_follows_the_s7_type(tag_type, width):
    assert bit_width(tag_type) == width


def test_allowed_kinds_per_type():
    assert allowed_alarm_kinds("REAL") == {"threshold"}
    assert allowed_alarm_kinds("BOOL") == {"bool"}
    assert allowed_alarm_kinds("WORD") == {"threshold", "bits"}
    assert allowed_alarm_kinds("BYTE") == {"threshold", "bits"}
    assert allowed_alarm_kinds("STRING") == set()


def test_bit_alarm_on_real_is_rejected_with_a_polish_reason():
    reason = rule_incompatibility("bits", "REAL", bit_index=0)
    assert reason is not None and "REAL" in reason


def test_bit_beyond_type_width_is_rejected():
    assert rule_incompatibility("bits", "BYTE", bit_index=8) is not None
    assert rule_incompatibility("bits", "BYTE", bit_index=7) is None
    assert rule_incompatibility("bits", "WORD", bit_index=15) is None
    assert rule_incompatibility("bits", "WORD", bit_index=16) is not None


def test_threshold_on_bool_and_bool_rule_on_real_are_rejected():
    assert rule_incompatibility("threshold", "BOOL") is not None
    assert rule_incompatibility("bool", "REAL") is not None
    assert rule_incompatibility("bool", "BOOL") is None


def test_awaria_metric_ids_cover_every_device_fault_signal_in_the_catalog():
    expected = set()
    for area in AREA_DEFINITIONS:
        for group in area.get("device_groups", []):
            for device in group["devices"]:
                awaria = device["metric_ids"].get("awaria")
                if awaria:
                    expected.update(awaria if isinstance(awaria, list) else [awaria])
    assert expected, "catalog should define at least one AWARIA signal"
    assert AWARIA_METRIC_IDS == expected
    assert "chlodnia-1-v101-awaria" in AWARIA_METRIC_IDS
