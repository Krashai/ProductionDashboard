"""Periodic task that turns (DB config + LiveStore snapshot) into the
WS payload and pushes it to every connected client, per
NewBackendPlan.md §4 (~1s cadence, grouped per UI area).

Deliberately decoupled from the PLCWorker poll threads (see
app.plc.worker module docstring): this reads fresh config from the DB on
every tick, which is also what makes ThresholdRule/BitAlarmRule edits
show up in the broadcast within one tick — no explicit "reload" signal
needed for alarm evaluation, only for the poll threads themselves
(app.plc.supervisor).
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.db.config_loader import load_all
from app.plc.aggregator import build_area_payload
from app.plc.live_store import LiveStore


async def broadcast_once(db: Session, live_store: LiveStore, ws_manager) -> None:
    config = load_all(db)
    areas = build_area_payload(
        plcs=config["plcs"],
        tags=config["tags"],
        threshold_rules=config["threshold_rules"],
        bit_alarm_rules=config["bit_alarm_rules"],
        live_snapshot=live_store.snapshot(),
    )
    message = {
        "type": "STATE_UPDATE",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "areas": areas,
    }
    await ws_manager.broadcast(message)


async def broadcast_loop(
    session_local, live_store: LiveStore, ws_manager, interval: float = 1.0
) -> None:
    """Runs until cancelled. Each tick opens/closes its own short-lived
    DB session — cheap for SQLite at this scale (8 PLCs, ~40 tags)."""
    while True:
        await asyncio.sleep(interval)
        db = session_local()
        try:
            await broadcast_once(db, live_store, ws_manager)
        except Exception as exc:  # never let a bad tick kill the loop
            print(f"broadcast_loop tick failed: {exc}", flush=True)
        finally:
            db.close()
