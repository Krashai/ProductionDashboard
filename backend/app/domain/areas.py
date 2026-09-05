"""Static mirror of ProductionDashboard's src/lib/areas.ts.

This is intentionally duplicated data (not shared code — the frontend is
TypeScript, this backend is Python, there is no practical way to share a
single source without a build-time codegen step that YAGNI rules out for
5 static areas). Keep this in sync by hand whenever areas.ts changes.

Used for:
  - GET /api/areas — read-only reference data for the admin panel's
    area/metric dropdowns, so operators pick valid metric_id values
    instead of typing free text.
  - app.api.tags — METRIC_TO_AREA is the actual enforcement point:
    creating/updating a Tag whose metric_id names one of these known
    metrics is rejected (409) unless it belongs to the same area as the
    tag's own Plc.area_id. This is what stops a misconfigured tag from
    silently overwriting the value on the wrong wallboard card.
  - app.plc.aggregator — grouping the WS//status payload by area in a
    stable, known order, and (defense in depth, in case the app.api.tags
    check above is ever bypassed) scoping each area's tags to only those
    belonging to a PLC actually assigned to that area.
"""
from __future__ import annotations

from typing import TypedDict


class MetricDefinition(TypedDict):
    id: str
    label: str
    unit: str
    decimals: int


class DeviceMetricIds(TypedDict, total=False):
    praca: str
    awaria: str
    hz: str


class DeviceDefinition(TypedDict):
    id: str
    label: str
    metric_ids: DeviceMetricIds


class DeviceGroupDefinition(TypedDict):
    id: str
    label: str
    devices: list[DeviceDefinition]


class DeviceSpec(TypedDict, total=False):
    id: str
    label: str
    has_frequency: bool


class AreaDefinition(TypedDict, total=False):
    id: str
    name: str
    type: str
    metrics: list[MetricDefinition]
    max_cm: int
    device_groups: list[DeviceGroupDefinition]


def _build_device_group(
    area_id: str, group_id: str, group_label: str, devices: list[DeviceSpec]
) -> tuple[DeviceGroupDefinition, list[MetricDefinition]]:
    """Każde urządzenie w grupie dostaje dwa bity — PRACA/AWARIA (0/1, jak dziś
    zwykła metryka analogowa: `Tag.type=BOOL` dekoduje się do liczby 0/1,
    patrz `app.plc.decode.get_bool`) — i opcjonalnie trzecią metrykę Hz dla
    urządzeń z regulacją obrotów (np. pompa VFD). Zwraca zarówno definicję
    grupy (do `AreaDefinition.device_groups`, używaną przez front do
    grupowania kafli) jak i płaską listę wygenerowanych `MetricDefinition`
    (do dopisania do `AreaDefinition.metrics` — to jest jedyne miejsce, które
    faktycznie steruje tym, co trafia do WS payloadu/panelu admina, patrz
    `app.plc.aggregator.build_area_payload` i `app.api.tags`).
    """
    metrics: list[MetricDefinition] = []
    devices_out: list[DeviceDefinition] = []
    for device in devices:
        praca_id = f"{area_id}-{device['id']}-praca"
        awaria_id = f"{area_id}-{device['id']}-awaria"
        metrics.append({"id": praca_id, "label": f"{device['label']} — Praca", "unit": "", "decimals": 0})
        metrics.append({"id": awaria_id, "label": f"{device['label']} — Awaria", "unit": "", "decimals": 0})
        metric_ids: DeviceMetricIds = {"praca": praca_id, "awaria": awaria_id}
        if device.get("has_frequency"):
            hz_id = f"{area_id}-{device['id']}-hz"
            metrics.append({"id": hz_id, "label": f"{device['label']} — Częstotliwość", "unit": "Hz", "decimals": 1})
            metric_ids["hz"] = hz_id
        devices_out.append({"id": device["id"], "label": device["label"], "metric_ids": metric_ids})

    return {"id": group_id, "label": group_label, "devices": devices_out}, metrics


# Wspólna dla wszystkich 3 chłodni grupa 5 pomp obiegowych stacji Hyamat —
# jedna z nich (Pompa 1) ma regulację obrotów (VFD), więc dodatkowo pokazuje
# zadaną częstotliwość w Hz. Nazwy "Pompa 1..5" są robocze (brak realnych
# nazw punktów PLC w źródłowych notatkach) — `Tag.label` jest edytowalny w
# panelu admina, więc nie blokuje to podpięcia realnych bitów później.
def _pump_group_spec() -> list[DeviceSpec]:
    return [
        {"id": "pompa-1", "label": "Pompa 1", "has_frequency": True},
        {"id": "pompa-2", "label": "Pompa 2"},
        {"id": "pompa-3", "label": "Pompa 3"},
        {"id": "pompa-4", "label": "Pompa 4"},
        {"id": "pompa-5", "label": "Pompa 5"},
    ]


def _cooling_area(
    area_id: str, name: str, max_cm: int, device_group_specs: list[tuple[str, str, list[DeviceSpec]]]
) -> AreaDefinition:
    base_metrics: list[MetricDefinition] = [
        {
            "id": f"{area_id}-temp",
            "label": "Temperatura wody na halę",
            "unit": "°C",
            "decimals": 1,
        },
        {
            "id": f"{area_id}-pressure",
            "label": "Ciśnienie wody na halę",
            "unit": "bar",
            "decimals": 2,
        },
        {
            "id": f"{area_id}-level",
            "label": "Poziom wody w zbiorniku",
            "unit": "cm",
            "decimals": 0,
        },
    ]

    device_groups: list[DeviceGroupDefinition] = []
    device_metrics: list[MetricDefinition] = []
    for group_id, group_label, devices in device_group_specs:
        group, metrics = _build_device_group(area_id, group_id, group_label, devices)
        device_groups.append(group)
        device_metrics.extend(metrics)

    return {
        "id": area_id,
        "name": name,
        "type": "cooling",
        "max_cm": max_cm,
        "metrics": [*base_metrics, *device_metrics],
        "device_groups": device_groups,
    }


# Decyzja #17: fizyczne sprężarkownie 1 i 2 zasilają jedną wspólną sieć
# sprężonego powietrza, więc karuzela ma dla nich JEDEN slajd/obszar
# "Sprężarkownia". Korekta po konsultacji z użytkownikiem: ten jeden obszar
# ma jednak dwie wizualnie odrębne sekcje UI — "Magazyn Aluminium" i
# "Magazyn Bębnów" — każda z własną parą sprężarek (PRACA/AWARIA, bez
# regulacji obrotów) i własnymi odczytami ciśnienia/przepływu. Id urządzeń
# muszą być prefiksowane per sekcja (aluminium-1, nie gołe sprezarka-1),
# analogicznie do uzasadnienia przy _build_device_group.
def _compressor_area() -> AreaDefinition:
    area_id = "sprezarkownia"
    aluminium_group, aluminium_metrics = _build_device_group(
        area_id,
        "magazyn-aluminium",
        "Magazyn Aluminium",
        [{"id": "aluminium-1", "label": "Sprężarka 1"}, {"id": "aluminium-2", "label": "Sprężarka 2"}],
    )
    bebny_group, bebny_metrics = _build_device_group(
        area_id,
        "magazyn-bebnow",
        "Magazyn Bębnów",
        [{"id": "bebny-1", "label": "Sprężarka 1"}, {"id": "bebny-2", "label": "Sprężarka 2"}],
    )

    analog_metrics: list[MetricDefinition] = [
        {
            "id": f"{area_id}-magazyn-aluminium-cisnienie-zbiornik",
            "label": "Magazyn Aluminium — Ciśnienie zbiornik",
            "unit": "bar",
            "decimals": 2,
        },
        {
            "id": f"{area_id}-magazyn-bebnow-cisnienie-zbiornik",
            "label": "Magazyn Bębnów — Ciśnienie zbiornik",
            "unit": "bar",
            "decimals": 2,
        },
        {
            "id": f"{area_id}-magazyn-bebnow-cisnienie-kolektor",
            "label": "Magazyn Bębnów — Ciśnienie kolektor",
            "unit": "bar",
            "decimals": 2,
        },
        {
            "id": f"{area_id}-magazyn-bebnow-przeplyw-powietrza",
            "label": "Magazyn Bębnów — Przepływ powietrza",
            "unit": "m³/min",
            "decimals": 1,
        },
    ]

    return {
        "id": area_id,
        "name": "Sprężarkownia",
        "type": "compressor",
        "metrics": [*aluminium_metrics, *bebny_metrics, *analog_metrics],
        "device_groups": [aluminium_group, bebny_group],
    }


# Ekran szczegółowy "Energia elektryczna" (sierpień 2026) rozrósł się z
# ubogiej siatki 6 kart (moc czynna+pozorna) do gęstego "arkusza danych" — 12
# metryk na trafostację (napięcia L1N/L2N/L3N, prądy L1/L2/L3, moc czynna/
# bierna/pozorna, temperatura, THDi/THDu), 36 metryk łącznie. Kolejność
# odzwierciedla docelową kolejność wyświetlania we frontendowym
# PowerAreaView/SpecSheetColumn (napięcia -> prądy -> moc -> temperatura ->
# THD) — mirror src/lib/areas.ts::powerArea(), zsynchronizowane ręcznie.
#
# trafostacja-{n}-active/apparent (id, unit, decimals) MUSZĄ zostać bez
# zmian — czyta je overview-power-summary.ts (unit === 'kW') i
# OverviewView.tsx, oba poza zakresem tej zmiany.
def _power_area() -> AreaDefinition:
    metrics: list[MetricDefinition] = []
    for n in (1, 2, 3):
        metrics.extend(
            [
                {"id": f"trafostacja-{n}-l1n", "label": f"Trafostacja {n} — L1N", "unit": "V", "decimals": 0},
                {"id": f"trafostacja-{n}-l2n", "label": f"Trafostacja {n} — L2N", "unit": "V", "decimals": 0},
                {"id": f"trafostacja-{n}-l3n", "label": f"Trafostacja {n} — L3N", "unit": "V", "decimals": 0},
                {
                    "id": f"trafostacja-{n}-prad-l1",
                    "label": f"Trafostacja {n} — L1 (prąd)",
                    "unit": "A",
                    "decimals": 1,
                },
                {
                    "id": f"trafostacja-{n}-prad-l2",
                    "label": f"Trafostacja {n} — L2 (prąd)",
                    "unit": "A",
                    "decimals": 1,
                },
                {
                    "id": f"trafostacja-{n}-prad-l3",
                    "label": f"Trafostacja {n} — L3 (prąd)",
                    "unit": "A",
                    "decimals": 1,
                },
                {
                    "id": f"trafostacja-{n}-active",
                    "label": f"Trafostacja {n} — Moc czynna",
                    "unit": "kW",
                    "decimals": 1,
                },
                {
                    "id": f"trafostacja-{n}-reactive",
                    "label": f"Trafostacja {n} — Moc bierna",
                    "unit": "kVAr",
                    "decimals": 1,
                },
                {
                    "id": f"trafostacja-{n}-apparent",
                    "label": f"Trafostacja {n} — Moc pozorna",
                    "unit": "kVA",
                    "decimals": 1,
                },
                {
                    "id": f"trafostacja-{n}-temperatura",
                    "label": f"Trafostacja {n} — Temperatura",
                    "unit": "°C",
                    "decimals": 1,
                },
                {"id": f"trafostacja-{n}-thdi", "label": f"Trafostacja {n} — THDi", "unit": "%", "decimals": 1},
                {"id": f"trafostacja-{n}-thdu", "label": f"Trafostacja {n} — THDu", "unit": "%", "decimals": 1},
            ]
        )
    return {
        "id": "energia-elektryczna",
        "name": "Energia elektryczna",
        "type": "power",
        "metrics": metrics,
    }


# Chłodnia 1 ma DWIE osobne grupy sprężarkowe (Sprężarki: V101/V201, Agregaty:
# KWR125A/KWR125B), Chłodnia 2/3 mają tylko jedną (Sprężarki: V301A/V301B) —
# potwierdzone wprost przez użytkownika, nie założenie agenta.
AREA_DEFINITIONS: list[AreaDefinition] = [
    _cooling_area(
        "chlodnia-1",
        "Chłodnia 1",
        150,
        [
            ("sprezarki", "Sprężarki", [{"id": "v101", "label": "V101"}, {"id": "v201", "label": "V201"}]),
            (
                "agregaty",
                "Agregaty",
                [{"id": "kwr125a", "label": "KWR125A"}, {"id": "kwr125b", "label": "KWR125B"}],
            ),
            ("pompy", "Pompy obiegowe", _pump_group_spec()),
        ],
    ),
    _cooling_area(
        "chlodnia-2",
        "Chłodnia 2",
        150,
        [
            (
                "sprezarki",
                "Sprężarki",
                [{"id": "v301a", "label": "V301A"}, {"id": "v301b", "label": "V301B"}],
            ),
            ("pompy", "Pompy obiegowe", _pump_group_spec()),
        ],
    ),
    _cooling_area(
        "chlodnia-3",
        "Chłodnia 3",
        150,
        [
            (
                "sprezarki",
                "Sprężarki",
                [{"id": "v301a", "label": "V301A"}, {"id": "v301b", "label": "V301B"}],
            ),
            ("pompy", "Pompy obiegowe", _pump_group_spec()),
        ],
    ),
    _compressor_area(),
    _power_area(),
]

AREA_IDS: frozenset[str] = frozenset(a["id"] for a in AREA_DEFINITIONS)

AREAS_BY_ID: dict[str, AreaDefinition] = {a["id"]: a for a in AREA_DEFINITIONS}

METRIC_TO_AREA: dict[str, str] = {
    metric["id"]: area["id"]
    for area in AREA_DEFINITIONS
    for metric in area["metrics"]
}

METRIC_DEFINITIONS: dict[str, MetricDefinition] = {
    metric["id"]: metric
    for area in AREA_DEFINITIONS
    for metric in area["metrics"]
}
