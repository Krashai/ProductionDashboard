"""Shared FastAPI dependencies. Everything is pulled off `request.app.state`
rather than imported as module-level globals, so `app.main.create_app()`
can build fully isolated app instances for tests (own DB, own
supervisor/worker_factory, own LiveStore) without any monkeypatching.
"""
from __future__ import annotations

import hmac
from collections.abc import Iterator

from fastapi import Header, HTTPException, Request, status
from sqlalchemy.orm import Session


async def require_admin_token(
    request: Request,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> None:
    """Guards every mutating (POST/PUT/DELETE) /api/* route.

    NewBackendPlan.md decision #9 ("WS bez auth") applies ONLY to /ws —
    read-only telemetry on an internal network. It says nothing about the
    REST CRUD surface, and leaving that unauthenticated would let any
    host on the network delete PLC config (instant polling DoS) or
    repoint a PLC's IP (falsified wallboard readings). GET endpoints and
    /ws are intentionally left open; only writes require this header.

    The expected token is read from `request.app.state.admin_token`,
    which `app.main.create_app()` populates from the `ADMIN_API_TOKEN`
    env var (or an explicit constructor arg in tests) — never a
    hardcoded default, see create_app's docstring.
    """
    expected = request.app.state.admin_token
    if not x_admin_token or not hmac.compare_digest(x_admin_token, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Admin-Token header",
        )


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
