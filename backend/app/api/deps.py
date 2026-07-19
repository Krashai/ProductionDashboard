"""Shared FastAPI dependencies. Everything is pulled off `request.app.state`
rather than imported as module-level globals, so `app.main.create_app()`
can build fully isolated app instances for tests (own DB, own
supervisor/worker_factory, own LiveStore) without any monkeypatching.
"""
from __future__ import annotations

from collections.abc import Iterator

from fastapi import Request
from sqlalchemy.orm import Session


def get_db(request: Request) -> Iterator[Session]:
    session_local = request.app.state.session_local
    db = session_local()
    try:
        yield db
    finally:
        db.close()


def get_supervisor(request: Request):
    return request.app.state.supervisor


def get_live_store(request: Request):
    return request.app.state.live_store


def get_ws_manager(request: Request):
    return request.app.state.ws_manager


def reload_supervisor(request: Request, db: Session) -> None:
    """Re-reads Plc/Tag config and reconciles running PLCWorker threads.
    Call after every CRUD write that could affect polling (Plc/Tag
    create/update/delete). ThresholdRule/BitAlarmRule writes do NOT need
    this — see app.plc.broadcaster docstring, alarm evaluation re-reads
    the DB every broadcast tick regardless.
    """
    from app.db.config_loader import load_plcs, load_tags

    supervisor = get_supervisor(request)
    supervisor.reload(load_plcs(db), load_tags(db))
