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
    awaria: str | list[str]
    secondary: str


class DeviceDefinition(TypedDict):
    id: str
    label: str
    metric_ids: DeviceMetricIds


class DeviceGroupDefinition(TypedDict):
    id: str
    label: str
    devices: list[DeviceDefinition]


class SecondaryMetricSpec(TypedDict, total=False):
    slug: str
    label: str
    unit: str
    decimals: int


class DeviceSpec(TypedDict, total=False):
    id: str
    label: str
    # Zgeneralizowane z dawnego `has_frequency`/`hz` (wrzesień 2026, Chłodnia
    # 3): jedna, opcjonalna dodatkowa wartość liczbowa urządzenia niezależna
    # od jednostki — Hz dla pompy VFD, ale też bezjednostkowy "poziom pracy"
    # sprężarki Darpin. `slug` buduje sufiks metric id
    # (`{area_id}-{device_id}-{slug}`), `unit=""` renderuje się na kaflu bez
    # jednostki — mirror `src/lib/areas.ts::DeviceSpec.secondaryMetric`.
    secondary_metric: SecondaryMetricSpec
    # `False` — urządzenie NIE ma bitu awarii wcale (Darpin: PLC nie
    # udostępnia takiego bitu). Domyślnie `True` (każde inne urządzenie w tym
    # pliku ma dokładnie jeden bit awarii) — mirror
    # `src/lib/areas.ts::DeviceSpec.hasAwaria`.
    has_awaria: bool
    # Gdy urządzenie ma WIĘCEJ NIŻ JEDEN bit awarii (Rhoss: "alarm
    # sterowania" + "alarm pompy") — każda etykieta generuje własną, osobno
    # nazwaną metrykę, a `metric_ids["awaria"]` staje się listą. Nadpisuje
    # `has_awaria` (obecność `awaria_labels` oznacza "ma awarię") — mirror
    # `src/lib/areas.ts::DeviceSpec.awariaLabels`.
    awaria_labels: list[str]


class AreaDefinition(TypedDict, total=False):
    id: str
    name: str
    type: str
    metrics: list[MetricDefinition]
    max_cm: int
    device_groups: list[DeviceGroupDefinition]


def _build_device_group(
    area_id: str,
    group_id: str,
    group_label: str,
    devices: list[DeviceSpec],
) -> tuple[DeviceGroupDefinition, list[MetricDefinition]]:
    """Każde urządzenie w grupie dostaje bit PRACA (0/1, jak dziś zwykła
    metryka analogowa: `Tag.type=BOOL` dekoduje się do liczby 0/1 — koercja
    `int(...)` w `app.plc.decode.decode_tag_value`, gałąź BOOL; samo
    `snap7.util.get_bool` zwraca boola, co łamie kontrakt drutowy) —
    zero/jeden/wiele bitów AWARIA (`has_awaria`/`awaria_labels`, wrzesień
    2026: Darpin nie ma żadnego, Rhoss ma dwa osobno nazwane) — i opcjonalnie
    jedną dodatkową wartość liczbową (`secondary_metric`, dawniej Hz-specific
    `has_frequency` — teraz też bezjednostkowy "poziom pracy" Darpin). Zwraca
    zarówno definicję grupy (do `AreaDefinition.device_groups`, używaną przez
    front do grupowania kafli) jak i płaską listę wygenerowanych
    `MetricDefinition` (do dopisania do `AreaDefinition.metrics` — to jest
    jedyne miejsce, które faktycznie steruje tym, co trafia do WS
    payloadu/panelu admina, patrz `app.plc.aggregator.build_area_payload` i
    `app.api.tags`). Mirror `src/lib/areas.ts::buildDeviceGroup`.
    """
    metrics: list[MetricDefinition] = []
    devices_out: list[DeviceDefinition] = []
    for device in devices:
        praca_id = f"{area_id}-{device['id']}-praca"
        metrics.append({"id": praca_id, "label": f"{device['label']} — Praca", "unit": "", "decimals": 0})
        metric_ids: DeviceMetricIds = {"praca": praca_id}

        awaria_labels = device.get("awaria_labels")
        if awaria_labels:
            awaria_ids: list[str] = []
            for index, label in enumerate(awaria_labels):
                awaria_id = f"{area_id}-{device['id']}-awaria-{index + 1}"
                metrics.append({"id": awaria_id, "label": f"{device['label']} — {label}", "unit": "", "decimals": 0})
                awaria_ids.append(awaria_id)
            metric_ids["awaria"] = awaria_ids
        elif device.get("has_awaria", True):
            awaria_id = f"{area_id}-{device['id']}-awaria"
            metrics.append({"id": awaria_id, "label": f"{device['label']} — Awaria", "unit": "", "decimals": 0})
            metric_ids["awaria"] = awaria_id

        secondary_metric = device.get("secondary_metric")
        if secondary_metric:
            slug = secondary_metric["slug"]
            secondary_id = f"{area_id}-{device['id']}-{slug}"
            metrics.append(
                {
                    "id": secondary_id,
                    "label": f"{device['label']} — {secondary_metric['label']}",
                    "unit": secondary_metric["unit"],
                    "decimals": secondary_metric.get("decimals", 0),
                }
            )
            metric_ids["secondary"] = secondary_id

        devices_out.append({"id": device["id"], "label": device["label"], "metric_ids": metric_ids})

    return {"id": group_id, "label": group_label, "devices": devices_out}, metrics


# Wspólny wzorzec pomp obiegowych stacji Hyamat dla wszystkich 3 chłodni —
# TYLKO Pompa 1 ma regulację obrotów (VFD), więc dodatkowo pokazuje zadaną
# częstotliwość w Hz; liczba pomp różni się per chłodnia (Chłodnia 1: 5,
# Chłodnia 2: 4, Chłodnia 3: 1 — potwierdzone przez użytkownika, wrzesień
# 2026), stąd parametr `count` zamiast sztywnej listy. Nazwy "Pompa 1..N" są
# robocze (brak realnych nazw punktów PLC w źródłowych notatkach) —
# `Tag.label` jest edytowalny w panelu admina, więc nie blokuje to podpięcia
# realnych bitów później. Mirror `src/lib/areas.ts::pumpGroupSpec`.
def _pump_group_spec(count: int) -> list[DeviceSpec]:
    devices: list[DeviceSpec] = []
    for n in range(1, count + 1):
        device: DeviceSpec = {"id": f"pompa-{n}", "label": f"Pompa {n}"}
        if n == 1:
            device["secondary_metric"] = {"slug": "hz", "label": "Częstotliwość", "unit": "Hz", "decimals": 1}
        devices.append(device)
    return devices


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
# KWR125A/KWR125B) i 5 pomp obiegowych. Chłodnia 2 ma jedną grupę sprężarkową
# (Sprężarki: V301A/V301B, fizycznie istnieją, ale są w trakcie podłączania do
# systemu PLC — UI-only `note` na `DeviceGroupDefinition` we froncie, backend
# go nie mirroruje, bo nie wpływa na kontrakt metryk/walidację tagów) i 4
# pompy obiegowe.
#
# Chłodnia 3 KOREKTA (wrzesień 2026, potwierdzone wprost przez użytkownika —
# wcześniejszy komentarz w tym miejscu zakładał identyczne V301A/V301B jak
# Chłodnia 2, co było błędnym założeniem, nie faktem): fizycznie ma DWIE
# RÓŻNE jednostki sprężarkowe, nie parę bliźniaczych sprężarek:
# - Darpin: jeden bit PRACA + jedna wartość INT "poziom pracy sprężarki"
#   (`secondary_metric`) — BRAK bitu awarii w PLC (`has_awaria: False`).
# - Rhoss: jeden bit PRACA + DWA osobne bity awarii — "alarm sterowania" i
#   "alarm pompy" (`awaria_labels`) — OR-owane w jeden status "fault" po
#   stronie frontu, ale nadal dwie osobno nazwane metryki dla paska alarmów.
# Chłodnia 3 ma tylko 1 pompę obiegową (nie 5/4 jak Chłodnia 1/2).
# Mirror `src/lib/areas.ts::AREAS`.
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
            ("pompy", "Pompy obiegowe", _pump_group_spec(5)),
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
            ("pompy", "Pompy obiegowe", _pump_group_spec(4)),
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
                [
                    {
                        "id": "darpin",
                        "label": "Darpin",
                        "secondary_metric": {"slug": "poziom", "label": "Poziom pracy", "unit": "", "decimals": 0},
                        "has_awaria": False,
                    },
                    {
                        "id": "rhoss",
                        "label": "Rhoss",
                        "awaria_labels": ["Alarm sterowania", "Alarm pompy"],
                    },
                ],
            ),
            ("pompy", "Pompy obiegowe", _pump_group_spec(1)),
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
