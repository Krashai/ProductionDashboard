"""PollingSupervisor.reload() is the hot-reload mechanism required by
NewBackendPlan.md §4: any CRUD write to Plc/Tag/ThresholdRule/BitAlarmRule
calls reload() with the freshly-committed config, and workers are
started/stopped/restarted to match — no process restart needed.

A fake worker_factory (not the real PLCWorker/threading.Thread) is used
throughout so these tests run fast and deterministically, and so the
assertions can be about *supervisor* behavior (diffing, start/stop
counts) rather than real poll-loop timing.
"""
from app.plc.live_store import LiveStore
from app.plc.supervisor import PollingSupervisor


class FakeWorker:
    instances: list["FakeWorker"] = []

    def __init__(self, plc, tags, live_store, poll_interval=1.0):
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval
        self.started = False
        self.stopped = False
        FakeWorker.instances.append(self)

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def join(self, timeout=None):
        pass


def _factory(**kwargs):
    return FakeWorker(**kwargs)


def setup_function(_):
    FakeWorker.instances = []


def test_reload_starts_a_worker_per_plc():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    plcs = [{"id": 1, "ip": "10.10.0.10"}, {"id": 2, "ip": "10.10.0.11"}]
    tags = [{"id": 1, "plc_id": 1, "name": "Temp"}]

    supervisor.reload(plcs, tags)

    assert supervisor.active_plc_ids == {1, 2}
    assert len(FakeWorker.instances) == 2
    assert all(w.started for w in FakeWorker.instances)


def test_reload_gives_each_worker_only_its_own_plcs_tags():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    plcs = [{"id": 1, "ip": "a"}, {"id": 2, "ip": "b"}]
    tags = [
        {"id": 1, "plc_id": 1, "name": "T1"},
        {"id": 2, "plc_id": 2, "name": "T2"},
    ]

    supervisor.reload(plcs, tags)

    by_plc = {w.plc["id"]: w for w in FakeWorker.instances}
    assert [t["name"] for t in by_plc[1].tags] == ["T1"]
    assert [t["name"] for t in by_plc[2].tags] == ["T2"]


def test_reload_removes_worker_for_deleted_plc():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    supervisor.reload([{"id": 1, "ip": "a"}], [])
    first_worker = FakeWorker.instances[0]

    supervisor.reload([], [])

    assert supervisor.active_plc_ids == set()
    assert first_worker.stopped is True


def test_reload_leaves_unchanged_plc_worker_running_untouched():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    plc = {"id": 1, "ip": "a"}
    supervisor.reload([plc], [])
    first_worker = FakeWorker.instances[0]

    supervisor.reload([dict(plc)], [])  # same config, new dict instance

    assert len(FakeWorker.instances) == 1  # no new worker created
    assert first_worker.stopped is False


def test_reload_restarts_worker_when_plc_ip_changes():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    supervisor.reload([{"id": 1, "ip": "10.10.0.10"}], [])
    first_worker = FakeWorker.instances[0]

    supervisor.reload([{"id": 1, "ip": "10.10.0.99"}], [])

    assert first_worker.stopped is True
    assert len(FakeWorker.instances) == 2
    assert FakeWorker.instances[1].started is True


def test_reload_restarts_worker_when_its_tags_change():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    plc = {"id": 1, "ip": "a"}
    supervisor.reload([plc], [{"id": 1, "plc_id": 1, "name": "Temp", "offset": 0}])
    first_worker = FakeWorker.instances[0]

    supervisor.reload([plc], [{"id": 1, "plc_id": 1, "name": "Temp", "offset": 4}])

    assert first_worker.stopped is True
    assert len(FakeWorker.instances) == 2


def test_reload_removes_stale_live_store_entry_for_deleted_plc():
    live_store = LiveStore()
    supervisor = PollingSupervisor(live_store=live_store, worker_factory=_factory)
    supervisor.reload([{"id": 1, "ip": "a"}], [])
    live_store.update_plc(plc_id=1, online=True, tag_values={}, error=None)

    supervisor.reload([], [])

    assert live_store.snapshot() == {}


def test_shutdown_stops_every_running_worker():
    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    supervisor.reload([{"id": 1, "ip": "a"}, {"id": 2, "ip": "b"}], [])

    supervisor.shutdown()

    assert all(w.stopped for w in FakeWorker.instances)
    assert supervisor.active_plc_ids == set()
