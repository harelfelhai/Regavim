#!/usr/bin/env python3
"""
Mock data seeder for MVP demonstration.

Creates:
  - 3 demo users (admin, manager, coordinator)
  - 30 reports spread across Israel with all 7 categories and 5 statuses
  - 1 placeholder JPEG per report (generated with PIL — colour-coded by category)

Usage (from repo root):
    python backend/seed_data.py            # additive — keeps existing data
    python backend/seed_data.py --reset    # wipes all reports/images first
"""

from __future__ import annotations

import argparse
import io
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from PIL import Image as PILImage, ImageDraw, ImageFont

import backend.models  # noqa: F401 — registers all ORM models
from backend.api.v1.images import get_storage
from backend.core.config import settings
from backend.core.constants import ReportStatus, ViolationCategory
from backend.core.security import hash_password
from backend.db.base import Base
from backend.db.session import SessionLocal, engine
from backend.models.image import Image
from backend.models.report import Report
from backend.models.user import User


# ─────────────────────────────────────────────────────────────────────────────
# Demo users
# ─────────────────────────────────────────────────────────────────────────────

DEMO_USERS = [
    {"email": "admin@regavim.org",   "password": "Admin1234!",   "role": "admin"},
    {"email": "manager@regavim.org", "password": "Manager1234!", "role": "manager"},
    {"email": "field@regavim.org",   "password": "Field1234!",   "role": "coordinator"},
]


# ─────────────────────────────────────────────────────────────────────────────
# 30 realistic Israeli locations (lat, lng, area name)
# ─────────────────────────────────────────────────────────────────────────────

LOCATIONS = [
    # Negev (6)
    (31.2518, 34.7913, "Beer Sheva outskirts"),
    (31.0707, 35.0327, "Dimona industrial zone"),
    (30.6093, 34.8011, "Mitzpe Ramon ridge"),
    (31.2589, 35.2117, "Arad northeast"),
    (30.9874, 34.8456, "Yeroham hills"),
    (31.1421, 35.0218, "Negev highlands"),
    # Galilee (6)
    (32.7940, 34.9896, "Haifa Mount Carmel"),
    (32.7021, 35.2978, "Nazareth east slope"),
    (32.9629, 35.4951, "Safed valley"),
    (32.7959, 35.5310, "Tiberias shore"),
    (33.2076, 35.5694, "Kiryat Shmona ridge"),
    (33.0567, 35.3458, "Upper Galilee forest"),
    # West Bank / Judea & Samaria (8)
    (32.2211, 35.2544, "Shechem area"),
    (31.5326, 35.0998, "Hebron hills"),
    (31.9302, 35.2316, "Beit El plateau"),
    (31.9544, 35.3024, "Ofra ridge"),
    (32.0556, 35.2916, "Shiloh hilltop"),
    (31.7032, 35.1965, "Gush Etzion"),
    (32.1043, 35.1798, "Binyamin region"),
    (31.8567, 35.4321, "Jordan Valley west"),
    # Center (4)
    (32.0709, 34.7818, "Tel Aviv south"),
    (32.0853, 34.8916, "Petah Tikva north"),
    (32.3215, 34.8532, "Netanya south"),
    (32.1834, 34.8716, "Raanana east"),
    # Coastal (3)
    (31.8014, 34.6435, "Ashdod port area"),
    (31.6688, 34.5743, "Ashkelon coastal"),
    (32.5527, 34.9460, "Hadera north"),
    # Jerusalem area (3)
    (31.7826, 35.2154, "Jerusalem outskirts"),
    (31.7461, 34.9892, "Beit Shemesh"),
    (31.7950, 35.1542, "Mevasseret Zion"),
]

assert len(LOCATIONS) == 30, "Expected exactly 30 locations"


# ─────────────────────────────────────────────────────────────────────────────
# Sample descriptions per category (Hebrew + English mix for realism)
# ─────────────────────────────────────────────────────────────────────────────

DESCRIPTIONS = {
    "ILLEGAL_CONSTRUCTION": [
        "Concrete foundations poured on state land without permit.",
        "מבנה לבנים בלתי חוקי הולך ונבנה ליד הכביש.",
        "Two-storey structure built overnight; no zoning approval.",
        "תוספת בנייה בלתי מאושרת על גבעה ציבורית.",
        "Permanent caravan installed with utility hookups, no permit.",
    ],
    "LAND_GRADING": [
        "Bulldozers flattening a hillside; significant earth movement.",
        "פעולות עפר נרחבות באזור פתוח ללא היתר.",
        "Heavy equipment grading 2-acre site overnight.",
    ],
    "AGRICULTURAL_ENCROACHMENT": [
        "Olive grove planted on contested state land.",
        "כרם חדש נטוע מעבר לקו ההפרדה.",
        "Greenhouse erected without authorization.",
        "מטעים נרחבים על שטחי מרעה ציבוריים.",
    ],
    "ROAD_PAVING": [
        "Unauthorized asphalt road cut across nature reserve.",
        "סלילת דרך עפר ארוכה ללא אישור.",
        "Heavy machinery laying new access road in protected zone.",
    ],
    "DEMOLITION": [
        "Historic structure demolished without heritage authority approval.",
        "הריסה לא מבוקרת של מבנה ישן עם משמעות היסטורית.",
    ],
    "ILLEGAL_DUMPING": [
        "Construction debris dumped in open wadi.",
        "פסולת בניין מושלכת בשטח פתוח.",
        "Several truckloads of waste dumped near settlement edge.",
        "פינוי פסולת מסוכנת לא מאושר.",
    ],
    "OTHER": [
        "Unidentified land-use violation requiring field investigation.",
        "פעילות חשודה — מצריך בדיקה נוספת.",
    ],
}


# ─────────────────────────────────────────────────────────────────────────────
# Category → colour (for placeholder image background)
# ─────────────────────────────────────────────────────────────────────────────

CATEGORY_COLOUR = {
    "ILLEGAL_CONSTRUCTION":     (220, 38,  38),   # red-600
    "LAND_GRADING":             (217, 119, 6),    # amber-600
    "AGRICULTURAL_ENCROACHMENT":(22,  163, 74),   # green-600
    "ROAD_PAVING":              (75,  85,  99),   # gray-600
    "DEMOLITION":               (139, 92,  246),  # violet-500
    "ILLEGAL_DUMPING":          (180, 83,  9),    # amber-700
    "OTHER":                    (37,  99,  235),  # blue-600
}


# ─────────────────────────────────────────────────────────────────────────────
# Status distribution (30 total)
# ─────────────────────────────────────────────────────────────────────────────

STATUS_PLAN = (
    [ReportStatus.PENDING.value]            * 8 +
    [ReportStatus.CONFIRMED.value]          * 8 +
    [ReportStatus.APPROVED.value]           * 8 +
    [ReportStatus.REJECTED.value]           * 4 +
    [ReportStatus.DELETION_REQUESTED.value] * 2
)
assert len(STATUS_PLAN) == 30


# ─────────────────────────────────────────────────────────────────────────────
# Image generation
# ─────────────────────────────────────────────────────────────────────────────

def make_placeholder_jpeg(category: str, area: str, index: int) -> bytes:
    """
    Generate a small JPEG with the category colour and label text overlay.
    Returns the raw bytes — ready for the StorageProvider.
    """
    width, height = 480, 360
    bg = CATEGORY_COLOUR.get(category, (107, 114, 128))
    img = PILImage.new("RGB", (width, height), bg)
    draw = ImageDraw.Draw(img)

    # Try to load a default font; fall back to PIL's built-in if unavailable.
    try:
        font_large = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 22)
        font_small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except OSError:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()

    # Title — category name (replace _ with space)
    title = category.replace("_", " ")
    draw.text((20, 30),  f"#{index:02d}",  fill=(255, 255, 255), font=font_large)
    draw.text((20, 70),  title,            fill=(255, 255, 255), font=font_large)
    draw.text((20, 130), area,             fill=(255, 255, 255, 220), font=font_small)
    draw.text((20, 320), "DEMO EVIDENCE PHOTO", fill=(255, 255, 255), font=font_small)

    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=85)
    return buffer.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
# Main seeding logic
# ─────────────────────────────────────────────────────────────────────────────

def ensure_users(db) -> dict[str, User]:
    """Return {role: User}. Creates any missing demo accounts."""
    result: dict[str, User] = {}
    for spec in DEMO_USERS:
        existing = db.query(User).filter(User.email == spec["email"]).first()
        if existing:
            result[spec["role"]] = existing
            print(f"  • exists: {spec['email']} ({spec['role']})")
            continue
        user = User(
            email=spec["email"],
            hashed_password=hash_password(spec["password"]),
            role=spec["role"],
        )
        db.add(user)
        db.flush()
        result[spec["role"]] = user
        print(f"  + created: {spec['email']} / {spec['password']} ({spec['role']})")
    db.commit()
    return result


def wipe_reports_and_images(db) -> None:
    """Remove all reports and images (cascade-deletes images via the FK)."""
    storage = get_storage()
    for img in db.query(Image).all():
        try:
            storage.delete(img.file_path)
        except Exception:
            pass
    db.query(Image).delete()
    db.query(Report).delete()
    db.commit()
    print("  ✓ wiped existing reports and images")


def seed_reports(db, coordinator: User, count: int = 30) -> None:
    storage = get_storage()
    categories = list(CATEGORY_COLOUR.keys())
    random.seed(42)  # Deterministic output

    now = datetime.now(timezone.utc)

    for i in range(count):
        lat, lng, area = LOCATIONS[i]
        category = categories[i % len(categories)]
        status = STATUS_PLAN[i]

        # Spread created_at over the last 180 days, recent dates more likely
        days_ago = int(random.triangular(0, 180, 25))
        created_at = now - timedelta(days=days_ago, hours=random.randint(0, 23))
        observed_at = created_at - timedelta(hours=random.randint(0, 12))

        # ai_category always set; final_category only for non-pending statuses
        ai_category = category if random.random() > 0.15 else random.choice(categories)
        if status == ReportStatus.PENDING.value:
            final_category = None
        else:
            final_category = category

        description = random.choice(DESCRIPTIONS[category])

        # Tiny jitter so reports near same location don't perfectly overlap
        jitter_lat = lat + random.uniform(-0.005, 0.005)
        jitter_lng = lng + random.uniform(-0.005, 0.005)

        report = Report(
            user_id=coordinator.id,
            status=status,
            ai_category=ai_category,
            final_category=final_category,
            description=description,
            created_at=created_at,
            updated_at=created_at,
            observed_at=observed_at,
            user_lat=jitter_lat,
            user_lng=jitter_lng,
            target_lat=jitter_lat,
            target_lng=jitter_lng,
            land_context="State land" if random.random() > 0.5 else "Survey land",
        )
        db.add(report)
        db.flush()

        # Generate and save the placeholder image
        image_bytes = make_placeholder_jpeg(category, area, i + 1)
        image_id = str(uuid.uuid4())
        storage_filename = f"{image_id}.jpg"
        file_path = storage.save(storage_filename, image_bytes)

        image = Image(
            id=image_id,
            report_id=report.id,
            file_path=file_path,
            original_filename=f"demo_{i+1:02d}_{category.lower()}.jpg",
            exif_data=None,
            has_exif=False,
            uploaded_at=created_at,
        )
        db.add(image)
        db.flush()

        print(f"  + report {i+1:02d}: {category:<26} {status:<20} {area}")

    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed demo data for MVP presentation.")
    parser.add_argument("--reset", action="store_true",
                        help="Wipe existing reports and images before seeding")
    args = parser.parse_args()

    print(f"  Database : {settings.DATABASE_URL}")
    print(f"  Storage  : {'Cloudinary' if settings.CLOUDINARY_CLOUD_NAME else 'Local disk (' + settings.UPLOAD_DIR + ')'}")
    print()

    # First-run safety: create tables if Alembic hasn't been run yet.
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        if args.reset:
            print("Wiping existing data…")
            wipe_reports_and_images(db)
            print()

        print("Ensuring demo users…")
        users = ensure_users(db)
        print()

        print(f"Seeding 30 reports owned by {users['coordinator'].email}…")
        seed_reports(db, users["coordinator"])
        print()

        total_reports = db.query(Report).count()
        total_images = db.query(Image).count()
        print(f"✓ Done. Database now has {total_reports} reports / {total_images} images.")
        print()
        print("Demo logins:")
        for spec in DEMO_USERS:
            print(f"  {spec['role']:<12} {spec['email']:<25} {spec['password']}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
