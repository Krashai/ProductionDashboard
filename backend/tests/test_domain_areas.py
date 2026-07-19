"""app.domain.areas must stay a byte-for-byte semantic mirror of
src/lib/areas.ts (id/type/metric ids/labels/units/decimals) — the whole
point of this module is that the WS payload matches the frontend's
AreaDefinition without any adapter-layer guessing.
"""
from app.domain.areas import AREA_DEFINITIONS, AREA_IDS, METRIC_TO_AREA


def test_exactly_five_areas():
    assert len(AREA_DEFINITIONS) == 5


def test_area_ids_match_frontend_areas_ts():
    assert AREA_IDS == {
        "chlodnia-1",
        "chlodnia-2",
        "chlodnia-3",
        "sprezarkownia",
        "energia-elektryczna",
    }


def test_cooling_area_has_three_metrics_with_expected_ids_units_decimals():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "chlodnia-1")
    metric_ids = {m["id"] for m in area["metrics"]}
    assert metric_ids == {
        "chlodnia-1-temp",
        "chlodnia-1-pressure",
        "chlodnia-1-level",
    }
    temp = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-temp")
    assert temp["unit"] == "°C"
    assert temp["decimals"] == 1
    level = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-level")
    assert level["unit"] == "cm"
    assert level["decimals"] == 0


def test_compressor_area_has_two_pressure_metrics():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "sprezarkownia")
    metric_ids = {m["id"] for m in area["metrics"]}
    assert metric_ids == {"sprezarkownia-drums", "sprezarkownia-aluminium"}
    assert all(m["unit"] == "bar" for m in area["metrics"])


def test_power_area_has_six_metrics_two_per_substation():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "energia-elektryczna")
    metric_ids = {m["id"] for m in area["metrics"]}
    assert metric_ids == {
        "trafostacja-1-active",
        "trafostacja-1-apparent",
        "trafostacja-2-active",
        "trafostacja-2-apparent",
        "trafostacja-3-active",
        "trafostacja-3-apparent",
    }


def test_metric_to_area_reverse_lookup_covers_every_metric():
    total_metrics = sum(len(a["metrics"]) for a in AREA_DEFINITIONS)
    assert len(METRIC_TO_AREA) == total_metrics
    assert METRIC_TO_AREA["chlodnia-2-temp"] == "chlodnia-2"
    assert METRIC_TO_AREA["trafostacja-3-apparent"] == "energia-elektryczna"


def test_cooling_areas_carry_max_cm_tank_scale():
    for area_id in ("chlodnia-1", "chlodnia-2", "chlodnia-3"):
        area = next(a for a in AREA_DEFINITIONS if a["id"] == area_id)
        assert area["max_cm"] == 250
