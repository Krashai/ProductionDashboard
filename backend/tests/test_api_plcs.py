def _plc_payload(**overrides):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    payload.update(overrides)
    return payload


def test_create_plc_returns_201_with_id(client):
    resp = client.post("/api/plcs", json=_plc_payload())
    assert resp.status_code == 201
    body = resp.json()
    assert body["id"] is not None
    assert body["name"] == "Chłodnia 1"


def test_create_plc_rejects_unknown_area_id(client):
    resp = client.post("/api/plcs", json=_plc_payload(area_id="not-a-real-area"))
    assert resp.status_code == 422


def test_list_plcs_returns_all_created(client):
    client.post("/api/plcs", json=_plc_payload(name="A"))
    client.post("/api/plcs", json=_plc_payload(name="B", area_id="chlodnia-2"))

    resp = client.get("/api/plcs")

    assert resp.status_code == 200
    names = {p["name"] for p in resp.json()}
    assert names == {"A", "B"}


def test_get_single_plc_by_id(client):
    created = client.post("/api/plcs", json=_plc_payload()).json()

    resp = client.get(f"/api/plcs/{created['id']}")

    assert resp.status_code == 200
    assert resp.json()["id"] == created["id"]


def test_get_missing_plc_returns_404(client):
    resp = client.get("/api/plcs/999")
    assert resp.status_code == 404


def test_update_plc_changes_fields(client):
    created = client.post("/api/plcs", json=_plc_payload()).json()

    resp = client.put(
        f"/api/plcs/{created['id']}", json=_plc_payload(name="Renamed", ip="10.10.0.99")
    )

    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"
    assert resp.json()["ip"] == "10.10.0.99"


def test_update_missing_plc_returns_404(client):
    resp = client.put("/api/plcs/999", json=_plc_payload())
    assert resp.status_code == 404


def test_delete_plc_removes_it(client):
    created = client.post("/api/plcs", json=_plc_payload()).json()

    resp = client.delete(f"/api/plcs/{created['id']}")

    assert resp.status_code == 204
    assert client.get(f"/api/plcs/{created['id']}").status_code == 404


def test_delete_missing_plc_returns_404(client):
    resp = client.delete("/api/plcs/999")
    assert resp.status_code == 404


def test_delete_plc_cascades_to_its_tags(client):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag_payload = dict(
        plc_id=plc["id"], name="Temp", db=1, offset=0, bit=0, type="REAL",
        metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
    )
    tag = client.post("/api/tags", json=tag_payload).json()

    client.delete(f"/api/plcs/{plc['id']}")

    assert client.get(f"/api/tags/{tag['id']}").status_code == 404
