def _plc(client):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    return client.post("/api/plcs", json=payload).json()


def _tag(client, plc_id, **overrides):
    payload = dict(
        plc_id=plc_id, name="Fault_Word", db=1, offset=0, bit=0, type="WORD",
        metric_id="chlodnia-1-faults", label="Alarmy", unit="", decimals=0,
    )
    payload.update(overrides)
    return client.post("/api/tags", json=payload).json()


def test_create_bit_alarm_rule(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])

    resp = client.post(
        "/api/bit-alarms",
        json={"tag_id": tag["id"], "bit_index": 0, "description": "Niski poziom wody"},
    )

    assert resp.status_code == 201
    assert resp.json()["bit_index"] == 0


def test_create_bit_alarm_rejects_unknown_tag(client):
    resp = client.post(
        "/api/bit-alarms", json={"tag_id": 9999, "bit_index": 0, "description": "x"}
    )
    assert resp.status_code == 404


def test_tag_can_have_multiple_bit_alarm_rules(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    client.post("/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "A"})

    resp = client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 1, "description": "B"}
    )

    assert resp.status_code == 201


def test_duplicate_bit_index_for_same_tag_is_rejected(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    client.post("/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "A"})

    resp = client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "dup"}
    )

    assert resp.status_code == 409


def test_bit_alarm_rejected_when_tag_already_has_threshold_rule(client):
    """Mutual-exclusivity working assumption from NewBackendPlan.md §8:
    a tag has either a ThresholdRule or 1+ BitAlarmRules, never both.
    """
    plc = _plc(client)
    tag = _tag(client, plc["id"], type="REAL", name="Temp", metric_id="chlodnia-1-temp")
    client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10})

    resp = client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "x"}
    )

    assert resp.status_code == 409


def test_threshold_rejected_when_tag_already_has_bit_alarm(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "x"}
    )

    resp = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10})

    assert resp.status_code == 409


def test_update_bit_alarm_rule(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    rule = client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "A"}
    ).json()

    resp = client.put(f"/api/bit-alarms/{rule['id']}", json={"description": "Renamed"})

    assert resp.status_code == 200
    assert resp.json()["description"] == "Renamed"


def test_delete_bit_alarm_rule(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    rule = client.post(
        "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "A"}
    ).json()

    resp = client.delete(f"/api/bit-alarms/{rule['id']}")

    assert resp.status_code == 204
    assert client.get(f"/api/bit-alarms/{rule['id']}").status_code == 404


def test_list_bit_alarms(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"])
    client.post("/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "A"})

    resp = client.get("/api/bit-alarms")

    assert resp.status_code == 200
    assert len(resp.json()) == 1
