import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.database import Base
from app.main import create_app


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
    )


@pytest.fixture()
def client(app):
    with TestClient(app) as c:
        yield c
