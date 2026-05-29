"""
Orphan-image reaper.

Images are uploaded and analysed BEFORE their report exists (see images router).
An image that is never linked to a report — because the reporter abandoned the
create flow — stays in the database with report_id IS NULL. This module removes
those staged images once they are older than a TTL, freeing both the DB row and
the stored file.

IMPORTANT — production scheduling:
    This function must be run PERIODICALLY in production (e.g. a cron job, a
    Celery beat task, or a Kubernetes CronJob calling backend/cleanup_orphan_images.py).
    The MVP also calls it once on application startup as a stopgap, which is
    enough while the server is short-lived, but a long-running production server
    needs a real scheduler. main.py logs a loud warning on startup until the
    IMAGE_REAPER_SCHEDULED setting is set to true to acknowledge this.
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from backend.models.image import Image as ImageModel
from backend.services.storage import StorageProvider

logger = logging.getLogger(__name__)


def delete_orphan_images(
    db: Session,
    storage: StorageProvider,
    older_than: timedelta,
) -> int:
    """
    Delete staged images (report_id IS NULL) uploaded longer ago than `older_than`.

    Returns the number of images removed. Storage deletion failures for an
    individual file are logged but do not abort the run — the DB row is still
    removed so the orphan does not linger.
    """
    cutoff = datetime.now(timezone.utc) - older_than
    orphans = (
        db.query(ImageModel)
        .filter(ImageModel.report_id.is_(None), ImageModel.uploaded_at < cutoff)
        .all()
    )

    removed = 0
    for image in orphans:
        try:
            storage.delete(image.file_path)
        except Exception:  # noqa: BLE001 — best effort; never block on a single file
            logger.warning("Failed to delete orphan image file: %s", image.file_path)
        db.delete(image)
        removed += 1

    if removed:
        db.commit()
        logger.info("Reaped %d orphan image(s) older than %s.", removed, older_than)

    return removed
