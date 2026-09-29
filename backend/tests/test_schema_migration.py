"""The Pi already holds a SQLite file with real PLC/tag config created by
the previous schema. `Base.metadata.create_all` creates missing *tables*
but never adds columns to existing ones, so new ThresholdRule columns must
be added in place — without losing any rows."""
from sqlalchemy import create_engine, inspect, text

from app.db.migrations import ensure_schema

OLD_SCHEMA = [
    "CREATE TABLE plcs (id INTEGER PRIMARY KEY, name VARCHAR NOT NULL, area_id VARCHAR NOT NULL,"
    " ip VARCHAR NOT NULL, rack INTEGER NOT NULL, slot INTEGER NOT NULL, plc_type VARCHAR NOT NULL)",
    "CREATE TABLE tags (id INTEGER PRIMARY KEY, plc_id INTEGER NOT NULL, name VARCHAR NOT NULL,"
    " db INTEGER NOT NULL, offset INTEGER NOT NULL, bit INTEGER NOT NULL, type VARCHAR NOT NULL,"
    " metric_id VARCHAR NOT NULL UNIQUE, label VARCHAR NOT NULL, unit VARCHAR NOT NULL,"
    " decimals INTEGER NOT NULL)",
    "CREATE TABLE threshold_rules (id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL UNIQUE,"
    " min FLOAT, max FLOAT)",
    "CREATE TABLE bit_alarm_rules (id INTEGER PRIMARY KEY, tag_id INTEGER NOT NULL,"
    " bit_index INTEGER NOT NULL, description VARCHAR NOT NULL)",
    "INSERT INTO plcs VALUES (1, 'PLC', 'chlodnia-1', '10.10.0.10', 0, 1, 'S7-1200')",
    "INSERT INTO tags VALUES (1, 1, 't', 6, 112, 0, 'REAL', 'chlodnia-1-temp', 'Temp', '°C', 1)",
    "INSERT INTO threshold_rules VALUES (1, 1, 2.0, 8.0)",
]


def _old_db(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with engine.begin() as conn:
        for stmt in OLD_SCHEMA:
            conn.execute(text(stmt))
    return engine


def test_adds_new_threshold_columns_and_keeps_existing_rules(tmp_path):
    engine = _old_db(tmp_path)

    ensure_schema(engine)

    columns = {c["name"] for c in inspect(engine).get_columns("threshold_rules")}
    assert {"hysteresis", "delay_s"} <= columns
    with engine.connect() as conn:
        row = conn.execute(text("SELECT min, max, hysteresis, delay_s FROM threshold_rules")).one()
    assert tuple(row) == (2.0, 8.0, 0.0, 0.0)


def test_creates_the_new_bool_alarm_table(tmp_path):
    engine = _old_db(tmp_path)

    ensure_schema(engine)

    assert "bool_alarm_rules" in inspect(engine).get_table_names()


def test_is_idempotent(tmp_path):
    engine = _old_db(tmp_path)

    ensure_schema(engine)
    ensure_schema(engine)

    with engine.connect() as conn:
        assert conn.execute(text("SELECT count(*) FROM threshold_rules")).scalar() == 1
