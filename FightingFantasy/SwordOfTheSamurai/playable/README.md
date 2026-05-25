# Sword of the Samurai Playable Version

Open `index.html` in a browser to play. Source assets live in `../source`.

The app includes:

- The introduction and rules as the starting view, with Background available as page `0` or `ii`.
- Section navigation with history, bookmarks, search, and manual jump.
- Adventure sheet fields saved in local browser storage.
- Dice, luck test, and a simple attack round helper.
- An optional original PDF page pane that is off by default.

The main book text comes from fresh Tesseract OCR. A small number of sections may use the PDF's embedded OCR as fallback where Tesseract did not split a section cleanly. The PDF pane is included as the authoritative source whenever extracted text looks odd.

To regenerate `book-data.js` from the PDF, run this from the project root after Tesseract and the Python packages are installed:

```powershell
python .\tools\ocr-gamebook.py
powershell -ExecutionPolicy Bypass -File .\tools\extract-gamebook.ps1 -OutDir .\tools\embedded-cache
python .\tools\merge-ocr-data.py
```
