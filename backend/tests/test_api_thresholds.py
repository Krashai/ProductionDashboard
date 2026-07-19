def _plc(client):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    return client.post("/api/plcs", json=payload).json()


def _tag(client, plc_id, **overrides):
    payload = dict(
        plc_id=plc_id, name="Temp", db=1, offset=0, bit=0, type="REAL",
        metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
    )
    payload.update(overrides)
    return client.post("/api/tags", json=payload).json()


def test_create_threshold_rule(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])

    resp = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 2.0, "max": 8.0})

    assert resp.status_code == 201
    assert resp.json()["min"] == 2.0
    assert resp.json()["max"] == 8.0


def test_create_threshold_rule_rejects_unknown_tag(client):
    resp = client.post("/api/thresholds", json={"tag_id": 9999, "min": 0, "max": 1})
    assert resp.status_code == 404


def test_create_second_threshold_rule_for_same_tag_is_rejected(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10})

    resp = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 1, "max": 9})

    assert resp.status_code == 409


def test_create_threshold_rule_rejects_tag_that_already_has_bit_alarm():
    pass  # covered in test_api_bit_alarms.py (mutual exclusivity, symmetric)


def test_max_below_min_is_rejected(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])

    resp = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 10, "max": 1})

    assert resp.status_code == 422


def test_update_threshold_rule(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    rule = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10}).json()

    resp = client.put(f"/api/thresholds/{rule['id']}", json={"min": 1, "max": 9})

    assert resp.status_code == 200
    assert resp.json()["min"] == 1
    assert resp.json()["max"] == 9


def test_delete_threshold_rule(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    rule = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10}).json()

    resp = client.delete(f"/api/thresholds/{rule['id']}")

    assert resp.status_code == 204
    assert client.get(f"/api/thresholds/{rule['id']}").status_code == 404


def test_list_and_get_threshold_rules(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    rule = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10}).json()

    assert client.get("/api/thresholds").status_code == 200
    assert client.get(f"/api/thresholds/{rule['id']}").json()["tag_id"] == tag["id"]
