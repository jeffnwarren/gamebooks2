from __future__ import annotations

import json
import re
import subprocess
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OCR_DATA = ROOT / "playable" / "book-data.js"
OCR_PAGES = ROOT / "playable" / "pages.txt"
ILLUSTRATIONS_DATA = ROOT / "playable" / "illustrations.json"
FALLBACK_DATA = ROOT / "tools" / "embedded-cache" / "book-data.js"
MAX_SECTION = 515
MANUAL_SECTION_SLICES = {
    5: [(10, 28, 49)],
    6: [(10, 50, 63), (11, 1, 12)],
    16: [(14, 26, 43)],
    17: [(14, 45, 47)],
    18: [(15, 14, 23)],
    21: [(16, 23, 59)],
    22: [(16, 60, 64), (17, 1, 17)],
    23: [(17, 18, 31)],
    24: [(17, 35, 43)],
    32: [(19, 31, 62), (20, 1, 13)],
    33: [(20, 14, 62)],
    34: [(21, 14, 30)],
    35: [(21, 31, 45), (24, 1, 8)],
    36: [(24, 10, 20)],
    37: [(24, 22, 53)],
    38: [(22, 1, 40)],
    39: [(22, 41, 48)],
    40: [(22, 49, 63), (23, 1, 6)],
    41: [(23, 7, 32)],
    46: [(25, 9, 32)],
    47: [(25, 33, 53)],
    53: [(28, 8, 18)],
    54: [(28, 19, 55), (29, 3, 15)],
    55: [(29, 17, 27)],
    59: [(30, 43, 55), (31, 3, 18)],
    60: [(31, 20, 39)],
    61: [(31, 41, 47)],
    64: [(32, 50, 57), (33, 1, 16)],
    65: [(33, 17, 33)],
    66: [(33, 35, 43)],
    67: [(33, 45, 55)],
    68: [(33, 56, 60), (34, 10, 16)],
    69: [(34, 17, 40)],
    70: [(35, 3, 25)],
    71: [(35, 26, 30), (35, 32, 33)],
    72: [(35, 35, 50)],
    73: [(35, 52, 61), (36, 2, 18)],
    74: [(36, 20, 37)],
    75: [(36, 39, 57)],
    76: [(36, 59, 62), (37, 2, 19)],
    77: [(37, 21, 25)],
    78: [(37, 26, 30)],
    79: [(37, 37, 52)],
    80: [(37, 53, 55), (38, 1, 20)],
    81: [(38, 21, 36)],
    82: [(38, 37, 48)],
    83: [(38, 49, 57), (39, 1, 27)],
    84: [(39, 28, 38)],
    86: [(40, 15, 43), (41, 1, 41)],
    87: [(41, 42, 60)],
    92: [(43, 3, 14)],
    96: [(44, 3, 24)],
    107: [(48, 55, 60), (49, 2, 21)],
    114: [(52, 3, 26)],
    127: [(56, 42, 53), (57, 2, 11)],
    131: [(58, 5, 17)],
    132: [(58, 19, 23)],
    133: [(58, 25, 31)],
    153: [(62, 53, 60), (63, 14, 18)],
    154: [(63, 20, 43), (64, 2, 7)],
    169: [(67, 20, 31), (67, 34, 36)],
    183: [(72, 3, 21), (72, 25, 33)],
    263: [(99, 38, 42), (100, 2, 15)],
    277: [(105, 26, 29), (105, 32, 41)],
    280: [(106, 35, 50), (107, 2, 5)],
    287: [(108, 60, 64), (109, 2, 8)],
    211: [(82, 41, 56)],
    212: [(82, 58, 64), (83, 2, 4)],
    213: [(83, 6, 13)],
    214: [(83, 15, 26)],
    223: [(86, 3, 12)],
    248: [(95, 3, 12)],
    255: [(119, 21, 45), (97, 2, 4)],
    305: [(116, 34, 45)],
    314: [(118, 53, 59)],
    323: [(122, 52, 63), (123, 2, 7)],
    324: [(123, 9, 60), (124, 2, 5)],
    328: [(125, 3, 35)],
    329: [(125, 37, 39)],
    330: [(125, 41, 56), (126, 2, 7)],
    332: [(126, 16, 30), (126, 33, 49)],
    338: [(129, 6, 19)],
    341: [(129, 50, 56), (130, 2, 4)],
    344: [(131, 36, 42)],
    345: [(131, 23, 34)],
    346: [(131, 36, 42)],
    360: [(135, 59, 61), (136, 2, 11)],
    367: [(137, 40, 55)],
    370: [(139, 25, 56), (140, 1, 23)],
    399: [(148, 18, 31), (148, 35, 37)],
    402: [(149, 43, 61), (150, 2, 5)],
    400: [(148, 35, 37)],
    401: [(149, 19, 41)],
    419: [(156, 33, 42)],
    420: [(156, 44, 48)],
    425: [(159, 11, 50)],
    433: [(161, 43, 63), (162, 2, 10)],
    437: [(163, 13, 27)],
    447: [(167, 46, 51)],
    448: [(167, 53, 65), (168, 2, 12)],
    453: [(169, 36, 42)],
    461: [(171, 18, 39)],
    482: [(179, 3, 14)],
    493: [(183, 53, 67), (184, 2, 7)],
    494: [(184, 9, 48)],
    496: [(185, 13, 41), (186, 2, 12)],
    497: [(186, 14, 38)],
}


def load_js_data(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"window\.GAMEBOOK_DATA\s*=\s*(.*);\s*$", text, re.S)
    if not match:
        raise ValueError(f"Could not read data from {path}")
    try:
        return json.loads(match.group(1))
    except json.JSONDecodeError:
        node = Path(r"C:\Program Files\nodejs\node.exe")
        script = (
            "global.window={};"
            f"require({json.dumps(str(path))});"
            "process.stdout.write(JSON.stringify(window.GAMEBOOK_DATA));"
        )
        output = subprocess.check_output([str(node), "-e", script], cwd=ROOT)
        return json.loads(output.decode("utf-8"))


def clean_intro(text: str) -> str:
    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            lines.append("")
            continue
        if re.fullmatch(r"[-=_ .,'\"|\\/()A-Za-z]{1,30}", line) and len(re.findall(r"[A-Za-z]{3,}", line)) == 0:
            continue
        if re.fullmatch(r"\d{1,2}", line):
            continue
        lines.append(line)

    value = "\n".join(lines)
    value = re.sub(r"\n{3,}", "\n\n", value)
    value = value.replace("Now tum to paragraph 1", "Now turn to paragraph 1")
    value = value.replace("sraMina", "STAMINA")
    value = value.replace("staMINA", "STAMINA")
    value = value.replace("LucK", "LUCK")
    value = value.replace("CHANCE points", "CHANGE points")
    return value.strip()


def digit_for_range(char: str) -> str:
    mapping = {
        "O": "0",
        "o": "0",
        "Q": "0",
        "(": "0",
        ")": "0",
        "£": "1",
        "I": "1",
        "l": "1",
        "i": "1",
        "t": "1",
        "T": "1",
        "|": "1",
        "!": "1",
        "z": "2",
        "Z": "2",
        "j": "3",
        "J": "3",
        "A": "4",
        "a": "4",
        "S": "5",
        "s": "5",
        "$": "5",
        "G": "6",
        "b": "6",
        "B": "8",
        "g": "5",
        "q": "9",
    }
    if char.isdigit():
        return char
    return mapping.get(char, "")


def parse_loose_number(token: str) -> int | None:
    digits = "".join(digit_for_range(char) for char in token)
    if not digits:
        return None
    value = int(re.sub(r"00+", "0", digits))
    return value if 1 <= value <= MAX_SECTION else None


def parse_range_line(line: str) -> tuple[int, int] | None:
    match = re.fullmatch(r"\s*([0-9A-Za-z$%(){}]+)\s*-\s*([0-9A-Za-z$%(){}]+)\s*", line)
    if not match:
        return None
    start = parse_loose_number(match.group(1))
    end = parse_loose_number(match.group(2))
    if start is None or end is None:
        return None
    if end < start and end < 100 and start >= 100:
        end = (start // 100) * 100 + end
    if start <= end and end - start <= 20:
        return start, end
    return None


TURN_WORDS = (
    "turn|tur|tum|tarn|tuin|tuln|tim|timi|tumi|tuum|tium|tiurn|tucn|furn|fum|fumi|"
    "faim|fim|fiumn|farm|hrm|rurn|burn|bum|bun|barn|hurn|hun|hum|humm|hirn|hon|harn|"
    "ham|eum|tun|tin|fiirn|fom|fuorn|tuo|rehurn|tetum|him|hur|fur"
)
DIRECT_WORDS = "go|return|continue"
TURN_CONNECTORS = r"immediately\s+to|at\s+once\s+to|at\s+ance\s+to|al\s+once\s+to|back\s+to|to|lo|te|bo|eo|io|10|at|ta|in|tn|y|i|l|fo|fa"


def token_matches_number(token: str, number: int) -> bool:
    clean = re.sub(r"[^\w$%(){}!|]", "", token)
    target = str(number)
    if not clean or len(clean) != len(target):
        return False
    if clean == target:
        return True

    options = {
        "0": set("0OoQ()D"),
        "1": set("1IlitT!|7zZ2"),
        "2": set("2zZ"),
        "3": set("3jJ9"),
        "4": set("4AaGgq"),
        "5": set("5Ss$Gg"),
        "6": set("6bBG"),
        "7": set("7yY"),
        "8": set("8B"),
        "9": set("9gq"),
    }
    return all(char in options[digit] for char, digit in zip(clean, target))


def previous_line_wants_target(line: str) -> bool:
    return bool(
        re.search(
            rf"\b(?:(?:{TURN_WORDS})-?(?:\s+(?:{TURN_CONNECTORS}))?|(?:{DIRECT_WORDS})\s+(?:{TURN_CONNECTORS}))\s*(?:paragraph|section)?\s*$",
            line.strip(),
            re.I,
        )
    )


def marker_number(
    line: str,
    expected: int,
    active_range: tuple[int, int] | None,
    previous_line: str = "",
) -> int | None:
    text = line.strip()
    if not text or len(text) > 18 or "-" in text:
        return None
    if previous_line_wants_target(previous_line) and parse_loose_number(text) is not None:
        return None
    tokens = re.findall(r"[0-9A-Za-z$%(){}!|]+", text)
    if not tokens or len(tokens) > 2:
        return None
    if len(tokens) == 2 and len(tokens[0]) > 1:
        trailing = parse_loose_number(tokens[1])
        prefix_letters = re.sub(r"[^A-Za-z]", "", tokens[0])
        prefix_is_junk = len(prefix_letters) <= 2 and not re.search(r"\d", tokens[0])
        if trailing == expected and prefix_is_junk:
            return expected
        return None

    search_start = expected
    search_end = min(MAX_SECTION, expected + 6)
    if active_range and active_range[0] <= expected + 12:
        search_start = max(expected, active_range[0])
        search_end = active_range[1]

    exact_numbers = [int(token) for token in tokens if token.isdigit()]
    exact_future = [number for number in exact_numbers if search_start <= number <= min(search_end, expected + 8)]
    if exact_future:
        return min(exact_future)

    for number in range(search_start, search_end + 1):
        if any(token_matches_number(token, number) for token in tokens):
            return number

    exact_valid_numbers = [number for number in exact_numbers if 1 <= number <= MAX_SECTION]
    numberish = any(
        len(token) <= 4 and (re.search(r"[0-9$§%]", token) or token_matches_number(token, expected))
        for token in tokens
    )
    marker_glyph = (
        active_range
        and active_range[0] <= expected <= active_range[1]
        and len(text) <= 4
        and bool(re.fullmatch(r"[A-Za-z?*!|$§%(){}]+", text))
        and len(re.findall(r"[A-Za-z]{3,}", text)) == 0
    )
    if (
        active_range
        and active_range[0] <= expected <= active_range[1]
        and (numberish or marker_glyph)
        and not exact_valid_numbers
    ):
        return expected
    return None


def is_artifact_line(line: str) -> bool:
    text = line.strip()
    if not text:
        return True
    if re.search(rf"\b(?:{TURN_WORDS})\b", text, re.I) and possible_target_fragment(text):
        return False
    if re.fullmatch(
        rf"(?:(?:{TURN_WORDS})\s+)?(?:{TURN_CONNECTORS})\s*[\w$%(){{}}.,'\"]{{1,6}}",
        text,
        re.I,
    ):
        return False
    if re.fullmatch(
        rf"(?:{TURN_WORDS}\s+)?(?:{TURN_CONNECTORS})\s*[0-9OoQIiLlAaEeSsBbGgqQjJzZ$§%(){{}}.,'\"]{{1,6}}",
        text,
        re.I,
    ):
        return False
    if re.fullmatch(r"\d{1,2}", text):
        return True
    if parse_range_line(text):
        return True
    words = re.findall(r"[A-Za-z]{3,}", text)
    if not words and re.fullmatch(r"[-=_ .,'\"|\\/()A-Za-z0-9$%{}&]+", text) and len(text) <= 32:
        return True
    if not words and re.fullmatch(r"(?:[A-Za-z]{1,2}|\d|[-;:,.=+_|/\\ ]){1,12}", text):
        return True
    return False


def possible_target_fragment(line: str) -> bool:
    for token in re.findall(r"[0-9A-Za-z$%(){}!|Â§£]+", line):
        if re.search(r"[0-9$%Â§£]", token) and len(token) <= 6:
            return True
    return False


def clean_section_text(lines: list[tuple[int, str]]) -> str:
    output = []
    for _, raw in lines:
        line = raw.strip()
        if is_artifact_line(line):
            if output and previous_line_wants_target(output[-1]) and possible_target_fragment(line):
                output.append(line)
            continue
        line = re.sub(r"^(?:[a-z]{1,3}\)|[a-z]{1,3})\s+(?=[A-Z'\"])", "", line)
        line = re.sub(r"^[=|\\/()[\]{} .,'\"-]{1,10}\s*(?=[A-Z'\"])", "", line)
        output.append(line)
    value = " ".join(output)
    value = re.sub(r"\s+", " ", value).strip()
    replacements = {
        " staMINA ": " STAMINA ",
        " stAMINA ": " STAMINA ",
        " sKILL ": " SKILL ",
        " LucK ": " LUCK ",
        " CHANCE ": " CHANGE ",
        " CITANCE ": " CHANGE ",
        " Roil ": " Roll ",
        " Tum ": " Turn ",
        " tum ": " turn ",
        " Tur ": " Turn ",
        " tur ": " turn ",
        " Fum ": " Turn ",
        " Bun to": "Turn to",
        " bun to": "turn to",
        " burn to": "turn to",
        " harn to": " turn to",
        " hun to": "turn to",
        "(hum bo": "(turn to",
        " hum bo": " turn to",
        " hum to": "turn to",
        " hirn to": "turn to",
        " hon to": "turn to",
        " hurn to": "turn to",
        " farm to": " turn to",
        " tin to": " turn to",
        " turn at once bo": " turn at once to",
        " turn atonce to": " turn at once to",
        " turn atonce": " turn at once",
        " turn toa ": " turn to ",
        " Tam to": "Turn to",
        " Tum to": "Turn to",
        "andturn": "and turn",
        "thenturn": "then turn",
        "Nowturn": "Now turn",
        "nowturn": "now turn",
        "burn 10150": "burn to 150",
        "tun to 991": "tun to 391",
        "turn to. 4134": "turn to 434",
        "turn tog7o": "turn to 270",
        "to gog": "to 309",
        "turn to 4843": "turn to 484",
        "turn to 4979": "turn to 379",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    value = re.sub(r"\bturn-\s*ing\s+(?=to\b)", "turn ", value, flags=re.I)
    value = re.sub(r"\bturning\s+(?=to\b)", "turn ", value, flags=re.I)
    value = re.sub(r"\b(?:fim|tum)\s+to(?=\b)", "turn to", value, flags=re.I)
    value = re.sub(r"\bturn\s+to\s+@(?=\d)", "turn to 6", value, flags=re.I)
    value = re.sub(r"\bturn\s+to\s+éa\b", "turn to 62", value, flags=re.I)
    value = re.sub(r"\bturn\s+to\s+son\b", "turn to 501", value, flags=re.I)
    value = re.sub(r"\bfiumn\.?\s+bo\s+Fy\b", "turn to 7", value, flags=re.I)
    value = re.sub(r"\bturn\s+toa\b", "turn to", value, flags=re.I)
    value = re.sub(r"\bturn\s+at\s+orice\b", "turn at once", value, flags=re.I)
    value = re.sub(r"([a-z])(?=turn(?:ing)?\s+(?:to|lo|te|io|10|ta|at)\b)", r"\1 ", value)
    return value.strip()


def has_turn_target(line: str) -> bool:
    return bool(
        re.search(
            rf"\b(?:{TURN_WORDS})"
            rf"\s+(?:{TURN_CONNECTORS})?\s*[0-9OoQIiLlAaEeSsBbGgqQjJzZ$§%(){{}}.,'\"]{{1,6}}",
            line,
            re.I,
        )
        or re.search(
            rf"\b(?:{DIRECT_WORDS})"
            rf"\s+(?:{TURN_CONNECTORS})\s*[0-9OoQIiLlAaEeSsBbGgqQjJzZ$§%(){{}}.,'\"]{{1,6}}",
            line,
            re.I,
        )
    )


def ending_like(text: str) -> bool:
    return bool(
        re.search(
            r"\b(adventure ends|advenhure ends|adventure is over|adventure ends here|adventure will end here|"
            r"adventure are over|quest ends here|quest has failed|you have failed|you are dead|you die|"
            r"you have died|you have been killed|you are killed|you pass out|"
            r"horrible end to your adventure|fate worse than death|met your doom|"
            r"hollow victory|willing servant always|mindless servant|new master|"
            r"your money and your life|your life and your adventure are over|"
            r"end your adventure|slay you|barbe-?\s*cued meal|the end|congratulations|you have escaped|"
            r"start all over again|paragraph with the same number as the one you were last instructed|"
            r"same number as the one you were last instructed|same number as[^.]{0,120}last[^.]{0,120}instructed)\b",
            text,
            re.I,
        )
    )


def looks_like_start(line: str) -> bool:
    text = line.strip()
    if is_artifact_line(text):
        return False
    text = re.sub(r"^[^A-Za-z'\"]+", "", text)
    text = re.sub(r"^(?:[a-z]{1,3}\)|[a-z]{1,3})\s+(?=[A-Z'\"])", "", text)
    if re.match(r"^[\"'A-Z]", text):
        return True
    return bool(
        re.match(
            r"^(You|The|A|An|As|After|Before|Being|Following|Leaving|Standing|Lifting|"
            r"Konrad|Hans|Tugging|Making|Spinning|Brandishing|Eventually|Somehow|Opening|Peering|"
            r"Descending|Cautiously|Sprinting|Revealed|Unable|Cutting|Among|Having|Two|To)\b",
            text,
            re.I,
        )
    )


def next_content_line(page_chunks: list[str], page_index: int, line_index: int) -> str:
    for next_page_index in range(page_index, min(len(page_chunks), page_index + 2)):
        page_lines = page_chunks[next_page_index].splitlines()
        start = line_index + 1 if next_page_index == page_index else 0
        for raw in page_lines[start:]:
            line = raw.strip()
            if line and not is_artifact_line(line):
                return line
    return ""


def marker_context_is_valid(
    page_chunks: list[str],
    page_index: int,
    line_index: int,
) -> bool:
    next_line = next_content_line(page_chunks, page_index, line_index)
    return not next_line or looks_like_start(next_line)


def find_section_boundary(lines: list[tuple[int, str]]) -> int:
    if len(lines) < 4:
        return -1

    for index, (_, text) in enumerate(lines[:-1]):
        previous = lines[index - 1][1] if index else ""
        target_after_turn = (
            len(text.strip()) <= 6
            and re.search(
                rf"\b(?:(?:{TURN_WORDS})\s+(?:{TURN_CONNECTORS})?|(?:{DIRECT_WORDS})\s+(?:{TURN_CONNECTORS}))\s*$",
                previous,
                re.I,
            )
        )
        recent_text = " ".join(item[1] for item in lines[max(0, index - 2) : index + 1])
        if not has_turn_target(text) and not target_after_turn and not ending_like(recent_text):
            continue

        next_index = index + 1
        while next_index < len(lines) and is_artifact_line(lines[next_index][1]):
            next_index += 1
        lookahead = []
        probe = next_index
        while probe < len(lines) and len(lookahead) < 3:
            if not is_artifact_line(lines[probe][1]):
                lookahead.append(lines[probe][1])
            probe += 1
        if any(has_turn_target(item) for item in lookahead):
            continue
        if next_index < len(lines) and looks_like_start(lines[next_index][1]):
            return next_index
    return -1


def add_section_run(
    sections: dict[int, dict],
    start: int,
    end: int,
    page: int,
    lines: list[tuple[int, str]],
) -> None:
    if start > end or start > MAX_SECTION:
        return

    end = min(end, MAX_SECTION)
    remaining = list(lines)
    for number in range(start, end + 1):
        if number == end:
            chunk = remaining
            section_page = chunk[0][0] if chunk else page
            sections[number] = {
                "number": number,
                "page": section_page,
                "choices": [],
                "text": clean_section_text(chunk),
                "ocrSource": "tesseract-resplit",
            }
            return

        boundary = find_section_boundary(remaining)
        if boundary <= 0 or boundary >= len(remaining):
            section_page = remaining[0][0] if remaining else page
            sections[number] = {
                "number": number,
                "page": section_page,
                "choices": [],
                "text": clean_section_text(remaining),
                "ocrSource": "tesseract-resplit",
            }
            for missing in range(number + 1, end + 1):
                sections[missing] = {
                    "number": missing,
                    "page": section_page,
                    "choices": [],
                    "text": "",
                    "ocrSource": "missing",
                }
            return

        chunk = remaining[:boundary]
        section_page = chunk[0][0] if chunk else page
        sections[number] = {
            "number": number,
            "page": section_page,
            "choices": [],
            "text": clean_section_text(chunk),
            "ocrSource": "tesseract-resplit",
        }
        remaining = remaining[boundary:]


def manual_slice_lines(page_chunks: list[str], specs: list[tuple[int, int, int]]) -> list[tuple[int, str]]:
    lines: list[tuple[int, str]] = []
    for page, start, end in specs:
        if page < 1 or page > len(page_chunks):
            continue
        page_lines = page_chunks[page - 1].splitlines()
        for line_index in range(start - 1, min(end, len(page_lines))):
            raw = page_lines[line_index].strip()
            if raw:
                lines.append((page, raw))
    return lines


def apply_manual_sections(sections: dict[int, dict], page_chunks: list[str]) -> None:
    # These targeted slices recover sections whose printed numbers OCR confuses with lookalike glyphs.
    for number, specs in MANUAL_SECTION_SLICES.items():
        lines = manual_slice_lines(page_chunks, specs)
        text = clean_section_text(lines)
        if not text:
            continue
        sections[number] = {
            "number": number,
            "page": specs[0][0],
            "choices": [],
            "text": text,
            "ocrSource": "manual-slice",
        }


def resplit_sections_from_pages(path: Path) -> dict[int, dict]:
    text = path.read_text(encoding="utf-8")
    page_chunks = re.split(r"\n\s*--- PAGE BREAK ---\s*\n", text)
    sections: dict[int, dict] = {}
    current_number: int | None = None
    current_page = 1
    current_lines: list[tuple[int, str]] = []
    expected = 1
    in_adventure = False
    waiting_for_first_range = False
    active_range: tuple[int, int] | None = None
    previous_line = ""

    for page_index, chunk in enumerate(page_chunks, start=1):
        page_lines = chunk.splitlines()
        for raw_index, raw in enumerate(page_lines):
            line = raw.strip()
            if not line:
                continue
            if not in_adventure:
                if re.search(r"\bTurn\s+to\s+paragraph\s+1\b", line, re.I):
                    in_adventure = True
                    waiting_for_first_range = True
                continue

            parsed_range = parse_range_line(line)
            if parsed_range:
                active_range = parsed_range
                if waiting_for_first_range and parsed_range[0] == 1:
                    waiting_for_first_range = False
                previous_line = line
                continue
            if waiting_for_first_range:
                previous_line = line
                continue
            if active_range and expected > active_range[1]:
                active_range = None

            matched = marker_number(line, expected, active_range, previous_line)
            if matched and not marker_context_is_valid(page_chunks, page_index - 1, raw_index):
                matched = None
            if matched:
                if current_number is not None:
                    add_section_run(sections, current_number, matched - 1, current_page, current_lines)
                current_number = matched
                current_page = page_index
                current_lines = []
                expected = matched + 1
                previous_line = line
                continue

            if current_number is not None:
                current_lines.append((page_index, line))
            previous_line = line

    if current_number is not None:
        add_section_run(sections, current_number, MAX_SECTION, current_page, current_lines)

    for number in range(1, MAX_SECTION + 1):
        sections.setdefault(
            number,
            {"number": number, "page": 1, "choices": [], "text": "", "ocrSource": "missing"},
        )
    apply_manual_sections(sections, page_chunks)
    return sections


def token_to_section(token: str) -> int | None:
    clean = re.sub(r"[^\w()%$§£]", "", token)
    if clean.isdigit():
        value = int(clean)
        if 1 <= value <= MAX_SECTION:
            return value
        if len(clean) == 3 and clean.startswith("7"):
            corrected = int("3" + clean[1:])
            if 1 <= corrected <= MAX_SECTION:
                return corrected
        return None

    mapping = {
        "O": "0",
        "o": "0",
        "Q": "0",
        "I": "1",
        "l": "1",
        "i": "1",
        "a": "1",
        "A": "4",
        "z": "2",
        "Z": "2",
        "j": "3",
        "J": "3",
        "%": "1",
        "§": "5",
        "£": "1",
        "$": "5",
        "S": "5",
        "s": "5",
        "B": "8",
        "b": "6",
        "G": "6",
        "e": "8",
        "E": "8",
        "g": "9",
        "q": "9",
    }
    digits = "".join(char if char.isdigit() else mapping.get(char, "") for char in clean)
    if not digits:
        return None
    value = int(re.sub(r"00+", "0", digits))
    if 1 <= value <= MAX_SECTION:
        return value
    if len(clean) == 3 and clean[0] in {"q", "Q"}:
        corrected = int("4" + digits[1:])
        if 1 <= corrected <= MAX_SECTION:
            return corrected
    return None


def section_references(text: str, current: int) -> list[int]:
    refs = []
    seen = set()
    pattern = re.compile(
        rf"\b(?:(?:{TURN_WORDS})\s+(?:{TURN_CONNECTORS})?|(?:{DIRECT_WORDS})\s+(?:{TURN_CONNECTORS}))"
        rf"\s*([0-9OoQIiLlAaEeSsBbGgqQjJzZ$§£%{{}}.,'\"]{{1,6}})",
        re.I,
    )
    pattern = re.compile(pattern.pattern + r"(?![A-Za-z])", re.I)
    for match in pattern.finditer(text):
        target = token_to_section(match.group(1))
        if target and target != current and target not in seen:
            refs.append(target)
            seen.add(target)
    return refs


def intro_from_pages(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    marker = re.search(r"(?m)^\s*1\s*-\s*[34]\s*$", text)
    if not marker:
        return ""
    return clean_intro(text[: marker.start()])


def illustrations_from_file(path: Path) -> dict:
    if not path.exists():
        return {"policy": "covers-and-full-page-illustrations-only", "fullPageIllustrations": []}

    data = json.loads(path.read_text(encoding="utf-8"))
    return {
        "policy": data.get("policy", "covers-and-full-page-illustrations-only"),
        "dpi": data.get("dpi"),
        "firstSectionPdfPage": data.get("firstSectionPdfPage"),
        "fullPageIllustrations": data.get("fullPageIllustrations", []),
    }


def main() -> int:
    data = load_js_data(OCR_DATA)
    fallback = load_js_data(FALLBACK_DATA) if FALLBACK_DATA.exists() else {"sections": {}}
    previous_sections = data.get("sections", {}) if isinstance(data.get("sections"), dict) else {}
    sections = resplit_sections_from_pages(OCR_PAGES)
    fallback_count = 0
    previous_fallback_count = 0

    for number in range(1, MAX_SECTION + 1):
        section = sections[number]
        if section["text"]:
            continue
        fallback_section = fallback.get("sections", {}).get(str(number), {})
        if fallback_section.get("text", "").strip():
            section["text"] = fallback_section["text"]
            section["page"] = fallback_section.get("page", section["page"])
            section["ocrSource"] = "embedded-fallback"
            fallback_count += 1
            continue

        previous_section = previous_sections.get(str(number), {})
        if previous_section.get("text", "").strip():
            section["text"] = previous_section["text"]
            section["page"] = previous_section.get("page", section["page"])
            section["ocrSource"] = "previous-data-fallback"
            previous_fallback_count += 1

    for number in range(1, MAX_SECTION + 1):
        section = sections[number]
        section["text"] = re.sub(rf"^\s*{number}\s+", "", section.get("text", "")).strip()
        section["choices"] = section_references(section["text"], number)

    total_missing = sum(1 for section in sections.values() if not section.get("text", "").strip())
    total_fallback = sum(1 for section in sections.values() if section.get("ocrSource") == "embedded-fallback")
    total_previous_fallback = sum(1 for section in sections.values() if section.get("ocrSource") == "previous-data-fallback")
    total_manual = sum(1 for section in sections.values() if section.get("ocrSource") == "manual-slice")

    data.update(
        {
            "title": "Howl of the Werewolf",
            "sourcePdf": "../source/altered FF61 Howl of the Werewolf.pdf",
            "coverImage": "../source/howlofthewerewolf.jpg",
            "generatedAt": datetime.now().isoformat(timespec="seconds"),
            "intro": {"title": "Introduction", "page": 1, "text": intro_from_pages(OCR_PAGES)},
            "illustrations": illustrations_from_file(ILLUSTRATIONS_DATA),
            "sections": {str(number): sections[number] for number in range(1, MAX_SECTION + 1)},
            "note": (
                "Primary text was generated by fresh Tesseract OCR and re-split for Howl's 515-section structure. "
                f"{total_manual} sections use targeted manual OCR slices; "
                f"{total_fallback} sections use the PDF's embedded OCR fallback; "
                f"{total_previous_fallback} sections retain previous OCR text as a fallback; "
                f"{total_missing} sections still lack recovered text."
            ),
        }
    )

    OCR_DATA.write_text(
        "window.GAMEBOOK_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Fallback sections filled: {fallback_count}")
    print(f"Previous-data fallback sections filled: {previous_fallback_count}")
    print(f"Manual slices applied: {total_manual}")
    print(f"Sections still missing: {total_missing}/{MAX_SECTION}")
    print(f"Intro characters: {len(data['intro']['text'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
