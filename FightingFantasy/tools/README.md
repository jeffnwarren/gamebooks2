# Shared gamebook tools

Cross-book tooling shared by every playable gamebook (Vault of the Vampire, Howl
of the Werewolf, Sword of the Samurai). A fix here benefits all books at once.

## `ocr-artifacts.js` — OCR-artifact detector

A reusable detector for the recurring OCR defects we keep finding by hand: stray
exclamations, glued/garbled stat blocks, leaked section-number headers, trailing
page-scan residue, and common substitution typos. It is the single source of
truth so that catching a new defect class in one book immediately covers them all.

`scanArtifacts(data)` walks every section plus the intro/background text and
returns findings `{ category, severity, weight, section, match, context }`.
Detectors are split by severity:

- **`gate`** — high-confidence, zero-tolerance defects. A book's `check:artifacts`
  fails the build if any remain.
- **`review`** — fuzzier suspects worth a human look; surfaced in reports only.

### Per-book wiring

Each book has thin wrappers in its own `tools/` that require this module:

- `tools/check-artifacts.js` → `npm run check:artifacts` — exits non-zero on any
  `gate` finding. Vault wires this into its `npm run check`.
- `tools/report-artifacts.js` → `npm run report:artifacts` — prints all findings
  grouped by category (add `--all` to list every hit).

### Adoption status

| Book | `report:artifacts` | gated in `check`? | gate backlog |
| --- | --- | --- | --- |
| Vault of the Vampire | yes | **yes** | 0 (clean) |
| Howl of the Werewolf | yes | not yet | sizeable |
| Sword of the Samurai | yes | not yet | sizeable |

Howl and Sword carry large pre-existing OCR backlogs, so their gates are not yet
in `npm run check`. Run `npm run report:artifacts` in those books to see the work
queue; promote `check:artifacts` into the `check` chain once the gate reaches 0.

When you fix a flagged defect, prefer routing the correction through the book's
durable OCR-correction layer (e.g. Vault's `SECTION_TEXT_OVERRIDES` /
`COMMON_SECTION_REPLACEMENTS` / `SECTION_REGEX_CLEANUPS` in `merge-ocr-data.py`)
so it survives regenerating `book-data.js` from the source PDF.
