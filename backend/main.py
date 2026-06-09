"""
FastAPI application entry point.

Run locally with:
    uvicorn backend.main:app --reload

Interactive API docs available at:
    http://localhost:8000/docs
"""

import logging
from contextlib import asynccontextmanager
from datetime import timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

import backend.models  # noqa: F401 — registers all ORM models with SQLAlchemy metadata
from backend.api.v1 import auth, complaints, images, reports, submit
from backend.api.v1.images import get_storage
from backend.core.config import settings
from backend.db.base import Base
from backend.db.session import SessionLocal, engine
from backend.services.image_cleanup import delete_orphan_images

logger = logging.getLogger(__name__)

# Built frontend (Vite `npm run build` output). When present, FastAPI serves the
# SPA itself so the whole app is a single origin reachable from one HTTPS URL —
# no separate dev server and no CORS needed (the MVP-from-a-phone setup).
_FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"


def _reap_orphan_images_on_startup() -> None:
    """
    Stopgap reaper run: clears staged images abandoned in a previous session.

    This is enough for the MVP because the dev server is short-lived, but a
    long-running production server only triggers this on (re)deploy. Until a real
    periodic scheduler is configured and IMAGE_REAPER_SCHEDULED is set to true,
    warn loudly on every boot so the requirement is never silently forgotten.
    """
    db = SessionLocal()
    try:
        delete_orphan_images(
            db,
            get_storage(),
            timedelta(hours=settings.ORPHAN_IMAGE_TTL_HOURS),
        )
    except Exception:  # noqa: BLE001 — never let cleanup block startup
        logger.exception("Orphan-image reaper failed on startup.")
    finally:
        db.close()

    if not settings.IMAGE_REAPER_SCHEDULED:
        logger.warning(
            "Orphan-image reaper is running in STARTUP-ONLY mode. Configure a "
            "periodic job (cron / Celery beat / K8s CronJob) to run "
            "backend/cleanup_orphan_images.py, then set IMAGE_REAPER_SCHEDULED=true "
            "to silence this warning. See backend/services/image_cleanup.py."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Create all DB tables on startup. Use Alembic migrations in production."""
    Base.metadata.create_all(bind=engine)
    _reap_orphan_images_on_startup()
    yield


app = FastAPI(
    title="Regavim Land-Use Monitor API",
    version="0.1.0",
    lifespan=lifespan,
)

_origins = (
    ["*"]
    if settings.ALLOWED_ORIGINS.strip() == "*"
    else [o.strip() for o in settings.ALLOWED_ORIGINS.split(",") if o.strip()]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,  # JWT Bearer tokens don't use cookies; credentials flag not needed
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(submit.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(images.router, prefix="/api/v1/images", tags=["images"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(complaints.router, prefix="/api/v1", tags=["complaints"])


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}


# ── Serve the built SPA (production / phone MVP) ─────────────────────────────
# Registered AFTER the API routers so /api/*, /health, /docs always win. Only
# active when a build exists; in local dev you run Vite separately and this is
# skipped, so nothing here interferes with the dev proxy setup.
if _FRONTEND_DIST.is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=_FRONTEND_DIST / "assets"),
        name="assets",
    )

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        """
        SPA history-mode fallback. React Router uses BrowserRouter, so a hard
        refresh on a client route (e.g. /map) hits the server — return the real
        file if one exists (favicon, manifest, icons), otherwise index.html so
        the client router can take over.
        """
        # Never let the catch-all swallow an unmatched API path — that should 404.
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")
        candidate = _FRONTEND_DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(_FRONTEND_DIST / "index.html")
else:
    logger.warning(
        "No frontend build found at %s — serving API only. Run "
        "`cd frontend && npm run build` to serve the SPA from this server "
        "(single-origin setup for phone/production).",
        _FRONTEND_DIST,
    )
