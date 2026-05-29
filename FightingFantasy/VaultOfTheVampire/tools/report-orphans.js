// Orphan reconciliation report.
//
// An ORPHAN is a section with zero inbound choice edges — nothing in the book's
// stored choice graph points at it. They exist because a "turn to N" reference was
// OCR-corrupted into a *different valid* number (a collision) or dropped entirely,
// so the inbound link landed elsewhere / nowhere. This report does NOT edit data;
// it lists each orphan plus ranked candidate source sections whose turn-tokens could
// plausibly have meant the orphan under known OCR confusions, so a human can confirm
// the true inbound link before it is rewritten.
//
// Usage:
//   node tools/report-orphans.js              # write reports/orphans.md + print summary
//   node tools/report-orphans.js --json       # also print the full JSON to stdout

const path = require("path");
const fs = require("fs");

// --- turn-token scanning (kept in sync with check-data.js) ---
const turnWordsPattern = [
  "turn", "tur", "tum", "tarn", "tuin", "tuln", "tim", "timi", "tumi", "tium", "tiurn",
  "tucn", "furn", "fum", "fumi", "faim", "fiumn", "hrm", "rurn", "burn", "bun", "barn",
  "hurn", "hun", "hum", "humm", "hirn", "hon", "harn", "ham", "eum", "go", "return", "continue"
].join("|");
const turnConnectorPattern = "at\\s+once\\s+to|back\\s+to|to|lo|te|bo|eo|at|ta|i|l|fo|paragraph|section";
const turnTokenPattern = "[0-9OoQIiLlAaEeSsBbGgqQjJzZyY$Â§%(){}.,'\\\"]{1,6}";
const turnPattern = new RegExp(`\\b(?:${turnWordsPattern})\\b\\s*(?:${turnConnectorPattern})?\\s*(${turnTokenPattern})(?![A-Za-z])`, "gi");

const glyphMap = {
  O: "0", o: "0", Q: "0", I: "1", i: "1", l: "1", L: "1", "|": "1", "!": "1",
  A: "1", a: "1", S: "5", s: "5", "$": "5", "§": "5", B: "8", b: "6", G: "6", Y: "7", y: "7",
  E: "8", e: "8", g: "9", q: "9", Z: "2", z: "2", J: "3", j: "3", "%": "1"
};

// Lossy primary reading used by the live graph builder (collapses 00+ -> 0).
function normalizeToken(token, maxSection) {
  const cleaned = String(token || "").trim().replace(/[.,:;'"{}\[\]\s]/g, "");
  if (!cleaned || cleaned.includes("-")) return null;
  if (/^\d+$/.test(cleaned)) {
    const exact = Number.parseInt(cleaned, 10);
    return exact >= 1 && exact <= maxSection ? exact : null;
  }
  let digits = "";
  for (const char of cleaned) {
    if (/\d/.test(char)) digits += char;
    else if (glyphMap[char]) digits += glyphMap[char];
  }
  digits = digits.replace(/00+/g, "0");
  const number = Number.parseInt(digits, 10);
  return Number.isInteger(number) && number >= 1 && number <= maxSection ? number : null;
}

// Curated OCR digit-confusion pairs with a relative likelihood weight (higher =
// more visually similar, so a more probable swap). Kept deliberately tight: a
// permissive set matches ~20 valid sections per orphan and is useless for ranking.
const confusionWeights = new Map(
  [
    ["1-7", 3], ["3-8", 3], ["6-8", 3], ["0-8", 3],
    ["5-6", 2], ["0-6", 2], ["5-8", 2], ["0-9", 2], ["3-5", 2],
    ["1-4", 1], ["4-9", 1], ["2-7", 1]
  ].flatMap(([k, w]) => {
    const [a, b] = k.split("-");
    return [[`${a}-${b}`, w], [`${b}-${a}`, w]];
  })
);
// If `a` is `b` with exactly one digit changed via a known confusion, return the
// pair's weight; otherwise 0. (a = current/misread target, b = orphan.)
function substitutionWeight(a, b) {
  const sa = String(a);
  const sb = String(b);
  if (sa.length !== sb.length) return 0;
  let diff = 0;
  let weight = 0;
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] === sb[i]) continue;
    diff += 1;
    if (diff > 1) return 0;
    weight = confusionWeights.get(`${sa[i]}-${sb[i]}`) || 0;
    if (!weight) return 0;
  }
  return diff === 1 ? weight : 0;
}

function snippet(text, len = 160) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, len);
}

const endingLike = (text) =>
  /\b(adventure ends|adventure is over|quest ends here|you are dead|you die|you have died|you have been killed|you are killed|the end|hollow victory|willing servant|new master|start all over again)\b/i.test(
    String(text || "")
  );

// --- load data ---
global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));
const data = global.window.GAMEBOOK_DATA;
const sections = data.sections || {};
const numbers = Object.keys(sections).map(Number).sort((a, b) => a - b);
const maxSection = numbers.at(-1) || 0;

// inbound edges from stored choices
const inbound = new Map(numbers.map((n) => [n, []]));
for (const n of numbers) {
  for (const target of sections[String(n)].choices || []) {
    if (inbound.has(target)) inbound.get(target).push(n);
  }
}

// reachability from §1
const reached = new Set();
const queue = [1];
while (queue.length) {
  const cur = queue.shift();
  if (reached.has(cur)) continue;
  reached.add(cur);
  for (const t of sections[String(cur)]?.choices || []) if (!reached.has(t)) queue.push(t);
}

const unreachable = numbers.filter((n) => !reached.has(n));
const unreachableSet = new Set(unreachable);
const trueOrphans = unreachable.filter((n) => inbound.get(n).length === 0);

// Group the unreachable sections into islands (connected components over choice
// edges, treated as undirected). Each island only needs ONE inbound link found —
// its entry orphan(s) — to reconnect the whole component.
const componentOf = new Map();
let componentId = 0;
for (const start of unreachable) {
  if (componentOf.has(start)) continue;
  const stack = [start];
  componentOf.set(start, componentId);
  while (stack.length) {
    const cur = stack.pop();
    const neighbors = new Set(sections[String(cur)].choices || []);
    for (const n of unreachable) {
      if ((sections[String(n)].choices || []).includes(cur)) neighbors.add(n);
    }
    for (const nb of neighbors) {
      if (unreachableSet.has(nb) && !componentOf.has(nb)) {
        componentOf.set(nb, componentId);
        stack.push(nb);
      }
    }
  }
  componentId += 1;
}

// For an orphan, find source sections (already reachable) whose stored choice is
// one OCR digit-substitution away from the orphan — i.e. "§src points to §C, but
// §C may be a misread of the orphan." This is the only viable mechanical signal
// since every corrupted ref now resolves to a valid (wrong) section.
function substitutionCandidates(orphan) {
  const out = [];
  for (const src of numbers) {
    if (unreachableSet.has(src)) continue; // a reconnection must come from outside the islands
    for (const choice of sections[String(src)].choices || []) {
      const weight = substitutionWeight(choice, orphan);
      if (weight) out.push({ source: src, currentTarget: choice, weight });
    }
  }
  // strongest digit-confusion first; keep a top shortlist for PDF review
  out.sort((a, b) => b.weight - a.weight || a.source - b.source);
  return out.slice(0, 8);
}

const islands = [];
for (let id = 0; id < componentId; id += 1) {
  const members = unreachable.filter((n) => componentOf.get(n) === id).sort((a, b) => a - b);
  const entries = members.filter((n) => trueOrphans.includes(n));
  islands.push({
    members,
    entries: entries.map((orphan) => ({
      orphan,
      page: sections[String(orphan)].page,
      endingLike: endingLike(sections[String(orphan)].text),
      text: snippet(sections[String(orphan)].text, 220),
      candidates: substitutionCandidates(orphan)
    }))
  });
}
islands.sort((a, b) => a.members[0] - b.members[0]);

// --- gate hubs: sections that send the player onward by a mechanism the choice
// graph cannot represent (cipher answers, "paragraph = number on the key", etc.).
// Their targets can legitimately be orphans-by-design, so flag the hubs for review.
const gateLanguage =
  /\b(number on the key|paragraph whose number|number referred to|whispering the name|decode|transcription|spell out|same as the number|the correct paragraph|same number as|half the number|half of the|twice the number|number of the magic(?:al)? page)\b/i;
const gateHubs = numbers
  .filter((n) => gateLanguage.test(String(sections[String(n)].text || "")))
  .map((n) => ({ section: n, page: sections[String(n)].page, text: snippet(sections[String(n)].text, 200) }));

// --- fragile targets (potential hidden orphans): reachable sections whose ENTIRE
// inbound set is "claimed" by an orphan candidate-correction. If those corrections
// are applied, the link is redirected away and the target becomes a new orphan —
// the §272→378 cascade. Every link src→target appearing in some orphan's candidate
// list is "claimed"; a target all of whose inbound links are claimed is fragile.
// Only the strongest (max-weight) candidate(s) per orphan are treated as "likely
// fixes"; claiming all 8 would falsely flag dozens of legitimate links.
const claimedLinks = new Set();
for (const island of islands) {
  for (const e of island.entries) {
    if (!e.candidates.length) continue;
    const topWeight = e.candidates[0].weight;
    if (topWeight < 2) continue; // weak (w1) candidates are mostly false positives
    for (const c of e.candidates) {
      if (c.weight === topWeight) claimedLinks.add(`${c.source}->${c.currentTarget}`);
    }
  }
}
const fragileTargets = numbers
  .filter((n) => !unreachableSet.has(n) && inbound.get(n).length > 0)
  .filter((n) => inbound.get(n).every((src) => claimedLinks.has(`${src}->${n}`)))
  .map((n) => ({
    section: n,
    page: sections[String(n)].page,
    inboundFrom: inbound.get(n),
    text: snippet(sections[String(n)].text, 160)
  }));

const summary = {
  title: data.title,
  sections: numbers.length,
  unreachable: unreachable.length,
  trueOrphans: trueOrphans.length,
  islands: islands.length,
  orphansWithSubstitutionCandidate: islands
    .flatMap((i) => i.entries)
    .filter((e) => e.candidates.length).length,
  gateHubs: gateHubs.length,
  fragileTargets: fragileTargets.length
};

// --- markdown report ---
const lines = [];
lines.push(`# Vault of the Vampire — orphan reconciliation`, "");
lines.push(`_Generated ${new Date().toISOString().slice(0, 10)} by \`npm run report:orphans\`. Read-only; no data was changed._`, "");
lines.push(
  `**${summary.unreachable}** sections are unreachable from §1, in **${summary.islands}** islands ` +
    `(connected components). Each island needs only ONE inbound link recovered — its **entry orphan** ` +
    `(zero inbound). Fixing that reconnects every member.`,
  ""
);
lines.push(
  `Every "turn to N" phrase in the book already resolves to a valid number and \`scannerFoundUnstored = 0\`, ` +
    `so these inbound links were corrupted by **digit substitution** into other valid sections — there is ` +
    `no leftover garbled token to grep. The candidate tables below list reachable sources whose stored ` +
    `choice is one OCR digit-confusion away from the orphan ("§src → §C, where §C may be a misread of the ` +
    `orphan"). Confirm against the source PDF before rewriting any link.`,
  ""
);
lines.push(`## Islands`, "");

islands.forEach((island, idx) => {
  lines.push(`### Island ${idx + 1} — sections ${island.members.map((m) => `§${m}`).join(", ")}`, "");
  for (const e of island.entries) {
    lines.push(`**Entry orphan §${e.orphan}** (page ${e.page})${e.endingLike ? " — ending" : ""}`);
    lines.push(`> ${e.text}`, "");
    if (!e.candidates.length) {
      lines.push(`_No one-substitution candidate — find the inbound link by reading the PDF around this content._`, "");
    } else {
      lines.push(`| source | currently points to | confusion weight |`);
      lines.push(`| ---: | ---: | ---: |`);
      for (const c of e.candidates) {
        lines.push(`| §${c.source} | §${c.currentTarget} (may be a misread of §${e.orphan}) | ${c.weight} |`);
      }
    }
    lines.push("");
  }
});

lines.push(`## Gate hubs (orphans may be intentional)`, "");
lines.push(
  `These sections route the player onward by a mechanism the choice graph can't follow ` +
    `(cipher answers, "turn to the paragraph matching the number on the key", etc.). An orphan that ` +
    `is the target of one of these is **orphaned by design** and needs no link fix — e.g. §350 ` +
    `(silvered chainmail) is the answer to the §123 cipher. Cross-check orphans against these.`,
  ""
);
if (!gateHubs.length) {
  lines.push(`_None detected._`, "");
} else {
  lines.push(`| section | page | text |`, `| ---: | ---: | --- |`);
  for (const g of gateHubs) lines.push(`| §${g.section} | ${g.page} | ${g.text} |`);
  lines.push("");
}

lines.push(`## Fragile targets (potential hidden orphans)`, "");
lines.push(
  `A **speculative watch list**: each section below is currently reachable only via inbound link(s) that ` +
    `are also strong (weight ≥ 2) candidate-corrections for an orphan above. *If* such a link is confirmed ` +
    `and redirected, the section becomes a new orphan (the §272→378 cascade). This over-reports — many ` +
    `links here are legitimate and merely happen to fit a confusion pattern. **Authoritative method:** apply ` +
    `the PDF-confirmed fixes, then re-run this report; genuine new orphans surface as real (zero-inbound) entries.`,
  ""
);
if (!fragileTargets.length) {
  lines.push(`_None detected._`, "");
} else {
  lines.push(`| section | page | sole/all inbound from | text |`, `| ---: | ---: | --- | --- |`);
  for (const f of fragileTargets) {
    lines.push(`| §${f.section} | ${f.page} | ${f.inboundFrom.map((s) => `§${s}`).join(", ")} | ${f.text} |`);
  }
  lines.push("");
}

const reportsDir = path.resolve(__dirname, "..", "reports");
fs.mkdirSync(reportsDir, { recursive: true });
const outPath = path.join(reportsDir, "orphans.md");
fs.writeFileSync(outPath, lines.join("\n"), "utf8");

console.log(JSON.stringify(summary, null, 2));
console.log(`\nReport written to ${path.relative(process.cwd(), outPath)}`);
if (process.argv.includes("--json")) {
  console.log("\n--- full report ---");
  console.log(JSON.stringify(islands, null, 2));
}
