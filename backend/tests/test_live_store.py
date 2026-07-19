import threading
import time

from app.plc.live_store import LiveStore


def test_update_and_snapshot_roundtrip():
    store = LiveStore()
    store.update_plc(plc_id=1, online=True, tag_values={"Temp": 4.2}, error=None)

    snapshot = store.snapshot()

    assert snapshot[1]["online"] is True
    assert snapshot[1]["tag_values"] == {"Temp": 4.2}
    assert snapshot[1]["error"] is None
    assert "last_update" in snapshot[1]


def test_snapshot_is_a_copy_not_a_live_view():
    store = LiveStore()
    store.update_plc(plc_id=1, online=True, tag_values={"Temp": 4.2}, error=None)

    snapshot = store.snapshot()
    snapshot[1]["tag_values"]["Temp"] = 999.0

    fresh = store.snapshot()
    assert fresh[1]["tag_values"]["Temp"] == 4.2


def test_missing_plc_absent_from_snapshot():
    store = LiveStore()
    assert store.snapshot() == {}


def test_remove_plc_drops_it_from_snapshot():
    store = LiveStore()
    store.update_plc(plc_id=1, online=True, tag_values={}, error=None)
    store.remove_plc(1)
    assert store.snapshot() == {}


def test_records_error_message_when_offline():
    store = LiveStore()
    store.update_plc(plc_id=1, online=False, tag_values={}, error="connection refused")
    snap = store.snapshot()
    assert snap[1]["online"] is False
    assert snap[1]["error"] == "connection refused"


def test_concurrent_updates_from_multiple_threads_are_not_lost():
    store = LiveStore()

    def worker(plc_id: int):
        for _ in range(50):
            store.update_plc(plc_id=plc_id, online=True, tag_values={"n": plc_id}, error=None)

    threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=5)

    snapshot = store.snapshot()
    assert len(snapshot) == 8
    for plc_id in range(8):
        assert snapshot[plc_id]["tag_values"]["n"] == plc_id
