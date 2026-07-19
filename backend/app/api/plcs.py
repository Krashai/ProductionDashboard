from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.api.deps import get_db, reload_supervisor
from app.db.models import Plc
from app.db.schemas import PlcCreate, PlcRead, PlcUpdate

router = APIRouter(prefix="/api/plcs", tags=["plcs"])


def _get_or_404(db: Session, plc_id: int) -> Plc:
    plc = db.get(Plc, plc_id)
    if plc is None:
        raise HTTPException(status_code=404, detail=f"PLC {plc_id} not found")
    return plc


@router.get("", response_model=list[PlcRead])
def list_plcs(db: Session = Depends(get_db)):
    return db.query(Plc).all()


@router.get("/{plc_id}", response_model=PlcRead)
def get_plc(plc_id: int, db: Session = Depends(get_db)):
    return _get_or_404(db, plc_id)


@router.post("", response_model=PlcRead, status_code=201)
def create_plc(payload: PlcCreate, request: Request, db: Session = Depends(get_db)):
    plc = Plc(**payload.model_dump())
    db.add(plc)
    db.commit()
    db.refresh(plc)
    reload_supervisor(request, db)
    return plc


@router.put("/{plc_id}", response_model=PlcRead)
def update_plc(
    plc_id: int, payload: PlcUpdate, request: Request, db: Session = Depends(get_db)
):
    plc = _get_or_404(db, plc_id)
    for field, value in payload.model_dump().items():
        setattr(plc, field, value)
    db.commit()
    db.refresh(plc)
    reload_supervisor(request, db)
    return plc


@router.delete("/{plc_id}", status_code=204)
def delete_plc(plc_id: int, request: Request, db: Session = Depends(get_db)):
    plc = _get_or_404(db, plc_id)
    db.delete(plc)
    db.commit()
    reload_supervisor(request, db)
