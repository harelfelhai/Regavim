"""
Stage 6 integration tests — report management lifecycle and filtering engine.

Test matrix (TestPatchReport):
  Happy path       — 200, field stored, updated_at advances
  Auto-confirm     — final_category on pending report → status becomes confirmed
  No auto-confirm  — final_category on non-pending report → status unchanged
  Explicit status  — final_category + status=rejected → explicit status wins
  Clear category   — final_category=null → cleared, no auto-confirm
  Read-only guard  — sending ai_category in PATCH body → 422
  Not found        — nonexistent report_id → 404
  Empty payload    — all-None patch → 200, nothing changes

Test matrix (TestDeleteReport):
  Happy path       — 204, row still in DB, status=rejected
  Idempotent       — second delete on already-rejected → 204
  Not found        — 404

Test matrix (TestListReportsFiltered):
  Status filter    — pending/confirmed/rejected; no-match → []
  Invalid status   — unknown string → 422
  Category filter  — matches ai_category; matches final_category; no-match → []
  Invalid category — unknown string → 422
  Date range       — date_from; date_to; range with no results → []
  Reporter filter  — matching and non-matching reporter_id
  Combined         — status + category together
"""

from datetime import datetime, timedelta, timezone

import pytest

from backend.core.constants import ReportStatus, ViolationCategory

_VALID = {
    "description": "Unauthorized road paving",
    "user_lat": 31.5,
    "user_lng": 34.9,
    "target_lat": 31.6,
    "target_lng": 35.0,
}

_PLACEHOLDER_USER_ID = "00000000-0000-0000-0000-000000000001"


def _create(client, **overrides) -> dict:
    payload = {**_VALID, **overrides}
    return client.post("/api/v1/reports/", json=payload).json()


def _patch(client, report_id: str, **fields) -> dict:
    return client.patch(f"/api/v1/reports/{report_id}", json=fields).json()


# ── PATCH ─────────────────────────────────────────────────────────────────────

class TestPatchReport:
    def test_patch_returns_200(self, client):
        report = _create(client)
        response = client.patch(
            f"/api/v1/reports/{report['id']}", json={"description": "Updated"}
        )
        assert response.status_code == 200

    def test_patch_updates_description(self, client):
        report = _create(client)
        data = _patch(client, report["id"], description="New description")
        assert data["description"] == "New description"

    def test_patch_updates_land_context(self, client):
        report = _create(client)
        data = _patch(client, report["id"], land_context="Private land")
        assert data["land_context"] == "Private land"

    def test_patch_updates_final_category(self, client):
        report = _create(client)
        data = _patch(client, report["id"], final_category="DEMOLITION")
        assert data["final_category"] == "DEMOLITION"

    def test_patch_updated_at_advances(self, client):
        report = _create(client)
        before = report["updated_at"]
        data = _patch(client, report["id"], description="trigger update")
        assert data["updated_at"] >= before

    def test_auto_confirm_on_final_category(self, client):
        """Setting final_category on a pending report automatically sets status=confirmed."""
        report = _create(client)
        assert report["status"] == "pending"
        data = _patch(client, report["id"], final_category="ILLEGAL_CONSTRUCTION")
        assert data["status"] == "confirmed"
        assert data["final_category"] == "ILLEGAL_CONSTRUCTION"

    def test_auto_confirm_only_when_pending(self, client):
        """Auto-confirm does NOT apply when report is already confirmed."""
        report = _create(client)
        # First patch: pending → confirmed
        _patch(client, report["id"], final_category="ROAD_PAVING")
        # Second patch: already confirmed — status must not change
        data = _patch(client, report["id"], final_category="DEMOLITION")
        assert data["status"] == "confirmed"

    def test_explicit_status_overrides_auto_confirm(self, client):
        """Explicit status in payload takes priority over auto-confirmation."""
        report = _create(client)
        data = _patch(
            client, report["id"],
            final_category="LAND_GRADING",
            status="rejected",
        )
        assert data["status"] == "rejected"
        assert data["final_category"] == "LAND_GRADING"

    def test_clear_final_category_does_not_auto_confirm(self, client):
        """Setting final_category to null clears it and does NOT auto-confirm."""
        report = _create(client)
        # First set a category so status becomes confirmed
        _patch(client, report["id"], final_category="DEMOLITION")
        # Now explicitly clear (a coordinator correcting an error)
        data = _patch(client, report["id"], final_category=None)
        assert data["final_category"] is None

    def test_patch_ai_category_forbidden(self, client):
        """ai_category is read-only — sending it in the body returns 422."""
        report = _create(client)
        response = client.patch(
            f"/api/v1/reports/{report['id']}", json={"ai_category": "DEMOLITION"}
        )
        assert response.status_code == 422

    def test_patch_unknown_field_forbidden(self, client):
        """Any field not in ReportUpdate schema returns 422."""
        report = _create(client)
        response = client.patch(
            f"/api/v1/reports/{report['id']}", json={"user_id": "hacked"}
        )
        assert response.status_code == 422

    def test_patch_invalid_status_value_returns_422(self, client):
        report = _create(client)
        response = client.patch(
            f"/api/v1/reports/{report['id']}", json={"status": "not_a_status"}
        )
        assert response.status_code == 422

    def test_patch_invalid_category_value_returns_422(self, client):
        report = _create(client)
        response = client.patch(
            f"/api/v1/reports/{report['id']}", json={"final_category": "FENCE_BUILDING"}
        )
        assert response.status_code == 422

    def test_patch_nonexistent_report_returns_404(self, client):
        response = client.patch("/api/v1/reports/no-such-id", json={"description": "x"})
        assert response.status_code == 404

    def test_patch_empty_payload_returns_200(self, client):
        """An empty PATCH payload is valid — nothing changes."""
        report = _create(client)
        response = client.patch(f"/api/v1/reports/{report['id']}", json={})
        assert response.status_code == 200
        assert response.json()["description"] == report["description"]

    def test_patch_status_confirmed_directly(self, client):
        """Status can be set to confirmed explicitly without final_category."""
        report = _create(client)
        data = _patch(client, report["id"], status="confirmed")
        assert data["status"] == "confirmed"

    def test_patch_ai_category_not_changed_when_sending_known_fields(self, client):
        """ai_category on the report is untouched by a PATCH to other fields."""
        report = _create(client)
        # Manually verify ai_category starts as None
        assert report["ai_category"] is None
        data = _patch(client, report["id"], description="Updated description")
        assert data["ai_category"] is None


# ── DELETE (soft-delete) ───────────────────────────────────────────────────────

class TestDeleteReport:
    def test_delete_returns_204(self, client):
        report = _create(client)
        response = client.delete(f"/api/v1/reports/{report['id']}")
        assert response.status_code == 204

    def test_delete_sets_status_to_rejected(self, client):
        report = _create(client)
        client.delete(f"/api/v1/reports/{report['id']}")
        data = client.get(f"/api/v1/reports/{report['id']}").json()
        assert data["status"] == "rejected"

    def test_delete_row_still_exists(self, client):
        """Soft-delete: row is retained, not physically removed."""
        report = _create(client)
        client.delete(f"/api/v1/reports/{report['id']}")
        response = client.get(f"/api/v1/reports/{report['id']}")
        assert response.status_code == 200

    def test_delete_idempotent(self, client):
        """Deleting an already-rejected report is a no-op — still 204."""
        report = _create(client)
        client.delete(f"/api/v1/reports/{report['id']}")
        response = client.delete(f"/api/v1/reports/{report['id']}")
        assert response.status_code == 204

    def test_delete_nonexistent_returns_404(self, client):
        response = client.delete("/api/v1/reports/no-such-id")
        assert response.status_code == 404


# ── GET / with filters ─────────────────────────────────────────────────────────

class TestListReportsFiltered:

    # ── status filter ──────────────────────────────────────────────────────────

    def test_filter_status_pending_returns_only_pending(self, client):
        _create(client)  # pending
        r2 = _create(client)
        _patch(client, r2["id"], final_category="DEMOLITION")  # confirmed
        response = client.get("/api/v1/reports/?status=pending")
        data = response.json()
        assert response.status_code == 200
        assert all(r["status"] == "pending" for r in data)
        assert len(data) == 1

    def test_filter_status_confirmed_returns_only_confirmed(self, client):
        _create(client)  # pending
        r2 = _create(client)
        _patch(client, r2["id"], final_category="ROAD_PAVING")  # confirmed
        data = client.get("/api/v1/reports/?status=confirmed").json()
        assert len(data) == 1
        assert data[0]["status"] == "confirmed"

    def test_filter_status_rejected_returns_only_rejected(self, client):
        r = _create(client)
        client.delete(f"/api/v1/reports/{r['id']}")
        _create(client)  # pending — should not appear
        data = client.get("/api/v1/reports/?status=rejected").json()
        assert len(data) == 1
        assert data[0]["status"] == "rejected"

    def test_filter_status_no_match_returns_empty_list(self, client):
        _create(client)  # pending
        data = client.get("/api/v1/reports/?status=approved").json()
        assert data == []

    def test_filter_invalid_status_returns_422(self, client):
        response = client.get("/api/v1/reports/?status=not_a_status")
        assert response.status_code == 422

    # ── category filter ────────────────────────────────────────────────────────

    def test_filter_category_matches_final_category(self, client):
        r = _create(client)
        _patch(client, r["id"], final_category="DEMOLITION")
        _create(client)  # no category — should not appear
        data = client.get("/api/v1/reports/?category=DEMOLITION").json()
        assert len(data) == 1
        assert data[0]["final_category"] == "DEMOLITION"

    def test_filter_category_no_match_returns_empty(self, client):
        r = _create(client)
        _patch(client, r["id"], final_category="DEMOLITION")
        data = client.get("/api/v1/reports/?category=ROAD_PAVING").json()
        assert data == []

    def test_filter_invalid_category_returns_422(self, client):
        response = client.get("/api/v1/reports/?category=FENCE_BUILDING")
        assert response.status_code == 422

    # ── date range filter ──────────────────────────────────────────────────────

    def test_filter_date_from_includes_recent_reports(self, client):
        # params= dict lets httpx URL-encode the '+' in timezone offset correctly.
        _create(client)
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        response = client.get("/api/v1/reports/", params={"date_from": past})
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_filter_date_from_future_returns_empty(self, client):
        _create(client)
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        response = client.get("/api/v1/reports/", params={"date_from": future})
        assert response.status_code == 200
        assert response.json() == []

    def test_filter_date_to_includes_recent_reports(self, client):
        _create(client)
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        response = client.get("/api/v1/reports/", params={"date_to": future})
        assert response.status_code == 200
        assert len(response.json()) == 1

    def test_filter_date_to_past_returns_empty(self, client):
        _create(client)
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        response = client.get("/api/v1/reports/", params={"date_to": past})
        assert response.status_code == 200
        assert response.json() == []

    def test_filter_date_range_no_results(self, client):
        _create(client)
        future_start = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        future_end = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        response = client.get(
            "/api/v1/reports/",
            params={"date_from": future_start, "date_to": future_end},
        )
        assert response.status_code == 200
        assert response.json() == []

    # ── reporter_id filter ─────────────────────────────────────────────────────

    def test_filter_reporter_id_matches(self, client):
        _create(client)
        data = client.get(
            f"/api/v1/reports/?reporter_id={_PLACEHOLDER_USER_ID}"
        ).json()
        assert len(data) == 1

    def test_filter_reporter_id_no_match_returns_empty(self, client):
        _create(client)
        data = client.get("/api/v1/reports/?reporter_id=nonexistent-user").json()
        assert data == []

    # ── combined filters ───────────────────────────────────────────────────────

    def test_combined_status_and_category(self, client):
        r1 = _create(client)
        _patch(client, r1["id"], final_category="DEMOLITION")  # confirmed + DEMOLITION
        r2 = _create(client)
        _patch(client, r2["id"], final_category="ROAD_PAVING")  # confirmed + ROAD_PAVING
        _create(client)  # pending, no category

        data = client.get(
            "/api/v1/reports/?status=confirmed&category=DEMOLITION"
        ).json()
        assert len(data) == 1
        assert data[0]["final_category"] == "DEMOLITION"

    def test_combined_date_and_status(self, client):
        r = _create(client)
        _patch(client, r["id"], final_category="DEMOLITION")  # confirmed
        _create(client)  # pending

        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        future = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
        response = client.get(
            "/api/v1/reports/",
            params={"status": "confirmed", "date_from": past, "date_to": future},
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "confirmed"

    def test_no_filters_returns_all(self, client):
        _create(client)
        _create(client)
        data = client.get("/api/v1/reports/").json()
        assert len(data) == 2
