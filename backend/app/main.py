"""FastAPI app factory for the ProductionDashboard PLC backend.

A factory (`create_app`) rather than a single module-level `app` because
every layer below it (DB, PollingSupervisor, LiveStore, ws manager) needs
to be swappable per-instance for tests — see tests/conftest.py's `app`
fixture, which builds a fully isolated app per test with its own temp
SQLite file and a no-op worker factory (no real PLC threads in tests).
`app = create_app()` at the bottom is the production entry point used by
`uvicorn app.main:app` / the Dockerfile CMD.
"""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.admin import router as admin_router
from app.api.areas import router as areas_router
from app.api.bit_alarms import router as bit_alarms_router
from app.api.plcs import router as plcs_router
from app.api.status import router as status_router
from app.api.tags import router as tags_router
from app.api.thresholds import router as thresholds_router
from app.api.websocket import ConnectionManager
from app.api.ws_route import router as ws_router
from app.db.config_loader import load_plcs, load_tags
from app.db.database import Base, _database_url
from app.plc.broadcaster import broadcast_loop
from app.plc.live_store import LiveStore
from app.plc.supervisor import PollingSupervisor
from app.plc.worker import PLCWorker


def create_app(
    database_url: str | None = None,
    worker_factory=PLCWorker,
    poll_interval: float = 1.0,
) -> FastAPI:
    database_url = database_url or _database_url()
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)

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

    app.include_router(plcs_router)
    app.include_router(tags_router)
    app.include_router(thresholds_router)
    app.include_router(bit_alarms_router)
    app.include_router(areas_router)
    app.include_router(status_router)
    app.include_router(ws_router)
    app.include_router(admin_router)

    return app


app = create_app()
