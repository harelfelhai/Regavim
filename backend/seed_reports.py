#!/usr/bin/env python3
"""
Seed the database with ~30 realistic sample violation reports.

Downloads real photos from picsum.photos (Unsplash), caches them locally,
then submits reports through the live API with varied categories, locations,
statuses, and dates spread across the last 6 months.

Usage:
  python backend/seed_reports.py --email admin@example.com --password SECRET
  python backend/seed_reports.py  # prompts for credentials
"""

import argparse
import io
import json
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
from PIL import Image, ImageDraw, ImageFilter

API_BASE = "http://localhost:8000"
IMAGE_CACHE = Path("/tmp/regavim_seed_images")
IMAGE_CACHE.mkdir(exist_ok=True)

# ── 8 synthetic landscape palettes (sky_top, sky_bot, ground_top, ground_bot) ─
# Each represents a different geographic zone found in the survey area.
LANDSCAPES = [
    # name,                sky_top,         sky_bot,         ground_top,     ground_bot
    ("negev_desert",       (135, 185, 235),  (195, 220, 245), (190, 155,  85), (145, 110, 55)),
    ("arava_valley",       (155, 200, 240),  (210, 230, 248), (175, 115,  65), (130,  85, 45)),
    ("galilee_hills",      (100, 160, 220),  (165, 205, 240), ( 85, 125,  65), ( 55,  90, 45)),
    ("judean_hills",       (120, 170, 225),  (185, 215, 242), (160, 140, 100), (115,  95, 65)),
    ("jordan_valley",      (160, 205, 240),  (215, 232, 248), (155,  95,  50), (100,  60, 30)),
    ("agricultural_north", ( 90, 155, 215),  (155, 200, 238), ( 75, 140,  60), ( 50, 100, 35)),
    ("semi_arid_south",    (145, 195, 238),  (200, 225, 245), (175, 150,  95), (130, 105, 60)),
    ("construction_site",  (130, 180, 230),  (190, 218, 242), (140, 125,  90), ( 95,  80, 55)),
]

IMAGE_SEEDS = [(name, f"{name}.jpg") for name, *_ in LANDSCAPES]


def _lerp_color(c1: tuple, c2: tuple, t: float) -> tuple:
    return tuple(int(c1[i] + (c2[i] - c1[i]) * t) for i in range(3))


def generate_landscape_image(palette_idx: int) -> bytes:
    """Create a 640×480 JPEG landscape image with sky + terrain gradient and noise."""
    name, sky_top, sky_bot, ground_top, ground_bot = LANDSCAPES[palette_idx]
    rng = random.Random(palette_idx * 1337)  # deterministic per palette

    W, H = 640, 480
    HORIZON = int(H * 0.42)

    img = Image.new("RGB", (W, H))
    draw = ImageDraw.Draw(img)

    # Sky gradient (top → horizon)
    for y in range(HORIZON):
        t = y / HORIZON
        draw.line([(0, y), (W, y)], fill=_lerp_color(sky_top, sky_bot, t))

    # Ground gradient (horizon → bottom)
    for y in range(HORIZON, H):
        t = (y - HORIZON) / (H - HORIZON)
        draw.line([(0, y), (W, y)], fill=_lerp_color(ground_top, ground_bot, t))

    # Texture: random rocky/terrain patches
    for _ in range(rng.randint(180, 280)):
        x = rng.randint(0, W - 1)
        y = rng.randint(HORIZON, H - 1)
        t = (y - HORIZON) / (H - HORIZON)
        base = _lerp_color(ground_top, ground_bot, t)
        brightness = rng.randint(-35, 35)
        color = tuple(max(0, min(255, c + brightness)) for c in base)
        size = rng.randint(3, 18)
        draw.ellipse([x - size, y - size // 2, x + size, y + size // 2], fill=color)

    # Distant ridgeline
    ridge_y = HORIZON - rng.randint(4, 18)
    ridge_col = _lerp_color(ground_top, sky_bot, 0.45)
    pts = []
    x = 0
    y = ridge_y
    while x <= W:
        pts.append((x, y))
        x += rng.randint(15, 40)
        y += rng.randint(-6, 6)
        y = max(HORIZON - 28, min(HORIZON + 5, y))
    pts.append((W, ridge_y))
    if len(pts) >= 2:
        draw.line(pts, fill=ridge_col, width=3)

    # Construction-site specific: add a simple structure outline
    if "construction" in name or "site" in name:
        sx = rng.randint(80, W - 180)
        sy = HORIZON + rng.randint(20, 60)
        sw, sh = rng.randint(80, 150), rng.randint(40, 80)
        wall_color = tuple(max(0, c - 25) for c in ground_top)
        draw.rectangle([sx, sy, sx + sw, sy + sh], outline=wall_color, width=3)
        # Columns
        for cx in range(sx, sx + sw, 25):
            draw.line([(cx, sy), (cx, sy + sh)], fill=wall_color, width=2)

    # Slight blur for realism
    img = img.filter(ImageFilter.GaussianBlur(radius=0.8))

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=82)
    return buf.getvalue()

# ── 30 report definitions ─────────────────────────────────────────────────────
# status: 'pending'|'confirmed'|'approved'|'rejected'|'deletion_requested'
# final_category required whenever status != 'pending'/'rejected'/'deletion_requested'
REPORTS = [
    # ── PENDING — no category assigned yet (field photos just uploaded) ───────
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 31.420, "target_lng": 35.381,
        "user_lat": 31.422,   "user_lng": 35.383,
        "days_ago": 1,  "img": 0,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 32.905, "target_lng": 35.762,
        "user_lat": 32.903,   "user_lng": 35.760,
        "days_ago": 2,  "img": 3,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 30.782, "target_lng": 34.897,
        "user_lat": 30.780,   "user_lng": 34.895,
        "days_ago": 3,  "img": 6,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 32.640, "target_lng": 35.187,
        "user_lat": 32.641,   "user_lng": 35.189,
        "days_ago": 4,  "img": 1,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 31.785, "target_lng": 35.441,
        "user_lat": 31.787,   "user_lng": 35.443,
        "days_ago": 6,  "img": 4,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 31.270, "target_lng": 35.218,
        "user_lat": 31.268,   "user_lng": 35.216,
        "days_ago": 9,  "img": 2,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 32.102, "target_lng": 35.533,
        "user_lat": 32.100,   "user_lng": 35.531,
        "days_ago": 12, "img": 7,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 30.405, "target_lng": 35.108,
        "user_lat": 30.403,   "user_lng": 35.106,
        "days_ago": 15, "img": 5,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 31.525, "target_lng": 35.062,
        "user_lat": 31.523,   "user_lng": 35.060,
        "days_ago": 18, "img": 0,
        "patch": None,
    },
    {
        "description": None,
        "final_category": None,
        "tags": None,
        "target_lat": 32.510, "target_lng": 35.498,
        "user_lat": 32.512,   "user_lng": 35.500,
        "days_ago": 21, "img": 3,
        "patch": None,
    },

    # ── CONFIRMED — coordinator reviewed but awaiting manager ─────────────────
    {
        "description": "בנייה של מבנה בטון ללא היתר בנייה — קירות כבר הוצבו",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": ["פרשיית נגב מזרחי"],
        "target_lat": 30.510, "target_lng": 35.223,
        "user_lat": 30.512,   "user_lng": 35.225,
        "days_ago": 5,  "img": 0,
        "patch": None,
    },
    {
        "description": "עבודות כיסוח נרחבות ויישור שטח להכנת מגרש",
        "final_category": "LAND_GRADING",
        "tags": ["ואדי ערה"],
        "target_lat": 32.523, "target_lng": 35.054,
        "user_lat": 32.521,   "user_lng": 35.052,
        "days_ago": 7,  "img": 1,
        "patch": None,
    },
    {
        "description": "השתלטות על קרקע חקלאית שמורה — חריש ועיבוד ללא רישיון",
        "final_category": "AGRICULTURAL_ENCROACHMENT",
        "tags": ["גולן דרומי"],
        "target_lat": 32.802, "target_lng": 35.748,
        "user_lat": 32.800,   "user_lng": 35.746,
        "days_ago": 10, "img": 4,
        "patch": None,
    },
    {
        "description": "סלילת דרך עפר חדשה לאורך 400 מטר בשטח פתוח",
        "final_category": "ROAD_PAVING",
        "tags": ["בקעת הירדן"],
        "target_lat": 32.100, "target_lng": 35.528,
        "user_lat": 32.098,   "user_lng": 35.526,
        "days_ago": 14, "img": 5,
        "patch": None,
    },
    {
        "description": "השלכת פסולת בניין בשטח ציבורי פתוח — עשרות טונות",
        "final_category": "ILLEGAL_DUMPING",
        "tags": ["ערד", "פסולת בניין"],
        "target_lat": 31.275, "target_lng": 35.205,
        "user_lat": 31.273,   "user_lng": 35.203,
        "days_ago": 16, "img": 7,
        "patch": None,
    },
    {
        "description": "הריסת מבנה ישן מתחת לפיקוח, ופינוי לקראת בנייה חדשה",
        "final_category": "DEMOLITION",
        "tags": ["הר חברון"],
        "target_lat": 31.502, "target_lng": 35.095,
        "user_lat": 31.500,   "user_lng": 35.093,
        "days_ago": 20, "img": 2,
        "patch": None,
    },
    {
        "description": "בנייה של 3 חדרים חדשים על גג מבנה קיים — ללא היתר",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": ["גליל מזרחי", "פרשייה ב"],
        "target_lat": 32.892, "target_lng": 35.775,
        "user_lat": 32.890,   "user_lng": 35.773,
        "days_ago": 25, "img": 0,
        "patch": None,
    },
    {
        "description": "פלישה לשטח שמור ועיבוד קרקע לגינון חקלאי",
        "final_category": "AGRICULTURAL_ENCROACHMENT",
        "tags": ["ים המלח"],
        "target_lat": 31.788, "target_lng": 35.445,
        "user_lat": 31.786,   "user_lng": 35.443,
        "days_ago": 30, "img": 4,
        "patch": None,
    },

    # ── APPROVED — manager confirmed ──────────────────────────────────────────
    {
        "description": "יסודות בטון הונחו על שטח פתוח — בנייה ללא היתר מתקדמת",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": ["נגב מרכזי"],
        "target_lat": 30.795, "target_lng": 34.902,
        "user_lat": 30.793,   "user_lng": 34.900,
        "days_ago": 35, "img": 0,
        "patch": {"status": "approved"},
    },
    {
        "description": "עבודות עפר נרחבות עם כלים כבדים — כ-2 דונם נחרשו",
        "final_category": "LAND_GRADING",
        "tags": ["ערבה", "פרשיית ערבה"],
        "target_lat": 30.408, "target_lng": 35.112,
        "user_lat": 30.406,   "user_lng": 35.110,
        "days_ago": 40, "img": 1,
        "patch": {"status": "approved"},
    },
    {
        "description": "סלילת כביש גישה לא חוקי באורך כ-600 מטר",
        "final_category": "ROAD_PAVING",
        "tags": ["בקעת יזרעאל"],
        "target_lat": 32.652, "target_lng": 35.192,
        "user_lat": 32.650,   "user_lng": 35.190,
        "days_ago": 45, "img": 5,
        "patch": {"status": "approved"},
    },
    {
        "description": "מזבלה פרטית — עשרות שקים של פסולת ביתית ובניין",
        "final_category": "ILLEGAL_DUMPING",
        "tags": ["נגב"],
        "target_lat": 30.530, "target_lng": 35.198,
        "user_lat": 30.528,   "user_lng": 35.196,
        "days_ago": 50, "img": 7,
        "patch": {"status": "approved"},
    },
    {
        "description": "הריסת גדר גבול ישנה ובניית גדר חדשה מחוץ לקו הירוק",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": ["יהודה"],
        "target_lat": 31.618, "target_lng": 35.055,
        "user_lat": 31.616,   "user_lng": 35.053,
        "days_ago": 55, "img": 2,
        "patch": {"status": "approved"},
    },
    {
        "description": "שטח חקלאי שמור הוסב לעיבוד צפוף — מאות עצי זית נטועים",
        "final_category": "AGRICULTURAL_ENCROACHMENT",
        "tags": ["שומרון"],
        "target_lat": 32.215, "target_lng": 35.278,
        "user_lat": 32.213,   "user_lng": 35.276,
        "days_ago": 60, "img": 4,
        "patch": {"status": "approved"},
    },
    {
        "description": "עבודות עפר להרחבת כפר — בולדוזר עובד בשטח B",
        "final_category": "LAND_GRADING",
        "tags": ["בנימין"],
        "target_lat": 31.895, "target_lng": 35.225,
        "user_lat": 31.893,   "user_lng": 35.223,
        "days_ago": 70, "img": 1,
        "patch": {"status": "approved"},
    },
    {
        "description": "הקמת מחסן פח גדול בשטח פתוח ללא כל היתר",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": ["גליל תחתון"],
        "target_lat": 32.698, "target_lng": 35.335,
        "user_lat": 32.696,   "user_lng": 35.333,
        "days_ago": 80, "img": 0,
        "patch": {"status": "approved"},
    },

    # ── REJECTED — false alarm or outside jurisdiction ────────────────────────
    {
        "description": "בנייה לכאורה — נבדק ונמצא שיש היתר בתוקף",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": None,
        "target_lat": 32.072, "target_lng": 34.786,
        "user_lat": 32.070,   "user_lng": 34.784,
        "days_ago": 90, "img": 3,
        "patch": {"status": "rejected"},
    },
    {
        "description": "עבודות חפירה שנראו חשודות — למעשה תשתית מאושרת",
        "final_category": "LAND_GRADING",
        "tags": None,
        "target_lat": 31.901, "target_lng": 34.812,
        "user_lat": 31.899,   "user_lng": 34.810,
        "days_ago": 100, "img": 6,
        "patch": {"status": "rejected"},
    },
    {
        "description": "פסולת שהסתבר שהיא על שטח פרטי עם אישור עירייה",
        "final_category": "ILLEGAL_DUMPING",
        "tags": None,
        "target_lat": 32.320, "target_lng": 34.856,
        "user_lat": 32.318,   "user_lng": 34.854,
        "days_ago": 110, "img": 7,
        "patch": {"status": "rejected"},
    },

    # ── DELETION_REQUESTED ────────────────────────────────────────────────────
    {
        "description": "תיעוד שגוי — המיקום לא מדויק, יש לבדוק מחדש",
        "final_category": "ILLEGAL_CONSTRUCTION",
        "tags": None,
        "target_lat": 31.352, "target_lng": 35.302,
        "user_lat": 31.350,   "user_lng": 35.300,
        "days_ago": 45, "img": 2,
        "patch": {"status": "deletion_requested"},
    },
]

assert len(REPORTS) == 30, f"Expected 30 reports, got {len(REPORTS)}"


# ── Helpers ───────────────────────────────────────────────────────────────────

def build_image(palette_idx: int, filename: str) -> Path:
    dest = IMAGE_CACHE / filename
    if dest.exists():
        return dest
    name = LANDSCAPES[palette_idx][0]
    print(f"  ✎ Generating {filename} ({name}) ...", end="", flush=True)
    data = generate_landscape_image(palette_idx)
    dest.write_bytes(data)
    print(f" {len(data)//1024} KB ✓")
    return dest


def warm_up(client: httpx.Client, attempts: int = 6) -> None:
    """Ping /health until the server responds, waking idle free-tier dynos."""
    import time

    for n in range(1, attempts + 1):
        try:
            r = client.get("/health", timeout=60)
            if r.status_code == 200:
                print("  Server is awake.")
                return
        except httpx.HTTPError:
            pass
        print(f"  Waiting for server to wake ({n}/{attempts})…")
        time.sleep(5)
    print("  Proceeding anyway — server may still be starting.")


def login(client: httpx.Client, email: str, password: str) -> str:
    r = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    if r.status_code != 200:
        sys.exit(f"Login failed ({r.status_code}): {r.text}")
    token = r.json()["access_token"]
    print(f"  Logged in as {email}")
    return token


def submit_report(
    client: httpx.Client, token: str, r_def: dict, image_path: Path
) -> str:
    now = datetime.now(tz=timezone.utc) - timedelta(days=r_def["days_ago"])

    # Regular form fields go in `data`; only the binary file goes in `files`.
    data: dict[str, str] = {
        "target_lat":  str(r_def["target_lat"]),
        "target_lng":  str(r_def["target_lng"]),
        "user_lat":    str(r_def["user_lat"]),
        "user_lng":    str(r_def["user_lng"]),
        "observed_at": now.isoformat(),
    }
    if r_def["description"]:
        data["description"]    = r_def["description"]
    if r_def["final_category"]:
        data["final_category"] = r_def["final_category"]
    if r_def["tags"]:
        data["tags"]           = json.dumps(r_def["tags"])

    files = {"file": (image_path.name, image_path.read_bytes(), "image/jpeg")}

    resp = client.post(
        "/api/v1/reports/submit",
        headers={"Authorization": f"Bearer {token}"},
        files=files,
        data=data,
        timeout=30,
    )
    if resp.status_code != 201:
        raise RuntimeError(f"submit failed {resp.status_code}: {resp.text}")
    return resp.json()["id"]


def patch_report(client: httpx.Client, token: str, report_id: str, patch: dict) -> None:
    resp = client.patch(
        f"/api/v1/reports/{report_id}",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        content=json.dumps(patch),
        timeout=10,
    )
    if resp.status_code != 200:
        raise RuntimeError(f"patch failed {resp.status_code}: {resp.text}")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Regavim with sample reports")
    parser.add_argument("--email",    default="admin@regavim.org")
    parser.add_argument("--password", default=None)
    parser.add_argument("--api",      default=API_BASE)
    args = parser.parse_args()

    if not args.password:
        import getpass
        args.password = getpass.getpass(f"Password for {args.email}: ")

    print("\n── Step 1: Generate landscape images ────────────────────────")
    images: list[Path] = []
    for idx, (seed, name) in enumerate(IMAGE_SEEDS):
        images.append(build_image(idx, name))

    print("\n── Step 2: Authenticate ─────────────────────────────────────")
    # Generous timeout — free hosting tiers (e.g. Render) spin down when idle
    # and can take ~50s to wake on the first request.
    with httpx.Client(base_url=args.api, timeout=60) as client:
        warm_up(client)
        token = login(client, args.email, args.password)

        print("\n── Step 3: Submit reports ───────────────────────────────────")
        submitted = 0
        for i, r_def in enumerate(REPORTS, start=1):
            img_path = images[r_def["img"]]
            label = r_def["final_category"] or "PENDING"
            patch = r_def["patch"]
            final_status = (patch or {}).get("status", "confirmed" if r_def["final_category"] else "pending")

            report_id = submit_report(client, token, r_def, img_path)

            if patch:
                patch_report(client, token, report_id, patch)

            submitted += 1
            print(
                f"  [{i:02d}/30] {final_status:20s}  {label:30s}  "
                f"({r_def['target_lat']:.3f}, {r_def['target_lng']:.3f})"
            )

    print(f"\n✓ Seeded {submitted} reports successfully.")


if __name__ == "__main__":
    main()
