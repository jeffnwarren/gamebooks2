from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OCR_DATA = ROOT / "playable" / "book-data.js"
OCR_PAGES = ROOT / "playable" / "pages.txt"
FALLBACK_DATA = ROOT / "tools" / "embedded-cache" / "book-data.js"
ILLUSTRATIONS_DATA = ROOT / "playable" / "illustrations.json"
MAX_SECTION = 400
MANUAL_SECTION_SLICES = {
    230: [(73, 28, 38)],
    231: [(73, 40, 51)],
    232: [(74, 3, 9)],
    302: [(90, 4, 27)],
    357: [(103, 28, 40)],
    396: [(114, 11, 15)],
    397: [(114, 17, 20)],
}
SECTION_TEXT_OVERRIDES = {
    30: (
        "The monstrously large Ghoul backs away from you, spittle drooling over its blackened stumps "
        "of teeth. You can ascend the stone stairs opposite the door (turn to 159) or attack the "
        "retreating Ghoul (turn to 107)."
    ),
    66: (
        "The woman who stands before you is tall and slim with flowing black hair and mysterious, "
        "emerald-green eyes. She is stunningly lovely, but very pale; the ivory pigment of her skin "
        "is emphasized by the jet-black dress she wears. Cold silver and glinting emerald jewellery "
        "adorn her. This is Katarina Heydrich, the Count's sister, who is gazing deep into your eyes! "
        "Turn to 264."
    ),
    80: (
        "You sense that Katarina has made some attempt to control you by magic, but she has failed. "
        "Snarling with frustration and rage, she commands you to leave. She begins to weave a spell, "
        "but you are fast enough to get away! Turn to 32."
    ),
    83: "Do you have a Magic Sword? If you do, turn to 129. If you do not, turn to 231.",
    113: (
        "Snivel the Gnome pulls out a dagger, and you can see that the blade is discoloured - poison! "
        "If Snivel manages to hit you, you must lose 4 points of STAMINA rather than the usual 2, due "
        "to the effects of the venom. What's more, the Gnome is athletic and he dodges and weaves, so "
        "he is not easy to hit! GNOME SKILL 8 STAMINA 6 If you win, will you Search the Gnome's "
        "house? Turn to 358 Take the boat and cross the river? Turn to 138 Wade across the shallow "
        "river? Turn to 187"
    ),
    164: (
        "Conduct the combat normally; turn back to 106. Your opponent is not actually a Vampire, "
        "so if you have the magical sword, Nightstar, you can claim a bonus of only 1 to your SKILL "
        "in this combat."
    ),
    174: (
        "You clamber into the coach, and the horses set off at a gallop - making no sound as they move! "
        "You settle back into a comfortable seat draped in black. Looking through the heavy "
        "purple-curtained windows you see nothing outside but thick swirling fog, but the wolf-howls "
        "you hear send shivers down your spine. Roll one die and add 2 to the number rolled. If the "
        "total is less than or equal to your FAITH, turn to 223. If the total is greater than your "
        "FAITH, you continue your journey until the coach stops, close by the Castle, and allows you "
        "to dismount before vanishing into the fog; turn to 362."
    ),
    209: (
        "'Well, there's poor young Wilhelm the cousin - mad as a hatter, you know. Quite harmless. "
        "Siegfried's dead of course - Reiner's elder brother, he was Count until he, ah, disappeared "
        "and Reiner took over. Then there's Gunthar who lives upstairs; just go right up and knock on "
        "the silver-handled door. He's a healer, so he says. Not a bad sort. Katarina the Count's "
        "sister, she's a beautiful and peculiar woman. Very capricious, with a temper like a wildcat, "
        "but quite captivating, too. She's got a lovely suite of rooms upstairs at the end of the "
        "corridor past the landing where you go up.' Return to 75."
    ),
    210: (
        "You unlock the door with your keys. It opens into a small, bare, stone chamber, with a plain "
        "stone sarcophagus in the centre. If you want to investigate the sarcophagus, turn to 262. If "
        "you would rather leave, you can either open the door to the Chancellor's tomb, if you haven't "
        "already done so (turn to 359), or head down the corridor to the T-junction (turn to 230)."
    ),
    219: (
        "You unlock the drawer, but you hear the sound of splintering glass as you do so. You must "
        "Test your Luck; if you are Lucky, turn to 130, but if you are Unlucky, turn to 387."
    ),
    248: (
        "The beautiful woman turns the full force of her glittering green eyes on you. Roll one die "
        "and add 4 to the result. If the total is less than or equal to your FAITH, turn to 80. If the "
        "total is greater than your FAITH, turn to 68."
    ),
    249: (
        "You find a silver bracelet behind a cushion. This is worth 3 Gold Pieces, so add it to your "
        "Treasure. You leave the room and return to the corridor outside. Here, you can either open "
        "the door at the east end of it (turn to 351) or follow it round to the south, past that door "
        "(turn to 166)."
    ),
    276: (
        "Katarina smiles beautifully at you and her feline eyes glitter. You realize that she is trying "
        "to control you, as she did before; since she has succeeded once, it will be harder for you to "
        "resist her this time! Roll one die and add 6 to the number rolled. If the total is less than "
        "or equal to your FAITH, turn to 343. If the total is greater than your FAITH, turn to 381."
    ),
    303: (
        "The Sage looks very serious and says that you don't want to go down there. The Count keeps "
        "prisoners in the Crypt, and it is protected by traps and by a particularly horrible enchanted "
        "monster made out of bones. 'Anyway it's locked, and the Count has the key in his rooms; the "
        "lock is magical, and only that key will get you in. It's a great iron key, I've seen the Count "
        "carrying it - but, as I say, you really don't want to go down there. Oh no!' Return to 75."
    ),
    307: (
        "You open the door and enter a shrine of some kind; the room is unlit, and you need a "
        "light-source to see by. There are white and yellow cloths on tables, wall-hangings decorating "
        "the room, small stools and a writing-table. There is also a book lying on a chair which "
        "attracts your attention, so you pick it up. It is a history of the lives of some famous holy "
        "men and healers, and it has a signature on the flyleaf, that of Gunthar Heydrich. You can "
        "take this book with you if you wish (if you do, add the Book of Healers to your Possessions). "
        "There is a spy-hole on the east wall, and you stand on a stool to look through it. Beyond, you "
        "can see a bare chamber with a pair of Zombies standing motionless on guard, holding fearsome "
        "halberds. Behind them is a half-open door leading into a bare chamber with stone steps going "
        "up. There doesn't seem to be any way of getting into the Zombie Chamber from here, so you "
        "leave and head for the door at the end of the eastern side-passage outside; turn to 258."
    ),
    362: (
        "You walk along as far as the base of a narrow trail which leads up a steep incline, and "
        "suddenly you walk out of the fog into a completely clear area. Starkly illuminated by the "
        "three-quarter moon stands the brooding Castle Heydrich! You can walk up and enter the "
        "half-open front gates (turn to 326) or walk round the outside to see what you can make of the "
        "place (turn to 50)."
    ),
    369: (
        "Lothar the Castellan looks up in horror as you advance to fight him. He grabs his broadsword "
        "and will give his best! LOTHAR SKILL 9 STAMINA 10 If you win, turn to 234."
    ),
    370: (
        "You roll over the edge of a precipice, and your body is smashed to pieces on the rocks in the "
        "chasm below. You have failed most miserably in your quest!"
    ),
}
SECTION_REGEX_CLEANUPS = {
    6: [(r"\s+= ia -$", "")],
    15: [(r"\s+eee$", "")],
    19: [(r"\s+SSS rr$", "")],
    36: [(r"\s+eee ie lar.*$", "")],
    72: [(r"\s+na a = 1G$", "")],
    73: [(r"\s+eae ae ihe.*$", "")],
    75: [(r"\s+it Ha\s+-+.*$", "")],
    131: [(r"^a \| ae = oe: a 131\s+", "")],
    145: [(r"\s+yh Na aaa.*$", "")],
    146: [(r"^cee ho = 146\s+", "")],
    169: [(r"\s+= -= =$", "")],
    228: [(r"\s+aa ee$", "")],
    261: [(r"\s+ee eee\. Sey$", ".")],
    292: [(r"\s+eee$", "")],
    298: [(r"\s+i If you win", " If you win")],
    324: [(r"\s+SE -=Es = ia ia =$", "")],
    344: [(r"^ee = 5 344 Et ge Ya ES oe 344\s+", "")],
    357: [(r"\brum as fast\b", "run as fast")],
    360: [(r"\s+a _- q EL - eee eee$", "")],
    387: [(r"\s+Bi eo j i 4 ri Mi a -$", "")],
}
COMMON_SECTION_REPLACEMENTS = {
    "Fa1TH": "FAITH",
    "FarrH": "FAITH",
    "sKiLi": "SKILL",
    "sKiLL": "SKILL",
    "sramM1iNa": "STAMINA",
    "stAMINa": "STAMINA",
    "Itis": "It is",
    "itis": "it is",
    "Ihave": "I have",
    "totalis": "total is",
    "thehorses": "the horses",
    "Srnashed": "Smashed",
    "srnashed": "smashed",
    "overthe": "over the",
    "yourbody": "your body",
    "iriside": "inside",
    "quesi": "quest",
    "skILL": "SKILL",
    "LucxK": "LUCK",
    "thereisa": "there is a",
    "openit": "open it",
}

TURN_WORDS = (
    "turn|tur|tum|tarn|tuin|tuln|tim|timi|tumi|tium|tiurn|tucn|furn|fum|"
    "fumi|faim|fiumn|hrm|rurn|burn|bun|barn|hurn|hun|hum|humm|hirn|hon|"
    "harn|ham|eum|go|return|continue"
)
TURN_CONNECTORS = r"at\s+once\s+to|back\s+to|to|lo|te|bo|eo|at|ta|i|l|fo"
TURN_TOKEN = r"[0-9OoQIiLlAaEeSsBbGgqQjJzZyY$%(){}.,'\"]{1,6}"


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
    value = value.replace("LucK", "LUCK")
    return value.strip()


def token_to_section(token: str) -> int | None:
    clean = re.sub(r"[^\w()%$]", "", token)
    if clean.isdigit():
        value = int(clean)
        return value if 1 <= value <= MAX_SECTION else None

    mapping = {
        "O": "0",
        "o": "0",
        "Q": "0",
        "I": "1",
        "l": "1",
        "i": "1",
        "a": "1",
        "A": "1",
        "z": "2",
        "Z": "2",
        "j": "3",
        "J": "3",
        "%": "1",
        "$": "5",
        "S": "5",
        "s": "5",
        "b": "6",
        "G": "6",
        "y": "7",
        "Y": "7",
        "e": "8",
        "E": "8",
        "B": "8",
        "g": "9",
        "q": "9",
    }
    digits = "".join(char if char.isdigit() else mapping.get(char, "") for char in clean)
    if not digits:
        return None
    value = int(re.sub(r"00+", "0", digits))
    return value if 1 <= value <= MAX_SECTION else None


def section_references(text: str, current: int) -> list[int]:
    refs = []
    seen = set()
    pattern = re.compile(
        rf"\b(?:{TURN_WORDS})\s+(?:{TURN_CONNECTORS})?\s*({TURN_TOKEN})(?![A-Za-z])",
        re.I,
    )
    for match in pattern.finditer(text):
        target = token_to_section(match.group(1))
        if target and target != current and target not in seen:
            refs.append(target)
            seen.add(target)
    return refs


def clean_section_text(lines: list[tuple[int, str]]) -> str:
    output = []
    for _, raw in lines:
        line = raw.strip()
        if not line:
            continue
        output.append(line)

    value = " ".join(output)
    value = re.sub(r"\s+", " ", value).strip()
    replacements = {
        " Tur ": " Turn ",
        " tur ": " turn ",
        " Tum ": " Turn ",
        " tum ": " turn ",
        " Fum ": " Turn ",
        " furn to": " turn to",
        " burn to": " turn to",
        " hirn to": " turn to",
        " hurn to": " turn to",
        " hum to": " turn to",
    }
    for old, new in replacements.items():
        value = value.replace(old, new)
    return value


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


def apply_manual_sections(sections: dict[str, dict], page_chunks: list[str]) -> None:
    for number, specs in MANUAL_SECTION_SLICES.items():
        text = clean_section_text(manual_slice_lines(page_chunks, specs))
        if not text:
            continue
        sections[str(number)] = {
            "number": number,
            "page": specs[0][0],
            "choices": [],
            "text": text,
            "ocrSource": "manual-slice",
        }


def apply_text_corrections(sections: dict[str, dict]) -> None:
    for number in range(1, MAX_SECTION + 1):
        section = sections[str(number)]
        text = section.get("text", "")
        for old, new in COMMON_SECTION_REPLACEMENTS.items():
            text = text.replace(old, new)
        for pattern, replacement in SECTION_REGEX_CLEANUPS.get(number, []):
            text = re.sub(pattern, replacement, text)
        section["text"] = text.strip()

    for number, text in SECTION_TEXT_OVERRIDES.items():
        section = sections[str(number)]
        section["text"] = text.strip()
        section["ocrSource"] = "manual-corrected"


def intro_from_pages(path: Path) -> str:
    text = path.read_text(encoding="utf-8")
    marker = re.search(r"(?m)^\s*1\s*-\s*4\s*$", text)
    if not marker:
        return ""
    return clean_intro(text[: marker.start()])


def recover_numbered_block(path: Path, header: str, marker: str, next_marker: str) -> str:
    lines = path.read_text(encoding="utf-8").splitlines()
    for index, line in enumerate(lines):
        if line.strip() != header:
            continue
        for marker_index in range(index + 1, min(index + 12, len(lines))):
            if lines[marker_index].strip() != marker:
                continue
            body = []
            for body_index in range(marker_index + 1, len(lines)):
                if lines[body_index].strip() == next_marker:
                    return clean_intro("\n".join(body))
                body.append(lines[body_index])
    return ""


def main() -> int:
    data = load_js_data(OCR_DATA)
    fallback = load_js_data(FALLBACK_DATA)
    page_chunks = re.split(r"\n\s*--- PAGE BREAK ---\s*\n", OCR_PAGES.read_text(encoding="utf-8"))
    fallback_count = 0

    for number in range(1, MAX_SECTION + 1):
        key = str(number)
        section = data["sections"][key]
        if section.get("text", "").strip():
            section["ocrSource"] = section.get("ocrSource") or "tesseract"
            continue

        fallback_section = fallback["sections"][key]
        section["text"] = fallback_section.get("text", "")
        section["choices"] = fallback_section.get("choices", [])
        section["page"] = fallback_section.get("page", section.get("page", 1))
        section["ocrSource"] = "embedded-fallback"
        fallback_count += 1

    if not data["sections"]["321"].get("text", "").strip():
        data["sections"]["321"]["text"] = recover_numbered_block(OCR_PAGES, "321-324", "421", "322")
        data["sections"]["321"]["page"] = 94
        data["sections"]["321"]["choices"] = [362]
        data["sections"]["321"]["ocrSource"] = "tesseract-heading-recovered"

    apply_manual_sections(data["sections"], page_chunks)
    apply_text_corrections(data["sections"])

    for number in range(1, MAX_SECTION + 1):
        section = data["sections"][str(number)]
        section["text"] = re.sub(rf"^\s*{number}\s+", "", section.get("text", "")).strip()
        section["choices"] = section_references(section["text"], number)

    total_fallback = sum(
        1 for section in data["sections"].values() if section.get("ocrSource") == "embedded-fallback"
    )
    total_recovered = sum(
        1 for section in data["sections"].values() if section.get("ocrSource") == "tesseract-heading-recovered"
    )
    total_manual = sum(
        1 for section in data["sections"].values() if section.get("ocrSource") == "manual-slice"
    )
    total_corrected = sum(
        1 for section in data["sections"].values() if section.get("ocrSource") == "manual-corrected"
    )

    data["intro"] = {
        "title": "Introduction",
        "page": 1,
        "text": intro_from_pages(OCR_PAGES),
    }
    data["illustrations"] = illustrations_from_file(ILLUSTRATIONS_DATA)
    data["note"] = (
        "Primary text was generated by fresh Tesseract OCR. "
        f"{total_fallback} sections that Tesseract did not split cleanly use the PDF's embedded OCR fallback; "
        f"{total_recovered} section heading was recovered from OCR context; "
        f"{total_manual} sections use targeted manual OCR slices; "
        f"{total_corrected} sections use manual text corrections."
    )

    OCR_DATA.write_text(
        "window.GAMEBOOK_DATA = " + json.dumps(data, ensure_ascii=False, indent=2) + ";\n",
        encoding="utf-8",
    )
    print(f"Fallback sections filled: {fallback_count}")
    print(f"Manual slices applied: {total_manual}")
    print(f"Manual text corrections applied: {total_corrected}")
    print(f"Intro characters: {len(data['intro']['text'])}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
