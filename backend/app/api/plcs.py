from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import (
    get_db,
    get_probe_client_factory,
    reload_supervisor,
    require_admin_token,
)
from app.db.models import Plc
from app.db.schemas import PlcCreate, PlcRead, PlcUpdate, ProbeRequest
from app.plc.probe import ProbeConnectError, ProbeReadError, probe_tag_value

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/plcs", tags=["plcs"])
_write_protected = [Depends(require_admin_token)]


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


@router.post("", response_model=PlcRead, status_code=201, dependencies=_write_protected)
def create_plc(payload: PlcCreate, request: Request, db: Session = Depends(get_db)):
    plc = Plc(**payload.model_dump())
    db.add(plc)
    db.commit()
    db.refresh(plc)
    reload_supervisor(request, db)
    return plc


@router.put("/{plc_id}", response_model=PlcRead, dependencies=_write_protected)
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


@router.delete("/{plc_id}", status_code=204, dependencies=_write_protected)
def delete_plc(plc_id: int, request: Request, db: Session = Depends(get_db)):
    plc = _get_or_404(db, plc_id)
    db.delete(plc)
    db.commit()
    reload_supervisor(request, db)


@router.post("/{plc_id}/probe", dependencies=_write_protected)
def probe_plc_address(
    plc_id: int,
    payload: ProbeRequest,
    db: Session = Depends(get_db),
    client_factory=Depends(get_probe_client_factory),
):
    """Test-read an arbitrary S7 address on `plc_id` before committing it
    as a Tag (VariableAssignmentWizard.md §5.1). Uses its own short-lived
    snap7 client (app.plc.probe) — never the PollingSupervisor's already-
    running per-PLC worker connection, and never touches LiveStore.

    Never returns a 500: connect failures and read/decode failures both
    map to 502 with a bare error code, and the underlying exception is
    only ever logged server-side (never echoed back in the response
    body), even though this route is already admin-token-gated.
    """
    plc = _get_or_404(db, plc_id)

    try:
        value = probe_tag_value(
            plc={"ip": plc.ip, "rack": plc.rack, "slot": plc.slot},
            db=payload.db,
            offset=payload.offset,
            bit=payload.bit,
            tag_type=payload.type,
            client_factory=client_factory,
        )
    except ProbeConnectError:
        logger.exception(
            "PLC probe connect failed: plc_id=%s ip=%s", plc_id, plc.ip
        )
        return JSONResponse(status_code=502, content={"error": "connect_failed"})
    except ProbeReadError:
        logger.exception(
            "PLC probe read failed: plc_id=%s ip=%s db=%s offset=%s bit=%s type=%s",
            plc_id, plc.ip, payload.db, payload.offset, payload.bit, payload.type,
        )
        return JSONResponse(status_code=502, content={"error": "read_failed"})

    return {"value": value, "read_at": datetime.now(timezone.utc).isoformat()}
