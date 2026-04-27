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
| Frontend | React 19 (PWA) | Mobile-first; offline-capable via service worker |
| Frontend build | Vite 6 | Dev server + production bundler |
| Frontend styling | Tailwind CSS v3 | Utility-first; responsive mobile-first classes |
| Frontend state | Zustand | Lightweight global store; no boilerplate |
| Frontend HTTP | Axios | Centralized instance in `services/api.js` |
| Frontend testing | Vitest + React Testing Library | Vite-native; MSW for HTTP mocking |
| Backend | Python + FastAPI | Async, RESTful API |
| ORM | SQLAlchemy | Declarative models; DB-agnostic |
| DB (dev) | SQLite | Zero-config local development |
| DB (prod) | PostgreSQL | Target production database |
| AI | Anthropic Claude API | Image analysis + category suggestion |
| Maps | TBD (Leaflet.js or Mapbox GL JS) | To be decided in Phase C |
| Auth | TBD | JWT is the likely approach; Stage 7 |

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
| 8 | Frontend scaffolding — Phase A: Infrastructure & API Client | **Done** |
| 8B | Frontend — Phase B: Map Dashboard | **Done** |
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

## 17. Stage 3 Phase A — Plan (Frontend Infrastructure)

### Goal
Scaffold the React + Vite + Tailwind frontend, establish the folder structure and API client, and build a single `Status` component that proves the frontend can talk to the backend health-check endpoint. No forms, no map, no auth yet.

### Folder Structure
```
frontend/
├── src/
│   ├── components/         # Reusable UI components
│   │   └── Status.jsx      # Phase A: health-check indicator
│   ├── services/
│   │   └── api.js          # Centralized Axios instance
│   ├── hooks/              # Custom React hooks (Phase B+)
│   ├── store/              # Zustand stores (Phase B+)
│   ├── test/
│   │   └── setup.js        # Vitest + Testing Library bootstrap
│   ├── App.jsx
│   ├── index.css           # Tailwind directives
│   └── main.jsx
├── .env.example
├── vite.config.js          # Includes Vitest test config
├── tailwind.config.js
└── package.json
```

### API Client Design
```javascript
// src/services/api.js
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
});
```
`VITE_API_BASE_URL` is set per-environment via `.env` files. Defaults to local FastAPI dev server.

### Status Component States
| State | Trigger | Display |
|---|---|---|
| `checking` | Initial render, before fetch completes | Spinner + "Checking…" |
| `connected` | GET /health returns 2xx | Green dot + "Backend Connected" |
| `error` | Network error or non-2xx | Red dot + "Backend Offline" |

### Phase A Testing Protocol

| Test | Method | Assertion |
|---|---|---|
| Shows loading on mount | MSW handler never resolves | "Checking" text visible |
| Shows connected on 200 | MSW returns `{status:"ok"}` | "Connected" text visible |
| Shows error on network failure | MSW returns network error | "Offline" text visible |
| Shows error on 5xx | MSW returns 500 | "Offline" text visible |

---

## 18. Stage 3 Phase A — Completion Summary

### What Was Built

| File | Purpose |
|---|---|
| `frontend/` | Vite 8 + React 19 project (npm create vite --template react) |
| `frontend/src/services/api.js` | Axios instance; `baseURL` from `VITE_API_BASE_URL` env var, fallback `localhost:8000` |
| `frontend/src/components/Status.jsx` | Three-state indicator: checking / connected / error; `role="status"` + `aria-live` |
| `frontend/src/components/__tests__/Status.test.jsx` | 9 unit tests; api.js mocked with `vi.mock` |
| `frontend/src/test/setup.js` | Vitest bootstrap — imports `@testing-library/jest-dom` |
| `frontend/src/hooks/` | Placeholder directory (Phase B+) |
| `frontend/src/store/` | Placeholder directory (Phase B+) |
| `frontend/tailwind.config.js` | Tailwind v3 — content paths for `src/**/*.{js,jsx}` |
| `frontend/vite.config.js` | Added Vitest test config: globals, jsdom environment, setup files |
| `frontend/.env.example` | Documents `VITE_API_BASE_URL` |

### Test Results — 9 / 9 PASSED

| Test | Scenario | Result |
|---|---|---|
| Initial render — checking text visible | Never-resolving promise | PASS |
| Accessibility — `role=status` present | - | PASS |
| Happy path — connected text after 200 | Mock resolves `{status:"ok"}` | PASS |
| Calls GET /health on mount | Mock resolves | PASS |
| Only calls health endpoint once | Mock resolves | PASS |
| Network error → offline text | Mock rejects with Error | PASS |
| 500 server error → offline text | Mock rejects with 500 response | PASS |
| 503 server unavailable → offline text | Mock rejects with 503 response | PASS |
| Error state — connected text absent | Mock rejects | PASS |

### Key Decisions
- **Mocking strategy**: `vi.mock('../../services/api')` rather than MSW — cleaner for unit tests since axios in jsdom/node has inconsistent interceptor behaviour across environments. MSW reserved for integration tests in Phase B+.
- **Tailwind v3**: Pinned to v3 (`^3.4.x`) for stability; v4 has a different `@import` config syntax.
- **No App.css**: Vite scaffold's `App.css` replaced; all styles go through Tailwind utilities.

### Technical Debt / Deferred Items
- No PWA service worker yet — add in final deployment phase.
- `hooks/` and `store/` are empty placeholders — populated in Phase B.
- No proxy configured for dev server — developers must have the backend running on port 8000 or set `VITE_API_BASE_URL`.

---

## 19. Stage 3 Phase B — Plan (Map Dashboard)

### Verification Fixes (before new code)
| Item | Current State | Fix |
|---|---|---|
| Axios timeout | `timeout: 10_000` ✓ | Add response interceptor that marks network errors with `isNetworkError = true` |
| Tailwind color palette | Only Tailwind defaults | Add `regavim` namespace: `bg`, `surface`, `border`, `blue.*`, `navy` |

### New Packages
- `react-leaflet` + `leaflet` — map rendering
- `lucide-react` — icon set (Layers, MapPin, AlertCircle, Loader2)

### Component Architecture
```
App.jsx
└── MapDashboard.jsx     — layout shell (sidebar + map pane)
    ├── ReportSidebar.jsx — scrollable report list, status badges, pan-to button
    └── Map.jsx           — Leaflet map, layer switcher, color-coded markers
        └── MapController — internal: watches panTarget, calls map.panTo()
```

### New Files
| File | Purpose |
|---|---|
| `src/services/reports.js` | `fetchReports(filters)` → `GET /api/v1/reports/` |
| `src/hooks/useReports.js` | `{ reports, loading, error }` with cancel-on-unmount |
| `src/store/mapStore.js` | Zustand: `panTarget`, `selectedReportId`, `panTo()`, `selectReport()` |
| `src/components/Map.jsx` | `MapContainer` + layer control (OSM / Satellite) + markers |
| `src/components/ReportSidebar.jsx` | Report list, status badges, loading/error/empty states |
| `src/components/MapDashboard.jsx` | Flex layout: 288px sidebar + full-height map |

### Map Design Decisions
- **Default center**: `[31.5, 35.0]` (Israel), zoom 8
- **OSM tile**: `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`
- **Satellite tile**: Esri World Imagery (free, no API key required)
- **Markers**: `L.divIcon` with coloured circles — no default icon asset issues in Vite
- **Status colours**: pending→blue, confirmed→green, approved→emerald, rejected→gray
- **Invalid coords guard**: `target_lat != null && target_lng != null` — reports without coords appear in sidebar but not on map

### Coordinate Validity Rule
A report is *mappable* when:
```
report.target_lat != null && report.target_lng != null
```
Markers for non-mappable reports are silently skipped. The sidebar still shows them with the pan button disabled.

### Testing Protocol
| Component / Module | Tests |
|---|---|
| `services/reports.js` | Calls correct endpoint; returns data; propagates errors |
| `hooks/useReports.js` | Loading state, success with data, error state, cancel on unmount |
| `components/ReportSidebar.jsx` | Loading/error/empty states; report list; status badges; disabled button for null coords; pan callback fired |
| `components/Map.jsx` | Renders without crash on empty list; markers only for valid coords; filters null-coord reports |

react-leaflet is mocked with a `vi.mock` shim in Map tests to avoid jsdom/canvas limitations.

---

## 20. Stage 3 Phase B — Completion Summary

### What Was Built

| File | Purpose |
|---|---|
| `src/services/api.js` | Added response interceptor: marks network errors with `isNetworkError = true` |
| `tailwind.config.js` | Added `regavim.*` color tokens (bg, surface, border, blue.*, navy) |
| `src/services/reports.js` | `fetchReports(filters)` → `GET /api/v1/reports/` |
| `src/hooks/useReports.js` | `{ reports, loading, error }` — cancel-on-unmount pattern |
| `src/store/mapStore.js` | Zustand: `panTarget`, `selectedReportId`, `panTo()`, `selectReport()` |
| `src/components/Map.jsx` | Leaflet map: OSM + Esri satellite layer switcher; `L.divIcon` colored markers; `MapController` for pan-to |
| `src/components/ReportSidebar.jsx` | Scrollable report list; status badges; loading/error/empty states; disabled button when coords are null |
| `src/components/MapDashboard.jsx` | 288px sidebar + full-height map layout |
| `src/main.jsx` | Added `import 'leaflet/dist/leaflet.css'` before app CSS |
| `src/services/__tests__/reports.test.js` | 5 tests |
| `src/hooks/__tests__/useReports.test.js` | 5 tests (incl. cancel-on-unmount) |
| `src/components/__tests__/ReportSidebar.test.jsx` | 13 tests |
| `src/components/__tests__/Map.test.jsx` | 11 tests |

### Test Results — 43 / 43 PASSED (34 new)

| Test File | Count | Result |
|---|---|---|
| `Status.test.jsx` (Phase A) | 9 | PASS |
| `reports.test.js` | 5 | PASS |
| `useReports.test.js` | 5 | PASS |
| `ReportSidebar.test.jsx` | 13 | PASS |
| `Map.test.jsx` | 11 | PASS |

### Anomalies Discovered & Handled

| Anomaly | Finding | Resolution |
|---|---|---|
| `data-testid` mismatch | Map.jsx passes `data-testid="report-marker"` to Marker; mock default was `"marker"` | Updated tests to query `"report-marker"` consistently |
| Leaflet CSS in jsdom | Importing `leaflet/dist/leaflet.css` in main.jsx would crash tests | CSS is only imported in `main.jsx`; tests import `Map.jsx` directly, bypassing `main.jsx` — no issue |
| react-leaflet in jsdom | `MapContainer` expects a real DOM with layout | Mocked entire `react-leaflet` module with `vi.mock` shim; tests verify React-level logic only |

### Technical Debt / Deferred Items
- No real API integration test (all mocked) — needs backend running for E2E.
- `useReports` only fetches once on mount; no refresh or polling yet.
- Map center and zoom are hardcoded to Israel — should become configurable env vars.
- Sidebar has no search/filter UI — Phase C scope.
- No PWA manifest yet.

---

## 9. Open Questions / Decisions Deferred

- **Image storage**: Local filesystem (simple) vs. object storage like S3 (scalable). Decision deferred until deployment planning.
- **Maps library**: Resolved — Leaflet.js chosen in Phase B.
- **Auth scope**: Is self-registration allowed, or is user creation admin-only? To clarify with stakeholder.
- **Offline support depth**: Read-only offline (cache dashboard) or full offline report drafting with sync? PWA complexity depends on this.

---

## 21. Stage 3 Phase C — Plan (Reporting Form & Image Integration)

### Goal
Build `ReportForm.jsx`: a multi-step form that lets a coordinator upload an image, receive an AI category suggestion before submitting, and confirm or override it. The form mounts as a modal overlay on the map dashboard.

### Upload Flow (State Machine)
```
idle ──(file chosen)──► uploading ──(image uploaded)──► analyzing ──(AI responds)──► ready
  ↑                        │                                │                          │
  └──(reset)──────────────┤                                └──(error)──────────────► error
                           └──(error)──────────────────────────────────────────────► error
ready ──(submit clicked)──► submitting ──(PATCH OK)──► done
```

### New Files

| File | Purpose |
|---|---|
| `src/services/images.js` | `uploadImage(reportId, file)` → `POST /api/v1/images/upload` (FormData); `analyzeImage(imageId)` → `POST /api/v1/images/analyze` (FormData) |
| `src/hooks/useReportForm.js` | Orchestrates the full flow: create report → upload → analyze → patch on submit |
| `src/components/ReportForm.jsx` | UI: upload dropzone, preview, step progress, AI badge, category dropdown, description, submit |

### Updated Files

| File | Change |
|---|---|
| `src/services/reports.js` | Add `createReport(payload)`, `patchReport(id, payload)` |
| `src/components/MapDashboard.jsx` | Add "+ New Report" button; show `ReportForm` as modal overlay |

### FormData Usage
```
// Upload — multipart/form-data (axios detects FormData, sets boundary automatically)
const fd = new FormData();
fd.append('report_id', reportId);   // FastAPI Form field
fd.append('file', file);            // FastAPI UploadFile field
await api.post('/api/v1/images/upload', fd);

// Analyze — also multipart (backend uses Form(...) for image_id)
const fd2 = new FormData();
fd2.append('image_id', imageId);
await api.post('/api/v1/images/analyze', fd2);
```

### Why Upload Before Analyze
The `/analyze` endpoint fetches the image **from disk by image_id**. It does not accept image bytes directly — the file must already be stored. Therefore:
1. `createReport` → get `report_id` (required by upload endpoint)
2. `uploadImage(report_id, file)` → file written to disk, get `image_id`
3. `analyzeImage(image_id)` → backend reads file from disk, calls Claude, returns category

Steps 2 and 3 cannot be reordered.

### Image Preview
`URL.createObjectURL(file)` creates a blob URL instantly (no network call). The object URL is revoked on hook cleanup to prevent memory leaks.

### Category Override
The AI suggestion pre-selects the `<select>` dropdown. The user can override before submitting. If `analysis_available: false`, the dropdown has no default and the user must choose.

### Testing Protocol
| File | Tests |
|---|---|
| `services/__tests__/images.test.js` | FormData fields, endpoint URLs, data return, error propagation |
| `hooks/__tests__/useReportForm.test.js` | Full state-machine transitions; error on upload; error on analysis; submit flow |
| `components/__tests__/ReportForm.test.jsx` | All render states; file input fires handleFileChange; submit calls hook; error message shown |

---

## 22. Stage 3 Phase D — Plan (Admin Management & Advanced Filtering)

### Goal
Add report detail view (image + metadata + AI reasoning), admin confirmation UI (set `final_category` via PATCH), a filter bar (status + date range), and updated status color coding. All within the existing sidebar using a list/detail toggle pattern.

### Sidebar Toggle Pattern
When no report is selected:  `FilterBar` + `ReportSidebar` (list).
When a report is selected:   `ReportDetailPanel` replaces the full sidebar.

The `selectedReportId` in `mapStore` drives the toggle. All list items are now clickable (detail opens for any report, pan only if coords exist).

### Status Color Scheme (updated from Phase B)
| Status | Color Token | Meaning |
|---|---|---|
| `pending` | amber | Needs coordinator action |
| `confirmed` | blue | Coordinator reviewed, awaiting manager |
| `approved` | green | Manager approved |
| `rejected` | gray | Soft-deleted / dismissed |

### Backend Changes

| File | Change |
|---|---|
| `backend/models/report.py` | Add `@property image_ids` — returns `[img.id for img in self.images]` |
| `backend/schemas/report.py` | Add `image_ids: list[str] = []` to `ReportRead` (populated via property) |
| `backend/api/v1/images.py` | Add `GET /{image_id}/file` → `FileResponse` (serves binary image with correct Content-Type) |
| `tests/test_report_api.py` | Add 2 tests: `image_ids: []` on new report; `image_ids` contains uploaded image id |
| `tests/test_images.py` | Add 3 tests for file-serving endpoint (200 + binary, 404, Content-Type) |

### Frontend New Files

| File | Purpose |
|---|---|
| `src/components/FilterBar.jsx` | Status `<select>` + from/to `<input type="date">`; calls `onChange({status,dateFrom,dateTo})`; "Clear" button when active |
| `src/components/ReportDetailPanel.jsx` | Back button, image, metadata grid, AI badge, confirmation form (pending/confirmed only) |
| `src/hooks/useReportDetail.js` | Fetches single report; exposes `confirmCategory(cat)` → PATCH; manages loading/patching/error state |

### Frontend Updated Files

| File | Change |
|---|---|
| `src/services/reports.js` | Add `fetchReport(id)` → `GET /api/v1/reports/{id}` |
| `src/services/images.js` | Add `getImageFileUrl(id)` → constructs `${VITE_API_BASE_URL}/api/v1/images/{id}/file` |
| `src/hooks/useReports.js` | Replace `[tick]` dep with `[JSON.stringify(filters), tick]` — re-fetches reactively when filters change |
| `src/components/MapDashboard.jsx` | Holds `filters` state; builds `activeFilters` for `useReports`; conditionally renders `FilterBar`+`ReportSidebar` vs `ReportDetailPanel` |
| `src/components/ReportSidebar.jsx` | Update status badge colors (amber/blue/green/gray); make all items clickable |
| `src/components/Map.jsx` | Update `STATUS_COLOR` map (amber/blue/green/gray) |

### PATCH Flow & Frontend State Update

1. Admin selects a category in `ReportDetailPanel` and clicks "Confirm Category".
2. `handleConfirm` calls `confirmCategory(value)` from `useReportDetail`.
3. The hook calls `patchReport(reportId, { final_category: value })`.
4. On success: the hook calls `setReport(updatedReport)` (the response from PATCH), then calls `onPatched?.()`.
5. `onPatched` is wired to `refresh()` from `useReports` in `MapDashboard` — this re-fetches the full report list, updating sidebar badges and map marker colors immediately.
6. On failure: `setPatchError(message)` — error is shown inline below the confirm button; no state is lost.

This gives both **optimistic local update** (the detail panel shows the new status immediately) and **list sync** (the sidebar + map reflect the change after the refetch completes).

### Testing Protocol

| File | New Tests |
|---|---|
| `services/__tests__/reports.test.js` | 3 tests for `fetchReport` |
| `hooks/__tests__/useReportDetail.test.js` | ~11 tests: fetch lifecycle, re-fetch on id change, confirmCategory payload, optimistic update, onPatched callback, error states |
| `components/__tests__/FilterBar.test.jsx` | ~7 tests: renders, status change, date change, clear button visibility, clear resets |
| `components/__tests__/ReportDetailPanel.test.jsx` | ~10 tests: loading/error/data states, image shown, metadata, confirm form, patchError, back button |

---

## 23. Stage E1 — Plan (Backend Security & JWT Authentication)

### Why JWT over session-based auth

JWT is **stateless** — the token is self-verifying (signed payload, no server lookup required per request). This fits the project's constraints:

| Concern | JWT | Sessions |
|---|---|---|
| Scalability | Any instance verifies the token — no shared session store | Requires Redis/DB session store shared across instances |
| Mobile / PWA | Authorization header (no CSRF risk) | Cookies require SameSite guards |
| Offline capability | Token cached on device; refreshed when online | Server session must be live |
| Simplicity | Single secret key, standard `python-jose` | Session store + middleware + CSRF tokens |

Tradeoff acknowledged: JWT tokens cannot be individually revoked before expiry (a stolen token is valid until `exp`). Mitigation: short expiry (24 h) + token refresh endpoint (planned Stage 7+).

### Token Design
```
Header: { "alg": "HS256", "typ": "JWT" }
Payload: { "sub": "<user_id>", "role": "coordinator|manager|admin", "exp": <unix_ts> }
Signed with settings.SECRET_KEY using HMAC-SHA256.
```

### New Files

| File | Purpose |
|---|---|
| `backend/core/security.py` | `hash_password`, `verify_password`, `create_access_token`, `decode_access_token`, `oauth2_scheme` |
| `backend/schemas/user.py` | `UserCreate`, `UserRead`, `LoginRequest`, `TokenResponse` |
| `backend/api/deps.py` | `get_current_user(token, db) → User` FastAPI dependency |
| `tests/test_auth.py` | Auth endpoint test suite (~13 tests) |

### Modified Files

| File | Change |
|---|---|
| `backend/api/v1/auth.py` | Implement `POST /register`, `POST /login`, `GET /me` |
| `backend/api/v1/reports.py` | Add `current_user = Depends(get_current_user)` to all routes; `create_report` uses `current_user.id` |
| `backend/api/v1/images.py` | Same protection |
| `tests/conftest.py` | Add global `get_current_user` override (stub user id=placeholder); add `auth_client` fixture |

### Dependency Chain
```
Request → OAuth2PasswordBearer (extracts Bearer token)
        → decode_access_token (verifies signature + expiry, raises 401 on failure)
        → get_current_user (looks up User by sub, raises 401 if not found)
        → route handler receives User object
```

### Endpoint Contracts

```
POST /api/v1/auth/register    — public; body: {email, password, role?}; 201 UserRead | 409
POST /api/v1/auth/login       — public; body: {email, password}; 200 TokenResponse | 401
GET  /api/v1/auth/me          — protected; 200 UserRead | 401

All /api/v1/reports/* and /api/v1/images/* endpoints — protected; 401 without valid Bearer token
```

### Test Strategy
- **Existing tests** (179): `conftest.py` adds a global `get_current_user` override returning a stub `User(id="00000000-0000-0000-0000-000000000001")` — same ID as the old placeholder, so zero changes to existing tests
- **New `test_auth.py`** uses `auth_client` fixture that **pops** the override temporarily, tests real JWT flow without stub bypassing auth

### Phase E1 Anomaly Focus

| Anomaly | Expected Behaviour |
|---|---|
| Login with wrong password | 401 — identical error message as nonexistent email (prevents user enumeration) |
| Duplicate email on register | 409 Conflict |
| Missing Authorization header | 401 from OAuth2PasswordBearer before reaching handler |
| Malformed/tampered token | 401 from `decode_access_token` (JWTError) |
| Expired token | 401 — same JWTError path |
| Token with nonexistent user_id | 401 — `get_current_user` queries DB, returns 401 |
| `hashed_password` in response | Must be absent — `UserRead` schema does not include it |

---

## 24. Stage E1 — Completion Summary

### What Was Built

| File | Change |
|---|---|
| `backend/core/security.py` | **New** — `hash_password`, `verify_password`, `create_access_token`, `decode_access_token`, `oauth2_scheme`; JWT implemented with stdlib HMAC-SHA256 + `bcrypt` direct (no `python-jose`/`passlib` — both crash due to `cryptography` pyo3 incompatibility on this system) |
| `backend/schemas/user.py` | **New** — `UserCreate`, `LoginRequest`, `TokenResponse`, `UserRead` |
| `backend/api/deps.py` | **New** — `get_current_user` FastAPI dependency: extracts Bearer token → verifies → loads User from DB |
| `backend/api/v1/auth.py` | Implemented `POST /register` (201/409), `POST /login` (200/401), `GET /me` (200/401) |
| `backend/api/v1/reports.py` | All 5 routes now depend on `get_current_user`; `create_report` uses `current_user.id` |
| `backend/api/v1/images.py` | All 4 routes now depend on `get_current_user` |
| `tests/conftest.py` | Added global `get_current_user` stub override (stub user id = old placeholder UUID); added `auth_client` fixture that pops/restores override for real auth tests |
| `tests/test_auth.py` | **New** — 21 tests: TestRegister (5), TestLogin (6), TestGetMe (6), TestEndpointProtection (4) |

### Test Results — 206 / 206 PASSED (21 new)

| Test Class | Count | Result |
|---|---|---|
| `TestRegister` | 5 | PASS |
| `TestLogin` | 6 | PASS |
| `TestGetMe` | 6 | PASS |
| `TestEndpointProtection` | 4 | PASS |
| All Stage E (prior) | 185 | PASS (no regressions) |

### Anomalies Discovered & Handled

| Anomaly | Finding | Resolution |
|---|---|---|
| `python-jose[cryptography]` crash | pyo3 Rust panic in `cryptography.hazmat.bindings._rust` — system `cryptography` package incompatible with installed pyo3 bindings | Implemented JWT with stdlib `hmac`/`hashlib`/`base64` + `bcrypt` direct; zero native crypto deps |
| `passlib[bcrypt]` crash | `passlib` reads `bcrypt.__about__.__version__` which was removed in `bcrypt >= 4.0` | Used `bcrypt` module directly (`hashpw`/`checkpw`/`gensalt`) — no passlib wrapper |
| Existing test isolation | All 185 existing tests POST/GET/PATCH/DELETE routes that now require auth | Global `get_current_user` override in conftest returns stub user — zero changes to existing tests |
| User enumeration via login timing | Same 401 status + same error message for wrong password and nonexistent email | Verified by dedicated test: `wrong_password_and_missing_email_same_message` |

### Technical Debt / Deferred Items
- `POST /api/v1/auth/refresh` stub still not implemented — token refresh deferred to later stage.
- `SECRET_KEY` defaults to `"change-me-before-production"` — must be rotated before deployment.
- No role-based authorization (RBAC) yet — `current_user.role` is stored but not checked. Add `require_role("manager")` guards in Stage 7+.
- No rate limiting on `/login` — brute-force protection needed before production.
- Revocation not possible with stateless JWT — add a token blocklist (Redis) if short-lived sessions are required.
