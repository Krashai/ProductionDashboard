import os

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# app.main's module-level `app = create_app()` (the production
# `uvicorn app.main:app` entry point) runs unconditionally on import —
# see its comment for why a "skip if unset" guard there is actively
# harmful. That means merely importing app.main (next line) needs
# ADMIN_API_TOKEN set to *something*. This placeholder is never used by
# any real test: every test below builds its own fully isolated app via
# create_app(admin_token=TEST_ADMIN_TOKEN, ...) and never touches
# app.main's module-level `app` object. setdefault() so a real
# ADMIN_API_TOKEN in the environment (there shouldn't be one in CI/dev)
# is never clobbered.
os.environ.setdefault("ADMIN_API_TOKEN", "conftest-import-placeholder-unused-by-tests")

from app.db.database import Base  # noqa: E402
from app.main import create_app  # noqa: E402


@pytest.fixture()
def db_session():
    """Fresh in-memory SQLite DB per test — fast and fully isolated."""
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(
        bind=engine, autoflush=False, autocommit=False
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        engine.dispose()


class NoopWorker:
    """Stand-in for PLCWorker in API/integration tests: CRUD endpoints
    trigger PollingSupervisor.reload() as a side effect, which would
    otherwise spin up a real thread trying to open a TCP connection to
    whatever fake IP the test used. This double makes start/stop/join
    harmless no-ops so CRUD tests stay fast and hermetic.
    """

    def __init__(self, plc, tags, live_store, poll_interval=1.0):
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval

    def start(self):
        pass

    def stop(self):
        pass

    def join(self, timeout=None):
        pass


TEST_ADMIN_TOKEN = "test-admin-token-do-not-use-in-prod"


@pytest.fixture()
def app(tmp_path):
    """A fully wired FastAPI app instance backed by its own temp SQLite
    file (so multiple connections/sessions within the same test share
    state, unlike sqlite:///:memory: which is per-connection) and a
    no-op worker factory so no real PLC threads spawn. Not entered as a
    TestClient context manager here — the `client` fixture below does
    that exactly once, since entering twice would run the lifespan (and
    the broadcaster task) twice.
    """
    db_path = tmp_path / "test.db"
    return create_app(
        database_url=f"sqlite:///{db_path}",
        worker_factory=NoopWorker,
        poll_interval=0.05,
        admin_token=TEST_ADMIN_TOKEN,
    )


@pytest.fixture()
def client(app):
    """Default client used by all CRUD/behavior tests. Carries a valid
    X-Admin-Token on every request (harmless on GET, required on
    POST/PUT/DELETE) so existing tests keep exercising CRUD behavior
    without also having to think about auth — the auth mechanism itself
    is covered separately in tests/test_api_auth.py.
    """
    with TestClient(app, headers={"X-Admin-Token": TEST_ADMIN_TOKEN}) as c:
        yield c


@pytest.fixture()
def anon_client(app):
    """Same app, no admin token attached — for auth-specific tests."""
    with TestClient(app) as c:
        yield c
