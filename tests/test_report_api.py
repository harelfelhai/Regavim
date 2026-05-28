"""
Integration tests for the Report API endpoints.

Uses the shared in-memory SQLite DB from conftest.
Each test starts with a clean table via the autouse clear_tables fixture.
"""

_VALID_PAYLOAD = {
    "description": "Unauthorized road paving",
    "user_lat": 31.5,
    "user_lng": 34.9,
    "target_lat": 31.6,
    "target_lng": 35.0,
    "land_context": "State land",
}


class TestCreateReport:
    def test_happy_path_returns_201(self, client):
        response = client.post("/api/v1/reports/", json=_VALID_PAYLOAD)
        assert response.status_code == 201

    def test_response_has_expected_fields(self, client):
        data = client.post("/api/v1/reports/", json=_VALID_PAYLOAD).json()
        assert data["status"] == "pending"
        assert data["ai_category"] is None
        assert data["final_category"] is None
        assert data["user_lat"] == 31.5
        assert data["target_lat"] == 31.6
        assert data["land_context"] == "State land"
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data

    def test_minimal_empty_payload_accepted(self, client):
        response = client.post("/api/v1/reports/", json={})
        assert response.status_code == 201
        data = response.json()
        assert data["user_lat"] is None
        assert data["description"] is None

    def test_invalid_gps_returns_422(self, client):
        response = client.post("/api/v1/reports/", json={"user_lat": 999.0})
        assert response.status_code == 422

    def test_invalid_longitude_returns_422(self, client):
        response = client.post("/api/v1/reports/", json={"user_lng": -999.0})
        assert response.status_code == 422

    def test_extreme_valid_gps_boundary_accepted(self, client):
        response = client.post(
            "/api/v1/reports/",
            json={"user_lat": -90.0, "user_lng": 180.0, "target_lat": 90.0, "target_lng": -180.0},
        )
        assert response.status_code == 201

    def test_sql_injection_in_description_stored_safely(self, client):
        """SQLAlchemy parameterized queries prevent execution; payload is stored as-is."""
        injection = "'; DROP TABLE reports; --"
        data = client.post("/api/v1/reports/", json={"description": injection}).json()
        assert data["description"] == injection

    def test_xss_payload_stored_as_plain_string(self, client):
        """FastAPI does not HTML-escape strings — the API is JSON-only, not HTML."""
        xss = "<script>alert('xss')</script>"
        data = client.post("/api/v1/reports/", json={"description": xss}).json()
        assert data["description"] == xss

    def test_multiple_reports_get_unique_ids(self, client):
        id1 = client.post("/api/v1/reports/", json={}).json()["id"]
        id2 = client.post("/api/v1/reports/", json={}).json()["id"]
        assert id1 != id2


class TestListReports:
    def test_empty_db_returns_empty_list(self, client):
        response = client.get("/api/v1/reports/")
        assert response.status_code == 200
        assert response.json() == []

    def test_returns_created_reports(self, client):
        client.post("/api/v1/reports/", json=_VALID_PAYLOAD)
        client.post("/api/v1/reports/", json=_VALID_PAYLOAD)
        response = client.get("/api/v1/reports/")
        assert response.status_code == 200
        assert len(response.json()) == 2


class TestGetReport:
    def test_returns_report_by_id(self, client):
        created = client.post("/api/v1/reports/", json=_VALID_PAYLOAD).json()
        response = client.get(f"/api/v1/reports/{created['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == created["id"]

    def test_nonexistent_id_returns_404(self, client):
        response = client.get("/api/v1/reports/does-not-exist")
        assert response.status_code == 404

    def test_malformed_id_returns_404(self, client):
        response = client.get("/api/v1/reports/../../etc/passwd")
        assert response.status_code == 404


class TestDraftReports:
    def test_create_with_draft_flag_sets_draft_status(self, client):
        data = client.post("/api/v1/reports/?draft=true", json=_VALID_PAYLOAD).json()
        assert data["status"] == "draft"

    def test_create_without_draft_flag_stays_pending(self, client):
        data = client.post("/api/v1/reports/", json=_VALID_PAYLOAD).json()
        assert data["status"] == "pending"

    def test_drafts_excluded_from_default_list(self, client):
        client.post("/api/v1/reports/?draft=true", json=_VALID_PAYLOAD)
        client.post("/api/v1/reports/", json=_VALID_PAYLOAD)  # visible
        data = client.get("/api/v1/reports/").json()
        assert len(data) == 1
        assert data[0]["status"] == "pending"

    def test_drafts_visible_with_explicit_status_filter(self, client):
        client.post("/api/v1/reports/?draft=true", json=_VALID_PAYLOAD)
        data = client.get("/api/v1/reports/?status=draft").json()
        assert len(data) == 1
        assert data[0]["status"] == "draft"

    def test_force_delete_draft_hard_deletes(self, client):
        created = client.post("/api/v1/reports/?draft=true", json=_VALID_PAYLOAD).json()
        response = client.delete(f"/api/v1/reports/{created['id']}?force=true")
        assert response.status_code == 204
        assert client.get(f"/api/v1/reports/{created['id']}").status_code == 404

    def test_force_delete_non_draft_rejected(self, client):
        created = client.post("/api/v1/reports/", json=_VALID_PAYLOAD).json()
        response = client.delete(f"/api/v1/reports/{created['id']}?force=true")
        assert response.status_code == 409
        # Row is untouched — still retrievable and still pending.
        assert client.get(f"/api/v1/reports/{created['id']}").json()["status"] == "pending"


class TestReportImageIds:
    def test_new_report_has_empty_image_ids(self, client):
        data = client.post("/api/v1/reports/", json={}).json()
        assert "image_ids" in data
        assert data["image_ids"] == []

    def test_list_endpoint_includes_image_ids_field(self, client):
        client.post("/api/v1/reports/", json={})
        reports = client.get("/api/v1/reports/").json()
        assert len(reports) == 1
        assert "image_ids" in reports[0]
        assert reports[0]["image_ids"] == []
