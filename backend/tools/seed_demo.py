"""Seed a demo configuration through the public API (see tools/sim_server.py).

Chłodnia 1 fully wired (with alarms of every kind), the other areas only
partly, one offline PLC — so coverage, "Niepodpięta" rows, live alarms and
the offline state are all visible at once.
"""
from __future__ import annotations

import argparse
import json
import urllib.request


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    parser.add_argument("--token", required=True)
    args = parser.parse_args()

    def call(method, path, body=None):
        req = urllib.request.Request(
            args.url + path, method=method,
            data=None if body is None else json.dumps(body).encode(),
            headers={"Content-Type": "application/json", "X-Admin-Token": args.token},
        )
        with urllib.request.urlopen(req) as resp:
            return json.load(resp) if resp.status != 204 else None

    areas = {a["id"]: a for a in call("GET", "/api/areas")}
    # 192.0.2.0/24 = TEST-NET-1 (RFC 5737): documentation-only addresses, so
    # this public repo never carries the plant's real OT addresses.
    plan = {  # area -> (PLC name, IP, how many catalog metrics to wire)
        "chlodnia-1": ("PLC Chłodnia 1", "192.0.2.10", None),
        "chlodnia-2": ("PLC Chłodnia 2", "192.0.2.26", 9),
        "chlodnia-3": ("PLC Chłodnia 3 (offline)", "192.0.2.23", 6),
        "sprezarkownia": ("PLC Sprężarkownia", "192.0.2.40", 8),
        "energia-elektryczna": ("PLC Trafostacje", "192.0.2.50", 14),
    }
    for area_id, (name, ip, limit) in plan.items():
        plc = call("POST", "/api/plcs", {"name": name, "area_id": area_id, "ip": ip,
                                         "rack": 0, "slot": 1, "plc_type": "S7-1200"})
        metrics = areas[area_id]["metrics"][:limit]
        for i, m in enumerate(metrics):
            is_bool = m["id"].endswith("-praca") or "-awaria" in m["id"]
            tag = call("POST", "/api/tags", {
                "plc_id": plc["id"], "name": m["id"], "db": 6, "offset": i * 4 if not is_bool else i // 8,
                "bit": i % 8 if is_bool else 0, "type": "BOOL" if is_bool else "REAL",
                "metric_id": m["id"], "label": m["label"], "unit": m["unit"], "decimals": m["decimals"]})
            limits = {"°C": (2.0, 8.0), "bar": (2.8, 5.2), "cm": (80.0, None)}.get(m["unit"])
            if limits:
                call("PUT", f"/api/tags/{tag['id']}/alarm", {"kind": "threshold", "threshold": {
                    "min": limits[0], "max": limits[1], "hysteresis": 0.2 if m["unit"] != "cm" else 5, "delay_s": 3}})
            if m["id"] == "chlodnia-1-v201-awaria":
                call("PUT", f"/api/tags/{tag['id']}/alarm", {"kind": "bool", "bool_alarm": {
                    "active_value": 0, "description": "Brak sygnału gotowości (logika odwrócona)", "delay_s": 0}})
        if area_id.startswith("chlodnia"):
            word = call("POST", "/api/tags", {
                "plc_id": plc["id"], "name": "slowo_awarii_1", "db": 20, "offset": 0, "bit": 0, "type": "WORD",
                "metric_id": f"{area_id}-diag-slowo-awarii-1", "label": "Słowo awarii 1", "unit": "", "decimals": 0})
            call("PUT", f"/api/tags/{word['id']}/alarm", {"kind": "bits", "bits": [
                {"bit_index": 0, "description": "Przegrzanie silnika V101"},
                {"bit_index": 2, "description": "Zabezpieczenie termiczne pompy 1"},
                {"bit_index": 3, "description": "Brak przepływu wody lodowej"}]})
    print("Demo configuration seeded.")


if __name__ == "__main__":
    main()
