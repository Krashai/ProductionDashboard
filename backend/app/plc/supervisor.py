"""Owns the set of running PLCWorker threads and reconciles it against
whatever Plc/Tag config is currently in the database.

This is the hot-reload mechanism from NewBackendPlan.md §4: every CRUD
write to Plc/Tag/ThresholdRule/BitAlarmRule (see app.api.*) calls
``reload()`` with a freshly-read config snapshot. Workers whose config
hasn't changed are left running untouched (so we don't thrash PLC TCP
connections on every unrelated admin-panel edit); workers whose PLC/tag
config changed, or whose PLC was deleted, are stopped and (if still
desired) replaced.

ThresholdRule/BitAlarmRule changes affect *alarm evaluation*, which
happens in app.plc.aggregator (reading LiveStore + fresh DB rows each
broadcast tick) — not inside the worker at all. So the supervisor only
needs to diff on Plc/Tag identity to decide whether a *poll* needs
restarting; the aggregator picks up new threshold/bit-alarm rules
automatically on its next tick without any worker restart.

Thread-safety: every CRUD route handler is a sync `def`, so FastAPI runs
each one in its own threadpool thread — meaning two concurrent admin-
panel writes can call ``reload()`` at the same time. Without a lock,
their read-diff-mutate sequences on ``self._workers``/``self._fingerprints``
could interleave: e.g. both threads decide "PLC 3 needs restarting",
both call ``_stop_worker(3)`` (the second pop() finds nothing, silently
no-ops — harmless), but worse, both could go on to start a *new* worker
for PLC 3, leaving one thread's worker orphaned in a live TCP connection
with no reference in ``self._workers`` to ever stop() it — a leaked
thread. An ``RLock`` around every method that reads or mutates that
state serializes reload()/shutdown() calls; RLock (not Lock) because
``reload()`` and ``shutdown()`` both call ``_stop_worker()``, which takes
the same lock.
"""
from __future__ import annotations

import json
import threading
from typing import Callable

from app.plc.live_store import LiveStore
from app.plc.worker import PLCWorker

WorkerFactory = Callable[..., PLCWorker]


def _config_fingerprint(plc: dict, tags: list[dict]) -> str:
    sorted_tags = sorted(tags, key=lambda t: t["id"])
    return json.dumps(
        {"plc": plc, "tags": sorted_tags}, sort_keys=True, default=str
    )


class PollingSupervisor:
    def __init__(
        self,
        live_store: LiveStore,
        worker_factory: WorkerFactory = PLCWorker,
        poll_interval: float = 1.0,
    ) -> None:
        self.live_store = live_store
        self.worker_factory = worker_factory
        self.poll_interval = poll_interval
        self._lock = threading.RLock()
        self._workers: dict[int, PLCWorker] = {}
        self._fingerprints: dict[int, str] = {}

    @property
    def active_plc_ids(self) -> set[int]:
        with self._lock:
            return set(self._workers)

    def reload(self, plcs: list[dict], tags: list[dict]) -> None:
        with self._lock:
            tags_by_plc: dict[int, list[dict]] = {}
            for tag in tags:
                tags_by_plc.setdefault(tag["plc_id"], []).append(tag)

            desired_ids = {plc["id"] for plc in plcs}
            for plc_id in list(self._workers):
                if plc_id not in desired_ids:
                    self._stop_worker(plc_id)

            for plc in plcs:
                plc_id = plc["id"]
                plc_tags = tags_by_plc.get(plc_id, [])
                fingerprint = _config_fingerprint(plc, plc_tags)

                if plc_id in self._workers and self._fingerprints.get(plc_id) == fingerprint:
                    continue  # unchanged — leave the running worker alone

                if plc_id in self._workers:
                    self._stop_worker(plc_id)

                worker = self.worker_factory(
                    plc=plc,
                    tags=plc_tags,
                    live_store=self.live_store,
                    poll_interval=self.poll_interval,
                )
                worker.start()
                self._workers[plc_id] = worker
                self._fingerprints[plc_id] = fingerprint

    def _stop_worker(self, plc_id: int) -> None:
        # Always called from inside a `with self._lock` block (reload()
        # or shutdown()) — held for the duration of stop()+join() too,
        # not just the dict mutation. That serializes reload() calls
        # against each other for up to ~6s (the join timeout) per worker
        # being replaced, worst case. Accepted trade-off at this scale
        # (8 PLCs, infrequent admin-panel writes): correctness (no
        # orphaned/leaked worker threads) matters far more here than
        # reload() latency, and stop()/join() finishes in milliseconds
        # in the common case — 6s is only the pathological upper bound.
        with self._lock:
            worker = self._workers.pop(plc_id, None)
            self._fingerprints.pop(plc_id, None)
            if worker is not None:
                worker.stop()
                worker.join(timeout=6.0)
            self.live_store.remove_plc(plc_id)

    def shutdown(self) -> None:
        with self._lock:
            for plc_id in list(self._workers):
                self._stop_worker(plc_id)
