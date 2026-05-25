from __future__ import annotations

import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import fitz
import pytesseract
from PIL import Image, ImageFilter, ImageOps


ROOT = Path(__file__).resolve().parents[1]
PDF_PATH = ROOT / "source" / "altered FF20 Sword of the Samurai OCR.pdf"
OUT_DIR = ROOT / "playable"
OCR_DIR = ROOT / "tools" / "ocr-cache"
TESSERACT = Path(r"C:\Program Files\Tesseract-OCR\tesseract.exe")
MAX_SECTION = 400
FIRST_SECTION_MIN_PAGE = 8


@dataclass
class OcrLine:
    text: str
    x0: int
    y0: int
    x1: int
    y1: int
    page: int
    half: str


def clean_text(value: str) -> str:
    replacements = {
        "‘": "'",
        "’": "'",
        "“": '"',
        "”": '"',
        "–": "-",
        "—": "-",
        " ": " ",
        "~": "-",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def clean_line(value: str) -> str:
    value = clean_text(value)
    value = re.sub(r"^[|_\\/\[\]{}():;.,\s]+", "", value)
    value = re.sub(r"[|_\\/\[\]{}():;.,\s]+$", "", value)
    value = value.replace("$TAMINA", "STAMINA")
    value = value.replace("sTaMINA", "STAMINA")
    value = value.replace("sTAMINA", "STAMINA")
    value = value.replace("sKILL", "SKILL")
    value = value.replace("sKiLL", "SKILL")
    value = value.replace("HoNoUR", "HONOUR")
    value = value.replace("HoNOUR", "HONOUR")
    return value.strip()


def digit_candidates(token: str) -> set[int]:
    value = token.strip()
    value = re.sub(r"^[^0-9A-Za-z=&|!]+|[^0-9A-Za-z=&|!]+$", "", value)
    if not value or len(value) > 5:
        return set()
    if re.search(r"[/-]", value):
        return set()

    mapping = {
        "0": ["0"],
        "1": ["1"],
        "2": ["2"],
        "3": ["3"],
        "4": ["4"],
        "5": ["5"],
        "6": ["6"],
        "7": ["7", "1"],
        "8": ["8"],
        "9": ["9"],
        "O": ["0"],
        "o": ["0"],
        "Q": ["0"],
        "I": ["1"],
        "l": ["1"],
        "i": ["1"],
        "T": ["1", "7"],
        "t": ["1"],
        "|": ["1"],
        "!": ["1"],
        "Z": ["2"],
        "z": ["2"],
        "A": ["4"],
        "S": ["5"],
        "s": ["5"],
        "&": ["8"],
        "b": ["6"],
        "B": ["8"],
        "G": ["6"],
        "g": ["9"],
        "q": ["9"],
        "v": ["7"],
        "V": ["7"],
        "=": ["2"],
    }

    states = [""]
    for char in value:
        options = mapping.get(char)
        if not options:
            return set()
        states = [state + option for state in states for option in options]

    result: set[int] = set()
    for state in states:
        state = re.sub(r"00+", "0", state)
        if not state:
            continue
        number = int(state)
        if 1 <= number <= MAX_SECTION:
            result.add(number)
    return result


def parse_range(line: str, expected: int) -> tuple[int, int] | None:
    value = clean_line(line)
    match = re.search(r"([0-9OIlSBAgqTtZz&bvV!|]{1,4})\s*[-:=]\s*([0-9OIlSBAgqTtZz&bvV!|]{1,4})", value)
    if not match:
        return None

    left = digit_candidates(match.group(1))
    right = digit_candidates(match.group(2))
    if not left or not right:
        return None

    pairs = [
        (start, end)
        for start in left
        for end in right
        if start <= end and end - start <= 12 and abs(start - expected) <= 15
    ]
    if not pairs:
        pairs = [(start, end) for start in left for end in right if start <= end and end - start <= 12]
    if not pairs:
        return None
    return min(pairs, key=lambda pair: (abs(pair[0] - expected), pair[1] - pair[0]))


def likely_marker(line: OcrLine, expected: int, width: int) -> bool:
    text = clean_line(line.text)
    if not text:
        return False

    numbers = [int(item) for item in re.findall(r"\d{1,3}", text)]
    letters = re.sub(r"[^A-Za-z]+", "", text)
    if expected in numbers and len(text) <= 14 and len(letters) <= 2:
        return True

    if len(text) > 5:
        return False

    if expected in digit_candidates(text):
        return True

    if line.half == "C":
        candidates = digit_candidates(text) | ({1} if text in "iIlTt|!" else set())
        return expected in candidates

    center = (line.x0 + line.x1) / 2
    centered = abs(center - (width / 2)) < width * 0.08
    if not centered:
        return False
    if not re.fullmatch(r"[A-Za-z&!|=]", text):
        return False
    candidates = digit_candidates(text) | ({1} if text in "iIlTt|!" else set())
    return expected in candidates


def marker_numbers(line: OcrLine) -> set[int]:
    text = clean_line(line.text)
    if not text or len(text) > 14:
        return set()
    letters = re.sub(r"[^A-Za-z]+", "", text)
    if len(letters) > 2:
        return set()
    values = {int(item) for item in re.findall(r"\d{1,3}", text)}
    values |= digit_candidates(text)
    return {value for value in values if 1 <= value <= MAX_SECTION}


def preprocess(image: Image.Image) -> Image.Image:
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.MedianFilter(size=3))
    image = image.filter(ImageFilter.SHARPEN)
    return image


def ocr_image(image: Image.Image, page: int, half: str, psm: int = 3) -> list[OcrLine]:
    data = pytesseract.image_to_data(
        image,
        lang="eng",
        config=f"--psm {psm} --oem 1 -c tessedit_char_blacklist=�",
        output_type=pytesseract.Output.DICT,
    )

    grouped: dict[tuple[int, int, int], list[int]] = {}
    for index, text in enumerate(data["text"]):
        if not text or not text.strip():
            continue
        try:
            confidence = float(data["conf"][index])
        except ValueError:
            confidence = -1
        if confidence < 0:
            continue
        key = (data["block_num"][index], data["par_num"][index], data["line_num"][index])
        grouped.setdefault(key, []).append(index)

    lines: list[OcrLine] = []
    for indexes in grouped.values():
        indexes.sort(key=lambda idx: data["left"][idx])
        text = clean_line(" ".join(data["text"][idx] for idx in indexes))
        if not text:
            continue
        lefts = [data["left"][idx] for idx in indexes]
        tops = [data["top"][idx] for idx in indexes]
        rights = [data["left"][idx] + data["width"][idx] for idx in indexes]
        bottoms = [data["top"][idx] + data["height"][idx] for idx in indexes]
        lines.append(OcrLine(text, min(lefts), min(tops), max(rights), max(bottoms), page, half))

    return sorted(lines, key=lambda item: (item.y0, item.x0))


def render_and_ocr() -> list[OcrLine]:
    OCR_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = OCR_DIR / "lines.json"
    if cache_file.exists():
        raw = json.loads(cache_file.read_text(encoding="utf-8"))
        return [OcrLine(**item) for item in raw]

    pytesseract.pytesseract.tesseract_cmd = str(TESSERACT)
    doc = fitz.open(PDF_PATH)
    all_lines: list[OcrLine] = []

    for page_index, page in enumerate(doc, start=1):
        pix = page.get_pixmap(matrix=fitz.Matrix(4, 4), colorspace=fitz.csGRAY, alpha=False)
        image = Image.frombytes("L", (pix.width, pix.height), pix.samples)
        width, height = image.size

        halves = [
            ("L", image.crop((0, 0, width // 2, height))),
            ("R", image.crop((width // 2, 0, width, height))),
        ]

        for half, crop in halves:
            crop = preprocess(crop)
            lines = ocr_image(crop, page_index, half, psm=6)
            all_lines.extend(lines)

        center_strip = image.crop((int(width * 0.35), 0, int(width * 0.65), height))
        center_strip = preprocess(center_strip)
        center_lines = ocr_image(center_strip, page_index, "C", psm=11)
        center_offset = int(width * 0.35)
        for line in center_lines:
            line.x0 += center_offset
            line.x1 += center_offset
            text = clean_line(line.text)
            if not text or len(text) > 5:
                continue
            if not re.fullmatch(r"[0-9OoQIiLlAaEeSsBbGgqQjJzZTt&!|=]+", text):
                continue
            all_lines.append(line)

        if page_index % 10 == 0:
            print(f"OCR page {page_index}/{len(doc)}", flush=True)

    cache_file.write_text(
        json.dumps([line.__dict__ for line in all_lines], ensure_ascii=False),
        encoding="utf-8",
    )
    return all_lines


def split_sections(lines: list[OcrLine]) -> tuple[dict[int, str], dict[int, int]]:
    sections: dict[int, list[str]] = {number: [] for number in range(1, MAX_SECTION + 1)}
    pages: dict[int, int] = {number: 1 for number in range(1, MAX_SECTION + 1)}
    current: int | None = None
    expected = 1
    started = False

    groups: dict[tuple[int, str], list[OcrLine]] = {}
    for line in lines:
        groups.setdefault((line.page, line.half), []).append(line)

    half_order = {"L": 0, "R": 1}
    for key in sorted(
        [k for k in groups.keys() if k[1] in half_order],
        key=lambda item: (item[0], half_order[item[1]]),
    ):
        column_lines = groups[key]
        if not column_lines:
            continue

        width = max(line.x1 for line in column_lines) + max(1, min(line.x0 for line in column_lines))
        center_lines = groups.get((key[0], "C"), [])
        group = sorted(column_lines + center_lines, key=lambda item: (item.y0, item.x0))
        header_indexes: set[int] = set()
        header_range: tuple[int, int] | None = None

        for index, line in enumerate(group[:6]):
            parsed = parse_range(line.text, expected)
            if parsed:
                header_range = parsed
                header_indexes.add(index)
                break

        if not started:
            current_page = key[0]
            if current_page < FIRST_SECTION_MIN_PAGE:
                continue
            header_says_one = bool(header_range and header_range[0] == 1)

            for index, line in enumerate(group):
                if index in header_indexes:
                    continue
                if line.half == "C":
                    continue
                text = clean_line(line.text)
                if not text:
                    continue
                if likely_marker(line, 1, width):
                    started = True
                    current = 1
                    pages[1] = line.page
                    header_indexes.add(index)
                    expected = 2
                    break
                if len(text) > 3:
                    continue
                center = (line.x0 + line.x1) / 2
                if abs(center - width / 2) < width * 0.05 and header_says_one:
                    started = True
                    current = 1
                    pages[1] = line.page
                    header_indexes.add(index)
                    expected = 2
                    break
            if not started:
                continue

        if header_range and header_range[0] <= expected <= header_range[1] + 1:
            expected = max(expected, header_range[0])

        for index, line in enumerate(group):
            if index in header_indexes:
                continue
            text = clean_line(line.text)
            if not text:
                continue

            if expected <= MAX_SECTION and likely_marker(line, expected, width):
                current = expected
                pages[current] = line.page
                expected += 1
                continue

            candidates = marker_numbers(line)
            future = [number for number in candidates if expected < number <= min(MAX_SECTION, expected + 4)]
            if future:
                current = min(future)
                pages[current] = line.page
                expected = current + 1
                continue

            if current is not None and current <= MAX_SECTION:
                sections[current].append(text)

    joined = {number: postprocess_section("\n".join(parts)) for number, parts in sections.items()}
    return joined, pages


def postprocess_section(text: str) -> str:
    text = clean_text(text)
    text = re.sub(r"\bTum\b", "Turn", text)
    text = re.sub(r"\bTuin\b", "Turn", text)
    text = re.sub(r"\bFum\b", "Turn", text)
    text = re.sub(r"\bHrm\b", "Turn", text)
    text = re.sub(r"\bSraMINA\b", "STAMINA", text)
    text = re.sub(r"\bSraMina\b", "STAMINA", text)
    text = re.sub(r"\bsTAMINA\b", "STAMINA", text)
    text = re.sub(r"\bsKILL\b", "SKILL", text)
    text = re.sub(r"\bLucK\b", "LUCK", text)
    text = re.sub(r"\bHoNoUR\b", "HONOUR", text, flags=re.I)
    return text.strip()


def section_references(text: str, current: int) -> list[int]:
    refs: set[int] = set()
    for match in re.finditer(r"\b(?:turn|go|return|continue)\s+(?:to|at)?\s*([0-9OIlSBAgq]{1,4})", text, re.I):
        candidates = digit_candidates(match.group(1))
        if candidates:
            candidate = min(candidates)
            if 1 <= candidate <= MAX_SECTION and candidate != current:
                refs.add(candidate)
    return sorted(refs)


def write_outputs(sections: dict[int, str], pages: dict[int, int], lines: list[OcrLine]) -> None:
    OUT_DIR.mkdir(exist_ok=True)
    data = {
        "title": "Sword of the Samurai",
        "sourcePdf": "../source/altered FF20 Sword of the Samurai OCR.pdf",
        "coverImage": "../source/swordofthesamurai.jpg",
        "generatedAt": datetime.now().isoformat(timespec="seconds"),
        "note": "Text was generated by fresh Tesseract OCR from the scanned PDF pages and may still contain occasional OCR errors.",
        "sections": {
            str(number): {
                "number": number,
                "page": pages.get(number, 1),
                "choices": section_references(sections.get(number, ""), number),
                "text": sections.get(number, ""),
            }
            for number in range(1, MAX_SECTION + 1)
        },
    }
    (OUT_DIR / "book-data.js").write_text(
        "window.GAMEBOOK_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )

    page_chunks: list[str] = []
    groups: dict[tuple[int, str], list[OcrLine]] = {}
    for line in lines:
        groups.setdefault((line.page, line.half), []).append(line)
    for page in sorted({line.page for line in lines}):
        chunk: list[str] = []
        for half in ("L", "R"):
            chunk.extend(line.text for line in sorted(groups.get((page, half), []), key=lambda item: (item.y0, item.x0)))
        page_chunks.append("\n".join(chunk))
    (OUT_DIR / "pages.txt").write_text("\n\n--- PAGE BREAK ---\n\n".join(page_chunks), encoding="utf-8")


def main() -> int:
    if not TESSERACT.exists():
        print(f"Tesseract not found: {TESSERACT}", file=sys.stderr)
        return 1

    lines = render_and_ocr()
    sections, pages = split_sections(lines)
    write_outputs(sections, pages, lines)

    recovered = sum(1 for text in sections.values() if text.strip())
    choices = sum(len(section_references(sections[number], number)) for number in range(1, MAX_SECTION + 1))
    print(f"Sections with text: {recovered}/{MAX_SECTION}")
    print(f"Detected choices: {choices}")
    print("Data: playable/book-data.js")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
