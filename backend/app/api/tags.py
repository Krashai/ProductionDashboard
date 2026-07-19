from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, reload_supervisor
from app.db.models import Plc, Tag
from app.db.schemas import TagCreate, TagRead, TagUpdate

router = APIRouter(prefix="/api/tags", tags=["tags"])


def _get_or_404(db: Session, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail=f"Tag {tag_id} not found")
    return tag


def _assert_plc_exists(db: Session, plc_id: int) -> None:
    if db.get(Plc, plc_id) is None:
        raise HTTPException(status_code=404, detail=f"PLC {plc_id} not found")


@router.get("", response_model=list[TagRead])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).all()


@router.get("/{tag_id}", response_model=TagRead)
def get_tag(tag_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, tag_id)


@router.post("", response_model=TagRead, status_code=201)
def create_tag(payload: TagCreate, request: Request, db: Session = Depends(get_db)):
    _assert_plc_exists(db, payload.plc_id)
    tag = Tag(**payload.model_dump())
    db.add(tag)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"metric_id {payload.metric_id!r} is already in use by another tag",
        )
    db.refresh(tag)
    reload_supervisor(request, db)
    return tag


@router.put("/{tag_id}", response_model=TagRead)
def update_tag(
    tag_id: int, payload: TagUpdate, request: Request, db: Session = Depends(get_db)
):
    tag = _get_or_404(db, tag_id)
    _assert_plc_exists(db, payload.plc_id)
    for field, value in payload.model_dump().items():
        setattr(tag, field, value)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"metric_id {payload.metric_id!r} is already in use by another tag",
        )
    db.refresh(tag)
    reload_supervisor(request, db)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(tag_id: int, request: Request, db: Session = Depends(get_db)):
    tag = _get_or_404(db, tag_id)
    db.delete(tag)
    db.commit()
    reload_supervisor(request, db)
