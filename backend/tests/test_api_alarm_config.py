"""GET/PUT /api/tags/{id}/alarm — one call replaces a tag's whole alarm
configuration (threshold, BOOL level or bit map), so the admin panel
edits "the variable's alarm" instead of juggling three rule tables by
internal tag number. Plus type validation (F5) on the per-kind routers."""


def _plc(client, area_id="chlodnia-1"):
    return client.post("/api/plcs", json=dict(
        name="PLC", area_id=area_id, ip="10.10.0.10", rack=0, slot=1, plc_type="S7-1200",
    )).json()


def _tag(client, plc_id, tag_type, metric_id, name=None):
    resp = client.post("/api/tags", json=dict(
        plc_id=plc_id, name=name or metric_id, db=6, offset=0, bit=0, type=tag_type,
        metric_id=metric_id, label="L", unit="", decimals=0,
    ))
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_unconfigured_tag_reports_kind_none(client):
    tag = _tag(client, _plc(client)["id"], "REAL", "chlodnia-1-temp")

    body = client.get(f"/api/tags/{tag['id']}/alarm").json()

    assert body["kind"] == "none"
    assert body["implicit"] is False


def test_awaria_tag_reports_its_implicit_true_rule(client):
    tag = _tag(client, _plc(client)["id"], "BOOL", "chlodnia-1-v101-awaria")

    body = client.get(f"/api/tags/{tag['id']}/alarm").json()

    assert body["kind"] == "bool"
    assert body["implicit"] is True
    assert body["bool_alarm"]["active_value"] == 1


def test_put_threshold_then_read_it_back(client):
    tag = _tag(client, _plc(client)["id"], "REAL", "chlodnia-1-temp")

    resp = client.put(f"/api/tags/{tag['id']}/alarm", json={
        "kind": "threshold",
        "threshold": {"min": 2, "max": 8, "hysteresis": 0.5, "delay_s": 5},
    })

    assert resp.status_code == 200, resp.text
    body = client.get(f"/api/tags/{tag['id']}/alarm").json()
    assert body["kind"] == "threshold"
    assert body["threshold"] == {"min": 2.0, "max": 8.0, "hysteresis": 0.5, "delay_s": 5.0}


def test_put_bool_rule_can_make_false_the_fault_level(client):
    tag = _tag(client, _plc(client)["id"], "BOOL", "chlodnia-1-v101-awaria")

    client.put(f"/api/tags/{tag['id']}/alarm", json={
        "kind": "bool", "bool_alarm": {"active_value": 0, "description": "Brak gotowości"},
    })

    body = client.get(f"/api/tags/{tag['id']}/alarm").json()
    assert body["implicit"] is False
    assert body["bool_alarm"] == {"active_value": 0, "description": "Brak gotowości", "delay_s": 0.0}


def test_put_bits_replaces_the_previous_bit_map(client):
    tag = _tag(client, _plc(client)["id"], "WORD", "chlodnia-1-diag-aw1")
    url = f"/api/tags/{tag['id']}/alarm"
    client.put(url, json={"kind": "bits", "bits": [
        {"bit_index": 0, "description": "A"}, {"bit_index": 1, "description": "B"}]})

    client.put(url, json={"kind": "bits", "bits": [{"bit_index": 15, "description": "C"}]})

    assert client.get(url).json()["bits"] == [{"bit_index": 15, "description": "C"}]
    assert len(client.get("/api/bit-alarms").json()) == 1


def test_switching_kind_removes_the_old_rule(client):
    tag = _tag(client, _plc(client)["id"], "WORD", "chlodnia-1-diag-aw1")
    url = f"/api/tags/{tag['id']}/alarm"
    client.put(url, json={"kind": "bits", "bits": [{"bit_index": 0, "description": "A"}]})

    client.put(url, json={"kind": "threshold", "threshold": {"max": 100}})

    assert client.get("/api/bit-alarms").json() == []
    assert client.get(url).json()["kind"] == "threshold"


def test_put_none_clears_everything(client):
    tag = _tag(client, _plc(client)["id"], "REAL", "chlodnia-1-temp")
    url = f"/api/tags/{tag['id']}/alarm"
    client.put(url, json={"kind": "threshold", "threshold": {"max": 9}})

    client.put(url, json={"kind": "none"})

    assert client.get(url).json()["kind"] == "none"
    assert client.get("/api/thresholds").json() == []


def test_rejects_a_kind_that_does_not_fit_the_tag_type(client):
    tag = _tag(client, _plc(client)["id"], "REAL", "chlodnia-1-temp")

    resp = client.put(f"/api/tags/{tag['id']}/alarm", json={
        "kind": "bits", "bits": [{"bit_index": 0, "description": "A"}]})

    assert resp.status_code == 409
    assert "REAL" in resp.json()["detail"]


def test_rejects_a_bit_beyond_the_type_width(client):
    tag = _tag(client, _plc(client)["id"], "BYTE", "chlodnia-1-diag-b")

    resp = client.put(f"/api/tags/{tag['id']}/alarm", json={
        "kind": "bits", "bits": [{"bit_index": 8, "description": "A"}]})

    assert resp.status_code == 409


def test_rejects_duplicate_bits_and_missing_payload(client):
    tag = _tag(client, _plc(client)["id"], "WORD", "chlodnia-1-diag-aw1")
    url = f"/api/tags/{tag['id']}/alarm"

    dup = client.put(url, json={"kind": "bits", "bits": [
        {"bit_index": 1, "description": "A"}, {"bit_index": 1, "description": "B"}]})
    missing = client.put(url, json={"kind": "threshold"})
    empty = client.put(url, json={"kind": "threshold", "threshold": {}})

    assert dup.status_code == 422
    assert missing.status_code == 422
    assert empty.status_code == 422


def test_rejects_max_below_min(client):
    tag = _tag(client, _plc(client)["id"], "REAL", "chlodnia-1-temp")

    resp = client.put(f"/api/tags/{tag['id']}/alarm", json={
        "kind": "threshold", "threshold": {"min": 5, "max": 1}})

    assert resp.status_code == 422


def test_requires_the_admin_token(anon_client, client):
    tag = _tag(client, _plc(client)["id"], "REAL", "chlodnia-1-temp")

    resp = anon_client.put(f"/api/tags/{tag['id']}/alarm", json={"kind": "none"})

    assert resp.status_code == 401


def test_unknown_tag_is_404(client):
    assert client.get("/api/tags/999/alarm").status_code == 404
    assert client.put("/api/tags/999/alarm", json={"kind": "none"}).status_code == 404


def test_alarm_configs_lists_every_tag(client):
    plc = _plc(client)
    temp = _tag(client, plc["id"], "REAL", "chlodnia-1-temp")
    _tag(client, plc["id"], "BOOL", "chlodnia-1-v101-awaria")
    client.put(f"/api/tags/{temp['id']}/alarm", json={"kind": "threshold", "threshold": {"max": 9}})

    configs = {c["tag_id"]: c for c in client.get("/api/alarm-configs").json()}

    assert configs[temp["id"]]["kind"] == "threshold"
    assert sorted(c["kind"] for c in configs.values()) == ["bool", "threshold"]


# --- F5 on the per-kind routers -------------------------------------------

def test_bit_alarm_router_rejects_bit_beyond_type_width(client):
    tag = _tag(client, _plc(client)["id"], "BYTE", "chlodnia-1-diag-b")

    resp = client.post("/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 9, "description": "x"})

    assert resp.status_code == 409


def test_threshold_router_rejects_bool_tag(client):
    tag = _tag(client, _plc(client)["id"], "BOOL", "chlodnia-1-v101-praca")

    resp = client.post("/api/thresholds", json={"tag_id": tag["id"], "max": 0})

    assert resp.status_code == 409


def test_changing_tag_type_is_blocked_while_an_incompatible_alarm_exists(client):
    plc = _plc(client)
    tag = _tag(client, plc["id"], "WORD", "chlodnia-1-diag-aw1")
    client.put(f"/api/tags/{tag['id']}/alarm", json={
        "kind": "bits", "bits": [{"bit_index": 12, "description": "A"}]})

    body = {k: v for k, v in tag.items() if k != "id"} | {"type": "BYTE"}
    resp = client.put(f"/api/tags/{tag['id']}", json=body)

    assert resp.status_code == 409
    assert "alarm" in resp.json()["detail"].lower()
