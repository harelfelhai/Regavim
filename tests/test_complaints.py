"""
Integration tests for the complaint submission endpoints.

Auth model (see conftest): the default `client` is a stub *coordinator*. The
`admin_client` fixture swaps in an admin so privileged actions can be exercised,
and restores the coordinator override afterwards. Email sending is always
mocked — no real mail is ever sent.
"""

import pytest

from backend.api.deps import get_current_user
from backend.core.config import settings
from backend.main import app
from backend.models.user import User as UserModel

_VALID = {
    "description": "Unauthorized concrete structure",
    "user_lat": 32.10,
    "user_lng": 35.18,
    "target_lat": 32.1057,
    "target_lng": 35.1839,
    "final_category": "ILLEGAL_CONSTRUCTION",  # → status becomes 'confirmed'
}

_ADMIN = UserModel(id="admin-test-1", email="admin@regavim.org", role="admin", hashed_password="x")


@pytest.fixture
def admin_client(client):
    """`client` but authenticated as an admin; restores the prior override after."""
    saved = app.dependency_overrides.get(get_current_user)
    app.dependency_overrides[get_current_user] = lambda: _ADMIN
    yield client
    if saved is not None:
        app.dependency_overrides[get_current_user] = saved
    else:
        app.dependency_overrides.pop(get_current_user, None)


def _confirmed_report(client) -> dict:
    """Create a report that lands in 'confirmed' status (complaint-eligible)."""
    return client.post("/api/v1/reports/", json=_VALID).json()


# ── authorities lookup ───────────────────────────────────────────────────────

class TestAuthorities:
    def test_lists_all_authorities(self, client):
        data = client.get("/api/v1/complaints/authorities").json()
        keys = {a["key"] for a in data}
        assert {"POLICE", "ILA", "ENV_MINISTRY", "LOCAL_PLANNING", "CIVIL_ADMIN"} <= keys
        assert all({"key", "label", "available"} <= a.keys() for a in data)

    def test_available_reflects_configured_email(self, client, monkeypatch):
        monkeypatch.setattr(settings, "COMPLAINT_EMAIL_POLICE", "police@test.example")
        monkeypatch.setattr(settings, "COMPLAINT_EMAIL_ILA", "")
        data = {a["key"]: a["available"] for a in client.get("/api/v1/complaints/authorities").json()}
        assert data["POLICE"] is True
        assert data["ILA"] is False


# ── submit authorization & validation ────────────────────────────────────────

class TestSubmitGuards:
    def test_coordinator_forbidden(self, client):
        report = _confirmed_report(client)  # created by the stub coordinator
        resp = client.post(f"/api/v1/reports/{report['id']}/complaints", json={"authorities": ["POLICE"]})
        assert resp.status_code == 403

    def test_missing_report_404(self, admin_client):
        resp = admin_client.post("/api/v1/reports/no-such-id/complaints", json={"authorities": ["POLICE"]})
        assert resp.status_code == 404

    def test_pending_report_409(self, admin_client):
        # No final_category → stays 'pending' → not complaint-eligible.
        report = admin_client.post(
            "/api/v1/reports/", json={k: v for k, v in _VALID.items() if k != "final_category"}
        ).json()
        resp = admin_client.post(f"/api/v1/reports/{report['id']}/complaints", json={"authorities": ["POLICE"]})
        assert resp.status_code == 409

    def test_empty_authorities_422(self, admin_client):
        report = _confirmed_report(admin_client)
        resp = admin_client.post(f"/api/v1/reports/{report['id']}/complaints", json={"authorities": []})
        assert resp.status_code == 422

    def test_unknown_authority_422(self, admin_client):
        report = _confirmed_report(admin_client)
        resp = admin_client.post(f"/api/v1/reports/{report['id']}/complaints", json={"authorities": ["BOGUS"]})
        assert resp.status_code == 422


# ── submit happy path & history ──────────────────────────────────────────────

class TestSubmit:
    def test_sends_and_records_sent(self, admin_client, monkeypatch):
        sent = []
        monkeypatch.setattr(settings, "COMPLAINT_EMAIL_POLICE", "police@test.example")
        monkeypatch.setattr(
            "backend.api.v1.complaints.send_email",
            lambda to, subject, body, attachments=None: sent.append((to, subject)),
        )
        report = _confirmed_report(admin_client)

        resp = admin_client.post(
            f"/api/v1/reports/{report['id']}/complaints", json={"authorities": ["POLICE"]}
        )
        assert resp.status_code == 201
        results = resp.json()["results"]
        assert len(results) == 1
        assert results[0]["status"] == "sent"
        assert sent and sent[0][0] == "police@test.example"

        # History endpoint reflects the submission.
        history = admin_client.get(f"/api/v1/reports/{report['id']}/complaints").json()
        assert len(history) == 1
        assert history[0]["status"] == "sent"
        assert history[0]["authority_key"] == "POLICE"

    def test_no_configured_email_records_failed(self, admin_client, monkeypatch):
        monkeypatch.setattr(settings, "COMPLAINT_EMAIL_ILA", "")  # not configured
        report = _confirmed_report(admin_client)

        resp = admin_client.post(
            f"/api/v1/reports/{report['id']}/complaints", json={"authorities": ["ILA"]}
        )
        assert resp.status_code == 201
        results = resp.json()["results"]
        assert results[0]["status"] == "failed"
        assert results[0]["error_message"]

        history = admin_client.get(f"/api/v1/reports/{report['id']}/complaints").json()
        assert history[0]["status"] == "failed"

    def test_email_failure_is_isolated_and_recorded(self, admin_client, monkeypatch):
        def boom(*args, **kwargs):
            raise RuntimeError("smtp down")

        monkeypatch.setattr(settings, "COMPLAINT_EMAIL_POLICE", "police@test.example")
        monkeypatch.setattr("backend.api.v1.complaints.send_email", boom)
        report = _confirmed_report(admin_client)

        resp = admin_client.post(
            f"/api/v1/reports/{report['id']}/complaints", json={"authorities": ["POLICE"]}
        )
        assert resp.status_code == 201
        assert resp.json()["results"][0]["status"] == "failed"
        assert "smtp down" in resp.json()["results"][0]["error_message"]

    def test_history_404_for_missing_report(self, admin_client):
        assert admin_client.get("/api/v1/reports/nope/complaints").status_code == 404
