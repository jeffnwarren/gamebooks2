# Howl of the Werewolf Playable Version

Open `index.html` in a browser to play. Source assets live in `../source`.

The app includes:

- The introduction and rules as the starting view, with Background available as page `0` or `ii`.
- Section navigation with history, bookmarks, search, and manual jump.
- Adventure sheet fields saved in local browser storage.
- Dice, luck test, starting hero rolls, and a simple attack round helper.
- Dedicated codeword tracking with current-section add, cross-off, and check prompts, including normalization for common OCR variants.
- An optional original PDF page pane that is off by default.

The main book text now comes from fresh Tesseract OCR, re-split for Howl's 515-section structure. A targeted manual-slice layer repairs OCR marker misses so all 515 sections have recovered text, while the app keeps the PDF pane available as the authoritative source whenever extracted text looks odd.

Illustrations are limited to the cover plus full-page illustrations detected from the book PDF. Run `npm run report:illustrations -- --summary` to inspect the detected list, or `npm run build:illustrations` to write `illustrations.json` and extract the selected JPEGs into `playable/illustrations`.

Run `npm run check` from the project root for JavaScript syntax, book-data integrity, intro rendering, intro/background OCR smoke checks, and golden browser fixtures. Use `npm run check:choices -- 1 10 100` to sample specific sections, `npm run report:graph` for choice graph warnings, and `npm run report:ocr -- 25` for the highest-scoring OCR suspects.

## QA status

Current graph QA has no known missing stored choice targets: `scannerFoundUnstoredChoiceTargets` is `0`. Remaining graph warnings are broader review queues: `169` unreachable sections and `108` suspicious non-ending dead ends. These are noisier because they can include conditional, puzzle, codeword, and hidden-number paths.

In this workspace, if Howl's Playwright-based fixture check cannot find dependencies, run checks with Vault's installed modules on `NODE_PATH`:

```powershell
$env:NODE_PATH='C:\AI\FightingFantasy\VaultOfTheVampire\node_modules'
npm run check
```

To regenerate `book-data.js` from the PDF, run this from the project root after Tesseract and the Python packages are installed:

```powershell
python .\tools\ocr-gamebook.py
powershell -ExecutionPolicy Bypass -File .\tools\extract-gamebook.ps1 -OutDir .\tools\embedded-cache
python .\tools\merge-ocr-data.py
```
