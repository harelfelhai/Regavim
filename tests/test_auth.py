"""
Authentication endpoint tests — register, login, GET /me, token validation,
and endpoint protection checks.

All tests use the auth_client fixture which removes the get_current_user
stub override so real JWT verification is exercised.
"""

from datetime import timedelta

import pytest

from backend.core.security import create_access_token

# ── Helpers ───────────────────────────────────────────────────────────────────

_BASE = "/api/v1/auth"
_REPORTS = "/api/v1/reports/"
_IMAGES_ANALYZE = "/api/v1/images/analyze"


def _register(client, email="coord@example.com", password="Pass1234!", role="coordinator"):
    return client.post(f"{_BASE}/register", json={"email": email, "password": password, "role": role})


def _login(client, email="coord@example.com", password="Pass1234!"):
    return client.post(f"{_BASE}/login", json={"email": email, "password": password})


def _bearer(token):
    return {"Authorization": f"Bearer {token}"}


# ── Registration ──────────────────────────────────────────────────────────────

class TestRegister:
    def test_happy_path_returns_201(self, auth_client):
        r = _register(auth_client)
        assert r.status_code == 201

    def test_response_contains_id_email_role(self, auth_client):
        data = _register(auth_client).json()
        assert "id" in data
        assert data["email"] == "coord@example.com"
        assert data["role"] == "coordinator"

    def test_response_does_not_expose_hashed_password(self, auth_client):
        data = _register(auth_client).json()
        assert "hashed_password" not in data
        assert "password" not in data

    def test_duplicate_email_returns_409(self, auth_client):
        _register(auth_client)
        r = _register(auth_client)
        assert r.status_code == 409

    def test_custom_role_stored(self, auth_client):
        data = _register(auth_client, role="manager").json()
        assert data["role"] == "manager"


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    def test_happy_path_returns_200_with_token(self, auth_client):
        _register(auth_client)
        r = _login(auth_client)
        assert r.status_code == 200
        assert "access_token" in r.json()

    def test_token_type_is_bearer(self, auth_client):
        _register(auth_client)
        data = _login(auth_client).json()
        assert data["token_type"] == "bearer"

    def test_wrong_password_returns_401(self, auth_client):
        _register(auth_client)
        r = _login(auth_client, password="WrongPass!")
        assert r.status_code == 401

    def test_nonexistent_email_returns_401(self, auth_client):
        r = _login(auth_client, email="nobody@example.com")
        assert r.status_code == 401

    def test_wrong_password_and_missing_email_same_message(self, auth_client):
        """Prevents user enumeration — both cases must return the same error text."""
        _register(auth_client)
        wrong_pass = _login(auth_client, password="WrongPass!").json()["detail"]
        no_user = _login(auth_client, email="nobody@example.com").json()["detail"]
        assert wrong_pass == no_user

    def test_token_contains_valid_jwt_claims(self, auth_client):
        _register(auth_client)
        token = _login(auth_client).json()["access_token"]
        from backend.core.security import decode_access_token
        payload = decode_access_token(token)
        assert "sub" in payload
        assert payload["role"] == "coordinator"
        assert "exp" in payload


# ── GET /me ───────────────────────────────────────────────────────────────────

class TestGetMe:
    def test_returns_user_data_with_valid_token(self, auth_client):
        _register(auth_client)
        token = _login(auth_client).json()["access_token"]
        r = auth_client.get(f"{_BASE}/me", headers=_bearer(token))
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "coord@example.com"
        assert data["role"] == "coordinator"

    def test_no_token_returns_401(self, auth_client):
        r = auth_client.get(f"{_BASE}/me")
        assert r.status_code == 401

    def test_invalid_token_returns_401(self, auth_client):
        r = auth_client.get(f"{_BASE}/me", headers=_bearer("not.a.token"))
        assert r.status_code == 401

    def test_tampered_token_returns_401(self, auth_client):
        _register(auth_client)
        token = _login(auth_client).json()["access_token"]
        # Flip the last character of the signature
        tampered = token[:-1] + ("X" if token[-1] != "X" else "Y")
        r = auth_client.get(f"{_BASE}/me", headers=_bearer(tampered))
        assert r.status_code == 401

    def test_expired_token_returns_401(self, auth_client):
        expired_token = create_access_token(
            "some-user-id", "coordinator", expires_delta=timedelta(seconds=-1)
        )
        r = auth_client.get(f"{_BASE}/me", headers=_bearer(expired_token))
        assert r.status_code == 401

    def test_token_for_deleted_user_returns_401(self, auth_client):
        """Token with a valid signature but non-existent sub → 401."""
        orphan_token = create_access_token("00000000-dead-dead-dead-000000000000", "coordinator")
        r = auth_client.get(f"{_BASE}/me", headers=_bearer(orphan_token))
        assert r.status_code == 401


# ── Endpoint protection ───────────────────────────────────────────────────────

class TestEndpointProtection:
    def test_reports_list_requires_auth(self, auth_client):
        r = auth_client.get(_REPORTS)
        assert r.status_code == 401

    def test_create_report_requires_auth(self, auth_client):
        r = auth_client.post(_REPORTS, json={})
        assert r.status_code == 401

    def test_images_analyze_requires_auth(self, auth_client):
        r = auth_client.post(_IMAGES_ANALYZE, data={"image_id": "x"})
        assert r.status_code == 401

    def test_authenticated_request_reaches_handler(self, auth_client):
        """A valid token should get past auth and reach the report handler (empty list)."""
        _register(auth_client)
        token = _login(auth_client).json()["access_token"]
        r = auth_client.get(_REPORTS, headers=_bearer(token))
        assert r.status_code == 200
        assert r.json() == []
