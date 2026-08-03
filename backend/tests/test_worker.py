"""PLCWorker tests. snap7.client.Client is always mocked — there is no
physical PLC in this environment (per NewBackendPlan.md §6).

Design: unlike the gateway's PLCWorker (which pushes a per-PLC WS
broadcast every cycle from inside the poll thread), this worker's only
job is decode-and-publish into a thread-safe LiveStore (see
app.plc.live_store). A single asyncio broadcaster task (app.main) reads
that store on its own cadence and builds the area-grouped payload. This
decouples 8 independent OS poll threads from the event loop and from
each other, and makes the worker trivially testable via `run_once()`
without needing a running asyncio loop at all.
"""
import logging
from unittest.mock import MagicMock

import pytest
from snap7.util import set_bool, set_int, set_real, set_string

from app.plc.live_store import LiveStore
from app.plc.worker import (
    CONNECT_TIMEOUT_S,
    PLCWorker,
    READ_TIMEOUT_S,
    _STRING_BUFFER_WIDTH,
)


def _plc_config(**overrides):
    defaults = dict(id=1, name="Chłodnia 1", ip="10.10.0.10", rack=0, slot=1)
    defaults.update(overrides)
    return defaults


def _tag(**overrides):
    defaults = dict(id=1, name="Temp_Hala", db=1, offset=0, bit=0, type="REAL")
    defaults.update(overrides)
    return defaults


def _worker_with_mock_client(plc, tags, live_store=None, probe=None):
    """``probe`` defaults to a harmless no-op MagicMock (not the real
    ``_default_tcp_probe``) so these tests never attempt a real TCP
    connection to the fake IPs used throughout this file — HIGH #B1's
    probe behavior itself is covered by the dedicated tests below.
    """
    live_store = live_store or LiveStore()
    mock_client = MagicMock()
    worker = PLCWorker(
        plc=plc,
        tags=tags,
        live_store=live_store,
        client_factory=lambda: mock_client,
        poll_interval=0.01,
        probe=probe or MagicMock(),
    )
    return worker, mock_client, live_store


def test_run_once_connects_when_not_already_connected():
    plc = _plc_config()
    worker, mock_client, _ = _worker_with_mock_client(plc, [])
    mock_client.get_connected.return_value = False

    worker.run_once()

    mock_client.connect.assert_called_once_with(plc["ip"], plc["rack"], plc["slot"])


def test_run_once_skips_connect_when_already_connected():
    plc = _plc_config()
    worker, mock_client, _ = _worker_with_mock_client(plc, [])
    mock_client.get_connected.return_value = True

    worker.run_once()

    mock_client.connect.assert_not_called()


def test_run_once_reads_and_decodes_a_real_tag_into_live_store():
    plc = _plc_config(id=7)
    tags = [_tag(id=1, name="Temp_Hala", db=1, offset=0, type="REAL")]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True

    raw = bytearray(32)
    set_real(raw, 0, 4.75)
    mock_client.db_read.return_value = raw

    worker.run_once()

    snapshot = live_store.snapshot()
    assert snapshot[7]["online"] is True
    assert snapshot[7]["tag_values"]["Temp_Hala"] == pytest.approx(4.75)
    assert snapshot[7]["error"] is None


def test_run_once_groups_reads_by_db_number_minimizing_round_trips():
    plc = _plc_config(id=1)
    tags = [
        _tag(id=1, name="Temp", db=1, offset=0, type="REAL"),
        _tag(id=2, name="Pressure", db=1, offset=4, type="REAL"),
        _tag(id=3, name="Level", db=2, offset=0, type="INT"),
    ]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True

    raw_db1 = bytearray(32)
    set_real(raw_db1, 0, 1.5)
    set_real(raw_db1, 4, 2.5)
    raw_db2 = bytearray(32)
    set_int(raw_db2, 0, 42)

    def fake_db_read(db_num, start, size):
        return raw_db1 if db_num == 1 else raw_db2

    mock_client.db_read.side_effect = fake_db_read

    worker.run_once()

    assert mock_client.db_read.call_count == 2  # one read per distinct DB, not per tag
    values = live_store.snapshot()[1]["tag_values"]
    assert values["Temp"] == pytest.approx(1.5)
    assert values["Pressure"] == pytest.approx(2.5)
    assert values["Level"] == 42


def test_run_once_decodes_bool_tag_with_bit_offset():
    plc = _plc_config(id=1)
    tags = [_tag(id=1, name="Alarm", db=1, offset=0, bit=5, type="BOOL")]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True

    raw = bytearray(32)
    set_bool(raw, 0, 5, True)
    mock_client.db_read.return_value = raw

    worker.run_once()

    assert live_store.snapshot()[1]["tag_values"]["Alarm"] is True


def test_connection_failure_marks_plc_offline_with_error_and_does_not_raise():
    """MEDIUM #B3/B5: only a short, generic error code reaches LiveStore
    (and therefore /status and /ws) — never the raw exception text, which
    could leak internal hostnames/paths to an unauthenticated endpoint."""
    plc = _plc_config(id=1)
    worker, mock_client, live_store = _worker_with_mock_client(plc, [_tag()])
    mock_client.get_connected.return_value = False
    mock_client.connect.side_effect = RuntimeError("connection refused")

    worker.run_once()  # must not raise — daemon thread can't die silently

    snapshot = live_store.snapshot()
    assert snapshot[1]["online"] is False
    assert snapshot[1]["error"] == "connect_failed"


def test_read_failure_mid_cycle_marks_offline_and_disconnects():
    plc = _plc_config(id=1)
    worker, mock_client, live_store = _worker_with_mock_client(plc, [_tag()])
    mock_client.get_connected.return_value = True
    mock_client.db_read.side_effect = RuntimeError("read timeout")

    worker.run_once()

    assert live_store.snapshot()[1]["online"] is False
    mock_client.disconnect.assert_called_once()


def test_single_bad_tag_does_not_take_down_the_whole_cycle():
    """One tag with a decode error (e.g. misconfigured offset) must not
    prevent the other, valid tags in the same cycle from being published.
    """
    plc = _plc_config(id=1)
    tags = [
        _tag(id=1, name="Good", db=1, offset=0, type="REAL"),
        _tag(id=2, name="Bad", db=1, offset=0, type="NOT_A_TYPE"),
    ]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True

    raw = bytearray(32)
    set_real(raw, 0, 9.9)
    mock_client.db_read.return_value = raw

    worker.run_once()

    values = live_store.snapshot()[1]["tag_values"]
    assert values["Good"] == pytest.approx(9.9)
    assert "Bad" not in values


def test_stop_sets_running_false_and_disconnects_if_connected():
    plc = _plc_config(id=1)
    worker, mock_client, _ = _worker_with_mock_client(plc, [])
    mock_client.get_connected.return_value = True

    worker.stop()

    assert worker.running is False
    mock_client.disconnect.assert_called_once()


def test_thread_run_loop_calls_run_once_repeatedly_until_stopped():
    plc = _plc_config(id=1)
    tags = [_tag(id=1, name="Temp", db=1, offset=0, type="REAL")]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True
    raw = bytearray(32)
    set_real(raw, 0, 1.0)
    mock_client.db_read.return_value = raw

    worker.start()
    import time

    time.sleep(0.1)
    worker.stop()
    worker.join(timeout=2.0)

    assert not worker.is_alive()
    assert mock_client.db_read.call_count >= 2


# --- HIGH #4: STRING tags need a much wider read buffer than the old
# flat "+4" gave them (S7 STRING can be up to 256 bytes: 2 header + up
# to 254 data bytes), or the read is silently truncated / decode raises.

def test_run_once_sizes_the_db_read_wide_enough_for_a_string_tag():
    plc = _plc_config(id=1)
    tags = [_tag(id=1, name="Batch_Name", db=1, offset=0, type="STRING")]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True

    raw = bytearray(300)
    set_string(raw, 0, "LOT-2026-07-19-A", max_size=254)
    mock_client.db_read.return_value = raw

    worker.run_once()

    called_size = mock_client.db_read.call_args[0][2]
    assert called_size >= _STRING_BUFFER_WIDTH
    assert live_store.snapshot()[1]["tag_values"]["Batch_Name"] == "LOT-2026-07-19-A"


def test_run_once_decodes_string_tag_alongside_other_tags_in_same_db():
    """A STRING tag sharing a DB block with tags at higher offsets must
    not truncate the shared read below what the STRING needs."""
    plc = _plc_config(id=1)
    tags = [
        _tag(id=1, name="Batch_Name", db=1, offset=0, type="STRING"),
        _tag(id=2, name="Temp", db=1, offset=260, type="REAL"),
    ]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True

    raw = bytearray(400)
    set_string(raw, 0, "LOT-42", max_size=254)
    set_real(raw, 260, 7.5)
    mock_client.db_read.return_value = raw

    worker.run_once()

    called_size = mock_client.db_read.call_args[0][2]
    assert called_size >= 260 + 4  # covers the REAL tag too
    values = live_store.snapshot()[1]["tag_values"]
    assert values["Batch_Name"] == "LOT-42"
    assert values["Temp"] == pytest.approx(7.5)


# --- HIGH #B1: pre-connect TCP probe with a short timeout, so an
# unreachable/blackholed host fails in ~CONNECT_TIMEOUT_S instead of
# snap7's own much longer (~10s worst case) internal timeouts, which
# could otherwise leak a worker thread past supervisor.py's join(6.0).

def test_probe_is_called_with_configured_timeout_before_connect():
    plc = _plc_config(id=1)
    live_store = LiveStore()
    mock_client = MagicMock()
    mock_client.get_connected.return_value = False
    mock_probe = MagicMock()

    manager = MagicMock()
    manager.attach_mock(mock_probe, "probe")
    manager.attach_mock(mock_client.connect, "connect")

    worker = PLCWorker(
        plc=plc,
        tags=[],
        live_store=live_store,
        client_factory=lambda: mock_client,
        poll_interval=0.01,
        probe=mock_probe,
    )

    worker.run_once()

    mock_probe.assert_called_once_with(plc["ip"], CONNECT_TIMEOUT_S)
    mock_client.connect.assert_called_once_with(plc["ip"], plc["rack"], plc["slot"])
    # probe must run *before* connect, not after
    assert [call[0] for call in manager.mock_calls] == ["probe", "connect"]


def test_probe_failure_marks_plc_offline_and_never_calls_connect():
    plc = _plc_config(id=1)
    live_store = LiveStore()
    mock_client = MagicMock()
    mock_client.get_connected.return_value = False
    mock_probe = MagicMock(side_effect=OSError("timed out"))

    worker = PLCWorker(
        plc=plc,
        tags=[],
        live_store=live_store,
        client_factory=lambda: mock_client,
        poll_interval=0.01,
        probe=mock_probe,
    )

    worker.run_once()  # must not raise

    mock_client.connect.assert_not_called()
    snapshot = live_store.snapshot()
    assert snapshot[1]["online"] is False
    assert snapshot[1]["error"] == "connect_failed"


def test_tighten_read_timeout_called_after_connect_when_client_exposes_it():
    plc = _plc_config(id=1)
    worker, mock_client, _ = _worker_with_mock_client(plc, [])
    mock_client.get_connected.return_value = False

    worker.run_once()

    mock_client.connection.socket.settimeout.assert_called_once_with(READ_TIMEOUT_S)


def test_tighten_read_timeout_is_a_silent_noop_when_client_does_not_expose_it():
    """Different python-snap7 builds expose different internals for this
    (or none at all, per the module docstring) — the best-effort attempt
    must never raise regardless."""
    plc = _plc_config(id=1)
    worker, mock_client, _ = _worker_with_mock_client(plc, [])
    mock_client.get_connected.return_value = False
    mock_client.connection = None  # simulates an installed build with no
    # reachable ``connection.socket`` attribute path
    mock_client.set_param.side_effect = AttributeError("no set_param on this build")

    worker.run_once()  # must not raise

    mock_client.connect.assert_called_once()


def test_run_once_after_stop_performs_no_live_store_write():
    """HIGH #B1: a thread that has been told to stop() must never write
    to LiveStore again — closing the race where a slow-to-stop worker
    keeps publishing after the supervisor has already moved on."""
    plc = _plc_config(id=1)
    tags = [_tag(id=1, name="Temp", db=1, offset=0, type="REAL")]
    worker, mock_client, live_store = _worker_with_mock_client(plc, tags)
    mock_client.get_connected.return_value = True
    raw = bytearray(32)
    set_real(raw, 0, 1.0)
    mock_client.db_read.return_value = raw

    worker.stop()
    live_store.update_plc = MagicMock(wraps=live_store.update_plc)

    worker.run_once()

    live_store.update_plc.assert_not_called()


# --- MEDIUM #B3/B5: raw exception text must never reach LiveStore (and
# therefore /status, /ws — unauthenticated), only a generic code; the
# full original message is only available via the logger.

def test_connect_exception_with_sensitive_message_is_never_leaked_to_live_store(caplog):
    plc = _plc_config(id=1)
    worker, mock_client, live_store = _worker_with_mock_client(plc, [_tag()])
    mock_client.get_connected.return_value = False
    sensitive = "failed to reach internal-plc-gw01.corp.local (see /etc/secrets/plc.key)"
    mock_client.connect.side_effect = RuntimeError(sensitive)

    with caplog.at_level(logging.ERROR, logger="app.plc.worker"):
        worker.run_once()

    snapshot = live_store.snapshot()
    assert snapshot[1]["error"] == "connect_failed"
    assert sensitive not in repr(snapshot)
    assert sensitive in caplog.text
