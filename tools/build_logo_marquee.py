#!/usr/bin/env python3
"""Normalise the raw brand assets in /logos into the monochrome set used by the
credential marquee in /assets/logos.

Design goals
------------
* One family. Only four neutral greys, no brand colour, transparent background,
  tight content box, sensible intrinsic dimensions.
* Still recognisable. Painting every logo in a *single* ink collapses
  Microsoft's four squares into one block and erases the internal contrast of
  Amazon, PMI and The Linux Foundation. Instead each distinct source colour is
  mapped to a different step of a grey ramp, ordered by luminance: dark source
  ink becomes the brightest grey (these assets were drawn for white paper, this
  page is dark), lighter accents step down. Raster assets get the same inverted
  tone curve, continuously sampled so anti-aliased edges survive.

SVG  - paint attributes, <style> rules and gradient stops are rewritten to the
       ramp. <defs> (clip paths, masks) are geometry and stay untouched.
       width/height are added when the source only carries a viewBox.
PNG  - the authored alpha channel is kept exactly (it carries the shape and the
       soft edges), RGB is replaced by a grey derived from source luminance,
       transparent margins are trimmed and oversized masters are downscaled.

Idempotent: re-running produces byte-identical output.

Usage::

    python tools/build_logo_marquee.py            # write assets/logos
    python tools/build_logo_marquee.py --check    # verify only, write nothing
"""

from __future__ import annotations

import argparse
import io
import re
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIR = ROOT / "logos"
TARGET_DIR = ROOT / "assets" / "logos"

# Apple's dark-UI greys, brightest first. Shared by the SVG ramp and, as a
# tone range, by the raster curve. The tiny blue cast matches --color-text etc.
RAMP = ("#F5F5F7", "#D2D2D7", "#AEAEB2", "#8E8E93")
RAMP_RGB = tuple(tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) for c in RAMP)
INK_MAX = RAMP_RGB[0][0]      # 245
INK_MIN = RAMP_RGB[-1][0]     # 142

# Logos are shown at ~30 CSS px, so 128 px of height is >4x density.
MAX_RASTER_HEIGHT = 128

NAMES = {
    "ai-research-institute-suat": "AI Research Institute of Shenzhen University of Advanced Technology",
    "amazon": "Amazon",
    "cariad": "CARIAD",
    "github": "GitHub",
    "linkedin": "LinkedIn",
    "linux-foundation": "The Linux Foundation",
    "microsoft": "Microsoft",
    "pforzheim-university": "Pforzheim University",
    "project-management-institute": "Project Management Institute",
}


# --------------------------------------------------------------------------- #
# Colour helpers
# --------------------------------------------------------------------------- #
_HEX = re.compile(r"^#([0-9a-f]{3}|[0-9a-f]{6})$", re.IGNORECASE)
_RGB = re.compile(r"^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$", re.IGNORECASE)


def parse_color(value: str):
    """Return an RGB triple, or None for a paint that must survive unchanged."""
    v = value.strip().lower()
    if not v or v in {"none", "transparent", "currentcolor", "inherit"} or v.startswith("url("):
        return None
    if v == "white":
        return (255, 255, 255)
    if v == "black":
        return (0, 0, 0)
    match = _HEX.match(v)
    if match:
        digits = match.group(1)
        if len(digits) == 3:
            digits = "".join(c * 2 for c in digits)
        return tuple(int(digits[i:i + 2], 16) for i in (0, 2, 4))
    match = _RGB.match(v)
    if match:
        return tuple(int(part) for part in match.groups())
    # Unknown paint server: treat it as ink rather than dropping the shape.
    return (0, 0, 0)


def luminance(rgb) -> float:
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255.0


def rank_key(rgb) -> float:
    """White is the exception to the inversion rule.

    An "inverse" asset (the official white Amazon wordmark) was authored for a
    dark ground already, so its white ink has to stay the *brightest* grey.
    Everything else is inverted: dark ink -> bright grey, light accent -> dim
    grey. Sorting on this key also keeps multi-colour marks such as Microsoft's
    four squares on four clearly different ramp steps.
    """
    if min(rgb) >= 245:
        return -1.0
    return luminance(rgb)


def is_grey(rgb) -> bool:
    # Apple's greys carry a deliberate 3-5 step blue cast (e.g. #D2D2D7).
    return max(rgb) - min(rgb) <= 8


def iter_pixels(image):
    """Pillow >= 12 renamed getdata(); keep the build usable on older ones."""
    getter = getattr(image, "get_flattened_data", None)
    return getter() if getter else image.getdata()


# --------------------------------------------------------------------------- #
# SVG
# --------------------------------------------------------------------------- #
_PAINT_ATTR = re.compile(r'\b(fill|stroke|stop-color|flood-color)="([^"]*)"')
_STYLE_PAINT = re.compile(r"(fill|stroke|stop-color|flood-color)\s*:\s*([^;}\s]+)")
_SVG_TAG = re.compile(r"<svg\b[^>]*>", re.IGNORECASE | re.DOTALL)
_VIEWBOX = re.compile(r'viewBox="([^"]+)"', re.IGNORECASE)
_DEFS = re.compile(r"<defs\b.*?</defs>", re.IGNORECASE | re.DOTALL)
_WIDTH = re.compile(r'(?<![-\w])width="([\d.]+)"', re.IGNORECASE)
_HEIGHT = re.compile(r'(?<![-\w])height="([\d.]+)"', re.IGNORECASE)


def split_defs(markup: str):
    """Yield (fragment, paintable) pairs; <defs> hold geometry, not paint."""
    parts = []
    pos = 0
    for match in _DEFS.finditer(markup):
        if match.start() > pos:
            parts.append((markup[pos:match.start()], True))
        parts.append((match.group(0), False))
        pos = match.end()
    if pos < len(markup):
        parts.append((markup[pos:], True))
    return parts


def collect_colors(fragments) -> set:
    colors = set()
    for fragment in fragments:
        for match in _PAINT_ATTR.finditer(fragment):
            rgb = parse_color(match.group(2))
            if rgb is not None:
                colors.add(rgb)
        for match in _STYLE_PAINT.finditer(fragment):
            rgb = parse_color(match.group(2))
            if rgb is not None:
                colors.add(rgb)
    return colors


def build_mapping(colors) -> dict:
    ordered = sorted(colors, key=lambda c: (rank_key(c), c))
    return {rgb: RAMP[min(index, len(RAMP) - 1)] for index, rgb in enumerate(ordered)}


def repaint(fragment: str, mapping: dict) -> str:
    def attr_sub(match: re.Match[str]) -> str:
        rgb = parse_color(match.group(2))
        if rgb is None:
            return match.group(0)
        return f'{match.group(1)}="{mapping.get(rgb, RAMP[0])}"'

    def style_sub(match: re.Match[str]) -> str:
        rgb = parse_color(match.group(2))
        if rgb is None:
            return match.group(0)
        return f"{match.group(1)}:{mapping.get(rgb, RAMP[0])}"

    fragment = _PAINT_ATTR.sub(attr_sub, fragment)
    return _STYLE_PAINT.sub(style_sub, fragment)


def ensure_size(markup: str) -> str:
    """Add width/height derived from the viewBox when the source lacks them."""
    tag_match = _SVG_TAG.search(markup)
    if not tag_match:
        return markup
    tag = tag_match.group(0)
    if _WIDTH.search(tag) and _HEIGHT.search(tag):
        return markup
    viewbox = _VIEWBOX.search(tag)
    if not viewbox:
        return markup
    try:
        _, _, width, height = (float(part) for part in viewbox.group(1).split())
    except ValueError:
        return markup

    additions = ""
    if not _WIDTH.search(tag):
        additions += f' width="{width:g}"'
    if not _HEIGHT.search(tag):
        additions += f' height="{height:g}"'
    if not additions:
        return markup
    sized = tag[:-1].rstrip() + additions + ">"
    return markup.replace(tag, sized, 1)


def render_svg(source: Path):
    parts = split_defs(source.read_text(encoding="utf-8"))
    mapping = build_mapping(collect_colors([text for text, paintable in parts if paintable]))
    markup = "".join(repaint(text, mapping) if paintable else text for text, paintable in parts)
    markup = ensure_size(markup)
    if not markup.endswith("\n"):
        markup += "\n"

    tag = _SVG_TAG.search(markup)
    width_match = _WIDTH.search(tag.group(0)) if tag else None
    height_match = _HEIGHT.search(tag.group(0)) if tag else None
    if width_match and height_match:
        width, height = int(float(width_match.group(1))), int(float(height_match.group(1)))
    else:
        viewbox = _VIEWBOX.search(tag.group(0)) if tag else None
        if viewbox:
            _, _, width, height = (int(float(p)) for p in viewbox.group(1).split())
        else:
            width, height = 0, 0
    return markup.encode("utf-8"), width, height


# --------------------------------------------------------------------------- #
# PNG
# --------------------------------------------------------------------------- #
def render_png(source: Path):
    with Image.open(source) as image:
        rgba = image.convert("RGBA")

    # Trim fully transparent margins so every logo sits tight in its box.
    alpha = rgba.getchannel("A")
    box = alpha.point(lambda a: 255 if a > 8 else 0).getbbox()
    if box:
        rgba = rgba.crop(box)

    if rgba.height > MAX_RASTER_HEIGHT:
        scale = MAX_RASTER_HEIGHT / rgba.height
        rgba = rgba.resize(
            (max(1, round(rgba.width * scale)), MAX_RASTER_HEIGHT),
            Image.LANCZOS,
        )

    # Keep the authored alpha (shape + anti-aliasing), replace colour with a
    # grey on the same inverted tone curve the SVG ramp uses.
    pixels = rgba.load()
    for y in range(rgba.height):
        for x in range(rgba.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                pixels[x, y] = (INK_MAX, INK_MAX, INK_MAX, 0)
                continue
            grey = round(INK_MAX - (INK_MAX - INK_MIN) * luminance((r, g, b)))
            pixels[x, y] = (grey, grey, grey, a)

    buffer = io.BytesIO()
    rgba.save(buffer, "PNG", optimize=True)
    return buffer.getvalue(), rgba.width, rgba.height


# --------------------------------------------------------------------------- #
def render(source: Path):
    if source.suffix.lower() == ".svg":
        return render_svg(source)
    return render_png(source)


def verify(rows, payloads: dict) -> list[str]:
    """Assert the published set really is homogeneous, transparent and complete."""
    failures: list[str] = []
    expected = set(NAMES)
    produced = {stem for stem, *_ in rows}
    missing = expected - produced
    extra = produced - expected
    if missing:
        failures.append(f"missing logos: {sorted(missing)}")
    if extra:
        failures.append(f"unexpected logos: {sorted(extra)}")

    for stem, kind, width, height, size in rows:
        data = payloads.get(f"{stem}.{kind}", b"")
        if width <= 0 or height <= 0:
            failures.append(f"{stem}.{kind}: bad intrinsic size {width}x{height}")
        if not data:
            failures.append(f"{stem}.{kind}: empty output")
            continue
        if size != len(data):
            failures.append(f"{stem}.{kind}: byte count mismatch")

        if kind == "png":
            with Image.open(io.BytesIO(data)) as image:
                rgba = image.convert("RGBA")
            alpha_min, alpha_max = rgba.getchannel("A").getextrema()
            if alpha_min != 0:
                failures.append(f"{stem}.png: no transparent pixels left")
            if alpha_max < 255:
                failures.append(f"{stem}.png: no opaque pixels left")
            for pixel in iter_pixels(rgba):
                if pixel[3] > 0 and not is_grey(pixel[:3]):
                    failures.append(f"{stem}.png: non-grey pixel {pixel[:3]}")
                    break
        else:
            text = data.decode("utf-8")
            body = "".join(fragment for fragment, paintable in split_defs(text) if paintable)
            for value in re.findall(r'(?:fill|stroke|stop-color|flood-color)="([^"]+)"', body):
                rgb = parse_color(value)
                if rgb is not None and not is_grey(rgb):
                    failures.append(f"{stem}.svg: brand colour left {value}")
                    break
            for value in re.findall(r"(?:fill|stroke|stop-color|flood-color)\s*:\s*([^;}\s]+)", body):
                rgb = parse_color(value)
                if rgb is not None and not is_grey(rgb):
                    failures.append(f"{stem}.svg: brand colour left {value}")
                    break
            tag = _SVG_TAG.search(text)
            if not tag or not (_WIDTH.search(tag.group(0)) and _HEIGHT.search(tag.group(0))):
                failures.append(f"{stem}.svg: missing intrinsic width/height")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true",
                        help="verify the published assets instead of writing them")
    args = parser.parse_args()

    sources = sorted(p for p in SOURCE_DIR.iterdir()
                     if p.suffix.lower() in {".svg", ".png"})
    if not sources:
        print(f"no source logos found in {SOURCE_DIR}", file=sys.stderr)
        return 1

    rows = []
    payloads = {}
    for source in sources:
        data, width, height = render(source)
        name = source.name
        payloads[name] = data
        rows.append((source.stem, source.suffix.lstrip(".").lower(), width, height, len(data)))

    header = f"{'logo':32} {'type':5} {'w':>5} {'h':>5} {'bytes':>8}"
    print(header)
    print("-" * len(header))
    for stem, kind, width, height, size in rows:
        print(f"{stem:32} {kind:5} {width:5d} {height:5d} {size:8d}")

    if args.check:
        for name, data in payloads.items():
            path = TARGET_DIR / name
            if not path.exists():
                print(f"FAILED: {name} not published", file=sys.stderr)
                return 1
            if path.read_bytes() != data:
                print(f"FAILED: {name} is stale; run the build again", file=sys.stderr)
                return 1
        print("\nPublished logos match the sources: monochrome, transparent, stable.")
    else:
        TARGET_DIR.mkdir(parents=True, exist_ok=True)
        for name, data in payloads.items():
            (TARGET_DIR / name).write_bytes(data)
        stale = {p.name for p in TARGET_DIR.iterdir() if p.is_file()} - set(payloads)
        if stale:
            print(f"removed stale assets: {sorted(stale)}")
            for name in stale:
                (TARGET_DIR / name).unlink()
        print(f"\nWrote {len(payloads)} logos to {TARGET_DIR}")

    failures = verify(rows, payloads)
    if failures:
        print("\nFAILED:", file=sys.stderr)
        for failure in failures:
            print(f"  - {failure}", file=sys.stderr)
        return 1
    print("All generated logos are grey, transparent and recognisably separated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
