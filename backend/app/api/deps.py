"""Shared FastAPI dependencies. Everything is pulled off `request.app.state`
rather than imported as module-level globals, so `app.main.create_app()`
can build fully isolated app instances for tests (own DB, own
supervisor/worker_factory, own LiveStore) without any monkeypatching.
"""
from __future__ import annotations

import hmac
import logging
from collections.abc import Iterator

from fastapi import Header, HTTPException, Request, status
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


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

    HIGH #B4: repeated *failed* attempts from the same client are rate
    limited (see app.api.rate_limit.FailedAuthLimiter, wired onto
    ``app.state.auth_limiter``) to blunt naive token-guessing. The correct
    token always succeeds and resets that client's failure count — rate
    limiting only ever kicks in on the invalid-token path, so it can
    never itself lock out the legitimate token holder. A blocked client
    sending yet another invalid token gets 429 (not 401) with a
    Retry-After header instead of a further recorded failure.
    """
    limiter = request.app.state.auth_limiter
    client_key = request.client.host if request.client else "unknown"

    expected = request.app.state.admin_token
    if x_admin_token and hmac.compare_digest(x_admin_token, expected):
        limiter.reset(client_key)
        return

    if limiter.is_blocked(client_key):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed admin-token attempts — try again later",
            headers={"Retry-After": str(int(limiter.window_s))},
        )

    limiter.record_failure(client_key)
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


def get_probe_client_factory(request: Request):
    """The snap7 client factory used by POST /api/plcs/{plc_id}/probe
    (see app.plc.probe). Pulled off app.state, like every other
    swappable dependency here, so tests can inject a MagicMock-returning
    factory via ``create_app(probe_client_factory=...)`` without any
    monkeypatching — and so a probe request never shares or contends with
    the supervisor's own per-PLC worker connections.
    """
    return request.app.state.probe_client_factory


def reload_supervisor(request: Request, db: Session) -> None:
    """Re-reads Plc/Tag config and reconciles running PLCWorker threads.
    Call after every CRUD write that could affect polling (Plc/Tag
    create/update/delete). ThresholdRule/BitAlarmRule writes do NOT need
    this — see app.plc.broadcaster docstring, alarm evaluation re-reads
    the DB every broadcast tick regardless.

    MEDIUM #B2: the CRUD write itself has already been committed to the
    DB by the time this runs — a failure here (e.g. a worker_factory that
    raises while spinning up a new PLCWorker) must not turn into a 500
    for a request that otherwise succeeded and whose data is already
    durable. Any exception is caught, logged with a full traceback, and
    reflected only as a generic health flag on app.state — never
    re-raised.
    """
    from app.db.config_loader import load_plcs, load_tags

    supervisor = get_supervisor(request)
    try:
        supervisor.reload(load_plcs(db), load_tags(db))
    except Exception:
        logger.exception(
            "reload_supervisor: PollingSupervisor.reload() failed after a "
            "successful DB write — config was committed, but polling "
            "threads may be out of sync with it"
        )
        request.app.state.supervisor_healthy = False
    else:
        request.app.state.supervisor_healthy = True
