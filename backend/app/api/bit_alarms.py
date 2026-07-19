"""CRUD for BitAlarmRule. See app.db.models module docstring for the
rationale behind the threshold-XOR-bit-alarm rule enforced here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import BitAlarmRule, Tag, ThresholdRule
from app.db.schemas import BitAlarmRuleCreate, BitAlarmRuleRead, BitAlarmRuleUpdate

router = APIRouter(prefix="/api/bit-alarms", tags=["bit-alarms"])


def _get_or_404(db: Session, rule_id: int) -> BitAlarmRule:
    rule = db.get(BitAlarmRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"BitAlarmRule {rule_id} not found")
    return rule


def _assert_tag_exists_and_free_of_threshold(db: Session, tag_id: int) -> None:
    if db.get(Tag, tag_id) is None:
        raise HTTPException(status_code=404, detail=f"Tag {tag_id} not found")
    has_threshold = (
        db.query(ThresholdRule).filter(ThresholdRule.tag_id == tag_id).first() is not None
    )
    if has_threshold:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Tag {tag_id} already has a threshold rule; a tag may have "
                "either a threshold or bit-alarm rules, never both."
            ),
        )


@router.get("", response_model=list[BitAlarmRuleRead])
def list_bit_alarms(db: Session = Depends(get_db)):
    return db.query(BitAlarmRule).all()


@router.get("/{rule_id}", response_model=BitAlarmRuleRead)
def get_bit_alarm(rule_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, rule_id)


@router.post("", response_model=BitAlarmRuleRead, status_code=201)
def create_bit_alarm(payload: BitAlarmRuleCreate, db: Session = Depends(get_db)):
    _assert_tag_exists_and_free_of_threshold(db, payload.tag_id)
    rule = BitAlarmRule(**payload.model_dump())
    db.add(rule)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=(
                f"Tag {payload.tag_id} already has a bit-alarm rule for "
                f"bit {payload.bit_index}"
            ),
        )
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=BitAlarmRuleRead)
def update_bit_alarm(
    rule_id: int, payload: BitAlarmRuleUpdate, db: Session = Depends(get_db)
):
    rule = _get_or_404(db, rule_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="bit_index already in use for this tag")
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_bit_alarm(rule_id: int, db: Session = Depends(get_db)):
    rule = _get_or_404(db, rule_id)
    db.delete(rule)
    db.commit()
