def _plc(client, **overrides):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    payload.update(overrides)
    return client.post("/api/plcs", json=payload).json()


def _tag_payload(plc_id, **overrides):
    payload = dict(
        plc_id=plc_id, name="Temp", db=1, offset=0, bit=0, type="REAL",
        metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
    )
    payload.update(overrides)
    return payload


def test_create_tag_returns_201(client):
    plc = _plc(client)
    resp = client.post("/api/tags", json=_tag_payload(plc["id"]))
    assert resp.status_code == 201
    assert resp.json()["metric_id"] == "chlodnia-1-temp"


def test_create_tag_rejects_unsupported_type(client):
    plc = _plc(client)
    resp = client.post("/api/tags", json=_tag_payload(plc["id"], type="TIMER"))
    assert resp.status_code == 422


def test_create_tag_rejects_unknown_plc_id(client):
    resp = client.post("/api/tags", json=_tag_payload(plc_id=9999))
    assert resp.status_code == 404


def test_create_tag_rejects_duplicate_metric_id(client):
    plc = _plc(client)
    client.post("/api/tags", json=_tag_payload(plc["id"]))
    resp = client.post(
        "/api/tags", json=_tag_payload(plc["id"], name="Temp2", db=1, offset=4)
    )
    assert resp.status_code == 409


def test_list_tags(client):
    plc = _plc(client)
    client.post("/api/tags", json=_tag_payload(plc["id"]))
    resp = client.get("/api/tags")
    assert resp.status_code == 200
    assert len(resp.json()) == 1


def test_update_tag(client):
    plc = _plc(client)
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()

    resp = client.put(f"/api/tags/{tag['id']}", json=_tag_payload(plc["id"], label="Renamed"))

    assert resp.status_code == 200
    assert resp.json()["label"] == "Renamed"


def test_delete_tag(client):
    plc = _plc(client)
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()

    resp = client.delete(f"/api/tags/{tag['id']}")

    assert resp.status_code == 204
    assert client.get(f"/api/tags/{tag['id']}").status_code == 404


def test_delete_tag_cascades_threshold_rule(client):
    plc = _plc(client)
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()
    rule = client.post(
        "/api/thresholds", json={"tag_id": tag["id"], "min": 1.0, "max": 9.0}
    ).json()

    client.delete(f"/api/tags/{tag['id']}")

    assert client.get(f"/api/thresholds/{rule['id']}").status_code == 404
