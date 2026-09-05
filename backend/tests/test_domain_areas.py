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


def test_cooling_area_has_three_analog_metrics_with_expected_ids_units_decimals():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "chlodnia-1")
    metric_ids = {m["id"] for m in area["metrics"]}
    assert {"chlodnia-1-temp", "chlodnia-1-pressure", "chlodnia-1-level"} <= metric_ids
    temp = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-temp")
    assert temp["unit"] == "°C"
    assert temp["decimals"] == 1
    level = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-level")
    assert level["unit"] == "cm"
    assert level["decimals"] == 0


def test_chlodnia_1_has_two_device_groups_sprezarki_and_agregaty_plus_pumps():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "chlodnia-1")
    group_ids = {g["id"] for g in area["device_groups"]}
    assert group_ids == {"sprezarki", "agregaty", "pompy"}

    sprezarki = next(g for g in area["device_groups"] if g["id"] == "sprezarki")
    assert {d["id"] for d in sprezarki["devices"]} == {"v101", "v201"}

    agregaty = next(g for g in area["device_groups"] if g["id"] == "agregaty")
    assert {d["id"] for d in agregaty["devices"]} == {"kwr125a", "kwr125b"}

    pompy = next(g for g in area["device_groups"] if g["id"] == "pompy")
    assert {d["id"] for d in pompy["devices"]} == {"pompa-1", "pompa-2", "pompa-3", "pompa-4", "pompa-5"}


def test_chlodnia_2_and_3_have_only_sprezarki_and_pompy_groups():
    for area_id in ("chlodnia-2", "chlodnia-3"):
        area = next(a for a in AREA_DEFINITIONS if a["id"] == area_id)
        group_ids = {g["id"] for g in area["device_groups"]}
        assert group_ids == {"sprezarki", "pompy"}
        sprezarki = next(g for g in area["device_groups"] if g["id"] == "sprezarki")
        assert {d["id"] for d in sprezarki["devices"]} == {"v301a", "v301b"}


def test_each_device_yields_praca_and_awaria_bool_metrics_with_unit_decimals_zero():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "chlodnia-1")
    v101 = next(d for g in area["device_groups"] for d in g["devices"] if d["id"] == "v101")
    assert v101["metric_ids"]["praca"] == "chlodnia-1-v101-praca"
    assert v101["metric_ids"]["awaria"] == "chlodnia-1-v101-awaria"
    assert "hz" not in v101["metric_ids"]

    praca_metric = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-v101-praca")
    assert praca_metric["unit"] == ""
    assert praca_metric["decimals"] == 0
    awaria_metric = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-v101-awaria")
    assert awaria_metric["unit"] == ""
    assert awaria_metric["decimals"] == 0


def test_pompa_1_has_extra_frequency_metric_in_hz_other_pumps_do_not():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "chlodnia-1")
    pompy = next(g for g in area["device_groups"] if g["id"] == "pompy")
    pompa1 = next(d for d in pompy["devices"] if d["id"] == "pompa-1")
    pompa2 = next(d for d in pompy["devices"] if d["id"] == "pompa-2")
    assert pompa1["metric_ids"]["hz"] == "chlodnia-1-pompa-1-hz"
    assert "hz" not in pompa2["metric_ids"]

    hz_metric = next(m for m in area["metrics"] if m["id"] == "chlodnia-1-pompa-1-hz")
    assert hz_metric["unit"] == "Hz"
    assert hz_metric["decimals"] == 1


def test_compressor_area_has_two_device_groups_magazyn_aluminium_and_magazyn_bebnow():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "sprezarkownia")
    group_ids = {g["id"] for g in area["device_groups"]}
    assert group_ids == {"magazyn-aluminium", "magazyn-bebnow"}

    aluminium = next(g for g in area["device_groups"] if g["id"] == "magazyn-aluminium")
    assert [d["id"] for d in aluminium["devices"]] == ["aluminium-1", "aluminium-2"]
    assert [d["label"] for d in aluminium["devices"]] == ["Sprężarka 1", "Sprężarka 2"]
    assert all("hz" not in d["metric_ids"] for d in aluminium["devices"])

    bebny = next(g for g in area["device_groups"] if g["id"] == "magazyn-bebnow")
    assert [d["id"] for d in bebny["devices"]] == ["bebny-1", "bebny-2"]
    assert [d["label"] for d in bebny["devices"]] == ["Sprężarka 1", "Sprężarka 2"]
    assert all("hz" not in d["metric_ids"] for d in bebny["devices"])


def test_compressor_area_device_metric_ids_are_namespaced_per_area_and_device():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "sprezarkownia")
    metric_ids = {m["id"] for m in area["metrics"]}
    assert "sprezarkownia-aluminium-1-praca" in metric_ids
    assert "sprezarkownia-bebny-1-praca" in metric_ids
    assert len(metric_ids) == len(area["metrics"])


def test_compressor_area_has_four_analog_pressure_flow_metrics():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "sprezarkownia")
    expected = {
        "sprezarkownia-magazyn-aluminium-cisnienie-zbiornik": ("bar", 2),
        "sprezarkownia-magazyn-bebnow-cisnienie-zbiornik": ("bar", 2),
        "sprezarkownia-magazyn-bebnow-cisnienie-kolektor": ("bar", 2),
        "sprezarkownia-magazyn-bebnow-przeplyw-powietrza": ("m³/min", 1),
    }
    for metric_id, (unit, decimals) in expected.items():
        metric = next(m for m in area["metrics"] if m["id"] == metric_id)
        assert metric["unit"] == unit
        assert metric["decimals"] == decimals


# Kolejność wg notatek źródłowych, mirror src/lib/__tests__/areas.test.ts:
# napięcia -> prądy -> moc (czynna, bierna, pozorna) -> temperatura -> THD.
def _power_metric_ids_for(n: int) -> list[str]:
    return [
        f"trafostacja-{n}-l1n",
        f"trafostacja-{n}-l2n",
        f"trafostacja-{n}-l3n",
        f"trafostacja-{n}-prad-l1",
        f"trafostacja-{n}-prad-l2",
        f"trafostacja-{n}-prad-l3",
        f"trafostacja-{n}-active",
        f"trafostacja-{n}-reactive",
        f"trafostacja-{n}-apparent",
        f"trafostacja-{n}-temperatura",
        f"trafostacja-{n}-thdi",
        f"trafostacja-{n}-thdu",
    ]


_POWER_METRIC_IDS = [mid for n in (1, 2, 3) for mid in _power_metric_ids_for(n)]

_POWER_UNITS_DECIMALS = {
    "l1n": ("V", 0),
    "l2n": ("V", 0),
    "l3n": ("V", 0),
    "prad-l1": ("A", 1),
    "prad-l2": ("A", 1),
    "prad-l3": ("A", 1),
    "active": ("kW", 1),
    "reactive": ("kVAr", 1),
    "apparent": ("kVA", 1),
    "temperatura": ("°C", 1),
    "thdi": ("%", 1),
    "thdu": ("%", 1),
}


def test_power_area_has_36_metrics_12_per_substation_in_fixed_order():
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "energia-elektryczna")
    assert len(area["metrics"]) == 36
    assert [m["id"] for m in area["metrics"]] == _POWER_METRIC_IDS


def test_power_area_metric_units_and_decimals_match_suffix():
    import re

    area = next(a for a in AREA_DEFINITIONS if a["id"] == "energia-elektryczna")
    for m in area["metrics"]:
        suffix = re.sub(r"^trafostacja-\d-", "", m["id"])
        expected_unit, expected_decimals = _POWER_UNITS_DECIMALS[suffix]
        assert m["unit"] == expected_unit
        assert m["decimals"] == expected_decimals


def test_power_area_preserves_preexisting_active_apparent_ids_units_decimals():
    # overview-power-summary.ts (unit === 'kW') and OverviewView.tsx are out
    # of scope and must keep reading trafostacja-{n}-active/apparent as
    # before this change.
    area = next(a for a in AREA_DEFINITIONS if a["id"] == "energia-elektryczna")
    for n in (1, 2, 3):
        active = next(m for m in area["metrics"] if m["id"] == f"trafostacja-{n}-active")
        assert active["unit"] == "kW"
        assert active["decimals"] == 1
        apparent = next(m for m in area["metrics"] if m["id"] == f"trafostacja-{n}-apparent")
        assert apparent["unit"] == "kVA"
        assert apparent["decimals"] == 1


def test_metric_to_area_reverse_lookup_covers_every_metric():
    total_metrics = sum(len(a["metrics"]) for a in AREA_DEFINITIONS)
    assert len(METRIC_TO_AREA) == total_metrics
    assert METRIC_TO_AREA["chlodnia-2-temp"] == "chlodnia-2"
    assert METRIC_TO_AREA["trafostacja-3-apparent"] == "energia-elektryczna"


def test_cooling_areas_carry_max_cm_tank_scale():
    for area_id in ("chlodnia-1", "chlodnia-2", "chlodnia-3"):
        area = next(a for a in AREA_DEFINITIONS if a["id"] == area_id)
        assert area["max_cm"] == 150
