# Howl of the Werewolf Playable Version

Open `index.html` in a browser to play. Source assets live in `../source`.

The app includes:

- The introduction and rules as the starting view, with Background available as page `0` or `ii`.
- Section navigation with history, bookmarks, search, and manual jump.
- Adventure sheet fields saved in local browser storage.
- Dice, luck test, starting hero rolls, and a simple attack round helper.
- Dedicated codeword tracking with current-section add, cross-off, and check prompts, including normalization for common OCR variants.
- Full-page illustrations shown contextually in the reader, plus an illustration index in the sidebar.
- An optional original PDF page pane that is off by default.
- `proofreader.html`, a page-by-page proofreading workbench with automatic OCR flags, editable text, human highlights, reviewed status, and JSON/Markdown export.

The main book text now comes from fresh Tesseract OCR, re-split for Howl's 515-section structure. A targeted manual-slice layer repairs OCR marker misses so all 515 sections have recovered text, while the app keeps the PDF pane available as the authoritative source whenever extracted text looks odd.

Illustrations are limited to the cover plus full-page illustrations detected from the book PDF. The playable reader embeds the detected illustration metadata during `merge-ocr-data.py`, shows each illustrated PDF page once at the first section on that page, and lists all extracted images in the sidebar. Run `npm run report:illustrations -- --summary` to inspect the detected list, or `npm run build:illustrations` to write `illustrations.json` and extract the selected JPEGs into `playable/illustrations`.

Run `npm run check` from the project root for JavaScript syntax, book-data integrity, intro rendering, proofreader smoke coverage, intro/background OCR smoke checks, and golden browser fixtures. Use `npm run check:choices -- 1 10 100` to sample specific sections, `npm run report:graph` for choice graph warnings, `npm run report:ocr -- 25` for the highest-scoring OCR suspects, `npm run report:review` for a human-facing OCR review queue plus safe-fix candidates, `npm run fix:intro-ocr:dry` to preview the curated intro/background cleanup, `npm run fix:intro-ocr` to apply it, `npm run fix:safe-ocr:dry` to preview exact safe OCR replacements, `npm run fix:safe-ocr` to apply them, and `npm run export:proofreading` to generate raw/readable text copies plus paste-sized chunks.

## QA status

Current graph QA has no known missing stored choice targets: `scannerFoundUnstoredChoiceTargets` is `0`. Remaining graph warnings are broader review queues: `139` unreachable sections and `1` suspicious non-ending dead end. These are noisier because they can include conditional, puzzle, codeword, hidden-number paths, and source text with no printed onward turn.

## TODO

- **Dead ends review**: Review section 386, the only remaining suspicious non-ending dead end, against the source because the printed text appears to have no onward turn.

In this workspace, if Howl's Playwright-based fixture check cannot find dependencies, run checks with Vault's installed modules on `NODE_PATH`:

```powershell
$env:NODE_PATH=(Resolve-Path '..\VaultOfTheVampire\node_modules').Path
npm.cmd run check
```

To regenerate `book-data.js` from the PDF, run this from the project root after Tesseract and the Python packages are installed:

```powershell
python .\tools\ocr-gamebook.py
powershell -ExecutionPolicy Bypass -File .\tools\extract-gamebook.ps1 -OutDir .\tools\embedded-cache
python .\tools\merge-ocr-data.py
```
