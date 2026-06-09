# Regavim — Project Memory

## מה זה

PWA לניטור בנייה בלתי חוקית ושימוש לא נאות בקרקעות. מדוח שטח (מצלמה + GPS) → ניתוח AI → dashboard מנהל עם מפה. פותח עבור ארגון NGO.

**זרימת ליבה:**
1. קואורדינטור מצלם הפרה בשטח
2. Claude Vision מציע קטגוריית הפרה
3. קואורדינטור מאשר/מתגבר על הצעת ה-AI (human-in-the-loop)
4. קואורדינטור מסמן את מיקום ההפרה על מפה
5. מנהל סוקר ומאשר דוחות ב-dashboard מבוסס-מפה

---

## Tech Stack

### Frontend
- React 19 + Vite 8 (PWA, mobile-first)
- Tailwind CSS v3 (`tailwind.config.js` עם `regavim.*` color tokens)
- Zustand (state management — `mapStore.js`)
- Axios (HTTP client — `src/services/api.js`)
- React Router v7
- Leaflet.js + react-leaflet (מפה, OSM + Esri satellite)
- Vitest + React Testing Library (בדיקות)
- Node.js ≥ 22.12.0

### Backend
- Python + FastAPI (async, RESTful)
- SQLAlchemy 2.0 (ORM)
- Alembic (מיגרציות)
- Pydantic 2.7+ (validation)
- SQLite (dev) / PostgreSQL Neon (prod)
- Anthropic Claude `claude-sonnet-4-6` (vision — AI category suggestion)
- JWT HS256 (auth, 24h expiry)
- Cloudinary (prod image storage) / Local filesystem (dev)
- Pillow + piexif (EXIF handling)

### Hosting
- Frontend: Vercel
- Backend: Render
- CI/CD: GitHub Actions (`.github/workflows/ci.yml`)

---

## מבנה קבצים חשוב

```
Regavim/
├── backend/
│   ├── api/v1/
│   │   ├── reports.py          # CRUD reports, filtering, PATCH/DELETE
│   │   ├── images.py           # Upload, analyze, serve file
│   │   └── auth.py             # JWT login/register/me
│   ├── api/v1/
│   │   └── complaints.py       # File report to authorities by email + history
│   ├── services/
│   │   ├── ai_service.py       # analyze_image_with_claude() — Claude vision
│   │   ├── image_service.py    # EXIF extraction + validation
│   │   ├── storage.py          # StorageProvider ABC + LocalStorageProvider
│   │   ├── report_service.py   # apply_report_filters() query builder
│   │   ├── email_service.py    # send_email() via smtplib (+ attachments)
│   │   ├── complaint_template.py   # render_complaint() — Hebrew letter (deterministic)
│   │   └── complaint_recipients.py # authority key → label (constants) + email (settings)
│   ├── models/
│   │   ├── report.py           # Report ORM (final_category, dual-location, complaint_submissions)
│   │   ├── image.py            # Image ORM (file_path, exif_data JSON, has_exif)
│   │   ├── complaint.py        # ComplaintSubmission ORM (per-authority audit history)
│   │   └── user.py             # User ORM (role: coordinator/manager/admin)
│   ├── schemas/
│   │   ├── report.py           # ReportCreate/Update/Read (GPS validators, extra="forbid")
│   │   ├── complaint.py        # Authority/Submit/Submission schemas
│   │   └── image.py            # ImageRead, AnalysisResult
│   ├── core/
│   │   ├── config.py           # Pydantic Settings (.env)
│   │   └── constants.py        # ViolationCategory, ReportStatus, UserRole enums
│   ├── db/
│   │   ├── session.py          # Engine, SessionLocal, get_db()
│   │   └── base.py             # DeclarativeBase
│   └── main.py                 # FastAPI app, lifespan, CORS, /health
├── frontend/
│   └── src/
│       ├── services/
│       │   ├── api.js          # Axios instance (VITE_API_BASE_URL)
│       │   ├── reports.js      # fetchReports/fetchReport/createReport/patchReport
│       │   └── images.js       # uploadImage/analyzeImage/getImageFileUrl
│       ├── hooks/
│       │   ├── useReports.js   # { reports, loading, error, refresh }
│       │   ├── useReportForm.js # state machine: idle→uploading→analyzing→ready→done
│       │   └── useReportDetail.js # fetch single report + confirmCategory (PATCH)
│       ├── store/
│       │   └── mapStore.js     # Zustand: panTarget, selectedReportId, panTo(), selectReport()
│       └── components/
│           ├── MapDashboard.jsx # Layout shell (sidebar + map pane)
│           ├── Map.jsx          # Leaflet map, layer switcher, color-coded markers
│           ├── ReportSidebar.jsx # Scrollable list, status badges, pan button
│           ├── ReportDetailPanel.jsx # Image + metadata + AI badge + confirm form
│           ├── ReportForm.jsx   # Multi-step form: upload→AI→submit
│           ├── FilterBar.jsx    # Status + date range filters
│           └── Status.jsx       # Backend health indicator
├── tests/                      # pytest test suite (227+ tests)
├── alembic/                    # DB migrations
├── memory.md                   # יומן פיתוח מפורט (קרא לפני שינויים גדולים)
├── .env.example
└── requirements.txt
```

---

## API Endpoints

```
POST   /api/v1/auth/register         # Register new user → { token }
POST   /api/v1/auth/login            # Login → { token }
GET    /api/v1/auth/me               # Current user info

POST   /api/v1/reports/              # Create report (requires auth)
GET    /api/v1/reports/              # List reports (filters: status, category, date_from, date_to, reporter_id)
GET    /api/v1/reports/{id}          # Get single report (includes image_ids)
PATCH  /api/v1/reports/{id}          # Update status/final_category/description (extra="forbid")
DELETE /api/v1/reports/{id}          # Soft-delete (sets status=rejected)

POST   /api/v1/images/upload         # Upload image (multipart: report_id + file) → ImageRead
POST   /api/v1/images/analyze        # AI analysis (multipart: image_id) → AnalysisResult
GET    /api/v1/images/{id}/file      # Serve original image binary (EXIF intact)

GET    /api/v1/complaints/authorities          # List authorities [{key,label,available}]
POST   /api/v1/reports/{id}/complaints         # File report to authorities {authorities:[keys]} (admin/manager)
GET    /api/v1/reports/{id}/complaints         # Submission history (newest first)

GET    /health                       # { status: "ok" } — no auth
```

---

## Violation Categories (enum)

```
ILLEGAL_CONSTRUCTION | LAND_GRADING | AGRICULTURAL_ENCROACHMENT
ROAD_PAVING | DEMOLITION | ILLEGAL_DUMPING | OTHER
```

---

## עיצוב חשוב — אל תשנה

- **EXIF preservation**: אסור לקודד מחדש תמונות. מאחסנים originals as-is; EXIF הוא ראיה משפטית.
- **Dual-location**: `user_lat/lng` (GPS מכשיר) ≠ `target_lat/lng` (פין מפה). שניהם חובה.
- **Human-in-the-loop AI**: `ai_category` — הצעת AI. `final_category` — בחירת אנוש. ה-AI **אף פעם** לא מגדיר `final_category`.
- **Auto-confirm**: אם PATCH מגדיר `final_category` ו-status הוא `pending` → status מתקדם ל-`confirmed` אוטומטית.
- **Soft-delete**: DELETE מגדיר `status=rejected`, לא מוחק שורה.
- **`has_exif = True`**: רק אם יש GPS sub-IFD או DateTimeOriginal. Device Make/Model לבד = `False`.
- **Complaints**: הגשת תלונה מותרת ל-`admin`/`manager` בלבד, ורק לדיווח `confirmed`/`approved`. שליחה מבודדת לכל רשות (כשל באחת נרשם כ-`failed` ולא עוצר את השאר). תמונות הראיה מצורפות as-is (EXIF נשמר). רשות בלי `COMPLAINT_EMAIL_*` מוגדר → מנוטרלת בממשק. כל הגשה נרשמת ב-`complaint_submissions`. התבנית (`complaint_template.py`) דטרמיניסטית — ללא AI.

---

## הרצה מקומית

### Backend
```bash
pip install -r requirements.txt
pip install -r requirements-dev.txt
alembic upgrade head
python -m uvicorn backend.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### בדיקות
```bash
pytest tests/ -v                # כל הבדיקות (227+)
cd frontend && npm test         # בדיקות frontend
```

---

## Env Vars

```bash
# Backend (.env)
ANTHROPIC_API_KEY          # חובה לניתוח תמונות
SECRET_KEY                 # JWT signing key
DATABASE_URL               # default: sqlite:///./smarttender.db
UPLOAD_DIR                 # default: uploads/
CLOUDINARY_CLOUD_NAME      # אם מוגדר — מפעיל Cloudinary
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET

# Email — complaint submission (ריק = שליחה מושבתת)
SMTP_HOST                  # e.g. smtp.gmail.com
SMTP_PORT                  # default: 587
SMTP_USER
SMTP_PASSWORD              # Gmail App Password / provider API key
SENDER_EMAIL               # חייב להתאים לתיבת השליחה המאומתת
SMTP_USE_TLS               # default: true
COMPLAINT_EMAIL_POLICE         # כתובת קבלה לכל רשות; ריק = הרשות מנוטרלת בממשק
COMPLAINT_EMAIL_ILA
COMPLAINT_EMAIL_ENV_MINISTRY
COMPLAINT_EMAIL_LOCAL_PLANNING
COMPLAINT_EMAIL_CIVIL_ADMIN

# Frontend (.env)
VITE_API_BASE_URL          # default: http://localhost:8000
```

---

## מצב הפרויקט

כל השלבים הושלמו (Stage 2–6, E1, E2, Phase A–F, DEL, SPU, INF).
227+ בדיקות עוברות. פרוסה ב-Vercel (frontend) + Render (backend).

לפרטי כל שלב ופתרונות anomalies — ראה `memory.md`.
