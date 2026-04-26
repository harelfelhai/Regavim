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
| `status` | Enum | `pending`, `approved`, `rejected` |
| `ai_category` | String | Claude's raw suggestion |
| `final_category` | String | Human-approved category (may differ) |
| `description` | Text | Optional coordinator notes |
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

## 5. Key Design Constraints

- **EXIF preservation**: Images must never be re-encoded or stripped of metadata. Store originals as-is; serve them directly.
- **Dual-location model**: Always store both `user_lat/lng` (device GPS) and `target_lat/lng` (map pin) — they are semantically different and both matter legally.
- **Human-in-the-loop AI**: The AI suggestion is non-binding. The UI must make it easy to accept or override. The `final_category` field is always set by the human.
- **DB flexibility**: All DB access goes through SQLAlchemy. No raw SQL. The same model code must work with SQLite (dev) and PostgreSQL (prod), switched via an env variable.
- **PWA / mobile-first**: The frontend must be installable and work on low-bandwidth connections. Images should be compressed for upload (but the server stores the original).

---

## 6. API Endpoints (Planned)

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

## 7. Project Status

| # | Stage | Status |
|---|---|---|
| 1 | Project scoping & memory file | **Done** |
| 2 | Backend scaffolding (FastAPI skeleton, DB setup) | Pending |
| 3 | ORM models + Pydantic schemas | Pending |
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

## 8. Open Questions / Decisions Deferred

- **Image storage**: Local filesystem (simple) vs. object storage like S3 (scalable). Decision deferred until deployment planning.
- **Maps library**: Leaflet.js (open source, lighter) vs. Mapbox GL JS (better visuals, API key required). To decide in frontend stage.
- **Auth scope**: Is self-registration allowed, or is user creation admin-only? To clarify with stakeholder.
- **Offline support depth**: Read-only offline (cache dashboard) or full offline report drafting with sync? PWA complexity depends on this.
