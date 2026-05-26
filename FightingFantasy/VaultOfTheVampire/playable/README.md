# Vault of the Vampire Playable Version

Open `index.html` in a browser to play. Source assets live in `../source`.

The app includes:

- The introduction and rules as the starting view, with Background available as page `0` or `ii`.
- Section navigation with history, bookmarks, search, and manual jump.
- Full-page illustrations shown contextually in the reader, plus an illustration index in the sidebar.
- Adventure sheet fields saved in local browser storage.
- Dice, luck test, and a simple attack round helper.
- An optional original PDF page pane that is off by default.

The main book text now comes from fresh Tesseract OCR, which is much more readable than the PDF's embedded OCR layer. A small number of sections use the embedded OCR as fallback where Tesseract did not split a section cleanly. The PDF pane is included as the authoritative source whenever extracted text looks odd.

Illustrations are limited to the cover plus full-page illustrations detected from the book PDF. The playable reader embeds the detected illustration metadata during `merge-ocr-data.py`, shows each illustrated PDF page once at the first section on that page, and lists all extracted images in the sidebar. Run `npm run report:illustrations -- --summary` to inspect the detected list, or `npm run build:illustrations` to write `illustrations.json` and extract the selected JPEGs into `playable/illustrations`.

Run `npm run check` from the project root for JavaScript syntax, book-data integrity, intro rendering, intro/background OCR smoke checks, and golden browser fixtures. Use `npm run check:choices -- 1 10 100` to sample specific sections, `npm run report:graph` for choice graph warnings, and `npm run report:ocr -- 25` for the highest-scoring OCR suspects.

## QA status

Current graph QA has no known missing stored choice targets: `scannerFoundUnstoredChoiceTargets` is `0`, and no suspicious non-ending dead ends. The remaining graph warning queue is `27` unreachable sections, mostly conditional, puzzle, or hidden-number paths.

To regenerate `book-data.js` from the PDF, run this from the project root after Tesseract and the Python packages are installed:

```powershell
python .\tools\ocr-gamebook.py
powershell -ExecutionPolicy Bypass -File .\tools\extract-gamebook.ps1 -OutDir .\tools\embedded-cache
python .\tools\merge-ocr-data.py
```
