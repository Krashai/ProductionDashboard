"""CRUD for ThresholdRule. See app.db.models module docstring for the
rationale behind the threshold-XOR-bit-alarm rule enforced here.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.db.models import BitAlarmRule, Tag, ThresholdRule
from app.db.schemas import ThresholdRuleCreate, ThresholdRuleRead, ThresholdRuleUpdate

router = APIRouter(prefix="/api/thresholds", tags=["thresholds"])


def _get_or_404(db: Session, rule_id: int) -> ThresholdRule:
    rule = db.get(ThresholdRule, rule_id)
    if rule is None:
        raise HTTPException(status_code=404, detail=f"ThresholdRule {rule_id} not found")
    return rule


def _assert_tag_exists_and_free_of_bit_alarms(db: Session, tag_id: int) -> None:
    if db.get(Tag, tag_id) is None:
        raise HTTPException(status_code=404, detail=f"Tag {tag_id} not found")
    has_bit_alarm = (
        db.query(BitAlarmRule).filter(BitAlarmRule.tag_id == tag_id).first() is not None
    )
    if has_bit_alarm:
        raise HTTPException(
            status_code=409,
            detail=(
                f"Tag {tag_id} already has bit-alarm rule(s); a tag may have "
                "either a threshold or bit-alarm rules, never both."
            ),
        )


@router.get("", response_model=list[ThresholdRuleRead])
def list_thresholds(db: Session = Depends(get_db)):
    return db.query(ThresholdRule).all()


@router.get("/{rule_id}", response_model=ThresholdRuleRead)
def get_threshold(rule_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, rule_id)


@router.post("", response_model=ThresholdRuleRead, status_code=201)
def create_threshold(payload: ThresholdRuleCreate, db: Session = Depends(get_db)):
    _assert_tag_exists_and_free_of_bit_alarms(db, payload.tag_id)
    rule = ThresholdRule(**payload.model_dump())
    db.add(rule)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail=f"Tag {payload.tag_id} already has a threshold rule"
        )
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=ThresholdRuleRead)
def update_threshold(
    rule_id: int, payload: ThresholdRuleUpdate, db: Session = Depends(get_db)
):
    rule = _get_or_404(db, rule_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
def delete_threshold(rule_id: int, db: Session = Depends(get_db)):
    rule = _get_or_404(db, rule_id)
    db.delete(rule)
    db.commit()
