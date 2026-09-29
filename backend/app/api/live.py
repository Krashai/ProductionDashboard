"""GET /api/live — per-PLC connection state and, per tag, the value and
alarm state the wallboard is showing right now. Feeds the admin panel's
live columns, so a freshly configured address can be checked at a
glance instead of by reading the raw /status JSON."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_live_store, require_admin_token
from app.db.config_loader import load_all
from app.plc.aggregator import evaluate_tag_alarms, tag_display_value

router = APIRouter(tags=["live"])


@router.get("/api/live")
def get_live(request: Request, db: Session = Depends(get_db), live_store=Depends(get_live_store)):
    config = load_all(db)
    snapshot = live_store.snapshot()
    alarms = evaluate_tag_alarms(
        config["tags"],
        config["threshold_rules"],
        config["bit_alarm_rules"],
        config["bool_alarm_rules"],
        snapshot,
        tracker=getattr(request.app.state, "alarm_tracker", None),
        commit=False,  # read-only: the broadcast loop owns alarm state
    )
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "plcs": {
            plc["id"]: {
                "online": snapshot.get(plc["id"], {}).get("online", False),
                "error": snapshot.get(plc["id"], {}).get("error"),
                "last_update": snapshot.get(plc["id"], {}).get("last_update"),
            }
            for plc in config["plcs"]
        },
        "tags": {
            tag["id"]: {
                "value": tag_display_value(tag, snapshot),
                "alarm": alarms[tag["id"]][0],
                "alarm_description": alarms[tag["id"]][1],
            }
            for tag in config["tags"]
        },
    }


@router.get("/api/auth/check", status_code=204, dependencies=[Depends(require_admin_token)])
def auth_check():
    """204 when X-Admin-Token is valid — lets the login screen verify a
    token before storing it, instead of failing on the first save."""
