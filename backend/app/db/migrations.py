"""In-place schema upgrades for an existing SQLite config database.

`Base.metadata.create_all` creates tables that don't exist yet (e.g.
bool_alarm_rules), but never adds columns to tables that already do. The
Pi holds a live config DB created by an older schema, so every column
added to an existing table since then is listed here and added with
ALTER TABLE on startup. Idempotent: a column that already exists is left
alone, and no existing row is touched beyond receiving the default.
"""
from __future__ import annotations

from sqlalchemy import Engine, inspect, text

from app.db.database import Base

# (table, column, SQLite DDL for the column) — append-only.
_ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("threshold_rules", "hysteresis", "FLOAT NOT NULL DEFAULT 0"),
    ("threshold_rules", "delay_s", "FLOAT NOT NULL DEFAULT 0"),
]


def ensure_schema(engine: Engine) -> None:
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column not in existing:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
