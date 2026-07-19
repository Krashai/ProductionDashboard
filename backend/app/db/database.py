"""SQLAlchemy engine/session wiring.

SQLite is a deliberate choice from NewBackendPlan.md decision #3: a single
file on a Docker volume avoids running a second database *engine*
container on a resource-constrained Raspberry Pi, while still giving the
admin panel full CRUD via the ORM.

No engine/sessionmaker is built at import time here — only
``build_engine_and_sessionmaker()`` constructs one, and only when called.
``app.main.create_app()`` calls it once per app instance (production and
every test get their own isolated engine). This used to also hold a
module-level `engine`/`SessionLocal`/`get_db()` duplicating what
create_app built itself; that copy was never imported anywhere else
(confirmed via grep) and had the additional problem of running
``os.makedirs`` as a side effect of merely importing this module. Both
problems are fixed by making engine construction lazy and explicit.
"""
from __future__ import annotations

import os

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker


class Base(DeclarativeBase):
    pass


def _database_url() -> str:
    # DASHBOARD_DB_PATH lets Docker/tests point at a specific file (or
    # ":memory:") without touching code. Defaults to a local file next to
    # the app, matching the docker-compose volume mount at /app/data.
    path = os.getenv("DASHBOARD_DB_PATH", "./data/dashboard.db")
    if path == ":memory:":
        return "sqlite:///:memory:"
    directory = os.path.dirname(path)
    if directory:
        os.makedirs(directory, exist_ok=True)
    return f"sqlite:///{path}"


def build_engine_and_sessionmaker(database_url: str | None = None):
    """Build a fresh engine + sessionmaker for ``database_url`` (or the
    env-derived default when omitted). One call site (app.main.create_app)
    for both production and tests — no duplicated engine-construction
    logic to drift out of sync.
    """
    database_url = database_url or _database_url()
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    engine = create_engine(database_url, connect_args=connect_args)
    session_local = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    return engine, session_local
