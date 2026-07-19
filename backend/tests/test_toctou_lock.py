"""MEDIUM finding #6: concurrent POST /api/thresholds and POST
/api/bit-alarms for the SAME tag could both pass their "is this tag free
of the other rule type" check before either commits, violating the
threshold-XOR-bit-alarm invariant (app.db.models). app.db.alarm_rule_lock
closes that window with a process-wide lock around the check+insert in
both routers. Race the two requests against each other, synchronized
with a Barrier to maximize the chance of catching a regression, repeated
across several fresh tags to make a flaky pass unlikely.
"""
import threading


def _plc(client):
    payload = dict(
        name="Chłodnia 1", area_id="chlodnia-1", ip="10.10.0.10",
        rack=0, slot=1, plc_type="S7-1200",
    )
    return client.post("/api/plcs", json=payload).json()


def _tag(client, plc_id, n):
    payload = dict(
        plc_id=plc_id, name=f"Fault_Word_{n}", db=1, offset=4 * n, bit=0, type="WORD",
        metric_id=f"chlodnia-1-faults-{n}", label="Alarmy", unit="", decimals=0,
    )
    return client.post("/api/tags", json=payload).json()


def test_concurrent_threshold_and_bit_alarm_creation_never_both_succeed(client):
    plc = _plc(client)
    results = []

    for n in range(15):
        tag = _tag(client, plc["id"], n)
        barrier = threading.Barrier(2)
        outcomes: dict[str, int] = {}

        def post_threshold():
            barrier.wait(timeout=5)
            resp = client.post("/api/thresholds", json={"tag_id": tag["id"], "min": 0, "max": 10})
            outcomes["threshold"] = resp.status_code

        def post_bit_alarm():
            barrier.wait(timeout=5)
            resp = client.post(
                "/api/bit-alarms", json={"tag_id": tag["id"], "bit_index": 0, "description": "x"}
            )
            outcomes["bit_alarm"] = resp.status_code

        t1 = threading.Thread(target=post_threshold)
        t2 = threading.Thread(target=post_bit_alarm)
        t1.start()
        t2.start()
        t1.join(timeout=5)
        t2.join(timeout=5)

        results.append(outcomes)

        threshold_created = outcomes.get("threshold") == 201
        bit_alarm_created = outcomes.get("bit_alarm") == 201
        assert not (threshold_created and bit_alarm_created), (
            f"tag {tag['id']}: both a threshold AND a bit-alarm rule were "
            f"created concurrently — TOCTOU race, outcomes={outcomes}"
        )
        # exactly one of the two racing requests must have won (both are
        # otherwise valid requests against a fresh tag)
        assert threshold_created or bit_alarm_created

    assert len(results) == 15
