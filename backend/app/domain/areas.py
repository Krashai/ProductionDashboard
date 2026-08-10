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


class AreaDefinition(TypedDict, total=False):
    id: str
    name: str
    type: str
    metrics: list[MetricDefinition]
    max_cm: int


def _cooling_area(area_id: str, name: str, max_cm: int) -> AreaDefinition:
    return {
        "id": area_id,
        "name": name,
        "type": "cooling",
        "max_cm": max_cm,
        "metrics": [
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
        ],
    }


def _compressor_area() -> AreaDefinition:
    return {
        "id": "sprezarkownia",
        "name": "Sprężarkownia",
        "type": "compressor",
        "metrics": [
            {
                "id": "sprezarkownia-drums",
                "label": "Magazyn Bębnów",
                "unit": "bar",
                "decimals": 2,
            },
            {
                "id": "sprezarkownia-aluminium",
                "label": "Magazyn Aluminium",
                "unit": "bar",
                "decimals": 2,
            },
        ],
    }


def _power_area() -> AreaDefinition:
    metrics: list[MetricDefinition] = []
    for n in (1, 2, 3):
        metrics.append(
            {
                "id": f"trafostacja-{n}-active",
                "label": f"Trafostacja {n} — Moc czynna",
                "unit": "kW",
                "decimals": 1,
            }
        )
        metrics.append(
            {
                "id": f"trafostacja-{n}-apparent",
                "label": f"Trafostacja {n} — Moc pozorna",
                "unit": "kVA",
                "decimals": 1,
            }
        )
    return {
        "id": "energia-elektryczna",
        "name": "Energia elektryczna",
        "type": "power",
        "metrics": metrics,
    }


AREA_DEFINITIONS: list[AreaDefinition] = [
    _cooling_area("chlodnia-1", "Chłodnia 1", 150),
    _cooling_area("chlodnia-2", "Chłodnia 2", 150),
    _cooling_area("chlodnia-3", "Chłodnia 3", 150),
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
