"""A tag's alarm as one object: GET/PUT /api/tags/{id}/alarm and
GET /api/alarm-configs.

The admin panel edits "the alarm of this variable". Underneath there are
still three rule tables (ThresholdRule, BoolAlarmRule, BitAlarmRule) with
the one-kind-per-tag rule, but PUT replaces whatever the tag had with the
new configuration in a single transaction, so the operator never has to
pick a tag by internal number or delete one rule before adding another.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_token
from app.db.alarm_rule_lock import THRESHOLD_BIT_ALARM_LOCK
from app.db.alarm_schemas import (
    AlarmConfig,
    AlarmConfigRead,
    BitConfig,
    BoolAlarmConfig,
    ThresholdConfig,
)
from app.db.models import BitAlarmRule, BoolAlarmRule, Tag, ThresholdRule
from app.domain.alarm_kinds import AWARIA_METRIC_IDS, rule_incompatibility

router = APIRouter(tags=["alarm-config"])


def _get_tag_or_404(db: Session, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono zmiennej {tag_id}.")
    return tag


def read_alarm_config(tag: Tag) -> AlarmConfigRead:
    if tag.threshold_rule is not None:
        r = tag.threshold_rule
        return AlarmConfigRead(
            tag_id=tag.id,
            kind="threshold",
            threshold=ThresholdConfig(min=r.min, max=r.max, hysteresis=r.hysteresis, delay_s=r.delay_s),
        )
    if tag.bool_alarm_rule is not None:
        r = tag.bool_alarm_rule
        return AlarmConfigRead(
            tag_id=tag.id,
            kind="bool",
            bool_alarm=BoolAlarmConfig(active_value=r.active_value, description=r.description, delay_s=r.delay_s),
        )
    if tag.bit_alarm_rules:
        bits = sorted(tag.bit_alarm_rules, key=lambda r: r.bit_index)
        return AlarmConfigRead(
            tag_id=tag.id,
            kind="bits",
            bits=[BitConfig(bit_index=r.bit_index, description=r.description) for r in bits],
        )
    if tag.metric_id in AWARIA_METRIC_IDS and tag.type == "BOOL":
        return AlarmConfigRead(tag_id=tag.id, kind="bool", implicit=True, bool_alarm=BoolAlarmConfig())
    return AlarmConfigRead(tag_id=tag.id, kind="none")


def assert_config_fits_tag(config: AlarmConfig, tag_type: str) -> None:
    if config.kind == "none":
        return
    reasons = [rule_incompatibility(config.kind, tag_type)]
    if config.kind == "bits":
        reasons += [rule_incompatibility("bits", tag_type, b.bit_index) for b in config.bits or []]
    reason = next((r for r in reasons if r), None)
    if reason:
        raise HTTPException(status_code=409, detail=reason)


def _replace_rules(db: Session, tag: Tag, config: AlarmConfig) -> None:
    tag.threshold_rule = None
    tag.bool_alarm_rule = None
    tag.bit_alarm_rules = []
    db.flush()  # delete-orphan the old rules before inserting (unique constraints)
    if config.kind == "threshold":
        tag.threshold_rule = ThresholdRule(**config.threshold.model_dump())
    elif config.kind == "bool":
        tag.bool_alarm_rule = BoolAlarmRule(**config.bool_alarm.model_dump())
    elif config.kind == "bits":
        tag.bit_alarm_rules = [BitAlarmRule(**b.model_dump()) for b in config.bits]


@router.get("/api/tags/{tag_id}/alarm", response_model=AlarmConfigRead)
def get_alarm_config(tag_id: int, db: Session = Depends(get_db)):
    return read_alarm_config(_get_tag_or_404(db, tag_id))


@router.put(
    "/api/tags/{tag_id}/alarm",
    response_model=AlarmConfigRead,
    dependencies=[Depends(require_admin_token)],
)
def put_alarm_config(tag_id: int, config: AlarmConfig, db: Session = Depends(get_db)):
    with THRESHOLD_BIT_ALARM_LOCK:
        tag = _get_tag_or_404(db, tag_id)
        assert_config_fits_tag(config, tag.type)
        _replace_rules(db, tag, config)
        db.commit()
    db.refresh(tag)
    return read_alarm_config(tag)


@router.get("/api/alarm-configs", response_model=list[AlarmConfigRead])
def list_alarm_configs(db: Session = Depends(get_db)):
    return [read_alarm_config(tag) for tag in db.query(Tag).order_by(Tag.id).all()]
