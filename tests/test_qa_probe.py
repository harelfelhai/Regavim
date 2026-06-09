"""
QA edge-case probes added during the pre-demo hardening pass.

Uses the stub-coordinator `client` (auth bypassed) against the test sqlite DB.
Focus: malformed inputs, boundary values, and lifecycle guards that the
per-feature suites may not cover. Any 5xx here is a real bug.
"""

_R = "/api/v1/reports/"

_VALID = {
    "description": "מבנה בטון ללא היתר",
    "user_lat": 32.0, "user_lng": 35.0,
    "target_lat": 32.1, "target_lng": 35.1,
    "final_category": "ILLEGAL_CONSTRUCTION",
}


# ── List filters ─────────────────────────────────────────────────────────────

class TestListFilters:
    def test_invalid_status_enum_422(self, client):
        assert client.get(_R, params={"status": "bogus"}).status_code == 422

    def test_invalid_category_enum_422(self, client):
        assert client.get(_R, params={"category": "bogus"}).status_code == 422

    def test_malformed_date_422(self, client):
        assert client.get(_R, params={"date_from": "not-a-date"}).status_code == 422

    def test_reversed_date_range_ok_empty(self, client):
        # date_from after date_to is logically empty, but must not error.
        r = client.get(_R, params={"date_from": "2030-01-01T00:00:00", "date_to": "2020-01-01T00:00:00"})
        assert r.status_code == 200
        assert r.json() == []


# ── Create ───────────────────────────────────────────────────────────────────

class TestCreate:
    def test_latitude_out_of_range_422(self, client):
        assert client.post(_R, json={**_VALID, "target_lat": 91}).status_code == 422

    def test_longitude_out_of_range_422(self, client):
        assert client.post(_R, json={**_VALID, "target_lng": 200}).status_code == 422

    def test_confirmed_requires_nonblank_description(self, client):
        # final_category present → report would be 'confirmed', which needs a description.
        r = client.post(_R, json={**_VALID, "description": "   "})
        assert r.status_code == 422

    def test_minimal_pending_ok(self, client):
        r = client.post(_R, json={k: v for k, v in _VALID.items() if k != "final_category"})
        assert r.status_code == 201
        assert r.json()["status"] == "pending"

    def test_unicode_and_emoji_description_roundtrips(self, client):
        text = "בנייה ליד ואדי 🚧🏗️ — שכבת בטון \"חדשה\" <b>test</b>"
        r = client.post(_R, json={**_VALID, "description": text})
        assert r.status_code == 201
        assert r.json()["description"] == text  # stored verbatim (escaping happens at render)

    def test_long_description_ok(self, client):
        r = client.post(_R, json={**_VALID, "description": "א" * 20000})
        assert r.status_code == 201


# ── Get / Patch / Delete ─────────────────────────────────────────────────────

class TestLifecycle:
    def test_get_missing_404(self, client):
        assert client.get(f"{_R}does-not-exist").status_code == 404

    def test_patch_unknown_field_422(self, client):
        rid = client.post(_R, json=_VALID).json()["id"]
        assert client.patch(f"{_R}{rid}", json={"bogus": "x"}).status_code == 422

    def test_patch_final_category_autoconfirms_pending(self, client):
        rid = client.post(_R, json={k: v for k, v in _VALID.items() if k != "final_category"}).json()["id"]
        r = client.patch(f"{_R}{rid}", json={"final_category": "DEMOLITION"})
        assert r.status_code == 200
        assert r.json()["status"] == "confirmed"

    def test_hard_delete_forbidden_for_coordinator(self, client):
        # Stub user is a coordinator → force delete must be 403.
        rid = client.post(_R, json=_VALID).json()["id"]
        assert client.delete(f"{_R}{rid}", params={"force": "true"}).status_code == 403
