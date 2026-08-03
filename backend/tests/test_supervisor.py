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

    # HIGH #B1: cleanly-stopping fakes (the vast majority of these tests)
    # report themselves as no-longer-alive after join(), matching real
    # threading.Thread.is_alive() semantics post-stop.
    _is_alive_after_join = False

    def __init__(self, plc, tags, live_store, poll_interval=1.0):
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval
        self.started = False
        self.stopped = False
        self.name = f"fake-plc-worker-{plc.get('id')}"
        FakeWorker.instances.append(self)

    def start(self):
        self.started = True

    def stop(self):
        self.stopped = True

    def join(self, timeout=None):
        pass

    def is_alive(self):
        return self._is_alive_after_join


class NeverDyingWorker(FakeWorker):
    """Simulates a worker whose thread never actually dies — e.g. the S7
    connect/read call is stuck past the join(timeout) window (the exact
    scenario HIGH #B1's probe/timeouts are meant to prevent, but the
    supervisor must still not silently pretend the stop succeeded)."""

    _is_alive_after_join = True


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


def test_reload_is_thread_safe_under_concurrent_calls():
    """HIGH finding #3: sync CRUD route handlers run in FastAPI's
    threadpool, so two admin-panel writes can call reload() at the same
    time. Without a lock, interleaved read-diff-mutate sequences on
    _workers/_fingerprints can leak a worker thread (started, then
    silently un-tracked with nothing left to ever call .stop() on it).
    Hammer reload() from several threads with configs that force
    constant replace-churn and assert two invariants hold afterward:
    _workers/_fingerprints never fall out of lockstep, and no worker
    that was ever started+replaced was left un-stopped (orphaned).
    """
    import threading

    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=_factory)
    errors: list[Exception] = []

    def hammer(offset: int) -> None:
        try:
            for i in range(50):
                ip = "10.10.0.10" if (i + offset) % 2 == 0 else "10.10.0.11"
                supervisor.reload([{"id": 1, "ip": ip}], [])
        except Exception as exc:  # pragma: no cover - only on failure
            errors.append(exc)

    threads = [threading.Thread(target=hammer, args=(n,)) for n in range(6)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert errors == []
    assert set(supervisor._workers.keys()) == set(supervisor._fingerprints.keys())

    tracked_current = set(supervisor._workers.values())
    for instance in FakeWorker.instances:
        if instance.started and instance not in tracked_current:
            assert instance.stopped, "worker was started, replaced, but never stopped (leak)"


def test_stop_worker_logs_and_records_orphan_when_join_returns_but_thread_still_alive(caplog):
    """HIGH #B1: worker.join(timeout=6.0) can return without the thread
    actually having died (e.g. stuck inside a blocking S7 call). The
    supervisor must not silently proceed as if stop() succeeded — it
    should log an error (with plc_id + thread name) and record the id in
    self._orphaned_worker_ids, while its own bookkeeping dicts
    (_workers/_fingerprints) are still cleaned up as before."""
    import logging

    supervisor = PollingSupervisor(live_store=LiveStore(), worker_factory=NeverDyingWorker)

    with caplog.at_level(logging.ERROR, logger="app.plc.supervisor"):
        supervisor.reload([{"id": 1, "ip": "a"}], [])
        worker = supervisor._workers[1]

        supervisor.reload([], [])  # PLC removed -> triggers _stop_worker(1)

    assert worker.stopped is True
    assert 1 in supervisor._orphaned_worker_ids
    assert supervisor.active_plc_ids == set()
    assert 1 not in supervisor._workers
    assert 1 not in supervisor._fingerprints
    assert any("1" in record.getMessage() for record in caplog.records)
    assert any(worker.name in record.getMessage() for record in caplog.records)
