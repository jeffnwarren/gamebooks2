// Build playable/review.html: a single, static, printable read-through of the
// whole book for a human proofreading / playthrough pass against the source
// PDF. Renders intro + background + all sections in order, places each curated
// full-page illustration at the passage it depicts, and auto-flags the things
// a reviewer should eyeball:
//   - choice targets whose number never appears in the section's own prose
//     (misroute risk: a choice pointing at a valid-but-wrong section)
//   - stray lonely OCR glyphs (=, %, stray punctuation runs)
//   - unbalanced parentheses (truncated parenthetical, classic OCR tail)
// It is regenerated from book-data.js, so it always reflects the live data.
const fs = require("fs");
const path = require("path");

const playable = path.join(__dirname, "..", "playable");
const bookDataPath = path.join(playable, "book-data.js");
const outPath = path.join(playable, "review.html");

global.window = {};
require(bookDataPath);
const data = window.GAMEBOOK_DATA;
const sections = data.sections || {};

const illustrationsBySection = new Map();
for (const item of data.illustrations?.fullPageIllustrations || []) {
  if (item && item.image && Number.isInteger(item.section)) {
    const list = illustrationsBySection.get(item.section) || [];
    list.push(item);
    illustrationsBySection.set(item.section, list);
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const numbers = Object.keys(sections)
  .map((n) => parseInt(n, 10))
  .filter((n) => Number.isFinite(n))
  .sort((a, b) => a - b);

// --- proofreading heuristics -------------------------------------------------

// Does `target` appear as a standalone number token anywhere in `text`?
function numberInText(text, target) {
  const re = new RegExp(`(?<!\\d)${target}(?!\\d)`);
  return re.test(text);
}

function detectStrayGlyphs(text) {
  const hits = [];
  // lonely symbol surrounded by spaces, e.g. " = ", " % "
  const lonely = text.match(/(?:^|\s)[=%~^|\\]+(?:\s|$)/g);
  if (lonely) hits.push(...lonely.map((s) => s.trim()).filter(Boolean));
  // runs of 3+ identical non-word chars (page-art residue like "SSS", "OOOO")
  const runs = text.match(/([^\w\s])\1{2,}/g);
  if (runs) hits.push(...runs);
  return [...new Set(hits)];
}

function parenBalance(text) {
  const open = (text.match(/\(/g) || []).length;
  const close = (text.match(/\)/g) || []).length;
  return open - close; // !== 0 is suspicious
}

// --- rendering ---------------------------------------------------------------

function renderText(text, choices) {
  // Wrap each standalone choice-target number in a highlight span so the
  // reviewer can quickly see where the "turn to N" lands in the prose, and
  // can spot ones that are missing entirely (flagged separately above).
  let html = esc(text);
  const seen = new Set();
  for (const t of choices) {
    if (seen.has(t)) continue;
    seen.add(t);
    const re = new RegExp(`(?<!\\d)(${t})(?!\\d)`, "g");
    html = html.replace(re, '<span class="ref">$1</span>');
  }
  return html;
}

function renderFlags(num, sec) {
  const text = sec.text || "";
  const choices = Array.isArray(sec.choices) ? sec.choices : [];
  const flags = [];

  const missing = choices.filter((t) => !numberInText(text, t));
  if (missing.length) {
    flags.push(
      `<span class="flag flag-route">choice ${missing.join(", ")} not in prose</span>`
    );
  }
  const stray = detectStrayGlyphs(text);
  if (stray.length) {
    flags.push(
      `<span class="flag flag-glyph">stray: ${esc(stray.join("  "))}</span>`
    );
  }
  const pb = parenBalance(text);
  if (pb !== 0) {
    flags.push(
      `<span class="flag flag-paren">unbalanced parens (${pb > 0 ? "+" : ""}${pb})</span>`
    );
  }
  if (choices.length === 0) {
    flags.push(`<span class="flag flag-end">ending / no choices</span>`);
  }
  return flags.join(" ");
}

function renderSection(num) {
  const sec = sections[num] || {};
  const text = sec.text || "";
  const choices = Array.isArray(sec.choices) ? sec.choices : [];
  const ills = illustrationsBySection.get(num) || [];

  const illHtml = ills
    .map(
      (i) =>
        `<figure class="ill"><img loading="lazy" src="${esc(i.image)}" alt="Illustration at section ${num}"><figcaption>PDF page ${i.pdfPage} — illustration for §${num}</figcaption></figure>`
    )
    .join("");

  const choiceHtml = choices.length
    ? `<div class="choices">→ ${choices
        .map((c) => `<a href="#s${c}">${c}</a>`)
        .join(" · ")}</div>`
    : "";

  const flags = renderFlags(num, sec);
  const flagClass = flags ? " has-flag" : "";

  return `<section class="passage${flagClass}" id="s${num}">
  <div class="head">
    <span class="num">${num}</span>
    <span class="page">PDF p.${sec.page ?? "?"} · src:${esc(sec.ocrSource || "?")}</span>
    ${flags ? `<span class="flags">${flags}</span>` : ""}
  </div>
  ${illHtml}
  <p class="prose">${renderText(text, choices)}</p>
  ${choiceHtml}
</section>`;
}

function renderIntroBlock(key, title) {
  const block = data[key];
  if (!block || !block.text) return "";
  const paras = esc(block.text)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\n/g, " ").trim())
    .filter(Boolean)
    .map((p) => `<p>${p}</p>`)
    .join("\n");
  return `<section class="passage intro" id="${key}">
  <div class="head"><span class="num">${esc(title)}</span></div>
  ${paras}
</section>`;
}

const totalFlags = numbers.filter((n) => renderFlags(n, sections[n] || {})).length;
const routeFlags = numbers.filter((n) => {
  const sec = sections[n] || {};
  const ch = Array.isArray(sec.choices) ? sec.choices : [];
  return ch.some((t) => !numberInText(sec.text || "", t));
}).length;

const body = numbers.map(renderSection).join("\n");

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vault of the Vampire — Proofreading Review</title>
<style>
  :root { --flag: #b00020; }
  * { box-sizing: border-box; }
  body { font: 16px/1.55 Georgia, "Times New Roman", serif; margin: 0; color: #1a1a1a; background: #f4f1ea; }
  header.top { position: sticky; top: 0; z-index: 10; background: #2a1f1f; color: #f4f1ea; padding: 10px 16px; box-shadow: 0 1px 6px rgba(0,0,0,.3); }
  header.top h1 { font-size: 18px; margin: 0 0 4px; }
  header.top .meta { font: 12px/1.4 system-ui, sans-serif; opacity: .85; }
  header.top form { display: inline-flex; gap: 6px; margin-left: 12px; }
  header.top input { width: 70px; }
  .legend { font: 12px/1.4 system-ui, sans-serif; margin-top: 6px; }
  .legend b { font-weight: 600; }
  main { max-width: 820px; margin: 0 auto; padding: 24px 18px 120px; }
  .howto { background: #fff; border-left: 4px solid #2a1f1f; padding: 12px 16px; font: 13px/1.5 system-ui, sans-serif; margin-bottom: 28px; }
  .passage { background: #fff; border: 1px solid #e2dccd; border-radius: 6px; padding: 14px 18px; margin: 0 0 14px; scroll-margin-top: 80px; }
  .passage.has-flag { border-color: var(--flag); box-shadow: inset 4px 0 0 var(--flag); }
  .passage.intro .prose, .passage.intro p { font-size: 15px; }
  .head { display: flex; align-items: baseline; flex-wrap: wrap; gap: 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; margin-bottom: 8px; }
  .num { font-weight: 700; font-size: 20px; }
  .page { font: 11px/1.3 system-ui, sans-serif; color: #888; }
  .flags { font: 11px/1.3 system-ui, sans-serif; display: flex; gap: 6px; flex-wrap: wrap; }
  .flag { color: #fff; background: var(--flag); border-radius: 3px; padding: 1px 6px; }
  .flag-end { background: #5a5a5a; }
  .flag-glyph { background: #8a6d00; }
  .flag-paren { background: #7a3e00; }
  .prose { white-space: normal; margin: 0; }
  .ref { background: #fff3b0; border-radius: 2px; padding: 0 2px; font-weight: 600; }
  .choices { margin-top: 8px; font: 13px/1.4 system-ui, sans-serif; color: #444; }
  .choices a { color: #7a1020; text-decoration: none; font-weight: 600; }
  .choices a:hover { text-decoration: underline; }
  figure.ill { margin: 10px 0; text-align: center; }
  figure.ill img { max-width: 100%; border: 1px solid #ccc; }
  figure.ill figcaption { font: 11px/1.3 system-ui, sans-serif; color: #888; margin-top: 4px; }
  @media print {
    header.top { position: static; }
    .howto { border-left-color: #000; }
    .passage { break-inside: avoid; border-color: #ccc; box-shadow: none; }
    .passage.has-flag { box-shadow: inset 4px 0 0 #000; }
    .ref { background: none; text-decoration: underline; }
  }
</style>
</head>
<body>
<header class="top">
  <h1>Vault of the Vampire — Proofreading Review
    <form onsubmit="location.hash='#s'+this.n.value;return false;">
      <input name="n" type="number" min="1" max="400" placeholder="§" aria-label="Jump to section">
      <button type="submit">Go</button>
    </form>
  </h1>
  <div class="meta">${numbers.length} sections · generated ${esc(data.generatedAt || "")} · ${totalFlags} sections carry an auto-flag (${routeFlags} with a choice→prose mismatch)</div>
  <div class="legend">
    <b style="color:#ff8a8a">choice N not in prose</b> = possible misroute ·
    <b style="color:#ffd54a">stray</b> = lonely OCR glyph ·
    <b style="color:#e0a060">parens</b> = truncated parenthetical ·
    yellow <span class="ref">N</span> = where a "turn to N" lands in the text
  </div>
</header>
<main>
  <div class="howto">
    <b>How to use:</b> read straight through against the source PDF
    (<code>${esc(data.sourcePdf || "")}</code>). Red-barred passages have an automatic flag worth checking;
    most flags are cosmetic OCR tails, but a <b>choice→prose mismatch</b> can mean a real misroute
    (the choice points at a valid-but-wrong section). Illustrations appear at their curated passage.
    Note corrections by section number; the graph/winnability are already verified, so this pass is about
    <b>prose fidelity</b>, not connectivity. Regenerate with <code>node tools/build-review.js</code>.
  </div>
  ${renderIntroBlock("intro", "Introduction")}
  ${renderIntroBlock("background", "Background")}
  ${body}
</main>
</body>
</html>`;

fs.writeFileSync(outPath, html);
console.log(
  JSON.stringify(
    {
      out: path.relative(path.join(__dirname, ".."), outPath),
      sections: numbers.length,
      sectionsWithFlags: totalFlags,
      choiceProseMismatches: routeFlags,
      illustrationsPlaced: [...illustrationsBySection.values()].reduce((a, b) => a + b.length, 0),
    },
    null,
    2
  )
);
