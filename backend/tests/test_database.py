"""app.db.database — MEDIUM finding #7: this used to also define a
dead, unused module-level engine/SessionLocal/get_db (never imported
anywhere else) and ran os.makedirs as a side effect of merely importing
the module. Both are gone now: engine construction is lazy
(build_engine_and_sessionmaker), consolidated into the one call site
that needs it (app.main.create_app).
"""
import os

from sqlalchemy.orm import Session

from app.db.database import _database_url, build_engine_and_sessionmaker


def test_database_url_defaults_to_data_dashboard_db(monkeypatch, tmp_path):
    monkeypatch.delenv("DASHBOARD_DB_PATH", raising=False)
    monkeypatch.chdir(tmp_path)

    url = _database_url()

    assert url == "sqlite:///./data/dashboard.db"
    assert (tmp_path / "data").is_dir()  # directory created for the volume mount


def test_database_url_respects_env_override(monkeypatch, tmp_path):
    custom = tmp_path / "custom.db"
    monkeypatch.setenv("DASHBOARD_DB_PATH", str(custom))

    url = _database_url()

    assert url == f"sqlite:///{custom}"


def test_database_url_memory_shortcut(monkeypatch):
    monkeypatch.setenv("DASHBOARD_DB_PATH", ":memory:")
    assert _database_url() == "sqlite:///:memory:"


def test_build_engine_and_sessionmaker_with_explicit_url():
    engine, session_local = build_engine_and_sessionmaker("sqlite:///:memory:")
    session = session_local()
    try:
        assert isinstance(session, Session)
        assert session.bind is engine
    finally:
        session.close()
        engine.dispose()


def test_build_engine_and_sessionmaker_uses_default_when_url_omitted(monkeypatch):
    monkeypatch.setenv("DASHBOARD_DB_PATH", ":memory:")
    engine, session_local = build_engine_and_sessionmaker()
    try:
        assert str(engine.url) == "sqlite:///:memory:"
    finally:
        engine.dispose()
