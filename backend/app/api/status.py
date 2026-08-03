"""GET /status — full diagnostic dump (per PLC connection state + raw tag
values, plus the same area-grouped view sent over /ws), per
NewBackendPlan.md §4.
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_live_store
from app.db.config_loader import load_all
from app.plc.aggregator import build_area_payload

router = APIRouter(tags=["status"])


@router.get("/status")
def get_status(
    request: Request, db: Session = Depends(get_db), live_store=Depends(get_live_store)
):
    config = load_all(db)
    snapshot = live_store.snapshot()

    plcs = []
    for plc in config["plcs"]:
        state = snapshot.get(plc["id"], {})
        plcs.append(
            {
                **plc,
                "online": state.get("online", False),
                "error": state.get("error"),
                "last_update": state.get("last_update"),
                "tag_values": state.get("tag_values", {}),
            }
        )

    areas = build_area_payload(
        plcs=config["plcs"],
        tags=config["tags"],
        threshold_rules=config["threshold_rules"],
        bit_alarm_rules=config["bit_alarm_rules"],
        live_snapshot=snapshot,
    )

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "plcs": plcs,
        "tags": config["tags"],
        "threshold_rules": config["threshold_rules"],
        "bit_alarm_rules": config["bit_alarm_rules"],
        "areas": areas,
        # MEDIUM #B2: surfaces whether the last reload_supervisor() call
        # (after a Plc/Tag CRUD write) succeeded — a CRUD write itself
        # never 500s on a supervisor.reload() failure (see app.api.deps),
        # so this is how an operator/monitoring can notice polling may be
        # out of sync with the DB. Defaults to True (healthy) if no
        # reload has ever failed/succeeded yet.
        "supervisor_healthy": getattr(request.app.state, "supervisor_healthy", True),
    }
