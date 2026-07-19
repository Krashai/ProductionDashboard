"""One background thread per PLC, polling tag values over S7 and
publishing them into a shared LiveStore.

Pattern adapted from ProductionMonitor's gateway/backend/app/plc/worker.py
(thread + python-snap7 + publish-on-change-ish poll loop), rewritten with
two structural differences:

1. Dependency-injected ``client_factory`` instead of hardcoding
   ``snap7.client.Client()`` in ``__init__``. This lets tests exercise the
   full poll cycle (connect / read / decode / error handling) against a
   plain ``MagicMock`` without a real libsnap7.so on the machine — there
   is no physical PLC available in this dev/CI environment.
2. No direct WS broadcast from inside the worker thread. The gateway
   pattern calls `asyncio.run_coroutine_threadsafe` after every cycle;
   here, 8 workers run independently and just write into `LiveStore`
   (thread-safe), and a single asyncio task in app.main reads that store
   on its own ~1s cadence to build and broadcast the area-grouped
   payload. This avoids 8 threads racing to schedule coroutines on the
   loop and keeps broadcast cadence decoupled from each PLC's own poll
   timing/latency.
"""
from __future__ import annotations

import threading
import time
import traceback
from typing import Any, Callable

from app.plc.decode import decode_tag_value
from app.plc.live_store import LiveStore

ClientFactory = Callable[[], Any]


def _default_client_factory() -> Any:
    # Imported lazily so importing this module never requires a working
    # libsnap7.so to be present (e.g. in the test environment).
    import snap7.client

    return snap7.client.Client()


class PLCWorker(threading.Thread):
    def __init__(
        self,
        plc: dict,
        tags: list[dict],
        live_store: LiveStore,
        client_factory: ClientFactory = _default_client_factory,
        poll_interval: float = 1.0,
    ) -> None:
        super().__init__(daemon=True, name=f"plc-worker-{plc['id']}")
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval
        self.running = True
        self.client = client_factory()

    def _connect_if_needed(self) -> bool:
        if self.client.get_connected():
            return True
        self.client.connect(self.plc["ip"], self.plc["rack"], self.plc["slot"])
        return True

    def _tags_by_db(self) -> dict[int, list[dict]]:
        grouped: dict[int, list[dict]] = {}
        for tag in self.tags:
            grouped.setdefault(tag["db"], []).append(tag)
        return grouped

    def _read_all_tags(self) -> dict[str, Any]:
        values: dict[str, Any] = {}
        for db_num, tags in self._tags_by_db().items():
            max_offset = max(t["offset"] for t in tags) + 4
            raw = self.client.db_read(db_num, 0, max_offset)
            for tag in tags:
                try:
                    value = decode_tag_value(
                        raw, tag["offset"], tag["type"], tag.get("bit", 0)
                    )
                except Exception as exc:
                    # One misconfigured tag (bad offset/type) must not
                    # take the rest of the cycle's valid tags down with
                    # it — log with full context and keep going.
                    print(
                        f"PLCWorker {self.plc['id']}: decode error for tag "
                        f"{tag['name']!r} (type={tag['type']!r} offset={tag['offset']}): {exc}",
                        flush=True,
                    )
                    continue
                values[tag["name"]] = value
        return values

    def run_once(self) -> None:
        """Execute a single connect+read+publish cycle. Never raises —
        any failure is caught, logged, and reflected as an offline
        LiveStore entry, so the owning thread (daemon) can never die
        silently (the gateway's worker.py had exactly this bug pre-fix).
        """
        try:
            self._connect_if_needed()
        except Exception as exc:
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=False, tag_values={}, error=str(exc)
            )
            return

        try:
            values = self._read_all_tags()
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=True, tag_values=values, error=None
            )
        except Exception as exc:
            print(
                f"PLCWorker {self.plc['id']}: read cycle failed: {exc}", flush=True
            )
            try:
                self.client.disconnect()
            except Exception:
                pass
            self.live_store.update_plc(
                plc_id=self.plc["id"], online=False, tag_values={}, error=str(exc)
            )

    def run(self) -> None:
        while self.running:
            start = time.time()
            try:
                self.run_once()
            except Exception:
                # Safety net: run_once already catches its own errors,
                # this only guards against a bug in run_once itself.
                traceback.print_exc()
            elapsed = time.time() - start
            time.sleep(max(0.01, self.poll_interval - elapsed))

    def stop(self) -> None:
        self.running = False
        try:
            if self.client.get_connected():
                self.client.disconnect()
        except Exception:
            pass
