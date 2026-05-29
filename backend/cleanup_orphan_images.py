"""
Standalone orphan-image reaper — for scheduled execution in production.

Run from a cron job / Celery beat / Kubernetes CronJob, e.g. hourly:

    python -m backend.cleanup_orphan_images

It deletes staged images (uploaded but never linked to a report) older than
settings.ORPHAN_IMAGE_TTL_HOURS. See backend/services/image_cleanup.py.
"""

import logging
from datetime import timedelta

from backend.api.v1.images import get_storage
from backend.core.config import settings
from backend.db.session import SessionLocal
from backend.services.image_cleanup import delete_orphan_images

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> int:
    db = SessionLocal()
    try:
        removed = delete_orphan_images(
            db,
            get_storage(),
            timedelta(hours=settings.ORPHAN_IMAGE_TTL_HOURS),
        )
        logger.info("Orphan-image cleanup complete: %d removed.", removed)
        return removed
    finally:
        db.close()


if __name__ == "__main__":
    main()
