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


# --- MEDIUM #B2: /status exposes whether the last reload_supervisor()
# call succeeded, since a CRUD write itself never 500s on that failure.

def test_supervisor_healthy_defaults_true_with_no_reload_ever_attempted(client):
    resp = client.get("/status")
    assert resp.status_code == 200
    assert resp.json()["supervisor_healthy"] is True


def test_supervisor_healthy_flips_false_after_failing_reload_and_true_after_recovery(client, app):
    plc_payload = dict(
        name="X", area_id="chlodnia-1", ip="10.10.0.10", rack=0, slot=1, plc_type="S7-1200",
    )
    original_reload = app.state.supervisor.reload
    app.state.supervisor.reload = lambda *a, **kw: (_ for _ in ()).throw(
        RuntimeError("boom: /etc/secrets/internal-path")
    )

    resp = client.post("/api/plcs", json=plc_payload)
    assert resp.status_code == 201

    status_resp = client.get("/status")
    assert status_resp.status_code == 200
    assert status_resp.json()["supervisor_healthy"] is False
    assert "/etc/secrets/internal-path" not in status_resp.text

    app.state.supervisor.reload = original_reload
    resp2 = client.post("/api/plcs", json=dict(plc_payload, name="Y"))
    assert resp2.status_code == 201

    status_resp2 = client.get("/status")
    assert status_resp2.json()["supervisor_healthy"] is True


# --- MEDIUM #B3/B5: /status's per-PLC error field must never be the raw
# exception text, even for a PLC that is currently erroring.

def test_status_plc_error_field_is_never_raw_exception_text(client, app):
    from unittest.mock import MagicMock

    from app.plc.worker import PLCWorker

    plc = client.post(
        "/api/plcs",
        json=dict(
            name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
            rack=0, slot=1, plc_type="S7-1200",
        ),
    ).json()

    sensitive = "failed to reach internal-plc-gw01.corp.local (see /etc/secrets/plc.key)"
    mock_client = MagicMock()
    mock_client.get_connected.return_value = False
    mock_client.connect.side_effect = RuntimeError(sensitive)
    worker = PLCWorker(
        plc=plc,
        tags=[],
        live_store=app.state.live_store,
        client_factory=lambda: mock_client,
        probe=MagicMock(),
    )
    worker.run_once()

    resp = client.get("/status")

    assert resp.status_code == 200
    assert sensitive not in resp.text
    plc_status = next(p for p in resp.json()["plcs"] if p["id"] == plc["id"])
    assert plc_status["error"] == "connect_failed"
