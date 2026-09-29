"""Endpoints backing the redesigned admin panel: per-tag live values and
alarm state (I4), a token check for the login screen (W7), and a JSON
backup that can be restored (F2 safety net)."""
from tests.conftest import TEST_ADMIN_TOKEN

PLC = dict(name="PLC C1", area_id="chlodnia-1", ip="10.10.0.10", rack=0, slot=1, plc_type="S7-1200")


def _tag(client, plc_id, tag_type, metric_id, name=None, **extra):
    body = dict(plc_id=plc_id, name=name or metric_id, db=6, offset=0, bit=0, type=tag_type,
                metric_id=metric_id, label="L", unit="", decimals=0) | extra
    resp = client.post("/api/tags", json=body)
    assert resp.status_code == 201, resp.text
    return resp.json()


# --- /api/live --------------------------------------------------------------

def test_live_reports_plc_state_and_per_tag_value_and_alarm(client, app):
    plc = client.post("/api/plcs", json=PLC).json()
    temp = _tag(client, plc["id"], "REAL", "chlodnia-1-temp", name="t")
    aw = _tag(client, plc["id"], "BOOL", "chlodnia-1-v101-awaria", name="aw")
    client.put(f"/api/tags/{temp['id']}/alarm", json={"kind": "threshold", "threshold": {"max": 9}})
    app.state.live_store.update_plc(plc["id"], online=True, tag_values={"t": 9.5, "aw": 0}, error=None)

    body = client.get("/api/live").json()

    assert body["plcs"][str(plc["id"])]["online"] is True
    assert body["tags"][str(temp["id"])] == {
        "value": 9.5, "alarm": True, "alarm_description": "Powyżej maksimum (9.0)"}
    assert body["tags"][str(aw["id"])]["alarm"] is False


def test_live_marks_unpolled_tags_as_null(client):
    plc = client.post("/api/plcs", json=PLC).json()
    tag = _tag(client, plc["id"], "REAL", "chlodnia-1-temp")

    body = client.get("/api/live").json()

    assert body["plcs"][str(plc["id"])]["online"] is False
    assert body["tags"][str(tag["id"])]["value"] is None


# --- /api/auth/check ----------------------------------------------------------

def test_auth_check_accepts_the_right_token(client):
    assert client.get("/api/auth/check").status_code == 204


def test_auth_check_rejects_a_wrong_token(anon_client):
    resp = anon_client.get("/api/auth/check", headers={"X-Admin-Token": "nope"})
    assert resp.status_code == 401


# --- backup / restore --------------------------------------------------------

def _seed(client):
    plc = client.post("/api/plcs", json=PLC).json()
    temp = _tag(client, plc["id"], "REAL", "chlodnia-1-temp", label="Temperatura", unit="°C", decimals=1)
    word = _tag(client, plc["id"], "WORD", "chlodnia-1-diag-aw1", name="slowo")
    client.put(f"/api/tags/{temp['id']}/alarm", json={
        "kind": "threshold", "threshold": {"min": 2, "max": 8, "hysteresis": 0.5, "delay_s": 3}})
    client.put(f"/api/tags/{word['id']}/alarm", json={
        "kind": "bits", "bits": [{"bit_index": 3, "description": "Przegrzanie"}]})
    return plc


def test_export_contains_plcs_tags_and_their_alarms(client):
    _seed(client)

    body = client.get("/api/config/export").json()

    assert body["format"] == "production-dashboard-config"
    assert body["version"] == 1
    assert [p["name"] for p in body["plcs"]] == ["PLC C1"]
    tags = {t["metric_id"]: t for t in body["tags"]}
    assert tags["chlodnia-1-temp"]["alarm"]["threshold"]["hysteresis"] == 0.5
    assert tags["chlodnia-1-diag-aw1"]["alarm"]["bits"] == [{"bit_index": 3, "description": "Przegrzanie"}]


def test_export_requires_the_admin_token(anon_client):
    assert anon_client.get("/api/config/export").status_code == 401


def test_restore_round_trips_an_export(client):
    _seed(client)
    backup = client.get("/api/config/export").json()
    plc_id = client.get("/api/plcs").json()[0]["id"]
    client.delete(f"/api/plcs/{plc_id}")
    assert client.get("/api/tags").json() == []

    resp = client.post("/api/config/restore", json=backup)

    assert resp.status_code == 200, resp.text
    assert resp.json() == {"plcs": 1, "tags": 2}
    again = client.get("/api/config/export").json()
    strip = lambda d: {k: v for k, v in d.items() if k not in ("id", "plc_id", "exported_at")}
    assert [strip(t) for t in again["tags"]] == [strip(t) for t in backup["tags"]]


def test_restore_is_all_or_nothing(client):
    _seed(client)
    backup = client.get("/api/config/export").json()
    backup["tags"][1]["alarm"]["bits"][0]["bit_index"] = 20  # WORD has bits 0-15

    resp = client.post("/api/config/restore", json=backup)

    assert resp.status_code == 409
    assert len(client.get("/api/tags").json()) == 2  # nothing was wiped


def test_restore_rejects_a_tag_pointing_at_an_unknown_plc(client):
    backup = {"format": "production-dashboard-config", "version": 1, "plcs": [], "tags": [
        {"id": 1, "plc_id": 42, "name": "t", "db": 1, "offset": 0, "bit": 0, "type": "REAL",
         "metric_id": "chlodnia-1-temp", "label": "L", "unit": "", "decimals": 0,
         "alarm": {"kind": "none"}}]}

    assert client.post("/api/config/restore", json=backup).status_code == 422


def test_restore_rejects_a_foreign_file(client):
    assert client.post("/api/config/restore", json={"format": "x", "version": 1, "plcs": [], "tags": []}).status_code == 422


def test_restore_requires_the_admin_token(anon_client):
    body = {"format": "production-dashboard-config", "version": 1, "plcs": [], "tags": []}
    assert anon_client.post("/api/config/restore", json=body).status_code == 401


def test_restore_rejects_an_oversized_backup(client):
    from app.api.backup import MAX_BACKUP_PLCS

    plc = dict(PLC, id=0)
    body = {"format": "production-dashboard-config", "version": 1,
            "plcs": [dict(plc, id=i) for i in range(MAX_BACKUP_PLCS + 1)], "tags": []}

    assert client.post("/api/config/restore", json=body).status_code == 422
    assert client.get("/api/plcs").json() == []
