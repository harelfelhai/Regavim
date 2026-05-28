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

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import backend.models  # noqa: F401 — registers all ORM models with SQLAlchemy metadata
from backend.api.v1 import auth, images, reports
from backend.api.v1.images import get_storage
from backend.core.config import settings
from backend.db.base import Base
from backend.db.session import SessionLocal, engine
from backend.services.image_cleanup import delete_orphan_images

logger = logging.getLogger(__name__)


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

app.include_router(reports.router, prefix="/api/v1/reports", tags=["reports"])
app.include_router(images.router, prefix="/api/v1/images", tags=["images"])
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])


@app.get("/health", tags=["health"])
def health_check():
    return {"status": "ok"}
