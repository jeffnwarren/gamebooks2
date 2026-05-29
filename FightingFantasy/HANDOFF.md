# Fighting Fantasy Gamebooks — Handoff

_Last updated: 2026-05-28_

Digitizing scanned Fighting Fantasy gamebooks into playable HTML readers. Each book lives in its
own directory under `FightingFantasy/` with `playable/` (the reader + `book-data.js`), `source/`
(PDF + cover), and `tools/` (per-book OCR/QA scripts). Howl also has `proofreading/`. Shared
scripts live in [`FightingFantasy/tools/`](tools/).

**Pipeline:** `ocr-gamebook.py` → `extract-gamebook.ps1` → `merge-ocr-data.py` builds
`playable/book-data.js` (sections keyed by number, each with `page` / `choices` / `text`).
Choices are extracted from the OCR'd text by `section_references(text)`, so **OCR quality
directly determines how complete the choice graph is.**

## Playability snapshot

| Book | Sections | Status |
| --- | ---: | --- |
| Howl of the Werewolf | 515 | **Playable, not fully clean** — prose cleaned this session; ~85 orphaned sections + §386 dead end remain |
| Vault of the Vampire | 400 | **Clean & provably winnable** — all 14 orphans resolved; `check:winnable` finds a §1→§400 victory path, all 400 sections reachable, zero trap regions. |
| Sword of the Samurai | 400 | **Not playable yet** — 117/400 sections have no OCR text; graph barely built |

### What "playable" means here (assessed 2026-05-28)
- **Howl and Vault pass every hard integrity check**: all sections present (1–515 / 1–400),
  **zero empty-text**, **zero dangling choice pointers**, and their reader fixtures pass. So both
  are **navigable** — you can roll a character and play; every choice lands on a real, readable
  section. No crashes, no dead clicks, no missing pages.
- **Neither is verified clean or winnable.** Some *inbound* "turn to N" references were
  OCR-corrupted into a different (but valid) number, leaving **orphaned sections** with no way in:

  | | Howl | Vault |
  | --- | ---: | ---: |
  | Orphaned sections (nothing points to them) | 85 | 14 |
  | …whose number appears nowhere in any text | 50 | 10 |
  | Suspicious non-ending dead ends | 1 (§386) | 0 |

  All 14 of Vault's orphans were read and are genuine content, not false positives: the Count's
  (final-boss) bite sub-rule **§212**, two death endings **§310/§370**, a Crucifix/Shield
  conditional hub **§189**, and several encounters. Same corruption class as the §124→200 /
  §237→400 bugs fixed this session, but here no correct inbound survived.
- **In play:** you'll occasionally be mis-routed to a non-sequitur section (the real target's
  reference was corrupted) and some content/endings are unreachable. The main path likely still
  reaches *an* ending, but **no clean §1→victory path has been verified** (the winnability
  validator is unbuilt).
- **Sword** is structurally incomplete — see its section below.

## Per-book status

### Howl of the Werewolf — playable, prose cleaned
- Reader complete (intro/background, navigation, adventure sheet, dice, codewords, full-page
  illustrations, proofreading workbench). Choice-graph QA clean: `scannerFoundUnstoredChoiceTargets`
  = `0`. 376 reachable / 139 unreachable / 1 dead end (§386).
- **This session:** added two graph-safe prose fixers (text-only edits, never touch `choices`):
  - **`fix:turn-refs`** ([HowlOfTheWerewolf/tools/apply-turn-fixes.js](HowlOfTheWerewolf/tools/apply-turn-fixes.js)) —
    273 garbled "turn to N" phrases normalized, gated on the resolved target already being a stored
    choice. 37 ambiguous phrases held back for review.
  - **`fix:stat-glyph`** ([HowlOfTheWerewolf/tools/apply-stat-glyph-fixes.js](HowlOfTheWerewolf/tools/apply-stat-glyph-fixes.js)) —
    26 stat-block digit splits, 31 garbled stat labels, 56 stray glyphs stripped.
  - Both dry-run-first (`:dry`), idempotent, EOL-preserving; reports under `proofreading/review/`.
- **Queued for human review:**
  - `proofreading/review/applied-turn-fixes.md` — 37 held-back phrases (alpha-only/connector-less;
    correct hold-backs include the idiom "turn tail" ×3).
  - `proofreading/review/applied-stat-glyph-fixes.md` — 45 glued glyphs + letter-valued stat blocks
    (`SKILL?`, `STAMINA S`) needing the PDF.
  - `proofreading/exports_from_jeff/howl-proofreading-review.md` — reviewer notes (2026-05-27) not
    yet ingested.
- **TODO §386:** only suspicious non-ending dead end — verify against the source PDF.

### Vault of the Vampire — clean & provably winnable
- Profiled and hand-cleaned earlier; OCR'd much cleaner than Howl. Earlier fixed two `oo`→`0`
  graph bugs (§124 → **[200, 231]**, §237 → **[400]**).
- **Orphan reconciliation complete (this session).** Built [`tools/report-orphans.js`](VaultOfTheVampire/tools/report-orphans.js)
  (`npm run report:orphans`): classifies unreachable sections into true orphans vs downstream,
  groups them into islands, detects **gate hubs** (puzzle/computed references) and a fragile-target
  watch list. All 14 orphans were then **PDF-confirmed** (rendered pages via PyMuPDF) and resolved:
  - **9 inbound-link fixes** (OCR digit misreads, choices + prose): §269 `304→301`, §272 `378→370`,
    §336 `239→219`, §208 `320→310`, §292 `346→340`, §288 `+151` ("£51"), §229 `+189`,
    §178 `242→212`, §305 `+355`.
  - **5 orphans are intentional, no fix** — a *magical-page* puzzle the choice-graph can't follow:
    §188 = the magic page itself, §94 = half of 188, §376 = twice 188, §169 = the jar-number gate
    (§282), §350 = the §123 cipher. Plus §378 (the library where you get the Book of Swords) is
    reachable via the **Silver Key #378 gate** (§146→§332).
  - `npm run check` passes; unreachable **27 → 8**, and all 8 are gated-by-design or downstream of a
    gate (§328/§374 via §94). **Zero genuine broken links.** Every section is player-reachable.
- **Key lesson:** substitution corruption leaves no garbled token to grep — both OCRs render a
  *valid wrong* number. The digit-confusion candidate heuristic found only ~half the antecedents;
  the rest needed narrative tracing + the **PDF text layer** (a separate OCR) + page rendering.
- **Winnability verified (this session).** Built [`tools/check-winnable.js`](VaultOfTheVampire/tools/check-winnable.js)
  (`npm run check:winnable`, now part of `npm run check`). It proves a §1→§400 victory path
  (Katarina slain, Nastassia rescued), modelling the computed gates as explicit edges and using
  optimistic reachability (assumes item/stat/LUCK gates are satisfiable). Result: **all 400
  sections reachable, 381 can reach victory (19 are death endings), zero "stuck"/trap sections.**
  Also fixed §400 (the victory ending) which had a spurious `choices: [8]` from OCR tail-garbage.
- **Vault is done** for the digitization goals: clean integrity, fully connected, provably
  completable. Remaining polish is optional (cosmetic prose, the deferred stat-glyph pass).

### Sword of the Samurai — needs foundational OCR work first
- **Not ready for cosmetic fixes.** 117 of 400 sections have no OCR text (`ocrSource: "missing"`),
  and since `merge-ocr-data.py` derives choices from text, the graph barely exists: only **2
  sections reachable** from §1 (§297, the only hop, is itself empty), 215 sections have no stored
  choices, 116 have turn-targets not in their choices. Roughly where Howl was before its
  OCR-recovery pass.
- **Prerequisites, in order:** (1) complete OCR for the 117 missing sections (Howl-style targeted
  manual slices or re-OCR), (2) re-run `merge-ocr-data.py` to rebuild choices, (3) add a
  `check-data.js` + graph QA, then (4) the cosmetic fixers apply (a probe already finds ~60 safe
  turn-ref rewrites once the graph is trustworthy).

## Cross-book next steps (prioritized)
1. **Orphan reconciliation** (`report:orphans`) — ✅ **Vault done** (this session). **Howl next**
   (85 orphans): port [`VaultOfTheVampire/tools/report-orphans.js`](VaultOfTheVampire/tools/report-orphans.js)
   to Howl and apply the same PDF-confirm workflow. Expect Howl to also have gate/computed
   references — run the gate-hub detector first and exclude those before chasing inbound links.
2. **Winnability validator** (`check:winnable`) — ✅ **built for Vault** (this session). Port to
   Howl after its orphan pass; the computed-gate modelling and optimistic-reachability approach
   carry over (Howl will need its own victory section + gate list).
3. **Sword OCR completion** — recover the 117 missing sections, then rebuild choices.
4. **Port the fix/report tooling to Vault & Sword** (they lack `report:review`, `fix:*`,
   `export:proofreading`) and **factor shared logic into [`FightingFantasy/tools/`](tools/)** —
   the per-book `tools/` currently duplicate `check-data.js`, `ocr-gamebook.py`, `merge-ocr-data.py`,
   etc. across books.
5. **CI / commit hook** to run each book's `npm run check` automatically.

## Tooling reference (Howl has the most complete set)
| Command (run from a book dir) | Action |
| --- | --- |
| `npm run fix:turn-refs:dry` / `fix:turn-refs` | Normalize garbled "turn to N" prose (graph-safe) — Howl |
| `npm run fix:stat-glyph:dry` / `fix:stat-glyph` | Split stat blocks, fix stat labels, strip stray glyphs — Howl |
| `npm run report:review` | Rebuild the OCR review queue + safe-fix candidates — Howl |
| `npm run report:graph` | Choice-graph warnings (unreachable / dead ends) — Howl, Vault |
| `npm run report:orphans` | Orphan reconciliation: islands, gate hubs, fragile targets — Vault |
| `npm run check:winnable` | Prove a §1→victory path through the computed gates — Vault |
| `npm run check` | Full QA suite (syntax, data, intro, OCR smoke, fixtures, winnable) — Howl, Vault |

**Running checks for Howl:** it has no local `node_modules`; borrow Vault's installed Playwright:

```powershell
$env:NODE_PATH=(Resolve-Path '..\VaultOfTheVampire\node_modules').Path
npm.cmd run check
```
