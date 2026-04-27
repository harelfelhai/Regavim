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

## 11. Stage 4 — Plan

### Goal
Implement a robust image upload pipeline: multipart upload → size/format validation → EXIF extraction → storage → DB record creation. All image processing must be non-blocking and the storage layer must be swappable without touching the endpoint.

### New / Changed Files

| File | Change | Reason |
|---|---|---|
| `backend/core/config.py` | Add `UPLOAD_DIR: str = "uploads"` | Configurable storage root |
| `backend/models/image.py` | Add `has_exif: Mapped[bool]` | Flag for legal metadata presence |
| `backend/schemas/image.py` | Add `has_exif: bool` to `ImageRead` | Expose flag to clients |
| `backend/services/image_service.py` | Enhance `extract_exif()` to include GPS sub-IFD; add `exif_has_legal_metadata()` | Structured EXIF access; `has_exif` determination |
| `backend/services/storage.py` | **New** — `StorageProvider` ABC + `LocalStorageProvider` | Loose coupling for S3 swap |
| `backend/api/v1/images.py` | Implement `POST /api/v1/images/upload`; add `get_storage()` dependency | Core feature |
| `backend/requirements.txt` | Add `piexif>=1.1.3` | Create EXIF-bearing test images |
| `tests/test_images.py` | **New** — full upload test suite | Compliance protocol |
| `.gitignore` | Add `uploads/` | Don't commit uploaded files |

### Storage Abstraction Design

```
StorageProvider (ABC)
├── save(filename: str, data: bytes) -> str   # returns the stored path / URL
└── delete(path: str) -> None

LocalStorageProvider(StorageProvider)
└── saves to UPLOAD_DIR/{uuid}.{ext}

# Future — no API change required:
S3StorageProvider(StorageProvider)
└── uploads to s3://bucket/{uuid}.{ext}, returns pre-signed URL
```

The endpoint depends on `StorageProvider` via FastAPI's `Depends(get_storage)`. Tests override `get_storage` with a temp-dir-backed provider — no mocking required.

### `has_exif` Logic
Set to `True` only when at least one of these is present in the EXIF:
- **GPS sub-IFD** (tag 34853) contains at least one entry, OR
- **DateTimeOriginal** (tag 36867) is present in the Exif sub-IFD (tag 34665)

Device Make / Model alone do **not** set `has_exif = True`.

### Upload Endpoint Contract

```
POST /api/v1/images/upload
Content-Type: multipart/form-data

Fields:
  report_id  (str, required) — existing report to link to
  file       (UploadFile, required) — image file

Responses:
  201  ImageRead   — success
  404              — report_id not found
  413              — file exceeds 10 MB limit
  422              — unsupported or corrupt format
```

### Stage 4 Anomaly Focus (per protocol)
| Anomaly | Expected Behaviour |
|---|---|
| JPEG with full GPS + timestamp EXIF | `has_exif = True`; upload succeeds |
| JPEG/PNG with no EXIF | `has_exif = False`; upload still succeeds |
| JPEG with Make/Model only (no GPS or timestamp) | `has_exif = False` |
| Corrupt bytes (random data) | 422 Unprocessable Entity |
| File > 10 MB | 413 Payload Too Large |
| Path traversal in filename (`../../etc/passwd.jpg`) | 201; stored path contains no `..` |
| 5 concurrent uploads to same report | All 201; all unique IDs |

---

## 8. Project Status

| # | Stage | Status |
|---|---|---|
| 1 | Project scoping & memory file | **Done** |
| 2 | Backend scaffolding (FastAPI skeleton, DB setup) | **Done** |
| 3 | ORM models + Pydantic schemas | **Done** (completed as part of Stage 2) |
| 4 | Image upload endpoint + EXIF handling | **Done** |
| 5 | Claude AI integration service | **Done** |
| 6 | Full report CRUD API | **Done** |
| 7 | Auth (JWT) | Pending |
| 8 | Frontend scaffolding (React PWA) | Pending |
| 9 | Report submission flow (UI) | Pending |
| 10 | Map location picker (UI) | Pending |
| 11 | Manager dashboard (UI) | Pending |
| 12 | End-to-end testing & deployment config | Pending |

---

## 12. Stage 4 — Completion Summary

### What Was Built

| File | Change |
|---|---|
| `backend/core/config.py` | Added `UPLOAD_DIR: str = "uploads"` |
| `backend/models/image.py` | Added `has_exif: Mapped[bool]` |
| `backend/schemas/image.py` | Added `has_exif: bool` to `ImageRead` |
| `backend/services/image_service.py` | Enhanced `extract_exif()` with GPS sub-IFD; added `exif_has_legal_metadata()` |
| `backend/services/storage.py` | **New** — `StorageProvider` ABC + `LocalStorageProvider` |
| `backend/api/v1/images.py` | Implemented `POST /api/v1/images/upload` + `GET /api/v1/images/{id}` |
| `tests/conftest.py` | Switched from `StaticPool` (in-memory) to file-based SQLite + `QueuePool` for thread-safety |
| `tests/test_images.py` | **New** — 35 tests across 6 classes |
| `backend/requirements.txt` | Added `piexif>=1.1.3` |
| `.gitignore` | Added `uploads/` |

### Test Results — 106 / 106 PASSED (35 new)

| Test Class | Count | Result |
|---|---|---|
| `TestUploadHappyPath` | 8 | PASS |
| `TestNoExifCases` | 5 | PASS |
| `TestAnomalies` | 9 | PASS |
| `TestConcurrency` | 2 | PASS |
| `TestExifHasLegalMetadata` | 7 | PASS |
| `TestExtractExifEnriched` | 4 | PASS |
| All Stage 2 tests | 71 | PASS (no regressions) |

### Anomalies Discovered & Handled

| Anomaly | Finding | Resolution |
|---|---|---|
| StaticPool + threading | `StaticPool` shares one connection across all threads, causing `InvalidRequestError` on concurrent `db.refresh()` | Switched test engine to file-based SQLite + `QueuePool`; each thread gets its own connection; SQLite serialises writes internally |
| `has_exif` for Make/Model only | Images with device metadata but no GPS or timestamp were initially ambiguous | Documented and tested: Make/Model alone sets `has_exif = False`; only GPS sub-IFD entries or `DateTimeOriginal` qualify |
| Path traversal filename | `../../etc/passwd.jpg` as filename must not escape the upload dir | `Path(filename).name` strips all directory components before storing; on-disk path uses UUID only |
| Deprecated FastAPI status constants | `HTTP_413_REQUEST_ENTITY_TOO_LARGE` and `HTTP_422_UNPROCESSABLE_ENTITY` produce `DeprecationWarning` in FastAPI 0.111+ | Replaced with bare integer literals `413` and `422` |
| Empty file upload | 0-byte file passes size check (correctly) but fails format validation | Returns 422 — correct behaviour; format check acts as the second gate |
| GPS sub-IFD Pillow access | `img.getexif().items()` does not include GPS entries in main dict; requires `exif.get_ifd(34853)` | Explicitly call `get_ifd()` for GPS and Exif sub-IFDs; stored under `gps_ifd` key in the JSON blob |

### Technical Debt / Deferred Items
- `POST /api/v1/images/analyze` is still a stub — Claude AI call implemented in Stage 5.
- File deletion (`StorageProvider.delete()`) is implemented but never called — wire up to report delete in Stage 6.
- `UPLOAD_DIR` is relative; should be resolved to an absolute path at startup.
- No auth guard on the upload endpoint — add in Stage 7.

---

## 13. Stage 5 — Plan

### Goal
Wire the Claude vision API into the upload pipeline. AI provides a *suggestion* (`ai_category`). A human later confirms via `PATCH /api/v1/reports/{id}` (`final_category`). The two fields are always independent — the AI never sets `final_category`.

### New / Changed Files

| File | Change |
|---|---|
| `backend/services/ai_service.py` | **New** — `analyze_image_with_claude()`, `_parse_category()`, `_get_client()` |
| `backend/schemas/image.py` | Add `AnalysisResult` response schema |
| `backend/api/v1/images.py` | Implement `POST /api/v1/images/analyze` |
| `tests/test_ai_service.py` | **New** — unit tests (all API calls mocked) |
| `tests/test_images.py` | Add `TestAnalyzeEndpoint` class |

### Suggested vs. Confirmed Logic

```
Upload image  →  POST /api/v1/images/upload     →  Image.has_exif set
                                                    report.ai_category = None (not yet)

Analyze       →  POST /api/v1/images/analyze    →  report.ai_category = "ILLEGAL_CONSTRUCTION"
                                                    report.final_category = None  ← never touched here

Human review  →  PATCH /api/v1/reports/{id}     →  report.final_category = "ILLEGAL_CONSTRUCTION"
                  { "final_category": "..." }       report.status = "approved"
```

### AI Service Design

```python
analyze_image_with_claude(image_bytes, media_type) -> str | None
  │
  ├─ Guard: media_type not in CLAUDE_SUPPORTED → return None (TIFF not supported)
  ├─ base64-encode → messages.create(model, max_tokens=32, system_prompt, image)
  ├─ parse raw text → _parse_category() → ViolationCategory enum validation
  ├─ APITimeoutError  → return None  (logged, not raised)
  └─ any Exception   → return None  (degrade gracefully)

_parse_category(raw) -> str | None
  ├─ strip + uppercase + normalise separators
  ├─ ViolationCategory(cleaned)  → return canonical value
  └─ ValueError                  → return None
```

### Prompt Design
The system prompt constrains Claude to a single-line response containing only a category name. `max_tokens=32` prevents verbose output and reduces cost. The prompt lists all 7 categories explicitly so Claude has no ambiguity about the output space.

### Claude-Supported Media Types
Claude vision API accepts: `image/jpeg`, `image/png`, `image/gif`, `image/webp`.
TIFF is **not** supported. TIFF uploads succeed (legally valid evidence format) but `analyze_image_with_claude()` returns `None` for them — the frontend should show "Manual classification required" in this case.

### Stage 5 Anomaly Focus

| Anomaly | Expected Behaviour |
|---|---|
| API timeout (`APITimeoutError`) | Returns `None`; endpoint returns 200 with `analysis_available: false`; `ai_category` unchanged |
| Invalid category in response | `_parse_category()` returns `None`; same degraded-but-successful response |
| Verbose/explanatory AI response | `_parse_category()` normalises and validates; garbage text returns `None` |
| `ai_category` set, `final_category` absent | Verified in test — AI suggestion never populates `final_category` |
| TIFF image (unsupported by Claude) | `analyze_image_with_claude()` returns `None` before calling API |
| Empty API response content list | Returns `None` without crash |
| All 7 categories round-trip | Each category returned by mock is parsed and stored correctly |

---

## 14. Stage 5 — Completion Summary

### What Was Built

| File | Change |
|---|---|
| `backend/services/ai_service.py` | **New** — `analyze_image_with_claude()`, `_parse_category()`, `_get_client()`; `_MODEL = "claude-sonnet-4-6"`; TIFF guard; graceful degradation on all error paths |
| `backend/schemas/image.py` | Added `AnalysisResult` schema — `image_id`, `report_id`, `ai_category`, `analysis_available` |
| `backend/api/v1/images.py` | Implemented `POST /api/v1/images/analyze` — reads stored file, calls AI, updates `report.ai_category`, returns `AnalysisResult` |
| `tests/test_ai_service.py` | **New** — 26 unit tests across `TestParseCategory` (14) and `TestAnalyzeImageWithClaude` (12); all API calls mocked |
| `tests/test_images.py` | Added `TestAnalyzeEndpoint` (7 tests) — integration tests for the `/analyze` endpoint |

### Test Results — 139 / 139 PASSED (33 new)

| Test Class | Count | Result |
|---|---|---|
| `TestParseCategory` | 14 | PASS |
| `TestAnalyzeImageWithClaude` | 12 | PASS |
| `TestAnalyzeEndpoint` | 7 | PASS |
| All Stage 4 tests | 35 | PASS (no regressions) |
| All Stage 2 tests | 71 | PASS (no regressions) |

### Anomalies Discovered & Handled

| Anomaly | Finding | Resolution |
|---|---|---|
| API timeout under field conditions | `anthropic.APITimeoutError` is a distinct exception from `Exception` | Caught separately; returns `None`; test constructs it with `httpx.Request` object |
| TIFF unsupported by Claude vision | TIFF is valid evidence but cannot be sent to Claude API | Guard at top of `analyze_image_with_claude()`; returns `None` before any API call; test confirms `_get_client` never called |
| Invalid / verbose AI responses | Claude may occasionally return an explanation instead of a category | `_parse_category()` normalises and validates; any non-enum text returns `None` |
| Suggested ≠ Confirmed | AI must never set `final_category` | `/analyze` only writes to `report.ai_category`; `final_category` stays `None`; explicitly tested |
| Empty content list from API | `message.content` could be `[]` | Safe guard: `message.content[0].text if message.content else ""`; returns `None` via `_parse_category("")` |
| `max_tokens` budget | Verbose responses waste cost and complicate parsing | Capped at `max_tokens=32`; test asserts `<= 64` to allow minor future tuning |

### Technical Debt / Deferred Items
- No real Anthropic API key used in tests (all mocked) — integration smoke test against live API deferred to deployment.
- `PATCH /api/v1/reports/{id}` still a stub — `final_category` confirmation wired up in Stage 6.
- File deletion on report delete not yet connected — Stage 6.
- No auth guard on `/analyze` — Stage 7.

---

## 15. Stage 6 — Plan

### Goal
Complete the report management lifecycle: implement PATCH (confirmation + override), DELETE (soft-delete), and an enhanced GET / with a multi-parameter filtering engine. Keep filtering logic in a dedicated service so the router stays thin.

### New / Changed Files

| File | Change |
|---|---|
| `backend/core/constants.py` | Add `CONFIRMED = "confirmed"` to `ReportStatus` |
| `backend/services/report_service.py` | **New** — `apply_report_filters()` query builder |
| `backend/schemas/report.py` | Add `ConfigDict(extra="forbid")` to `ReportUpdate` |
| `backend/api/v1/reports.py` | Implement PATCH, DELETE; add filter query params to GET / |
| `tests/test_report_management.py` | **New** — Stage 6 test suite |

### Report Lifecycle State Machine

```
pending ──(set final_category)──► confirmed ──(manager approval, Stage 7)──► approved
   │                                  │
   └─────────────────────────────────►└──────(soft-delete / reject)──────────► rejected
```

Auto-confirmation rule: when PATCH sets a non-null `final_category` AND no explicit `status` is provided AND current status is `pending`, the backend automatically advances status to `confirmed`.

### PATCH Contract

```
PATCH /api/v1/reports/{id}
Content-Type: application/json

Allowed fields:   status, final_category, description, land_context
Read-only fields: ai_category, user_id, user_lat, user_lng, target_lat, target_lng,
                  created_at, exif_data, image IDs
→ Sending read-only fields returns 422 (ReportUpdate uses ConfigDict(extra="forbid"))

Responses:
  200  ReportRead   — success
  404              — report_id not found
  422              — unknown field in payload, or invalid enum value
```

### DELETE Contract (Soft-delete)

```
DELETE /api/v1/reports/{id}

Sets report.status = "rejected". Row is never physically deleted.
Responses:
  204  — success (no body)
  404  — report_id not found
```

### GET / Filtering Parameters

| Parameter | Type | Matches |
|---|---|---|
| `status` | `ReportStatus` enum | Exact status match |
| `category` | `ViolationCategory` enum | `ai_category` OR `final_category` |
| `date_from` | `datetime` (ISO 8601) | `created_at >= date_from` |
| `date_to` | `datetime` (ISO 8601) | `created_at <= date_to` |
| `reporter_id` | `str` | `user_id` exact match |

Invalid enum values for `status` / `category` → 422. All parameters optional.

### Stage 6 Anomaly Focus

| Anomaly | Expected Behaviour |
|---|---|
| PATCH sets `ai_category` in body | 422 — field forbidden by `extra="forbid"` |
| PATCH with `final_category` when status is not `pending` | No auto-confirm — current status preserved |
| PATCH sets `final_category=null` | Clears category; no auto-confirm |
| DELETE already-rejected report | 204 — idempotent status set |
| Filter date range with no results | 200 with empty list |
| Filter by unknown category string | 422 |

---

## 16. Stage 6 — Completion Summary

### What Was Built

| File | Change |
|---|---|
| `backend/core/constants.py` | Added `CONFIRMED = "confirmed"` to `ReportStatus` |
| `backend/services/report_service.py` | **New** — `apply_report_filters()`: chains status, category, date range, reporter_id filters onto a SQLAlchemy query |
| `backend/schemas/report.py` | Added `ConfigDict(extra="forbid")` to `ReportUpdate` — unknown fields return 422 |
| `backend/api/v1/reports.py` | Implemented PATCH (auto-confirm logic), DELETE (soft-delete), GET / (5-parameter filter engine) |
| `tests/test_report_management.py` | **New** — 40 tests across TestPatchReport (17), TestDeleteReport (5), TestListReportsFiltered (18) |

### Test Results — 179 / 179 PASSED (40 new)

| Test Class | Count | Result |
|---|---|---|
| `TestPatchReport` | 17 | PASS |
| `TestDeleteReport` | 5 | PASS |
| `TestListReportsFiltered` | 18 | PASS |
| All Stage 5 tests | 33 | PASS (no regressions) |
| All Stage 4 tests | 35 | PASS (no regressions) |
| All Stage 2 tests | 71 | PASS (no regressions) |

### Anomalies Discovered & Handled

| Anomaly | Finding | Resolution |
|---|---|---|
| `+` in ISO datetime query params | `datetime.isoformat()` with timezone produces `+00:00`; bare `+` in URL query string is parsed as a space, causing 422 | All datetime query params passed via `params=` dict to httpx so `+` is URL-encoded to `%2B` automatically |
| False-positive date tests | Two tests checking `len(data) == 1` accidentally passed when a 422 error dict was returned (dicts also have length 1) | Added explicit `assert response.status_code == 200` to all date filter tests |
| Auto-confirm only on pending | If a report is already confirmed, a second `final_category` PATCH should not re-trigger any transition | Guard: `report.status == ReportStatus.PENDING.value` in auto-confirm logic |
| Soft-delete idempotency | Deleting an already-rejected report should not 404 | Set status unconditionally; 204 on every call as long as the report exists |

### Technical Debt / Deferred Items
- `category` filter matches on plain-string comparison; if `ViolationCategory` enum grows, the stored strings and enum must stay in sync (no separate FK table).
- No pagination on `GET /api/v1/reports/` — add `limit` / `offset` or cursor in Stage 8+ when the frontend needs it.
- Soft-delete: `file_path` is retained on disk. Wire `StorageProvider.delete()` when physical cleanup is needed.
- No auth guard on PATCH / DELETE — Stage 7.

---

## 9. Open Questions / Decisions Deferred

- **Image storage**: Local filesystem (simple) vs. object storage like S3 (scalable). Decision deferred until deployment planning.
- **Maps library**: Leaflet.js (open source, lighter) vs. Mapbox GL JS (better visuals, API key required). To decide in frontend stage.
- **Auth scope**: Is self-registration allowed, or is user creation admin-only? To clarify with stakeholder.
- **Offline support depth**: Read-only offline (cache dashboard) or full offline report drafting with sync? PWA complexity depends on this.
