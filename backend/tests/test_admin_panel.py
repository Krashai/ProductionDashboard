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


# --- Kreator: przypisz zmienną (wizard) — see
# VariableAssignmentWizard.md §5.3/§5.5. Per that doc's documented
# trade-off, this project tests admin.html the same way as the rest of
# the (framework-less) panel: presence of expected element ids/strings
# in the server-rendered HTML, not a full DOM/browser harness.


def test_admin_panel_has_wizard_section(client):
    resp = client.get("/")
    assert resp.status_code == 200
    assert 'id="wizard-section"' in resp.text
    assert "Kreator: przypisz zmienną" in resp.text


def test_admin_panel_wizard_has_a_control_for_each_of_the_six_steps(client):
    resp = client.get("/")
    text = resp.text
    # Step 1: obszar + metryka
    assert 'id="wizard-area-select"' in text
    assert 'id="wizard-metric-list"' in text
    # Step 2: PLC
    assert 'id="wizard-plc-select"' in text
    # Step 3: typ + adres
    assert 'id="wizard-type-select"' in text
    assert 'id="wizard-db-input"' in text
    assert 'id="wizard-offset-input"' in text
    assert 'id="wizard-bit-input"' in text
    assert 'id="wizard-address-preview"' in text
    # Step 4: testuj odczyt
    assert 'id="wizard-probe-button"' in text
    assert 'id="wizard-probe-result"' in text
    # Step 5: próg alarmowy (opcjonalnie)
    assert 'id="wizard-threshold-checkbox"' in text
    assert 'id="wizard-threshold-min"' in text
    assert 'id="wizard-threshold-max"' in text
    # Step 6: zapisz
    assert 'id="wizard-save-button"' in text
    assert 'id="wizard-summary"' in text
    assert 'id="wizard-result"' in text
    assert 'id="wizard-retry-threshold-button"' in text


def test_admin_panel_wizard_calls_probe_endpoint_and_admin_token_header(client):
    resp = client.get("/")
    text = resp.text
    assert "/probe" in text
    assert "X-Admin-Token" in text


def test_admin_panel_advanced_section_is_relabeled(client):
    resp = client.get("/")
    assert "Zaawansowane / tag diagnostyczny" in resp.text


def test_admin_panel_preexisting_sections_still_present(client):
    """Guard against an accidental regression while adding the wizard
    section: the pre-existing PLC/tag/threshold/bit-alarm forms and
    tables must keep the exact ids the rest of this file's JS wires up
    against.
    """
    resp = client.get("/")
    text = resp.text
    assert "Sterowniki PLC" in text
    assert 'id="plc-form"' in text
    assert 'id="plc-table"' in text
    assert 'id="tag-form"' in text
    assert 'id="tag-table"' in text
    assert 'id="threshold-form"' in text
    assert 'id="threshold-table"' in text
    assert 'id="bitalarm-form"' in text
    assert 'id="bitalarm-table"' in text
