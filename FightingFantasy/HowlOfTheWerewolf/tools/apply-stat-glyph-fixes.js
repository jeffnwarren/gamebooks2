// Mechanical OCR cleanup of stat blocks and stray glyphs in section prose.
//
// Three conservative passes, all gated to avoid touching real words:
//   1. Digit split   - "SKILL6" -> "SKILL 6" (clean label glued to a number).
//   2. Garbled labels - exact, case-sensitive allowlist of OCR'd stat labels
//      (e.g. "sTaMINa" -> "STAMINA"). Forms carrying a mis-OCR'd value letter
//      ("STAMINAS", "STAMINAY") are left for PDF review.
//   3. Stray glyphs   - removes ® © ¥ € £ ™ § only when whitespace-standalone.
//      Glyphs glued to text (e.g. "SKILL§", "®warning", "b¥") are reported but
//      left alone, since they usually stand in for a digit or letter.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const bookDataPath = path.join(projectRoot, "playable", "book-data.js");
const reportPath = path.join(projectRoot, "proofreading", "review", "applied-stat-glyph-fixes.md");
const buildReviewScript = path.join(__dirname, "build-review-queue.js");
const dryRun = process.argv.includes("--dry-run");

const PREFIX = "window.GAMEBOOK_DATA = ";

const digitSplitRegex = /\b(SKILL|STAMINA|LUCK|CHANGE|ALARM)(\d{1,2})\b/g;

// Exact, case-sensitive OCR surface forms only. Anything that is also a real
// English word (skull, spell, still, small, change, Luce, ...) is excluded.
const labelMap = new Map([
  ["sxILL", "SKILL"], ["skILL", "SKILL"], ["skKiLL", "SKILL"], ["sKiLL", "SKILL"],
  ["SkILL", "SKILL"], ["SEILL", "SKILL"],
  ["sTaMINa", "STAMINA"], ["staMINa", "STAMINA"], ["STAMINa", "STAMINA"],
  ["sTamina", "STAMINA"], ["sTaMina", "STAMINA"], ["stAMINa", "STAMINA"],
  ["STAMINAa", "STAMINA"], ["sTaMINaA", "STAMINA"], ["sTamMINA", "STAMINA"],
  ["sTAMENA", "STAMINA"], ["STAMENA", "STAMINA"],
  ["LUcE", "LUCK"], ["LUCE", "LUCK"], ["LucE", "LUCK"],
  ["CHaNGE", "CHANGE"]
]);

// § and £ are excluded from auto-strip: this book's OCR routinely uses them as
// the digit 5 / 1 (e.g. "§8" = 58, "STAMINA §" = STAMINA 5), so a standalone one
// is often a lost number. They are reported for review instead of removed.
const autoStripGlyphs = new Set(["®", "©", "¥", "€", "™"]);
const reviewGlyphs = new Set(["§", "£"]);
const glyphChars = new Set([...autoStripGlyphs, ...reviewGlyphs]);

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSpaceOrEdge(ch) {
  return ch === "" || /\s/.test(ch);
}

const digitSplits = [];
const labelFixes = [];
const glyphStrips = [];
const glyphGlued = [];

function fixSection(number, text) {
  // 1. garbled labels (case-sensitive, word-bounded). Run before the digit split
  // so a label glued to its value ("skILL7" -> "SKILL7") is then split below.
  for (const [from, to] of labelMap) {
    const re = new RegExp(`(^|[^A-Za-z])(${escapeRegExp(from)})(?=$|[^A-Za-z])`, "g");
    text = text.replace(re, (full, pre) => {
      labelFixes.push({ number, before: from, after: to });
      return `${pre}${to}`;
    });
  }

  // 2. digit split
  text = text.replace(digitSplitRegex, (m, label, digits) => {
    digitSplits.push({ number, before: m, after: `${label} ${digits}` });
    return `${label} ${digits}`;
  });

  // 3. stray glyphs: drop only when whitespace-standalone
  let stripped = false;
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (glyphChars.has(ch)) {
      const before = i > 0 ? text[i - 1] : "";
      const after = i < text.length - 1 ? text[i + 1] : "";
      const ctx = text.slice(Math.max(0, i - 22), i + 23).replace(/\s+/g, " ").trim();
      const standalone = isSpaceOrEdge(before) && isSpaceOrEdge(after);
      if (standalone && autoStripGlyphs.has(ch)) {
        glyphStrips.push({ number, glyph: ch, ctx });
        stripped = true;
        continue; // drop it
      }
      glyphGlued.push({ number, glyph: ch, ctx, standalone });
    }
    out += ch;
  }
  if (stripped) {
    out = out.replace(/ {2,}/g, " ").replace(/^ +/, "").replace(/ +$/, "");
  }
  return out;
}

// ---- load, transform, write ----
const raw = fs.readFileSync(bookDataPath, "utf8");
const data = JSON.parse(raw.slice(PREFIX.length).replace(/;\s*$/, ""));

for (const key of Object.keys(data.sections)) {
  const section = data.sections[key];
  section.text = fixSection(Number(key), String(section.text || ""));
}

const totalApplied = digitSplits.length + labelFixes.length + glyphStrips.length;
if (!dryRun && totalApplied) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const out = `${PREFIX}${JSON.stringify(data, null, 2)};\n`.replace(/\n/g, eol);
  fs.writeFileSync(bookDataPath, out, "utf8");
}

// ---- report ----
function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function tally(list, keyFn) {
  const counts = {};
  for (const item of list) {
    const k = keyFn(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

const lines = [
  "# Howl of the Werewolf Applied Stat-Block & Glyph Fixes",
  "",
  dryRun ? "Dry run only; no files were changed." : "Applied to `playable/book-data.js`.",
  "",
  `- Digit splits (SKILL6 -> SKILL 6): ${digitSplits.length}`,
  `- Garbled stat labels normalised: ${labelFixes.length}`,
  `- Stray standalone glyphs stripped: ${glyphStrips.length}`,
  `- Glued glyphs left for PDF review: ${glyphGlued.length}`,
  "",
  "## Digit splits",
  "",
  "| From | To | Count |",
  "| --- | --- | ---: |"
];
const splitTally = tally(digitSplits, (i) => `${i.before}\t${i.after}`);
if (!splitTally.length) lines.push("| - | - | 0 |");
for (const [k, v] of splitTally) {
  const [from, to] = k.split("\t");
  lines.push(`| ${escapeMd(from)} | ${escapeMd(to)} | ${v} |`);
}

lines.push("", "## Garbled stat labels", "", "| From | To | Count |", "| --- | --- | ---: |");
const labelTally = tally(labelFixes, (i) => `${i.before}\t${i.after}`);
if (!labelTally.length) lines.push("| - | - | 0 |");
for (const [k, v] of labelTally) {
  const [from, to] = k.split("\t");
  lines.push(`| ${escapeMd(from)} | ${escapeMd(to)} | ${v} |`);
}

lines.push("", "## Stray glyphs stripped", "");
if (!glyphStrips.length) {
  lines.push("None.");
} else {
  lines.push("| Section | Glyph | Context |", "| ---: | :---: | --- |");
  for (const item of glyphStrips) lines.push(`| ${item.number} | ${escapeMd(item.glyph)} | ${escapeMd(item.ctx)} |`);
}

lines.push("", "## Glued glyphs left for PDF review (not applied)", "");
if (!glyphGlued.length) {
  lines.push("None.");
} else {
  lines.push("| Section | Glyph | Context |", "| ---: | :---: | --- |");
  for (const item of glyphGlued) lines.push(`| ${item.number} | ${escapeMd(item.glyph)} | ${escapeMd(item.ctx)} |`);
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

if (!dryRun && totalApplied) {
  execFileSync(process.execPath, [buildReviewScript], { cwd: projectRoot, stdio: "pipe" });
}

console.log(JSON.stringify({
  dryRun,
  digitSplits: digitSplits.length,
  labelFixes: labelFixes.length,
  glyphsStripped: glyphStrips.length,
  gluedGlyphsForReview: glyphGlued.length,
  report: path.relative(projectRoot, reportPath),
  target: path.relative(projectRoot, bookDataPath)
}, null, 2));
