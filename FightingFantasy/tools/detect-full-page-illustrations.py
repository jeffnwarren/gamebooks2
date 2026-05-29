from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import fitz
from PIL import Image


def load_gamebook_data(project: Path) -> dict:
    data_path = project / "playable" / "book-data.js"
    text = data_path.read_text(encoding="utf-8")
    match = re.search(r"window\.GAMEBOOK_DATA\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise ValueError(f"Could not read gamebook data from {data_path}")
    return json.loads(match.group(1))


def crop_content(image: Image.Image) -> Image.Image:
    width, height = image.size
    margin_x = int(width * 0.055)
    margin_y = int(height * 0.045)
    return image.crop((margin_x, margin_y, width - margin_x, height - margin_y))


def percentile_from_histogram(histogram: list[int], percentile: float) -> int:
    total = sum(histogram)
    if total <= 0:
        return 255
    target = total * percentile
    running = 0
    for value, count in enumerate(histogram):
        running += count
        if running >= target:
            return value
    return 255


def adaptive_thresholds(image: Image.Image) -> tuple[int, int]:
    histogram = image.histogram()
    background = percentile_from_histogram(histogram, 0.90)
    dark = max(25, min(230, background - 38))
    very_dark = max(15, min(dark - 20, background - 105))
    return dark, very_dark


def dark_fraction(image: Image.Image, threshold: int) -> float:
    histogram = image.histogram()
    total = image.size[0] * image.size[1]
    return sum(histogram[:threshold]) / total if total else 0.0


def grid_coverage(image: Image.Image, threshold: int, cols: int = 12, rows: int = 18) -> float:
    width, height = image.size
    active = 0
    for row in range(rows):
        y0 = round(row * height / rows)
        y1 = round((row + 1) * height / rows)
        for col in range(cols):
            x0 = round(col * width / cols)
            x1 = round((col + 1) * width / cols)
            cell = image.crop((x0, y0, x1, y1))
            if dark_fraction(cell, threshold) >= 0.035:
                active += 1
    return active / (cols * rows)


def analyze_half(image: Image.Image) -> dict:
    content = crop_content(image.convert("L"))
    dark_threshold, very_dark_threshold = adaptive_thresholds(content)
    ink = dark_fraction(content, dark_threshold)
    very_dark = dark_fraction(content, very_dark_threshold)
    coverage = grid_coverage(content, dark_threshold)
    score = (ink * 2.8) + (very_dark * 1.4) + (coverage * 0.65)
    likely = (ink >= 0.38 and coverage >= 0.55) or (ink >= 0.32 and very_dark >= 0.24 and coverage >= 0.50)
    return {
        "inkCoverage": round(ink, 4),
        "veryDarkCoverage": round(very_dark, 4),
        "gridCoverage": round(coverage, 4),
        "darkThreshold": dark_threshold,
        "score": round(score, 4),
        "likelyFullPage": likely,
    }


def render_page(page: fitz.Page, dpi: int) -> Image.Image:
    matrix = fitz.Matrix(dpi / 72, dpi / 72)
    pixmap = page.get_pixmap(matrix=matrix, colorspace=fitz.csGRAY, alpha=False)
    return Image.frombytes("L", (pixmap.width, pixmap.height), pixmap.samples)


def detect(project: Path, dpi: int) -> dict:
    data = load_gamebook_data(project)
    playable_dir = project / "playable"
    pdf_path = (playable_dir / data["sourcePdf"]).resolve()
    document = fitz.open(pdf_path)
    section_pages = [
        section.get("page")
        for section in (data.get("sections") or {}).values()
        if isinstance(section.get("page"), int)
    ]
    first_section_page = min(section_pages) if section_pages else 1

    candidates = []
    for page_index, page in enumerate(document, start=1):
        if page_index < first_section_page:
            continue
        image = render_page(page, dpi)
        width, height = image.size
        halves = {
            "L": image.crop((0, 0, width // 2, height)),
            "R": image.crop((width // 2, 0, width, height)),
        }
        for half, half_image in halves.items():
            analysis = analyze_half(half_image)
            if analysis["likelyFullPage"]:
                candidates.append({"pdfPage": page_index, "half": half, **analysis})

    return {
        "title": data.get("title"),
        "sourcePdf": data.get("sourcePdf"),
        "coverImage": data.get("coverImage"),
        "policy": "covers-and-full-page-illustrations-only",
        "dpi": dpi,
        "firstSectionPdfPage": first_section_page,
        "fullPageIllustrations": candidates,
    }


def extract_images(project: Path, manifest: dict, dpi: int, output_dir: Path) -> None:
    playable_dir = project / "playable"
    pdf_path = (playable_dir / manifest["sourcePdf"]).resolve()
    document = fitz.open(pdf_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    for item in manifest["fullPageIllustrations"]:
        page = document[item["pdfPage"] - 1]
        image = render_page(page, dpi)
        width, height = image.size
        if item["half"] == "L":
            half_image = image.crop((0, 0, width // 2, height))
        else:
            half_image = image.crop((width // 2, 0, width, height))
        name = f"pdf-page-{item['pdfPage']:03d}-{item['half'].lower()}.jpg"
        half_image.save(output_dir / name, quality=92)
        item["image"] = str((output_dir / name).relative_to(playable_dir)).replace("\\", "/")


def carry_over_sections(project: Path, manifest: dict) -> None:
    """Preserve the curated `section` (passage the illustration depicts) across
    regenerations. The detector derives geometry only; the passage mapping is hand-
    curated against the source PDF, so merge it back by (pdfPage, half)."""
    existing_path = project / "playable" / "illustrations.json"
    if not existing_path.exists():
        return
    try:
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return
    sections = {
        (item.get("pdfPage"), item.get("half")): item.get("section")
        for item in existing.get("fullPageIllustrations", [])
        if isinstance(item.get("section"), int)
    }
    for item in manifest["fullPageIllustrations"]:
        mapped = sections.get((item["pdfPage"], item["half"]))
        if isinstance(mapped, int):
            item["section"] = mapped


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect full-page illustration halves in a scanned gamebook PDF.")
    parser.add_argument("project", nargs="?", default=".", help="Project root containing playable/book-data.js")
    parser.add_argument("--dpi", type=int, default=110)
    parser.add_argument("--write", action="store_true", help="Write playable/illustrations.json")
    parser.add_argument("--extract", action="store_true", help="Extract detected illustration halves as JPEG files")
    parser.add_argument("--summary", action="store_true", help="Print only the detected locations and count")
    args = parser.parse_args()

    project = Path(args.project).resolve()
    manifest = detect(project, args.dpi)
    carry_over_sections(project, manifest)

    if args.extract:
        extract_images(project, manifest, args.dpi, project / "playable" / "illustrations")

    if args.write:
        out_path = project / "playable" / "illustrations.json"
        out_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    if args.summary:
        print(json.dumps({
            "title": manifest["title"],
            "policy": manifest["policy"],
            "count": len(manifest["fullPageIllustrations"]),
            "fullPageIllustrations": manifest["fullPageIllustrations"],
        }, indent=2))
    else:
        print(json.dumps(manifest, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
