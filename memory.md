# Project Memory — Regavim Land-Use Monitor

> This file is the single source of truth for project state, decisions, and next steps.
> Update it at the end of every significant development session.

---

## 1. Project Overview

An NGO field-reporting tool that lets coordinators document illegal construction or land misuse in the field.

### Core User Flow
1. Coordinator opens the PWA on a mobile device.
2. Uploads (or captures) a photo of the violation.
3. AI (Claude API) analyzes the image and suggests a violation category.
4. Coordinator reviews the AI suggestion and approves or overrides it (human-in-the-loop).
5. Coordinator pins the **target location** on a map (distinct from their own GPS position).
6. Report is saved to the central database.
7. Manager reviews submissions via a map-based dashboard with filtering.

---

## 2. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React (PWA) | Mobile-first; offline-capable via service worker |
| Backend | Python + FastAPI | Async, RESTful API |
| ORM | SQLAlchemy | Declarative models; DB-agnostic |
| DB (dev) | SQLite | Zero-config local development |
| DB (prod) | PostgreSQL | Target production database |
| AI | Anthropic Claude API | Image analysis + category suggestion |
| Maps | TBD (Leaflet.js or Mapbox GL JS) | To be decided in frontend planning step |
| Auth | TBD | To be decided; JWT is the likely approach |

---

## 3. Architectural Decisions

### Backend — Separation of Concerns
```
backend/
├── api/          # FastAPI routers (HTTP boundary only — no business logic here)
├── services/     # Business logic (image handling, AI calls, report processing)
├── models/       # SQLAlchemy ORM models
├── schemas/      # Pydantic request/response schemas
├── db/           # Database session factory and migrations
└── core/         # Config, settings, constants
```

### Frontend — Feature-Based Modules
```
frontend/
├── public/            # Static assets, manifest.json, service worker
├── src/
│   ├── features/
│   │   ├── report/    # Upload, AI suggestion review, location picker
│   │   └── dashboard/ # Manager map view and filters
│   ├── components/    # Shared UI components
│   ├── hooks/         # Shared custom React hooks
│   ├── api/           # API client (axios/fetch wrappers)
│   └── utils/         # Helpers (EXIF parsing, coordinate formatting, etc.)
```

### Full Repository Layout (Proposed)
```
Regavim/
├── backend/
│   ├── api/
│   │   └── v1/
│   │       ├── reports.py
│   │       ├── images.py
│   │       └── auth.py
│   ├── services/
│   │   ├── ai_service.py       # Claude API integration
│   │   ├── image_service.py    # EXIF preservation, storage
│   │   └── report_service.py   # Report CRUD logic
│   ├── models/
│   │   ├── report.py
│   │   ├── image.py
│   │   └── user.py
│   ├── schemas/
│   │   ├── report.py
│   │   └── image.py
│   ├── db/
│   │   ├── session.py          # Engine + SessionLocal factory
│   │   └── base.py             # Declarative base
│   ├── core/
│   │   ├── config.py           # Pydantic Settings (reads .env)
│   │   └── constants.py        # Violation categories enum
│   ├── main.py                 # FastAPI app entry point
│   └── requirements.txt
├── frontend/
│   ├── public/
│   └── src/
│       ├── features/
│       │   ├── report/
│       │   └── dashboard/
│       ├── components/
│       ├── hooks/
│       ├── api/
│       └── utils/
├── memory.md                   # ← this file
├── .env.example
└── README.md
```

---

## 4. Data Schema (Draft)

### Report
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `created_at` | DateTime | UTC, auto-set |
| `updated_at` | DateTime | UTC, auto-updated on every change — tracks approval progress |
| `status` | Enum | `pending`, `approved`, `rejected` |
| `ai_category` | String | Claude's raw suggestion |
| `final_category` | String | Human-approved category (may differ) |
| `description` | Text | Optional coordinator notes |
| `land_context` | String | Legal land status (State land, private, etc.) — populated by GIS layer intersection |
| `user_id` | FK → User | Who submitted |
| `user_lat` | Float | Coordinator's GPS latitude |
| `user_lng` | Float | Coordinator's GPS longitude |
| `target_lat` | Float | Map-pinned violation latitude |
| `target_lng` | Float | Map-pinned violation longitude |

### Image
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `report_id` | FK → Report | Owning report |
| `file_path` | String | Server-side storage path |
| `original_filename` | String | Preserved for audit trail |
| `exif_data` | JSON | Full EXIF blob — critical for legal use |
| `uploaded_at` | DateTime | UTC, auto-set |

### User (minimal, to be expanded with Auth)
| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `email` | String | Unique |
| `role` | Enum | `coordinator`, `manager`, `admin` |
| `hashed_password` | String | bcrypt |

### Violation Category Enum (predefined schema for AI)
```
- ILLEGAL_CONSTRUCTION
- LAND_GRADING
- AGRICULTURAL_ENCROACHMENT
- ROAD_PAVING
- DEMOLITION
- ILLEGAL_DUMPING
- OTHER
```

---

## 5. Mandatory Testing Protocol

> Applies to every stage from Stage 2 onwards. No stage is considered complete without passing tests.

### Pre-Commit Checklist
1. **Happy path** — valid, typical inputs must produce correct outputs.
2. **Edge cases** — missing GPS, empty strings, boundary values (lat ±90, lng ±180), None fields.
3. **Security** — string inputs containing SQL injection and XSS payloads must be stored/returned safely (not executed).
4. **Anomaly cases** (as specified per stage) — documented below.

### Test Framework
- **Tool**: `pytest` with `httpx` for the FastAPI `TestClient`.
- **DB**: In-memory SQLite with `StaticPool` — fully isolated, no file artifacts.
- **Location**: `tests/` at repo root, one file per concern.
- **Command**: `pytest tests/ -v` from repo root.

### Stage-Specific Anomaly Focus

| Stage | Anomaly Focus |
|---|---|
| 2 (current) | Invalid/extreme GPS coords; missing EXIF metadata; large or corrupt image files |
| 4 | Corrupt upload stream; duplicate filename; EXIF stripping prevention |
| 5 | Claude API timeout; ambiguous image content; empty AI response |
| 6 | Concurrent status updates; cascade delete of images |

### Stage Summary Format
Each completed stage must append a section to this file containing:
- What was built (files created/changed).
- Tests run and Pass/Fail result per test class.
- Anomalies discovered and how they were handled.
- Technical debt or deferred items.

---

## 6. Key Design Constraints

- **EXIF preservation**: Images must never be re-encoded or stripped of metadata. Store originals as-is; serve them directly.
- **Dual-location model**: Always store both `user_lat/lng` (device GPS) and `target_lat/lng` (map pin) — they are semantically different and both matter legally.
- **Human-in-the-loop AI**: The AI suggestion is non-binding. The UI must make it easy to accept or override. The `final_category` field is always set by the human.
- **DB flexibility**: All DB access goes through SQLAlchemy. No raw SQL. The same model code must work with SQLite (dev) and PostgreSQL (prod), switched via an env variable.
- **PWA / mobile-first**: The frontend must be installable and work on low-bandwidth connections. Images should be compressed for upload (but the server stores the original).

---

## 7. API Endpoints (Planned)

```
POST   /api/v1/reports/              Create a new report (with image upload)
GET    /api/v1/reports/              List reports (manager dashboard, with filters)
GET    /api/v1/reports/{id}          Get single report detail
PATCH  /api/v1/reports/{id}          Update status / final category (approval flow)
DELETE /api/v1/reports/{id}          Soft-delete a report

POST   /api/v1/images/analyze        Submit image to Claude, get category suggestion back
GET    /api/v1/images/{id}           Retrieve original image (EXIF intact)

POST   /api/v1/auth/login            Obtain JWT
POST   /api/v1/auth/refresh          Refresh JWT
GET    /api/v1/auth/me               Current user info
```

---

## 10. Stage 2 — Completion Summary

### What Was Built
| File | Purpose |
|---|---|
| `backend/core/config.py` | Pydantic `Settings` reading `.env`; `DATABASE_URL`, `ANTHROPIC_API_KEY`, `SECRET_KEY` |
| `backend/core/constants.py` | `ViolationCategory`, `ReportStatus`, `UserRole` enums |
| `backend/db/base.py` | SQLAlchemy `DeclarativeBase` |
| `backend/db/session.py` | Engine, `SessionLocal`, `get_db()` FastAPI dependency |
| `backend/models/user.py` | `User` ORM model |
| `backend/models/report.py` | `Report` ORM model — all 13 fields incl. `updated_at`, `land_context` |
| `backend/models/image.py` | `Image` ORM model — EXIF stored as JSON blob |
| `backend/schemas/report.py` | `ReportCreate` / `ReportUpdate` / `ReportRead` — with GPS validators |
| `backend/schemas/image.py` | `ImageRead` |
| `backend/api/v1/reports.py` | `POST /`, `GET /`, `GET /{id}` implemented; PATCH/DELETE stubbed (Stage 6) |
| `backend/api/v1/images.py` | Route stubs (Stage 4/5) |
| `backend/api/v1/auth.py` | Route stubs (Stage 7) |
| `backend/services/image_service.py` | `extract_exif()`, `validate_image_size()`, `validate_image_format()` helpers |
| `backend/main.py` | FastAPI app, lifespan `create_all`, CORS, `/health` |
| `backend/requirements.txt` | Production dependencies |
| `requirements-dev.txt` | `pytest`, `httpx`, `pytest-cov` |
| `pytest.ini` | Test discovery config |
| `tests/conftest.py` | In-memory SQLite + `StaticPool`; `get_db` override; `clear_tables` autouse fixture |
| `tests/test_health.py` | Health endpoint |
| `tests/test_report_schema.py` | GPS validators, enum validators, optional-field defaults |
| `tests/test_report_api.py` | Report CRUD integration tests incl. security payloads |
| `tests/test_models.py` | ORM defaults, `updated_at` behaviour, UUID uniqueness |
| `tests/test_image_service.py` | EXIF extraction, size limits, format validation |

### Test Results — 71 / 71 PASSED

| Test Class | Count | Result |
|---|---|---|
| `test_health` | 2 | PASS |
| `TestExtractExif` | 7 | PASS |
| `TestValidateImageSize` | 6 | PASS |
| `TestValidateImageFormat` | 8 | PASS |
| `test_models` | 9 | PASS |
| `TestCreateReport` | 9 | PASS |
| `TestListReports` | 2 | PASS |
| `TestGetReport` | 3 | PASS |
| `TestReportCreateHappyPath` | 4 | PASS |
| `TestLatitudeValidation` | 9 | PASS |
| `TestLongitudeValidation` | 7 | PASS |
| `TestReportUpdate` | 5 | PASS |

### Anomalies Discovered & Handled

| Anomaly | Finding | Resolution |
|---|---|---|
| GPS boundary values | `±90.0` lat and `±180.0` lng must be **accepted** (they are valid poles/antimeridian) | Validators use `<=` not `<`; boundary tests confirm this |
| EXIF absent on JPEG | Most synthetic / low-quality JPEGs have no EXIF block | `extract_exif()` returns `None` without raising — callers handle gracefully |
| EXIF absent on PNG/TIFF | PNG has no EXIF standard; TIFF may or may not | Same `None`-return contract covers these cases |
| Corrupt image bytes | Random bytes fed to Pillow raise internal exceptions | Wrapped in `try/except Exception` — returns `None` for EXIF, raises `ValueError` for format check |
| Oversized upload | A single byte over the 10 MB limit must fail immediately | `validate_image_size()` checks `len(bytes)` before any I/O |
| SQL injection in description | `"'; DROP TABLE reports; --"` submitted as description | SQLAlchemy parameterized queries prevent execution; string stored verbatim — verified by test |
| XSS in string fields | `<script>alert('xss')</script>` in description | JSON API does not render HTML; payload stored and echoed as plain string — correct behaviour |
| Path traversal in report ID | `GET /api/v1/reports/../../etc/passwd` | FastAPI URL routing rejects the path before it reaches the handler; returns 404 |
| `updated_at` on fresh insert | Both `created_at` and `updated_at` set by the same lambda, so sub-millisecond difference is possible | Test allows up to 1 second delta on create; strict `>` comparison only on update |

### Technical Debt / Deferred Items
- `user_id` in `POST /api/v1/reports/` is a hardcoded placeholder UUID — replace with JWT claim in Stage 7.
- `PATCH` and `DELETE` report endpoints are stubs — implement in Stage 6 alongside filtering.
- `POST /api/v1/images/analyze` is a stub — implement EXIF extraction + Claude call in Stages 4 and 5.
- No auth guard on any endpoint yet — add in Stage 7.
- `land_context` is always stored as `None` for now — GIS intersection layer is a future integration.

---

## 8. Project Status

| # | Stage | Status |
|---|---|---|
| 1 | Project scoping & memory file | **Done** |
| 2 | Backend scaffolding (FastAPI skeleton, DB setup) | **Done** |
| 3 | ORM models + Pydantic schemas | **Done** (completed as part of Stage 2) |
| 4 | Image upload endpoint + EXIF handling | Pending |
| 5 | Claude AI integration service | Pending |
| 6 | Full report CRUD API | Pending |
| 7 | Auth (JWT) | Pending |
| 8 | Frontend scaffolding (React PWA) | Pending |
| 9 | Report submission flow (UI) | Pending |
| 10 | Map location picker (UI) | Pending |
| 11 | Manager dashboard (UI) | Pending |
| 12 | End-to-end testing & deployment config | Pending |

---

## 9. Open Questions / Decisions Deferred

- **Image storage**: Local filesystem (simple) vs. object storage like S3 (scalable). Decision deferred until deployment planning.
- **Maps library**: Leaflet.js (open source, lighter) vs. Mapbox GL JS (better visuals, API key required). To decide in frontend stage.
- **Auth scope**: Is self-registration allowed, or is user creation admin-only? To clarify with stakeholder.
- **Offline support depth**: Read-only offline (cache dashboard) or full offline report drafting with sync? PWA complexity depends on this.
