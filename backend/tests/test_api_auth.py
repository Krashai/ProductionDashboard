"""Auth coverage for CRITICAL finding #2: every mutating (POST/PUT/DELETE)
/api/* route must require a valid X-Admin-Token header. GET endpoints and
/ws stay open (NewBackendPlan.md decision #9 only ever covered /ws).
"""
import pytest

from tests.conftest import TEST_ADMIN_TOKEN


def _plc_payload(**overrides):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    payload.update(overrides)
    return payload


def _tag_payload(plc_id, **overrides):
    payload = dict(
        plc_id=plc_id, name="Temp", db=1, offset=0, bit=0, type="REAL",
        metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
    )
    payload.update(overrides)
    return payload


def _seed_plc_and_tag(client):
    """Uses the token-carrying `client` fixture just to set up fixtures
    that the auth tests themselves (on `anon_client`) then probe."""
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()
    return plc, tag


# --- GET stays open, no token needed ---------------------------------

def test_get_endpoints_do_not_require_a_token(anon_client):
    assert anon_client.get("/api/plcs").status_code == 200
    assert anon_client.get("/api/tags").status_code == 200
    assert anon_client.get("/api/thresholds").status_code == 200
    assert anon_client.get("/api/bit-alarms").status_code == 200
    assert anon_client.get("/api/areas").status_code == 200
    assert anon_client.get("/status").status_code == 200
    assert anon_client.get("/").status_code == 200


# --- POST /api/plcs ----------------------------------------------------

def test_create_plc_without_token_is_rejected(anon_client):
    resp = anon_client.post("/api/plcs", json=_plc_payload())
    assert resp.status_code == 401


def test_create_plc_with_wrong_token_is_rejected(anon_client):
    resp = anon_client.post(
        "/api/plcs", json=_plc_payload(), headers={"X-Admin-Token": "wrong"}
    )
    assert resp.status_code == 401


def test_create_plc_with_correct_token_succeeds(anon_client):
    resp = anon_client.post(
        "/api/plcs", json=_plc_payload(), headers={"X-Admin-Token": TEST_ADMIN_TOKEN}
    )
    assert resp.status_code == 201


def test_update_and_delete_plc_require_token(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()

    assert anon_client.put(f"/api/plcs/{plc['id']}", json=_plc_payload()).status_code == 401
    assert anon_client.delete(f"/api/plcs/{plc['id']}").status_code == 401

    ok_headers = {"X-Admin-Token": TEST_ADMIN_TOKEN}
    assert (
        anon_client.put(f"/api/plcs/{plc['id']}", json=_plc_payload(name="R"), headers=ok_headers).status_code
        == 200
    )
    assert anon_client.delete(f"/api/plcs/{plc['id']}", headers=ok_headers).status_code == 204


# --- POST /api/tags ------------------------------------------------------

def test_create_tag_without_token_is_rejected(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    resp = anon_client.post("/api/tags", json=_tag_payload(plc["id"]))
    assert resp.status_code == 401


def test_create_tag_with_correct_token_succeeds(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    resp = anon_client.post(
        "/api/tags",
        json=_tag_payload(plc["id"]),
        headers={"X-Admin-Token": TEST_ADMIN_TOKEN},
    )
    assert resp.status_code == 201


def test_update_and_delete_tag_require_token(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()

    assert anon_client.put(f"/api/tags/{tag['id']}", json=_tag_payload(plc["id"])).status_code == 401
    assert anon_client.delete(f"/api/tags/{tag['id']}").status_code == 401

    ok_headers = {"X-Admin-Token": TEST_ADMIN_TOKEN}
    assert (
        anon_client.put(
            f"/api/tags/{tag['id']}", json=_tag_payload(plc["id"], label="R"), headers=ok_headers
        ).status_code
        == 200
    )
    assert anon_client.delete(f"/api/tags/{tag['id']}", headers=ok_headers).status_code == 204


# --- POST /api/thresholds -------------------------------------------------

def test_create_threshold_without_token_is_rejected(client, anon_client):
    _, tag = _seed_plc_and_tag(client)
    resp = anon_client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10})
    assert resp.status_code == 401


def test_create_threshold_with_correct_token_succeeds(client, anon_client):
    _, tag = _seed_plc_and_tag(client)
    resp = anon_client.post(
        "/api/thresholds",
        json={"tag_id": tag["id"], "min": 0, "max": 10},
        headers={"X-Admin-Token": TEST_ADMIN_TOKEN},
    )
    assert resp.status_code == 201


def test_update_and_delete_threshold_require_token(client, anon_client):
    _, tag = _seed_plc_and_tag(client)
    rule = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10}).json()

    assert anon_client.put(f"/api/thresholds/{rule['id']}", json={"min": 1, "max": 9}).status_code == 401
    assert anon_client.delete(f"/api/thresholds/{rule['id']}").status_code == 401

    ok_headers = {"X-Admin-Token": TEST_ADMIN_TOKEN}
    assert (
        anon_client.put(f"/api/thresholds/{rule['id']}", json={"min": 1, "max": 9}, headers=ok_headers).status_code
        == 200
    )
    assert anon_client.delete(f"/api/thresholds/{rule['id']}", headers=ok_headers).status_code == 204


# --- POST /api/bit-alarms -------------------------------------------------

def test_create_bit_alarm_without_token_is_rejected(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag = client.post(
        "/api/tags", json=_tag_payload(plc["id"], name="Fault", type="WORD", metric_id="chlodnia-1-faults")
    ).json()

    resp = anon_client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "x"}
    )
    assert resp.status_code == 401


def test_create_bit_alarm_with_correct_token_succeeds(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag = client.post(
        "/api/tags", json=_tag_payload(plc["id"], name="Fault", type="WORD", metric_id="chlodnia-1-faults")
    ).json()

    resp = anon_client.post(
        "/api/bit-alarms",
        json={"tag_id": tag["id"], "bit_index": 0, "description": "x"},
        headers={"X-Admin-Token": TEST_ADMIN_TOKEN},
    )
    assert resp.status_code == 201


def test_update_and_delete_bit_alarm_require_token(client, anon_client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag = client.post(
        "/api/tags", json=_tag_payload(plc["id"], name="Fault", type="WORD", metric_id="chlodnia-1-faults")
    ).json()
    rule = client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "x"}
    ).json()

    assert anon_client.put(f"/api/bit-alarms/{rule['id']}", json={"description": "y"}).status_code == 401
    assert anon_client.delete(f"/api/bit-alarms/{rule['id']}").status_code == 401

    ok_headers = {"X-Admin-Token": TEST_ADMIN_TOKEN}
    assert (
        anon_client.put(f"/api/bit-alarms/{rule['id']}", json={"description": "y"}, headers=ok_headers).status_code
        == 200
    )
    assert anon_client.delete(f"/api/bit-alarms/{rule['id']}", headers=ok_headers).status_code == 204


# --- create_app fail-fast -------------------------------------------------

def test_create_app_without_admin_token_anywhere_raises(monkeypatch):
    from app.main import create_app

    # conftest.py sets a placeholder ADMIN_API_TOKEN so *importing*
    # app.main works (see its comment) — remove it here to prove
    # create_app() itself still refuses to build an app with neither an
    # explicit admin_token= nor a real env var, i.e. no hardcoded
    # fallback exists anywhere in the call chain.
    monkeypatch.delenv("ADMIN_API_TOKEN", raising=False)

    with pytest.raises(RuntimeError, match="ADMIN_API_TOKEN"):
        create_app(database_url="sqlite:///:memory:")
