"""GET / — the admin panel shell and its static ES modules.

The panel's logic lives in backend/app/static/admin/*.js; pure modules are
unit-tested with `node --test backend/tests_js/`, the UI itself is
verified in a browser. These tests pin what the backend is responsible
for: serving the shell and the assets, and the token-handling rules."""
from pathlib import Path

STATIC = Path(__file__).resolve().parents[1] / "app" / "static" / "admin"


def test_admin_panel_root_serves_the_shell(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert "text/html" in resp.headers["content-type"]
    assert 'src="/static/admin/app.js"' in resp.text
    assert 'id="login"' in resp.text
    assert 'id="logout"' in resp.text


def test_static_modules_are_served_and_revalidated(client):
    for path in ("app.js", "api.js", "admin.css", "editors/tag-editor.js"):
        resp = client.get(f"/static/admin/{path}")
        assert resp.status_code == 200, path
        assert resp.headers["cache-control"] == "no-cache"
    assert "javascript" in client.get("/static/admin/app.js").headers["content-type"]


def test_every_relative_import_resolves_to_a_served_file(client):
    """A typo in an import path only fails in the browser — catch it here."""
    import re

    for module in STATIC.rglob("*.js"):
        for target in re.findall(r"from '(\.[^']+)'", module.read_text(encoding="utf-8")):
            resolved = (module.parent / target).resolve().relative_to(STATIC)
            assert client.get(f"/static/admin/{resolved.as_posix()}").status_code == 200, (module.name, target)


def test_token_lives_in_session_storage_never_local_storage():
    sources = "\n".join(p.read_text(encoding="utf-8") for p in STATIC.rglob("*.js"))
    assert "sessionStorage" in sources
    assert "localStorage" not in sources


def test_no_inner_html_anywhere_in_the_panel():
    """Operator-supplied names/descriptions are rendered via textContent only."""
    for module in STATIC.rglob("*.js"):
        text = module.read_text(encoding="utf-8")
        assert "innerHTML" not in text.replace("nigdy innerHTML", ""), module.name
        assert "insertAdjacentHTML" not in text, module.name
