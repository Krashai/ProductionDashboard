import time


def test_ws_connect_and_receive_state_update(client, app):
    """Full integration: connect over the real /ws route, wait for the
    broadcaster loop (poll_interval=0.05s in the `app` fixture) to tick,
    and assert the pushed payload has the area-grouped shape."""
    with client.websocket_connect("/ws") as ws:
        message = ws.receive_json(mode="text")

    assert message["type"] == "STATE_UPDATE"
    assert len(message["areas"]) == 5
    assert {a["area_id"] for a in message["areas"]} == {
        "chlodnia-1", "chlodnia-2", "chlodnia-3", "sprezarkownia", "energia-elektryczna",
    }
