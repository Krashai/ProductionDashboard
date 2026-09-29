"""F4: a tag/PLC write used to wait for the supervisor to restart the
PLC's worker — ~3 s per save when that PLC is offline (the old worker's
join waits out the connect timeout). The reload now runs as a background
task after the response has been sent, from its own DB session."""
from fastapi import BackgroundTasks

from app.api.deps import run_supervisor_reload, schedule_supervisor_reload


class _Req:
    def __init__(self, app):
        self.app = app


def test_schedule_only_queues_the_reload(app):
    calls = []
    app.state.supervisor.reload = lambda plcs, tags: calls.append((plcs, tags))
    tasks = BackgroundTasks()

    schedule_supervisor_reload(_Req(app), tasks)

    assert calls == []
    assert len(tasks.tasks) == 1


def test_background_reload_reads_the_latest_committed_config(client, app):
    client.post("/api/plcs", json=dict(
        name="PLC", area_id="chlodnia-1", ip="10.10.0.10", rack=0, slot=1, plc_type="S7-1200"))
    seen = []
    app.state.supervisor.reload = lambda plcs, tags: seen.append([p["name"] for p in plcs])

    run_supervisor_reload(app)

    assert seen == [["PLC"]]
    assert app.state.supervisor_healthy is True


def test_background_reload_failure_only_flips_the_health_flag(app):
    def boom(plcs, tags):
        raise RuntimeError("worker factory exploded")
    app.state.supervisor.reload = boom

    run_supervisor_reload(app)

    assert app.state.supervisor_healthy is False


def test_crud_write_still_reconciles_workers(client, app):
    client.post("/api/plcs", json=dict(
        name="PLC", area_id="chlodnia-1", ip="10.10.0.10", rack=0, slot=1, plc_type="S7-1200"))

    # TestClient runs background tasks before returning.
    assert app.state.supervisor.active_plc_ids == {1}
