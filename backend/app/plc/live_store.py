"""Thread-safe store of the latest polled value per PLC.

Each PLCWorker runs in its own OS thread (see worker.py, mirroring the
gateway's one-thread-per-PLC pattern) and writes here after every poll
cycle. A separate asyncio broadcaster task (see main.py) reads a
consistent snapshot on its own cadence to build the WS/`/status`
payloads. Decoupling writer threads from the async reader this way means
8 independent poll loops never need to coordinate with each other or
with the event loop directly.
"""
from __future__ import annotations

import copy
import threading
from datetime import datetime, timezone
from typing import Any


class LiveStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[int, dict[str, Any]] = {}

    def update_plc(
        self,
        plc_id: int,
        online: bool,
        tag_values: dict[str, Any],
        error: str | None,
    ) -> None:
        with self._lock:
            self._state[plc_id] = {
                "online": online,
                "tag_values": dict(tag_values),
                "error": error,
                "last_update": datetime.now(timezone.utc).isoformat(),
            }

    def remove_plc(self, plc_id: int) -> None:
        with self._lock:
            self._state.pop(plc_id, None)

    def snapshot(self) -> dict[int, dict[str, Any]]:
        """Return a deep copy so callers can't mutate live state."""
        with self._lock:
            return copy.deepcopy(self._state)
