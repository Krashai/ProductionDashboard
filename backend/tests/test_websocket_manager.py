"""ConnectionManager — adapted from gateway/backend/app/api/websocket.py.
Tested with fake WebSocket doubles (no real network), including the
gateway's own documented fix: a socket that raises during broadcast must
be pruned from active_connections, not just skipped for that message.
"""
import pytest

from app.api.websocket import ConnectionManager


class FakeWebSocket:
    def __init__(self, fail: bool = False):
        self.fail = fail
        self.accepted = False
        self.sent: list[dict] = []

    async def accept(self):
        self.accepted = True

    async def send_json(self, message: dict):
        if self.fail:
            raise RuntimeError("socket closed")
        self.sent.append(message)


@pytest.mark.asyncio
async def test_connect_accepts_and_registers_socket():
    manager = ConnectionManager()
    ws = FakeWebSocket()

    await manager.connect(ws)

    assert ws.accepted is True
    assert ws in manager.active_connections


@pytest.mark.asyncio
async def test_broadcast_sends_to_all_connected_sockets():
    manager = ConnectionManager()
    ws1, ws2 = FakeWebSocket(), FakeWebSocket()
    await manager.connect(ws1)
    await manager.connect(ws2)

    await manager.broadcast({"type": "STATE_UPDATE"})

    assert ws1.sent == [{"type": "STATE_UPDATE"}]
    assert ws2.sent == [{"type": "STATE_UPDATE"}]


@pytest.mark.asyncio
async def test_broadcast_with_no_connections_is_a_no_op():
    manager = ConnectionManager()
    await manager.broadcast({"type": "STATE_UPDATE"})  # must not raise


@pytest.mark.asyncio
async def test_broadcast_prunes_socket_that_raises_on_send():
    manager = ConnectionManager()
    good, bad = FakeWebSocket(), FakeWebSocket(fail=True)
    await manager.connect(good)
    await manager.connect(bad)

    await manager.broadcast({"type": "STATE_UPDATE"})

    assert bad not in manager.active_connections
    assert good in manager.active_connections
    assert good.sent == [{"type": "STATE_UPDATE"}]


def test_disconnect_is_idempotent():
    manager = ConnectionManager()
    ws = FakeWebSocket()
    manager.active_connections.append(ws)

    manager.disconnect(ws)
    manager.disconnect(ws)  # second call must not raise

    assert ws not in manager.active_connections
