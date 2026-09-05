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


def test_create_tag_rejects_metric_id_from_a_different_area(client):
    """HIGH finding #5: a tag on a Chłodnia-1 PLC claiming a Chłodnia-2
    metric_id must be rejected — otherwise it would silently overwrite
    the wrong wallboard card's value."""
    plc = _plc(client, area_id="chlodnia-1")
    resp = client.post(
        "/api/tags", json=_tag_payload(plc["id"], metric_id="chlodnia-2-temp")
    )
    assert resp.status_code == 409


def test_create_tag_allows_metric_id_matching_its_own_area(client):
    plc = _plc(client, area_id="chlodnia-2")
    resp = client.post(
        "/api/tags", json=_tag_payload(plc["id"], metric_id="chlodnia-2-temp")
    )
    assert resp.status_code == 201


def test_create_tag_allows_arbitrary_metric_id_not_in_known_set(client):
    """Diagnostic-only (bit-alarm) tags may use a metric_id that isn't
    one of the frozen areas.ts metrics at all — those are exempt from
    the area-match check (see app.api.tags docstring)."""
    plc = _plc(client, area_id="chlodnia-1")
    resp = client.post(
        "/api/tags",
        json=_tag_payload(plc["id"], name="Fault_Word", type="WORD", metric_id="chlodnia-1-faults"),
    )
    assert resp.status_code == 201


def test_update_tag_rejects_metric_id_from_a_different_area(client):
    plc = _plc(client, area_id="chlodnia-1")
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()

    resp = client.put(
        f"/api/tags/{tag['id']}", json=_tag_payload(plc["id"], metric_id="sprezarkownia-magazyn-aluminium-cisnienie-zbiornik")
    )
    assert resp.status_code == 409


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


def test_create_tag_rejects_duplicate_name_on_same_plc(client):
    """VariableAssignmentWizard.md §5.2 — UniqueConstraint(plc_id, name).
    Same plc_id + name but a *different* metric_id must still 409, worded
    distinctly from the metric_id-conflict case."""
    plc = _plc(client)
    client.post("/api/tags", json=_tag_payload(plc["id"], name="Temp", metric_id="chlodnia-1-temp"))

    resp = client.post(
        "/api/tags",
        json=_tag_payload(
            plc["id"], name="Temp", db=1, offset=4, metric_id="chlodnia-1-faults"
        ),
    )

    assert resp.status_code == 409
    detail = resp.json()["detail"]
    assert "Temp" in detail
    assert "PLC" in detail
    assert "metric_id" not in detail


def test_create_tag_allows_same_name_on_different_plcs(client):
    """The (plc_id, name) constraint is per-PLC, not global — the same
    `name` on two different PLCs must both succeed."""
    plc_a = _plc(client, name="Chłodnia 1", area_id="chlodnia-1")
    plc_b = _plc(client, name="Chłodnia 2", area_id="chlodnia-2")

    resp_a = client.post(
        "/api/tags",
        json=_tag_payload(plc_a["id"], name="Temp", metric_id="chlodnia-1-temp"),
    )
    resp_b = client.post(
        "/api/tags",
        json=_tag_payload(plc_b["id"], name="Temp", metric_id="chlodnia-2-temp"),
    )

    assert resp_a.status_code == 201
    assert resp_b.status_code == 201


def test_update_tag_rejects_duplicate_name_on_same_plc(client):
    plc = _plc(client)
    client.post("/api/tags", json=_tag_payload(plc["id"], name="Temp", metric_id="chlodnia-1-temp"))
    other = client.post(
        "/api/tags",
        json=_tag_payload(plc["id"], name="Pressure", db=1, offset=4, metric_id="chlodnia-1-faults"),
    ).json()

    resp = client.put(
        f"/api/tags/{other['id']}",
        json=_tag_payload(plc["id"], name="Temp", metric_id="chlodnia-1-faults"),
    )

    assert resp.status_code == 409
    assert "metric_id" not in resp.json()["detail"]


def test_delete_tag_cascades_threshold_rule(client):
    plc = _plc(client)
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()
    rule = client.post(
        "/api/thresholds", json={"tag_id": tag["id"], "min": 1.0, "max": 9.0}
    ).json()

    client.delete(f"/api/tags/{tag['id']}")

    assert client.get(f"/api/thresholds/{rule['id']}").status_code == 404


# --- MEDIUM #B2: a CRUD write must not 500 just because the post-commit
# PollingSupervisor.reload() side effect failed — the DB write already
# committed successfully by that point.

def test_create_tag_still_returns_201_and_persists_when_supervisor_reload_raises(client, app):
    plc = _plc(client)
    app.state.supervisor.reload = lambda *a, **kw: (_ for _ in ()).throw(
        RuntimeError("worker_factory exploded")
    )

    resp = client.post("/api/tags", json=_tag_payload(plc["id"]))

    assert resp.status_code == 201
    tag_id = resp.json()["id"]
    assert client.get(f"/api/tags/{tag_id}").status_code == 200


def test_update_tag_still_returns_200_and_persists_when_supervisor_reload_raises(client, app):
    plc = _plc(client)
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()
    app.state.supervisor.reload = lambda *a, **kw: (_ for _ in ()).throw(
        RuntimeError("worker_factory exploded")
    )

    resp = client.put(f"/api/tags/{tag['id']}", json=_tag_payload(plc["id"], label="Renamed"))

    assert resp.status_code == 200
    assert client.get(f"/api/tags/{tag['id']}").json()["label"] == "Renamed"


def test_delete_tag_still_returns_204_and_persists_when_supervisor_reload_raises(client, app):
    plc = _plc(client)
    tag = client.post("/api/tags", json=_tag_payload(plc["id"])).json()
    app.state.supervisor.reload = lambda *a, **kw: (_ for _ in ()).throw(
        RuntimeError("worker_factory exploded")
    )

    resp = client.delete(f"/api/tags/{tag['id']}")

    assert resp.status_code == 204
    assert client.get(f"/api/tags/{tag['id']}").status_code == 404


# --- HIGH #B3/B5: db/offset must be within S7's real addressable bounds.

def test_create_tag_rejects_db_above_bounds(client):
    plc = _plc(client)
    resp = client.post("/api/tags", json=_tag_payload(plc["id"], db=70000))
    assert resp.status_code == 422


def test_create_tag_rejects_negative_offset(client):
    plc = _plc(client)
    resp = client.post("/api/tags", json=_tag_payload(plc["id"], offset=-1))
    assert resp.status_code == 422
