"""Reads Plc/Tag/ThresholdRule/BitAlarmRule out of the DB as plain dicts.

Centralized here because three different call sites need the exact same
shape: app.plc.aggregator (broadcast/status payload), app.plc.supervisor
(hot-reload diffing), and the CRUD routers (to trigger a reload after a
write). Keeping ORM objects out of those consumers means aggregator/
supervisor stay pure-dict, dependency-free, and unit-testable without a
database — see their module docstrings.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import BitAlarmRule, Plc, Tag, ThresholdRule


def load_plcs(db: Session) -> list[dict]:
    return [
        {
            "id": p.id,
            "name": p.name,
            "area_id": p.area_id,
            "ip": p.ip,
            "rack": p.rack,
            "slot": p.slot,
            "plc_type": p.plc_type,
        }
        for p in db.query(Plc).all()
    ]


def load_tags(db: Session) -> list[dict]:
    return [
        {
            "id": t.id,
            "plc_id": t.plc_id,
            "name": t.name,
            "db": t.db,
            "offset": t.offset,
            "bit": t.bit,
            "type": t.type,
            "metric_id": t.metric_id,
            "label": t.label,
            "unit": t.unit,
            "decimals": t.decimals,
        }
        for t in db.query(Tag).all()
    ]


def load_threshold_rules(db: Session) -> list[dict]:
    return [
        {"id": r.id, "tag_id": r.tag_id, "min": r.min, "max": r.max}
        for r in db.query(ThresholdRule).all()
    ]


def load_bit_alarm_rules(db: Session) -> list[dict]:
    return [
        {
            "id": r.id,
            "tag_id": r.tag_id,
            "bit_index": r.bit_index,
            "description": r.description,
        }
        for r in db.query(BitAlarmRule).all()
    ]


def load_all(db: Session) -> dict:
    """Convenience bundle used by the broadcaster loop and /status."""
    return {
        "plcs": load_plcs(db),
        "tags": load_tags(db),
        "threshold_rules": load_threshold_rules(db),
        "bit_alarm_rules": load_bit_alarm_rules(db),
    }
