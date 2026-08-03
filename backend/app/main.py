"""FastAPI app factory for the ProductionDashboard PLC backend.

A factory (`create_app`) rather than a single module-level `app` because
every layer below it (DB, PollingSupervisor, LiveStore, ws manager) needs
to be swappable per-instance for tests — see tests/conftest.py's `app`
fixture, which builds a fully isolated app per test with its own temp
SQLite file and a no-op worker factory (no real PLC threads in tests).
`app = create_app()` at the bottom is the production entry point used by
`uvicorn app.main:app` / the Dockerfile CMD — see its comment for why
that line is guarded rather than unconditional.
"""
from __future__ import annotations

import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.admin import router as admin_router
from app.api.areas import router as areas_router
from app.api.bit_alarms import router as bit_alarms_router
from app.api.plcs import router as plcs_router
from app.api.rate_limit import FailedAuthLimiter
from app.api.status import router as status_router
from app.api.tags import router as tags_router
from app.api.thresholds import router as thresholds_router
from app.api.websocket import ConnectionManager
from app.api.ws_route import router as ws_router
from app.db.config_loader import load_plcs, load_tags
from app.db.database import Base, build_engine_and_sessionmaker
from app.plc.broadcaster import broadcast_loop
from app.plc.live_store import LiveStore
from app.plc.supervisor import PollingSupervisor
from app.plc.worker import PLCWorker


def create_app(
    database_url: str | None = None,
    worker_factory=PLCWorker,
    poll_interval: float = 1.0,
    admin_token: str | None = None,
    auth_limiter: FailedAuthLimiter | None = None,
) -> FastAPI:
    """Build one fully-wired app instance.

    ``admin_token`` guards every mutating /api/* route (see
    app.api.deps.require_admin_token) and is resolved from, in order: the
    explicit argument (tests), then the ``ADMIN_API_TOKEN`` env var
    (production/Docker). There is deliberately no hardcoded fallback —
    if neither is set, this raises immediately rather than silently
    running with an open write API.

    ``auth_limiter`` (HIGH #B4) is an optional pre-built
    ``FailedAuthLimiter`` — mainly so tests can inject one constructed
    with a fake ``now`` callable to control the sliding window
    deterministically. Defaults to a fresh ``FailedAuthLimiter()`` (real
    wall-clock, process-lifetime state) when not given.
    """
    admin_token = admin_token or os.getenv("ADMIN_API_TOKEN")
    if not admin_token:
        raise RuntimeError(
            "ADMIN_API_TOKEN must be set (env var, or admin_token= for "
            "tests) — refusing to start with an unauthenticated write API. "
            "No default token is hardcoded, by design."
        )

    engine, session_local = build_engine_and_sessionmaker(database_url)

    live_store = LiveStore()
    supervisor = PollingSupervisor(
        live_store=live_store, worker_factory=worker_factory, poll_interval=poll_interval
    )
    ws_manager = ConnectionManager()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        Base.metadata.create_all(bind=engine)

        db = session_local()
        try:
            supervisor.reload(load_plcs(db), load_tags(db))
        finally:
            db.close()

        broadcaster_task = asyncio.create_task(
            broadcast_loop(session_local, live_store, ws_manager, poll_interval)
        )
        try:
            yield
        finally:
            broadcaster_task.cancel()
            try:
                await broadcaster_task
            except asyncio.CancelledError:
                pass
            supervisor.shutdown()
            engine.dispose()

    app = FastAPI(title="ProductionDashboard PLC Backend", lifespan=lifespan)
    app.state.session_local = session_local
    app.state.engine = engine
    app.state.supervisor = supervisor
    app.state.live_store = live_store
    app.state.ws_manager = ws_manager
    app.state.admin_token = admin_token
    app.state.auth_limiter = auth_limiter or FailedAuthLimiter()

    app.include_router(plcs_router)
    app.include_router(tags_router)
    app.include_router(thresholds_router)
    app.include_router(bit_alarms_router)
    app.include_router(areas_router)
    app.include_router(status_router)
    app.include_router(ws_router)
    app.include_router(admin_router)

    return app


# Production entry point for `uvicorn app.main:app` / the Dockerfile CMD.
#
# Deliberately unconditional — a previous version of this line guarded
# it behind `if os.getenv("ADMIN_API_TOKEN") else None`, on the theory
# that plain imports (`from app.main import create_app`, as
# tests/conftest.py does) shouldn't require the production secret. That
# backfired: with `app = None`, uvicorn doesn't error at startup at all
# — it silently treats `None` as a lifespan-less ASGI app, binds the
# port, and logs "ASGI 'lifespan' protocol appears unsupported" instead
# of the intended fail-fast RuntimeError, only breaking on the first
# actual request. That is worse than the plain crash this line is
# supposed to guarantee. So: this now always calls create_app(), and it
# is tests/conftest.py's job (not this module's) to make plain imports
# safe — it sets a harmless placeholder ADMIN_API_TOKEN before ever
# importing this module, since every test then builds its own isolated
# app via create_app(admin_token=...) anyway and never touches this
# module-level `app` object.
app = create_app()
