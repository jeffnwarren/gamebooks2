// Misroute audit.
//
// The graph checks (check:data, the scanner in check-data.js) prove every stored
// choice lands on a REAL section and every resolvable prose "turn to N" is stored.
// What they cannot catch is a choice that points to a VALID BUT WRONG section —
// e.g. OCR merged "42and" so the extractor stored `4` instead of `42` (§100), or a
// stray token produced a bogus choice (§400→8). Those never show as orphans because
// the wrong target is itself a real, referenced section.
//
// Heuristic: a trustworthy choice number appears verbatim, as a standalone number, in
// its own section's prose. This report flags every stored choice that does NOT, and
// shows the prose's actual "turn to N" numbers so a reviewer can spot the intended
// target. Expect two kinds of hit:
//   * real misroutes  — the choice disagrees with the prose's intent (fix these)
//   * prose garbles    — the choice is right but OCR mangled the printed digits
//                        (e.g. "turn togs" = "to 95"); cosmetic, choice stays
// Confirm against the source PDF before changing any link.
//
// Usage: node tools/report-misroutes.js   (npm run report:misroutes)

const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));
const data = global.window.GAMEBOOK_DATA;
const sections = data.sections || {};
const numbers = Object.keys(sections).map(Number).sort((a, b) => a - b);
const maxSection = numbers.at(-1) || 0;

// every standalone 1-3 digit run in the prose, kept if it is a valid section number
function proseNumbers(text) {
  const set = new Set();
  for (const run of String(text || "").match(/\d{1,3}/g) || []) {
    const n = Number.parseInt(run, 10);
    if (n >= 1 && n <= maxSection) set.add(n);
  }
  return set;
}

// the numbers the prose explicitly routes to ("turn/go/return to N"), for triage
function proseTurnTargets(text) {
  const out = [];
  const src = String(text || "").replace(/\s+/g, " ");
  const re = /\b(?:turn|go|return|continue)\b[^.]{0,18}?(\d{1,3})\b/gi;
  let m;
  while ((m = re.exec(src))) {
    const n = Number.parseInt(m[1], 10);
    if (n >= 1 && n <= maxSection) out.push(n);
  }
  return [...new Set(out)];
}

const flagged = [];
for (const n of numbers) {
  const section = sections[String(n)];
  const inProse = proseNumbers(section.text);
  const turns = proseTurnTargets(section.text);
  for (const choice of section.choices || []) {
    if (inProse.has(choice)) continue;
    // is there a prose turn-target NOT stored as a choice? that's the likely true one
    const unstored = turns.filter((t) => !(section.choices || []).includes(t));
    flagged.push({
      section: n,
      page: section.page,
      choice,
      proseTurnTargets: turns,
      likelyIntended: unstored,
      tail: String(section.text || "").replace(/\s+/g, " ").trim().slice(-130)
    });
  }
}

const report = {
  title: data.title,
  flaggedChoices: flagged.length,
  sectionsAffected: new Set(flagged.map((f) => f.section)).size,
  details: flagged
};
console.log(JSON.stringify(report, null, 2));
