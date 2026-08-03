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


# --- LOW #B6: the admin token must not persist indefinitely in
# localStorage with no logout affordance.

def test_admin_panel_uses_session_storage_not_local_storage_for_the_token(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "sessionStorage" in resp.text
    assert "localStorage" not in resp.text


def test_admin_panel_has_a_logout_control(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert 'id="logout-btn"' in resp.text
