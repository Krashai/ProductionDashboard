from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, reload_supervisor, require_admin_token
from app.db.models import Plc, Tag
from app.db.schemas import TagCreate, TagRead, TagUpdate
from app.domain.areas import METRIC_TO_AREA

router = APIRouter(prefix="/api/tags", tags=["tags"])
_write_protected = [Depends(require_admin_token)]


def _get_or_404(db: Session, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail=f"Tag {tag_id} not found")
    return tag


def _get_plc_or_404(db: Session, plc_id: int) -> Plc:
    plc = db.get(Plc, plc_id)
    if plc is None:
        raise HTTPException(status_code=404, detail=f"PLC {plc_id} not found")
    return plc


def _assert_metric_id_matches_plc_area(plc: Plc, metric_id: str) -> None:
    """A tag's metric_id, IF it names one of the known areas.ts metrics
    (app.domain.areas.METRIC_TO_AREA), must belong to the area its own
    PLC is assigned to — otherwise a misconfigured tag would silently
    overwrite the value on the wrong wallboard card (e.g. a Chłodnia-2
    PLC accidentally tagged with metric_id="chlodnia-1-temp"). metric_ids
    that aren't in the known set at all (diagnostic-only bit-alarm tags,
    see app.plc.aggregator) are exempt — they never render on a metric
    card, only on the area's alarm bar.
    """
    owning_area = METRIC_TO_AREA.get(metric_id)
    if owning_area is not None and owning_area != plc.area_id:
        raise HTTPException(
            status_code=409,
            detail=(
                f"metric_id {metric_id!r} belongs to area {owning_area!r}, "
                f"but this tag's PLC is in area {plc.area_id!r}"
            ),
        )


@router.get("", response_model=list[TagRead])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).all()


@router.get("/{tag_id}", response_model=TagRead)
def get_tag(tag_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, tag_id)


@router.post("", response_model=TagRead, status_code=201, dependencies=_write_protected)
def create_tag(payload: TagCreate, request: Request, db: Session = Depends(get_db)):
    plc = _get_plc_or_404(db, payload.plc_id)
    _assert_metric_id_matches_plc_area(plc, payload.metric_id)
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


@router.put("/{tag_id}", response_model=TagRead, dependencies=_write_protected)
def update_tag(
    tag_id: int, payload: TagUpdate, request: Request, db: Session = Depends(get_db)
):
    tag = _get_or_404(db, tag_id)
    plc = _get_plc_or_404(db, payload.plc_id)
    _assert_metric_id_matches_plc_area(plc, payload.metric_id)
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


@router.delete("/{tag_id}", status_code=204, dependencies=_write_protected)
def delete_tag(tag_id: int, request: Request, db: Session = Depends(get_db)):
    tag = _get_or_404(db, tag_id)
    db.delete(tag)
    db.commit()
    reload_supervisor(request, db)
