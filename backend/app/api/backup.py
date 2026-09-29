"""Configuration backup: GET /api/config/export and POST
/api/config/restore.

Deleting a PLC cascades to all of its tags and alarms, and there was no
way back. An export is the whole configuration (PLCs, tags, each tag's
alarm) as one JSON file; restore replaces the current configuration with
it in a single transaction — validated completely first, so a bad file
changes nothing.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from app.api.alarm_config import _replace_rules, assert_config_fits_tag, read_alarm_config
from app.api.deps import get_db, require_admin_token, schedule_supervisor_reload
from app.db.alarm_rule_lock import THRESHOLD_BIT_ALARM_LOCK
from app.db.alarm_schemas import AlarmConfig
from app.db.models import Plc, Tag
from app.db.schemas import PlcCreate, TagCreate
from app.domain.areas import METRIC_TO_AREA

router = APIRouter(prefix="/api/config", tags=["backup"], dependencies=[Depends(require_admin_token)])

FORMAT = "production-dashboard-config"


class BackupPlc(PlcCreate):
    id: int


class BackupTag(TagCreate):
    id: int
    alarm: AlarmConfig


# Far above the real plant (5 areas, ~100 catalog metrics) while bounding
# what an authenticated but malformed or hostile upload can make the server
# parse and rewrite in one transaction.
MAX_BACKUP_PLCS = 100
MAX_BACKUP_TAGS = 5000


class Backup(BaseModel):
    format: Literal["production-dashboard-config"]
    version: Literal[1]
    exported_at: str | None = None
    plcs: list[BackupPlc] = Field(max_length=MAX_BACKUP_PLCS)
    tags: list[BackupTag] = Field(max_length=MAX_BACKUP_TAGS)

    @model_validator(mode="after")
    def _references(self):
        plc_ids = {p.id for p in self.plcs}
        if len(plc_ids) != len(self.plcs):
            raise ValueError("Powtórzony identyfikator sterownika w kopii.")
        for tag in self.tags:
            if tag.plc_id not in plc_ids:
                raise ValueError(f"Zmienna {tag.name!r} wskazuje na nieistniejący sterownik {tag.plc_id}.")
        return self


@router.get("/export")
def export_config(db: Session = Depends(get_db)):
    plcs = db.query(Plc).order_by(Plc.id).all()
    tags = db.query(Tag).order_by(Tag.id).all()
    return {
        "format": FORMAT,
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "plcs": [
            {"id": p.id, "name": p.name, "area_id": p.area_id, "ip": p.ip,
             "rack": p.rack, "slot": p.slot, "plc_type": p.plc_type}
            for p in plcs
        ],
        "tags": [_export_tag(t) for t in tags],
    }


def _export_tag(tag: Tag) -> dict:
    alarm = read_alarm_config(tag)
    # An implicit AWARIA rule is a default, not stored configuration.
    alarm_body = {"kind": "none"} if alarm.implicit else alarm.model_dump(
        exclude={"tag_id", "implicit"}, exclude_none=True
    )
    return {
        "id": tag.id, "plc_id": tag.plc_id, "name": tag.name, "db": tag.db,
        "offset": tag.offset, "bit": tag.bit, "type": tag.type, "metric_id": tag.metric_id,
        "label": tag.label, "unit": tag.unit, "decimals": tag.decimals, "alarm": alarm_body,
    }


def _validate_semantics(backup: Backup) -> None:
    area_by_plc = {p.id: p.area_id for p in backup.plcs}
    for tag in backup.tags:
        owning_area = METRIC_TO_AREA.get(tag.metric_id)
        if owning_area is not None and owning_area != area_by_plc[tag.plc_id]:
            raise HTTPException(409, f"Zmienna {tag.name!r}: metryka należy do obszaru {owning_area!r}.")
        try:
            assert_config_fits_tag(tag.alarm, tag.type)
        except HTTPException as exc:
            raise HTTPException(409, f"Zmienna {tag.name!r}: {exc.detail}") from exc
    metric_ids = [t.metric_id for t in backup.tags]
    if len(metric_ids) != len(set(metric_ids)):
        raise HTTPException(409, "Kopia zawiera tę samą metrykę przypisaną do dwóch zmiennych.")
    names = [(t.plc_id, t.name) for t in backup.tags]
    if len(names) != len(set(names)):
        raise HTTPException(409, "Kopia zawiera dwie zmienne o tej samej nazwie na jednym sterowniku.")


@router.post("/restore")
def restore_config(
    backup: Backup, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    _validate_semantics(backup)
    with THRESHOLD_BIT_ALARM_LOCK:
        try:
            for plc in db.query(Plc).all():
                db.delete(plc)  # cascades to tags and their alarm rules
            db.flush()
            new_plc_ids: dict[int, int] = {}
            for p in backup.plcs:
                plc = Plc(**p.model_dump(exclude={"id"}))
                db.add(plc)
                db.flush()
                new_plc_ids[p.id] = plc.id
            for t in backup.tags:
                tag = Tag(**t.model_dump(exclude={"id", "alarm"}) | {"plc_id": new_plc_ids[t.plc_id]})
                db.add(tag)
                db.flush()
                _replace_rules(db, tag, t.alarm)
            db.commit()
        except Exception:
            db.rollback()
            raise
    schedule_supervisor_reload(request, background_tasks)
    return {"plcs": len(backup.plcs), "tags": len(backup.tags)}
