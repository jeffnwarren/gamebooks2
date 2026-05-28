# Howl of the Werewolf — Handoff

_Last updated: 2026-05-28_

## Where things stand
- 515 sections; playable reader is complete (intro/background, navigation, adventure
  sheet, dice, codewords, full-page illustrations, proofreading workbench).
- Choice-graph QA is clean: `scannerFoundUnstoredChoiceTargets` = `0`. Every numeric
  "turn to N" the scanner can see is already a stored choice.
- Remaining graph warnings are expected noise, not confirmed bugs: `139` unreachable
  sections and `1` suspicious non-ending dead end (§386). They come from conditional,
  codeword, puzzle, and hidden-number paths the reachability walk can't follow.
- Prose OCR cleanup runs through dry-run/apply tools that **never touch the choice
  graph** — every `book-data.js` edit is confined to `"text"` fields (verified with
  `git diff`).

## Just completed (this session)
- **`fix:turn-refs`** ([tools/apply-turn-fixes.js](tools/apply-turn-fixes.js)) — normalized **273**
  garbled "turn to N" phrases in prose (`"Turn fo 5a0"` → `"Turn to 510"`, `"3§6"` → `"356"`).
  Each rewrite is gated on the resolved target already being a stored `choice` of that
  section, so the graph is provably unchanged. 37 ambiguous phrases were held back for review.
- **`fix:stat-glyph`** ([tools/apply-stat-glyph-fixes.js](tools/apply-stat-glyph-fixes.js)) — **26**
  stat-block digit splits (`SKILL6`→`SKILL 6`), **31** garbled stat labels
  (`sxILL`→`SKILL`, `sTaMINa`→`STAMINA`), **56** stray page-art glyphs stripped (® © ¥ € ™).
- Both tools are dry-run-first (`:dry`), idempotent, EOL-preserving, and write full
  before/after reports under `proofreading/review/`.
- `npm run check` passes; graph metrics identical before and after (376 reachable /
  139 unreachable / 0 unstored / 1 dead-end).

## Next steps (prioritized)

### 1. Human review of queued items — fast, high-value
- `proofreading/review/applied-turn-fixes.md` — **37 phrases held back** (alpha-only number
  tokens, connector-less). Notable correct hold-backs: `"turn tail"` (idiom, ×3) and
  `"him is"`. For any that are genuine turn-refs, fix by hand or extend the tool's allowlist.
- `proofreading/review/applied-stat-glyph-fixes.md` — **45 glued glyphs** plus stat values
  written as letters (`SKILL?`, `STAMINA S`). These need the source PDF to recover the digit.
- `proofreading/exports_from_jeff/howl-proofreading-review.md` — reviewer notes (2026-05-27)
  not yet ingested (e.g. remove the intro "photocopies of the sheet" line).

### 2. Unbuilt automation (from the options menu)
- **`report:orphans`** — in-degree analysis to turn the 139 "unreachable" into ranked
  likely-source suggestions; would also help resolve the §386 dead end.
- **`check:winnable`** — prove ≥1 path from §1 to a victory ending; flag trap cycles and
  unsatisfiable codeword gates (stronger than reachability).
- **Port the fix/report tooling to Vault & Sword** — they still lack `report:review`,
  `fix:*`, and `export:proofreading`. Factor shared logic into the top-level `tools/`.
  - _Vault status (2026-05-28):_ profiled and hand-cleaned — it OCR'd much cleaner than
    Howl (only ~6 garbled turn-refs, 3 stat splits, 0 label garbles, 1 stray glyph).
    Fixed those plus **two genuine graph bugs** the `oo`→`0` collapse had masked:
    §124 `2oo`/`2jt` → choices **[200, 231]** (was [20]; §200 is the Wraith fight, §231 the
    no-Magic-Sword branch) and §237 `4oo` → **[400]** (was [40]). Not worth porting the full
    toolchain for so few fixes.
  - _Sword status (2026-05-28):_ **not ready for cosmetic fixes — needs foundational
    work first.** 117 of 400 sections have no OCR text (`ocrSource: "missing"`), and
    since `merge-ocr-data.py` derives choices from text, the graph is barely built:
    only **2 sections reachable** from §1 (§297, the only hop, is itself empty), 215
    sections have no stored choices, and 116 have turn-targets not in their choices.
    This is roughly where Howl was before its OCR-recovery pass. Prerequisites, in order:
    (1) complete OCR for the 117 missing sections (Howl-style targeted manual slices or
    re-OCR), (2) re-run `merge-ocr-data.py` to rebuild choices from the completed text,
    (3) add a `check-data.js` + graph QA, then (4) the cosmetic turn-ref/stat/glyph fixers
    become applicable. A turn-ref probe already finds ~60 safe rewrites once the graph is
    trustworthy.
- **CI / commit hook** to run `npm run check` automatically.

### 3. Known TODO
- **§386**: the only suspicious non-ending dead end — verify against the source PDF, as the
  printed text appears to have no onward turn.

## Running checks in this workspace
Howl has no local `node_modules`; borrow Vault's installed Playwright via `NODE_PATH`:

```powershell
$env:NODE_PATH=(Resolve-Path '..\VaultOfTheVampire\node_modules').Path
npm.cmd run check
```

## Fixer reference
| Command | Action |
| --- | --- |
| `npm run fix:turn-refs:dry` / `fix:turn-refs` | Normalize garbled "turn to N" prose (graph-safe) |
| `npm run fix:stat-glyph:dry` / `fix:stat-glyph` | Split stat blocks, fix stat labels, strip stray glyphs |
| `npm run report:review` | Rebuild the OCR review queue + safe-fix candidates |
| `npm run report:graph` | Choice-graph warnings (unreachable / dead ends) |
