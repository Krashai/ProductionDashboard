"""CRUD for BitAlarmRule. See app.db.models module docstring for the
rationale behind the threshold-XOR-bit-alarm rule enforced here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, require_admin_token
from app.db.alarm_rule_lock import THRESHOLD_BIT_ALARM_LOCK
from app.db.models import BitAlarmRule, BoolAlarmRule, Tag, ThresholdRule
from app.domain.alarm_kinds import rule_incompatibility
from app.db.schemas import BitAlarmRuleCreate, BitAlarmRuleRead, BitAlarmRuleUpdate

router = APIRouter(prefix="/api/bit-alarms", tags=["bit-alarms"])
_write_protected = [Depends(require_admin_token)]


def _get_or_404(db: Session, rule_id: int) -> BitAlarmRule:
    rule = db.get(BitAlarmRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono alarmu bitowego {rule_id}.")
    return rule


def _assert_tag_exists_and_free_of_threshold(
    db: Session, tag_id: int, bit_index: int | None = None
) -> None:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono zmiennej {tag_id}.")
    reason = rule_incompatibility("bits", tag.type, bit_index)
    if reason:
        raise HTTPException(status_code=409, detail=reason)
    has_other_rule = (
        db.query(ThresholdRule).filter(ThresholdRule.tag_id == tag_id).first() is not None
        or db.query(BoolAlarmRule).filter(BoolAlarmRule.tag_id == tag_id).first() is not None
    )
    if has_other_rule:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Zmienna {tag_id} ma już inny rodzaj alarmu; "
                "zmienna może mieć tylko jeden rodzaj alarmu."
            ),
        )


@router.get("", response_model=list[BitAlarmRuleRead])
def list_bit_alarms(db: Session = Depends(get_db)):
    return db.query(BitAlarmRule).all()


@router.get("/{rule_id}", response_model=BitAlarmRuleRead)
def get_bit_alarm(rule_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, rule_id)


@router.post("", response_model=BitAlarmRuleRead, status_code=201, dependencies=_write_protected)
def create_bit_alarm(payload: BitAlarmRuleCreate, db: Session = Depends(get_db)):
    # See app.db.alarm_rule_lock docstring: closes the TOCTOU window
    # between the "no threshold yet" check and the INSERT.
    with THRESHOLD_BIT_ALARM_LOCK:
        _assert_tag_exists_and_free_of_threshold(db, payload.tag_id, payload.bit_index)
        rule = BitAlarmRule(**payload.model_dump())
        db.add(rule)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409,
                detail=f"Zmienna {payload.tag_id} ma już alarm na bicie {payload.bit_index}.",
            )
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=BitAlarmRuleRead, dependencies=_write_protected)
def update_bit_alarm(
    rule_id: int, payload: BitAlarmRuleUpdate, db: Session = Depends(get_db)
):
    rule = _get_or_404(db, rule_id)
    if payload.bit_index is not None:
        reason = rule_incompatibility("bits", rule.tag.type, payload.bit_index)
        if reason:
            raise HTTPException(status_code=409, detail=reason)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Ten bit ma już opis alarmu w tej zmiennej.")
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204, dependencies=_write_protected)
def delete_bit_alarm(rule_id: int, db: Session = Depends(get_db)):
    rule = _get_or_404(db, rule_id)
    db.delete(rule)
    db.commit()
