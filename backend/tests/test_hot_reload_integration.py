"""End-to-end proof that CRUD writes trigger PollingSupervisor.reload()
without a process restart, per NewBackendPlan.md §4. Uses the NoopWorker
double (see conftest.py) so this stays a fast, hermetic test — the
question under test is "does the supervisor's active worker set track
the DB", not "does snap7 actually connect".
"""


def _plc_payload(**overrides):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    payload.update(overrides)
    return payload


def test_creating_a_plc_immediately_starts_a_worker(client, app):
    assert app.state.supervisor.active_plc_ids == set()

    created = client.post("/api/plcs", json=_plc_payload()).json()

    assert app.state.supervisor.active_plc_ids == {created["id"]}


def test_deleting_a_plc_immediately_stops_its_worker(client, app):
    created = client.post("/api/plcs", json=_plc_payload()).json()
    assert app.state.supervisor.active_plc_ids == {created["id"]}

    client.delete(f"/api/plcs/{created['id']}")

    assert app.state.supervisor.active_plc_ids == set()


def test_updating_a_tag_restarts_only_the_owning_plc_worker(client, app):
    plc = client.post("/api/plcs", json=_plc_payload()).json()
    tag = client.post(
        "/api/tags",
        json=dict(
            plc_id=plc["id"], name="Temp", db=1, offset=0, bit=0, type="REAL",
            metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
        ),
    ).json()
    worker_before = app.state.supervisor._workers[plc["id"]]

    client.put(
        f"/api/tags/{tag['id']}",
        json=dict(
            plc_id=plc["id"], name="Temp", db=1, offset=4, bit=0, type="REAL",
            metric_id="chlodnia-1-temp", label="Temp", unit="°C", decimals=1,
        ),
    )

    worker_after = app.state.supervisor._workers[plc["id"]]
    assert worker_after is not worker_before
