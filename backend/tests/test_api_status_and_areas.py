def test_areas_endpoint_returns_five_known_areas(client):
    resp = client.get("/api/areas")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 5
    assert {a["id"] for a in body} == {
        "chlodnia-1", "chlodnia-2", "chlodnia-3", "sprezarkownia", "energia-elektryczna",
    }


def test_status_endpoint_returns_areas_and_raw_plc_diagnostics(client):
    plc = client.post(
        "/api/plcs",
        json=dict(
            name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
            rack=0, slot=1, plc_type="S7-1200",
        ),
    ).json()

    resp = client.get("/status")

    assert resp.status_code == 200
    body = resp.json()
    assert "areas" in body
    assert len(body["areas"]) == 5
    assert "plcs" in body
    assert body["plcs"][0]["id"] == plc["id"]
    # no live poll happened (NoopWorker never calls live_store.update_plc)
    assert body["plcs"][0]["online"] is False


def test_status_endpoint_with_no_config_still_returns_five_areas(client):
    resp = client.get("/status")
    assert resp.status_code == 200
    assert len(resp.json()["areas"]) == 5
