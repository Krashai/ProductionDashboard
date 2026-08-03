"""Tests for POST /api/plcs/{plc_id}/probe (VariableAssignmentWizard.md
§5.1) — test-read an arbitrary address before committing it as a Tag.

Each test builds its own app instance (rather than reusing the shared
`client`/`app` fixtures from conftest.py) so it can inject its own mock
snap7 client via `probe_client_factory` — the probe endpoint's own
dependency-injection point (app.api.deps.get_probe_client_factory),
deliberately separate from `worker_factory`/`PollingSupervisor` since a
probe must never touch an already-running PLCWorker's connection.
"""
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from snap7.util import set_bool, set_real

from app.main import create_app
from tests.conftest import TEST_ADMIN_TOKEN, NoopWorker


def _plc_payload(**overrides):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    payload.update(overrides)
    return payload


def _probe_payload(**overrides):
    payload = dict(db=1, offset=0, bit=0, type="REAL")
    payload.update(overrides)
    return payload


def _seed_plc(client):
    return client.post("/api/plcs", json=_plc_payload()).json()


@pytest.fixture()
def mock_client():
    return MagicMock()


@pytest.fixture()
def probe_app(tmp_path, mock_client):
    db_path = tmp_path / "probe_test.db"
    return create_app(
        database_url=f"sqlite:///{db_path}",
        worker_factory=NoopWorker,
        poll_interval=0.05,
        admin_token=TEST_ADMIN_TOKEN,
        probe_client_factory=lambda: mock_client,
        # No-op success by default — a real bare-TCP probe would attempt
        # an actual socket connection to the fake IPs used throughout
        # this file. Tests that specifically exercise the pre-connect
        # probe failure path (below) override this via a fresh app.
        probe_tcp_probe=lambda ip, timeout: None,
    )


@pytest.fixture()
def probe_client(probe_app):
    with TestClient(probe_app, headers={"X-Admin-Token": TEST_ADMIN_TOKEN}) as c:
        yield c


@pytest.fixture()
def anon_probe_client(probe_app):
    with TestClient(probe_app) as c:
        yield c


# --- Happy path ------------------------------------------------------------

def test_probe_real_returns_decoded_value_and_read_at(probe_client, mock_client):
    plc = _seed_plc(probe_client)
    mock_client.get_connected.return_value = False
    raw = bytearray(8)
    set_real(raw, 0, 12.5)
    mock_client.db_read.return_value = raw

    resp = probe_client.post(
        f"/api/plcs/{plc['id']}/probe", json=_probe_payload(db=1, offset=0, type="REAL")
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["value"] == pytest.approx(12.5)
    assert isinstance(body["read_at"], str) and body["read_at"]
    mock_client.connect.assert_called_once_with(plc["ip"], plc["rack"], plc["slot"])
    mock_client.db_read.assert_called_once_with(1, 0, 4)
    mock_client.disconnect.assert_called_once()


def test_probe_bool_decodes_correct_bit_within_the_byte(probe_client, mock_client):
    plc = _seed_plc(probe_client)
    raw = bytearray(2)
    set_bool(raw, 0, 3, True)
    mock_client.db_read.return_value = raw

    resp = probe_client.post(
        f"/api/plcs/{plc['id']}/probe",
        json=_probe_payload(db=2, offset=0, bit=3, type="BOOL"),
    )

    assert resp.status_code == 200
    assert resp.json()["value"] is True
    mock_client.db_read.assert_called_once_with(2, 0, 1)


def test_probe_bool_false_bit_is_distinguished_from_true(probe_client, mock_client):
    plc = _seed_plc(probe_client)
    raw = bytearray(2)
    set_bool(raw, 0, 3, False)
    mock_client.db_read.return_value = raw

    resp = probe_client.post(
        f"/api/plcs/{plc['id']}/probe",
        json=_probe_payload(db=2, offset=0, bit=3, type="BOOL"),
    )

    assert resp.status_code == 200
    assert resp.json()["value"] is False


# --- 404 ---------------------------------------------------------------

def test_probe_against_nonexistent_plc_returns_404(probe_client):
    resp = probe_client.post("/api/plcs/9999/probe", json=_probe_payload())
    assert resp.status_code == 404


# --- 401 ---------------------------------------------------------------

def test_probe_without_admin_token_is_rejected(probe_client, anon_probe_client):
    plc = _seed_plc(probe_client)

    resp = anon_probe_client.post(f"/api/plcs/{plc['id']}/probe", json=_probe_payload())

    assert resp.status_code == 401


# --- 502 connect_failed, and state isolation ----------------------------

def test_probe_connect_failure_returns_502_and_leaves_live_store_and_supervisor_untouched(
    probe_client, mock_client, probe_app
):
    plc = _seed_plc(probe_client)
    mock_client.connect.side_effect = RuntimeError("connection refused")

    before_live_store = probe_app.state.live_store.snapshot()
    before_active_ids = probe_app.state.supervisor.active_plc_ids

    resp = probe_client.post(f"/api/plcs/{plc['id']}/probe", json=_probe_payload())

    assert resp.status_code == 502
    assert resp.json() == {"error": "connect_failed"}
    assert "connection refused" not in resp.text
    assert probe_app.state.live_store.snapshot() == before_live_store
    assert probe_app.state.supervisor.active_plc_ids == before_active_ids
    mock_client.disconnect.assert_called_once()  # finally block still runs


# --- 502 connect_failed via the pre-connect TCP probe --------------------
# The bare-TCP probe (not client.connect() itself) is the actual fail-fast
# guarantee — see app.plc.probe / app.plc.worker module docstrings for why
# a real snap7 client's own set_param-based timeout is a silent no-op.

def test_probe_tcp_probe_failure_returns_502_and_never_calls_client_connect(tmp_path, mock_client):
    db_path = tmp_path / "probe_tcp_fail.db"
    app = create_app(
        database_url=f"sqlite:///{db_path}",
        worker_factory=NoopWorker,
        poll_interval=0.05,
        admin_token=TEST_ADMIN_TOKEN,
        probe_client_factory=lambda: mock_client,
        probe_tcp_probe=lambda ip, timeout: (_ for _ in ()).throw(OSError("timed out")),
    )
    with TestClient(app, headers={"X-Admin-Token": TEST_ADMIN_TOKEN}) as client:
        plc = _seed_plc(client)

        resp = client.post(f"/api/plcs/{plc['id']}/probe", json=_probe_payload())

        assert resp.status_code == 502
        assert resp.json() == {"error": "connect_failed"}
        assert "timed out" not in resp.text
        mock_client.connect.assert_not_called()


# --- 502 read_failed -----------------------------------------------------

def test_probe_read_failure_returns_502(probe_client, mock_client):
    plc = _seed_plc(probe_client)
    mock_client.db_read.side_effect = RuntimeError("read timeout")

    resp = probe_client.post(f"/api/plcs/{plc['id']}/probe", json=_probe_payload())

    assert resp.status_code == 502
    assert resp.json() == {"error": "read_failed"}
    assert "read timeout" not in resp.text
    mock_client.disconnect.assert_called_once()


def test_probe_decode_failure_returns_502_read_failed(probe_client, mock_client):
    """A too-short/garbage buffer that makes decode_tag_value itself raise
    (not just db_read) must also map to read_failed, not a 500."""
    plc = _seed_plc(probe_client)
    mock_client.db_read.return_value = bytearray(0)  # too short for REAL

    resp = probe_client.post(
        f"/api/plcs/{plc['id']}/probe", json=_probe_payload(type="REAL")
    )

    assert resp.status_code == 502
    assert resp.json() == {"error": "read_failed"}


# --- 422 validation ------------------------------------------------------

def test_probe_rejects_unsupported_type(probe_client):
    plc = _seed_plc(probe_client)
    resp = probe_client.post(
        f"/api/plcs/{plc['id']}/probe", json=_probe_payload(type="TIMER")
    )
    assert resp.status_code == 422


@pytest.mark.parametrize(
    "field,value",
    [
        ("db", -1),
        ("db", 65536),
        ("offset", -1),
        ("offset", 65536),
        ("bit", -1),
        ("bit", 8),
    ],
)
def test_probe_rejects_out_of_range_address_fields(probe_client, field, value):
    plc = _seed_plc(probe_client)
    payload = _probe_payload()
    payload[field] = value

    resp = probe_client.post(f"/api/plcs/{plc['id']}/probe", json=payload)

    assert resp.status_code == 422
