"""SQLAlchemy engine/session wiring.

SQLite is a deliberate choice from NewBackendPlan.md decision #3: a single
file on a Docker volume avoids running a second database *engine*
container on a resource-constrained Raspberry Pi, while still giving the
admin panel full CRUD via the ORM.
"""
from __future__ import annotations

import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


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


engine = create_engine(
    _database_url(),
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped Session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
