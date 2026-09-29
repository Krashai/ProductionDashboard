from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import get_db, schedule_supervisor_reload, require_admin_token
from app.db.models import Plc, Tag
from app.db.schemas import TagCreate, TagRead, TagUpdate
from app.domain.alarm_kinds import rule_incompatibility
from app.domain.areas import METRIC_TO_AREA

router = APIRouter(prefix="/api/tags", tags=["tags"])
_write_protected = [Depends(require_admin_token)]


def _get_or_404(db: Session, tag_id: int) -> Tag:
    tag = db.get(Tag, tag_id)
    if tag is None:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono zmiennej {tag_id}.")
    return tag


def _get_plc_or_404(db: Session, plc_id: int) -> Plc:
    plc = db.get(Plc, plc_id)
    if plc is None:
        raise HTTPException(status_code=404, detail=f"Nie znaleziono sterownika PLC {plc_id}.")
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
                f"Metryka {metric_id!r} należy do obszaru {owning_area!r}, "
                f"a sterownik tej zmiennej jest w obszarze {plc.area_id!r}."
            ),
        )


def _assert_alarm_survives_type_change(tag: Tag, new_type: str) -> None:
    """Changing a tag's type must not leave behind an alarm rule that can
    no longer fire (bit 12 on a BYTE, a threshold on a BOOL...)."""
    from app.api.alarm_config import read_alarm_config

    config = read_alarm_config(tag)
    if config.kind == "none" or config.implicit:
        return
    reasons = [rule_incompatibility(config.kind, new_type)]
    if config.kind == "bits":
        reasons += [rule_incompatibility("bits", new_type, b.bit_index) for b in config.bits or []]
    reason = next((r for r in reasons if r), None)
    if reason:
        raise HTTPException(
            status_code=409,
            detail=f"Nie można zmienić typu na {new_type}: skonfigurowany alarm przestałby działać. {reason} Zmień lub usuń alarm.",
        )


def _raise_for_tag_integrity_error(exc: IntegrityError, payload: TagCreate | TagUpdate) -> None:
    """Two distinct UNIQUE constraints can fire on Tag writes — metric_id
    (global) and the (plc_id, name) pair (per-PLC, see
    app.db.models.Tag.__table_args__). SQLite's IntegrityError message
    names the offending column(s) (e.g. "UNIQUE constraint failed:
    tags.plc_id, tags.name" vs "...tags.metric_id"), so we inspect that
    text to return a 409 worded for whichever one actually conflicted,
    instead of always blaming metric_id.
    """
    message = str(exc.orig)
    if "tags.plc_id" in message and "tags.name" in message:
        raise HTTPException(
            status_code=409,
            detail=f"Nazwa {payload.name!r} jest już używana przez inną zmienną na tym PLC.",
        )
    raise HTTPException(
        status_code=409,
        detail=f"Metryka {payload.metric_id!r} jest już przypisana do innej zmiennej.",
    )


@router.get("", response_model=list[TagRead])
def list_tags(db: Session = Depends(get_db)):
    return db.query(Tag).all()


@router.get("/{tag_id}", response_model=TagRead)
def get_tag(tag_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, tag_id)


@router.post("", response_model=TagRead, status_code=201, dependencies=_write_protected)
def create_tag(payload: TagCreate, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    plc = _get_plc_or_404(db, payload.plc_id)
    _assert_metric_id_matches_plc_area(plc, payload.metric_id)
    tag = Tag(**payload.model_dump())
    db.add(tag)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_for_tag_integrity_error(exc, payload)
    db.refresh(tag)
    schedule_supervisor_reload(request, background_tasks)
    return tag


@router.put("/{tag_id}", response_model=TagRead, dependencies=_write_protected)
def update_tag(
    tag_id: int, payload: TagUpdate, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)
):
    tag = _get_or_404(db, tag_id)
    plc = _get_plc_or_404(db, payload.plc_id)
    _assert_metric_id_matches_plc_area(plc, payload.metric_id)
    if payload.type != tag.type:
        _assert_alarm_survives_type_change(tag, payload.type)
    for field, value in payload.model_dump().items():
        setattr(tag, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        _raise_for_tag_integrity_error(exc, payload)
    db.refresh(tag)
    schedule_supervisor_reload(request, background_tasks)
    return tag


@router.delete("/{tag_id}", status_code=204, dependencies=_write_protected)
def delete_tag(tag_id: int, request: Request, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    tag = _get_or_404(db, tag_id)
    db.delete(tag)
    db.commit()
    schedule_supervisor_reload(request, background_tasks)
