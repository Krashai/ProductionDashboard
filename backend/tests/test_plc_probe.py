"""Unit tests for app.plc.probe.probe_tag_value — the short-lived,
independent snap7 connection used by POST /api/plcs/{plc_id}/probe (see
tests/test_api_probe.py for the HTTP-layer behavior). These exercise the
function directly, the same granularity test_worker.py uses for
PLCWorker.run_once, including the exception-swallowing edges around the
best-effort timeout tightening and the always-disconnect finally block.
"""
from unittest.mock import MagicMock

import pytest
from snap7.util import set_real

from app.plc.probe import (
    ProbeConnectError,
    ProbeReadError,
    _tighten_connect_timeout,
    probe_tag_value,
)
from app.plc.worker import CONNECT_TIMEOUT_S


def _plc(**overrides):
    defaults = dict(ip="10.10.0.10", rack=0, slot=1)
    defaults.update(overrides)
    return defaults


def test_probe_tag_value_returns_decoded_value_on_success():
    mock_client = MagicMock()
    raw = bytearray(8)
    set_real(raw, 0, 3.25)
    mock_client.db_read.return_value = raw

    value = probe_tag_value(
        _plc(), db=1, offset=0, bit=0, tag_type="REAL",
        client_factory=lambda: mock_client,
        probe=MagicMock(),
    )

    assert value == pytest.approx(3.25)
    mock_client.connect.assert_called_once_with("10.10.0.10", 0, 1)
    mock_client.disconnect.assert_called_once()


def test_probe_tag_value_raises_probe_connect_error_on_connect_failure():
    mock_client = MagicMock()
    mock_client.connect.side_effect = RuntimeError("no route to host")

    with pytest.raises(ProbeConnectError):
        probe_tag_value(
            _plc(), db=1, offset=0, bit=0, tag_type="REAL",
            client_factory=lambda: mock_client,
            probe=MagicMock(),
        )

    mock_client.disconnect.assert_called_once()  # finally still runs


def test_probe_tag_value_raises_probe_read_error_on_db_read_failure():
    mock_client = MagicMock()
    mock_client.db_read.side_effect = RuntimeError("read timeout")

    with pytest.raises(ProbeReadError):
        probe_tag_value(
            _plc(), db=1, offset=0, bit=0, tag_type="REAL",
            client_factory=lambda: mock_client,
            probe=MagicMock(),
        )

    mock_client.disconnect.assert_called_once()


def test_probe_tag_value_raises_probe_read_error_on_decode_failure():
    mock_client = MagicMock()
    mock_client.db_read.return_value = bytearray(0)  # too short to decode a REAL

    with pytest.raises(ProbeReadError):
        probe_tag_value(
            _plc(), db=1, offset=0, bit=0, tag_type="REAL",
            client_factory=lambda: mock_client,
            probe=MagicMock(),
        )


def test_probe_tag_value_disconnect_failure_does_not_mask_the_original_error():
    """disconnect() itself raising in the finally block must not prevent
    the original ProbeConnectError from propagating."""
    mock_client = MagicMock()
    mock_client.connect.side_effect = RuntimeError("connection refused")
    mock_client.disconnect.side_effect = RuntimeError("already closed")

    with pytest.raises(ProbeConnectError):
        probe_tag_value(
            _plc(), db=1, offset=0, bit=0, tag_type="REAL",
            client_factory=lambda: mock_client,
            probe=MagicMock(),
        )


def test_probe_tag_value_runs_tcp_probe_before_connect():
    mock_client = MagicMock()
    raw = bytearray(8)
    set_real(raw, 0, 1.0)
    mock_client.db_read.return_value = raw
    mock_probe = MagicMock()
    manager = MagicMock()
    manager.attach_mock(mock_probe, "probe")
    manager.attach_mock(mock_client.connect, "connect")

    probe_tag_value(
        _plc(ip="10.20.0.5"), db=1, offset=0, bit=0, tag_type="REAL",
        client_factory=lambda: mock_client,
        probe=mock_probe,
    )

    mock_probe.assert_called_once_with("10.20.0.5", CONNECT_TIMEOUT_S)
    assert [call[0] for call in manager.mock_calls] == ["probe", "connect"]


def test_probe_tag_value_raises_probe_connect_error_when_tcp_probe_fails_and_never_connects():
    mock_client = MagicMock()
    mock_probe = MagicMock(side_effect=OSError("timed out"))

    with pytest.raises(ProbeConnectError):
        probe_tag_value(
            _plc(), db=1, offset=0, bit=0, tag_type="REAL",
            client_factory=lambda: mock_client,
            probe=mock_probe,
        )

    mock_client.connect.assert_not_called()
    mock_client.disconnect.assert_called_once()  # finally still runs


def test_tighten_connect_timeout_sets_ping_timeout_param_in_milliseconds():
    from snap7.type import Parameter

    mock_client = MagicMock()

    _tighten_connect_timeout(mock_client, timeout_s=2.0)

    mock_client.set_param.assert_called_once_with(Parameter.PingTimeout, 2000)


def test_tighten_connect_timeout_swallows_exceptions_from_set_param():
    mock_client = MagicMock()
    mock_client.set_param.side_effect = RuntimeError("param not supported")

    _tighten_connect_timeout(mock_client)  # must not raise
