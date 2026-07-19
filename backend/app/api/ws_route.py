"""GET /ws — unauthenticated WebSocket, per NewBackendPlan.md decision #9.
Actual push happens from app.plc.broadcaster's periodic loop via the
ConnectionManager on app.state.ws_manager; this route only registers/
deregisters each client connection.
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import get_ws_manager

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    manager = get_ws_manager(websocket)  # Request and WebSocket both expose .app
    await manager.connect(websocket)
    try:
        while True:
            # Clients don't send anything meaningful; this just keeps the
            # connection open and lets us detect disconnects promptly.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
