"""Development server with simulated PLCs — for trying the admin panel and
the wallboard without any S7 hardware. NOT for production.

    ADMIN_API_TOKEN=dev DASHBOARD_DB_PATH=/tmp/sim.db \\
        .venv/bin/uvicorn tools.sim_server:app --port 8001
    .venv/bin/python -m tools.seed_demo --url http://127.0.0.1:8001 --token dev

Every configured tag gets a plausible, slowly drifting value: analog values
by unit, PRACA mostly on, AWARIA rarely on, fault words with an occasional
bit set. A PLC whose name contains "offline" stays offline, so that state
can be seen too.
"""
from __future__ import annotations

import random
import threading

from app.main import create_app

# (środek, rozrzut) wg jednostki metryki — tylko do wyglądu, nie fizyka.
_RANGES = {
    "°C": (6.0, 3.0), "bar": (4.0, 1.5), "cm": (160.0, 60.0), "Hz": (42.0, 6.0),
    "V": (231.0, 3.0), "A": (400.0, 150.0), "kW": (180_000.0, 80_000.0),
    "kVA": (200_000.0, 80_000.0), "kVAr": (40_000.0, 20_000.0), "%": (3.0, 2.0),
    "m³/min": (20.0, 8.0),
}


class SimWorker(threading.Thread):
    def __init__(self, plc, tags, live_store, poll_interval=1.0):
        super().__init__(daemon=True, name=f"sim-plc-{plc['id']}")
        self.plc = plc
        self.tags = tags
        self.live_store = live_store
        self.poll_interval = poll_interval
        self._stop = threading.Event()
        self._values: dict[str, float | int] = {}

    def _next(self, tag):
        name, kind = tag["name"], tag["type"]
        previous = self._values.get(name)
        if kind == "BOOL":
            is_fault = "awaria" in tag["metric_id"]
            if previous is None:
                return int(random.random() < (0.08 if is_fault else 0.85))
            return 1 - previous if random.random() < (0.02 if is_fault else 0.03) else previous
        if kind in ("WORD", "BYTE", "INT", "DINT") and "diag" in tag["metric_id"]:
            if previous is None or random.random() < 0.05:
                return random.choice([0, 0, 0, 1, 8, 9, 4])
            return previous
        center, spread = _RANGES.get(tag["unit"], (50.0, 20.0))
        if previous is None:
            return center + random.uniform(-spread, spread) * 0.5
        drift = previous + random.uniform(-spread, spread) * 0.08
        value = min(center + spread * 1.4, max(center - spread * 1.4, drift))
        return round(value, 3) if kind == "REAL" else int(value)

    def run(self):
        offline = "offline" in self.plc["name"].lower()
        while not self._stop.is_set():
            if offline:
                self.live_store.update_plc(self.plc["id"], online=False, tag_values={}, error="Symulacja: brak połączenia")
            else:
                self._values = {t["name"]: self._next(t) for t in self.tags}
                self.live_store.update_plc(self.plc["id"], online=True, tag_values=self._values, error=None)
            self._stop.wait(self.poll_interval)

    def stop(self):
        self._stop.set()


app = create_app(worker_factory=SimWorker)
