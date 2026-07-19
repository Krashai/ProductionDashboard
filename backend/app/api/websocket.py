"""WS connection registry — ported from the gateway pattern
(gateway/backend/app/api/websocket.py), including its documented fix for
the "ghost socket" bug: a send failure during broadcast must remove the
socket from active_connections immediately, not just skip it for that
one message, or every subsequent broadcast keeps paying the cost of
iterating (and failing to send to) a dead connection.

Per NewBackendPlan.md decision #9, /ws is unauthenticated (internal
network, read-only data).
"""
from __future__ import annotations

import asyncio

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict) -> None:
        if not self.active_connections:
            return

        connections = list(self.active_connections)
        results = await asyncio.gather(
            *(conn.send_json(message) for conn in connections),
            return_exceptions=True,
        )
        for conn, result in zip(connections, results):
            if isinstance(result, Exception):
                self.disconnect(conn)
