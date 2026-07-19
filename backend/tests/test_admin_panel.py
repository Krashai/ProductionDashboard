def test_admin_panel_root_serves_html(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert "<form" in resp.text.lower()


def test_admin_panel_mentions_all_four_managed_entities(client):
    resp = client.get("/")
    text = resp.text.lower()
    for keyword in ("plc", "tag", "threshold", "próg", "bit"):
        assert keyword in text
