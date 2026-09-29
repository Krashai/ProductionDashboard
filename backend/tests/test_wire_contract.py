"""Backend half of the wire-contract test (see
src/lib/backend/__tests__/wireContract.test.ts for the other half).

Builds a real STATE_UPDATE with the aggregator — a threshold alarm with its
description, an AWARIA configured to fault on FALSE, a fault word with bit
alarms — and pins it to contracts/state_update.sample.json. The frontend
test feeds that same file through its guard, mapper, alarm bar and device
tile. Two green suites each testing their own idea of the payload is how
the 2026-09-18 BOOL outage happened; this file is the shared ground truth.

Regenerate after an intentional payload change:
    UPDATE_CONTRACT=1 pytest tests/test_wire_contract.py
"""
import json
import os
from pathlib import Path

from app.plc.aggregator import build_area_payload

CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "state_update.sample.json"


def _payload() -> dict:
    plcs = [{"id": 1, "area_id": "chlodnia-1"}]
    tags = [
        {"id": 1, "plc_id": 1, "name": "temp", "type": "REAL", "metric_id": "chlodnia-1-temp",
         "label": "Temperatura wody na halę", "unit": "°C", "decimals": 1},
        {"id": 2, "plc_id": 1, "name": "v101_aw", "type": "BOOL", "metric_id": "chlodnia-1-v101-awaria",
         "label": "V101 — Awaria", "unit": "", "decimals": 0},
        {"id": 3, "plc_id": 1, "name": "v201_aw", "type": "BOOL", "metric_id": "chlodnia-1-v201-awaria",
         "label": "V201 — Awaria", "unit": "", "decimals": 0},
        {"id": 4, "plc_id": 1, "name": "slowo", "type": "WORD", "metric_id": "chlodnia-1-diag-aw1",
         "label": "Słowo awarii 1", "unit": "", "decimals": 0},
        # A running pump, so the cooling area is not "shut down" (which would
        # deliberately silence the temperature alarm on the wallboard).
        {"id": 5, "plc_id": 1, "name": "p1", "type": "BOOL", "metric_id": "chlodnia-1-pompa-1-praca",
         "label": "Pompa 1 — Praca", "unit": "", "decimals": 0},
    ]
    areas = build_area_payload(  # noqa: E501
        plcs=plcs,
        tags=tags,
        threshold_rules=[{"tag_id": 1, "min": 2.0, "max": 8.0, "hysteresis": 0.0, "delay_s": 0.0}],
        bit_alarm_rules=[{"tag_id": 4, "bit_index": 0, "description": "Przegrzanie silnika V101"},
                         {"tag_id": 4, "bit_index": 3, "description": "Brak przepływu"}],
        # V101 faults on FALSE; V201 has no rule -> implicit "alarm on TRUE".
        bool_alarm_rules=[{"tag_id": 2, "active_value": 0, "description": "Brak sygnału gotowości", "delay_s": 0.0}],
        live_snapshot={1: {"online": True, "error": None,
                           "tag_values": {"temp": 9.5, "v101_aw": 0, "v201_aw": 1, "slowo": 0b1001, "p1": 1}}},
    )
    return {"type": "STATE_UPDATE", "timestamp": "2026-09-29T12:00:00+00:00", "areas": areas}


def test_payload_matches_the_shared_contract_file():
    payload = json.loads(json.dumps(_payload()))  # exactly what goes on the wire
    if os.getenv("UPDATE_CONTRACT"):
        CONTRACT.parent.mkdir(exist_ok=True)
        CONTRACT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    assert payload == json.loads(CONTRACT.read_text(encoding="utf-8")), (
        "Backend payload drifted from contracts/state_update.sample.json. If intentional, "
        "regenerate with UPDATE_CONTRACT=1 and make sure the frontend wire-contract test still passes."
    )
