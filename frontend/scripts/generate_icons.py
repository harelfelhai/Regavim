#!/usr/bin/env python3
"""
Generate the Regavim PWA icon set.

Brand mark: a white map-pin (location/monitoring) standing over two layered
terrain ridges (רגבים = clods of earth / land) on the brand-blue gradient.

Outputs into frontend/public/:
  icon-192.png            192x192  rounded, transparent corners   (purpose: any)
  icon-512.png            512x512  rounded, transparent corners   (purpose: any)
  icon-maskable-512.png   512x512  full-bleed, content in safe-zone (maskable)
  apple-touch-icon.png    180x180  full square, opaque (iOS rounds it itself)

Run:  python frontend/scripts/generate_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

PUBLIC = Path(__file__).resolve().parent.parent / "public"

# Brand palette
BLUE_TOP = (37, 99, 235)    # #2563eb  regavim-blue
BLUE_BOT = (30, 58, 138)    # #1e3a8a  blue-900 / navy
WHITE = (255, 255, 255)

SS = 4  # supersample factor for crisp edges


def _vertical_gradient(size: int, top: tuple, bot: tuple) -> Image.Image:
    grad = Image.new("RGB", (1, size))
    for y in range(size):
        t = y / max(1, size - 1)
        grad.putpixel(
            (0, y),
            tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)),
        )
    return grad.resize((size, size))


def _draw_terrain(draw: ImageDraw.ImageDraw, cx: int, base_y: int, span: int) -> None:
    """Two soft translucent ridges along the lower content area."""
    # Far ridge (lighter)
    far = [
        (cx - span, base_y - int(span * 0.06)),
        (cx - int(span * 0.45), base_y - int(span * 0.34)),
        (cx + int(span * 0.10), base_y - int(span * 0.10)),
        (cx + int(span * 0.55), base_y - int(span * 0.30)),
        (cx + span, base_y - int(span * 0.05)),
        (cx + span, base_y + span),
        (cx - span, base_y + span),
    ]
    draw.polygon(far, fill=(255, 255, 255, 70))
    # Near ridge (stronger)
    near = [
        (cx - span, base_y + int(span * 0.16)),
        (cx - int(span * 0.30), base_y - int(span * 0.12)),
        (cx + int(span * 0.30), base_y + int(span * 0.10)),
        (cx + int(span * 0.72), base_y - int(span * 0.08)),
        (cx + span, base_y + int(span * 0.14)),
        (cx + span, base_y + span),
        (cx - span, base_y + span),
    ]
    draw.polygon(near, fill=(255, 255, 255, 120))


def _draw_pin(draw: ImageDraw.ImageDraw, cx: int, top_y: int, height: int) -> None:
    """Classic map-pin: round head + tapered point, with a hole in the head."""
    head_r = int(height * 0.30)
    head_cy = top_y + head_r
    # Head circle
    draw.ellipse(
        [cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r],
        fill=WHITE,
    )
    # Tapered point down to the tip
    tip_y = top_y + height
    spread = int(head_r * 0.78)
    draw.polygon(
        [
            (cx - spread, head_cy + int(head_r * 0.55)),
            (cx + spread, head_cy + int(head_r * 0.55)),
            (cx, tip_y),
        ],
        fill=WHITE,
    )
    # Hole (shows the gradient through the head)
    hole_r = int(head_r * 0.42)
    draw.ellipse(
        [cx - hole_r, head_cy - hole_r, cx + hole_r, head_cy + hole_r],
        fill=(0, 0, 0, 0),
    )


def build_icon(size: int, *, maskable: bool, rounded: bool) -> Image.Image:
    """Render one icon at the requested pixel size."""
    s = size * SS
    # Background gradient (full-bleed)
    bg = _vertical_gradient(s, BLUE_TOP, BLUE_BOT).convert("RGBA")

    # Content occupies a smaller central region for maskable (safe zone),
    # larger otherwise.
    content = 0.62 if maskable else 0.78
    cx = s // 2
    span = int(s * content / 2)

    # Layer for translucent terrain so alpha blends onto the gradient.
    overlay = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    odraw = ImageDraw.Draw(overlay)
    terrain_base = int(s * (0.50 if maskable else 0.56))
    _draw_terrain(odraw, cx, terrain_base, span)
    bg = Image.alpha_composite(bg, overlay)

    # Pin (punch a transparent hole, then refill the hole with gradient so the
    # head shows the background through it).
    pin_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    pdraw = ImageDraw.Draw(pin_layer)
    pin_h = int(s * (0.46 if maskable else 0.54))
    pin_top = int(s * (0.18 if maskable else 0.14))
    _draw_pin(pdraw, cx, pin_top, pin_h)
    # Composite the white pin, then re-stamp the gradient into the hole.
    bg = Image.alpha_composite(bg, pin_layer)
    # Re-draw the hole as gradient: take a circular crop of the bg gradient.
    head_r = int(pin_h * 0.30)
    head_cy = pin_top + head_r
    hole_r = int(head_r * 0.42)
    grad_full = _vertical_gradient(s, BLUE_TOP, BLUE_BOT).convert("RGBA")
    hole_mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(hole_mask).ellipse(
        [cx - hole_r, head_cy - hole_r, cx + hole_r, head_cy + hole_r], fill=255
    )
    bg = Image.composite(grad_full, bg, hole_mask)

    out = bg.resize((size, size), Image.LANCZOS)

    if rounded:
        # Rounded square with transparent corners (iOS-style radius ~22%).
        radius = int(size * 0.22)
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=radius, fill=255
        )
        result = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        result.paste(out, (0, 0), mask)
        return result

    return out.convert("RGB")  # opaque square (maskable / apple-touch)


def main() -> None:
    targets = [
        ("icon-192.png", 192, dict(maskable=False, rounded=True)),
        ("icon-512.png", 512, dict(maskable=False, rounded=True)),
        ("icon-maskable-512.png", 512, dict(maskable=True, rounded=False)),
        ("apple-touch-icon.png", 180, dict(maskable=False, rounded=False)),
    ]
    PUBLIC.mkdir(exist_ok=True)
    for name, size, opts in targets:
        img = build_icon(size, **opts)
        dest = PUBLIC / name
        img.save(dest, format="PNG")
        print(f"  ✓ {name:24s} {size}x{size}  {dest.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
