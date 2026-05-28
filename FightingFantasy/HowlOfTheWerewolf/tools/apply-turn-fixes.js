// Normalises garbled "turn to N" phrases in section prose.
//
// The choice graph in book-data.js is already correct, so each section's stored
// `choices` array is treated as ground truth: a turn-phrase is only rewritten
// when its OCR'd target resolves to a number that is already a stored choice of
// that same section. That gate makes every applied change verifiable.
//
// Conservative by construction:
//   - Only the number token, the connector, and clearly-OCR'd verbs are touched.
//   - Meaningful connectors ("at once", "immediately", "back") are preserved.
//   - Alpha-only number tokens (e.g. "az", "age") and connector-less phrases are
//     reported for human review, never auto-applied.
//   - Surrounding whitespace and trailing sentence punctuation are preserved.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const bookDataPath = path.join(projectRoot, "playable", "book-data.js");
const reportPath = path.join(projectRoot, "proofreading", "review", "applied-turn-fixes.md");
const buildReviewScript = path.join(__dirname, "build-review-queue.js");
const dryRun = process.argv.includes("--dry-run");

const PREFIX = "window.GAMEBOOK_DATA = ";

const turnWordsPattern = [
  "turn", "tur", "tum", "tarn", "tuin", "tuln", "tim", "timi", "tumi", "tuum", "tium", "tiurn",
  "tucn", "furn", "fum", "fumi", "faim", "fim", "fiumn", "farm", "hrm", "rurn", "burn", "bum", "bun", "barn",
  "hurn", "hun", "hum", "humm", "hirn", "hon", "harn", "ham", "eum", "tun", "fiirn",
  "tin", "fom", "fuorn", "tuo", "rehurn", "tetum", "him", "hur", "fur", "go", "return", "continue"
].join("|");
const connectorPattern = "immediately\\s+to|at\\s+once\\s+to|at\\s+ance\\s+to|al\\s+once\\s+to|back\\s+to|to|lo|te|bo|eo|io|10|at|ta|in|tn|y|i|l|fo|fa|paragraph|section";
const tokenPattern = "[0-9OoQIiLlAaEeSsBbGgqQjJzZ$Â§£%(){}.,'\\\"]{1,6}";
// Capture: 1=verb 2=ws 3=connector(optional) 4=ws(after connector) 5=token
const turnRegex = new RegExp(
  `\\b(${turnWordsPattern})\\b(\\s*)(?:(${connectorPattern})(\\s*))?(${tokenPattern})(?![A-Za-z])`,
  "gi"
);

// Verbs that are legitimate navigation words and must be left as written.
const keepVerbs = new Set(["turn", "return", "continue", "go"]);
// Connectors that carry meaning beyond "to" and must be preserved verbatim.
const meaningfulConnector = /\s/;
// Connectors we refuse to collapse (would drop the noun) -> skip rewrite.
const skipConnectors = new Set(["paragraph", "section"]);

function normalizeToken(token) {
  const cleaned = String(token || "").trim().replace(/[.,:;'"{}\[\]\s]/g, "");
  if (!cleaned || cleaned.includes("-")) return null;
  if (/^\d+$/.test(cleaned)) {
    const exact = Number.parseInt(cleaned, 10);
    if (exact >= 1 && exact <= 515) return exact;
    if (cleaned.length === 3 && cleaned.startsWith("7")) {
      const corrected = Number.parseInt(`3${cleaned.slice(1)}`, 10);
      if (corrected >= 1 && corrected <= 515) return corrected;
    }
    return null;
  }
  const map = {
    O: "0", o: "0", Q: "0", I: "1", i: "1", l: "1", L: "1", "|": "1", "!": "1",
    A: "1", a: "1", S: "5", s: "5", "$": "5", "§": "5", B: "8", b: "6", G: "6",
    E: "8", e: "8", g: "9", q: "9", Z: "2", z: "2", J: "3", j: "3", "%": "1", "£": "1"
  };
  let digits = "";
  for (const char of cleaned) {
    if (/\d/.test(char)) digits += char;
    else if (map[char]) digits += map[char];
  }
  digits = digits.replace(/00+/g, "0");
  const number = Number.parseInt(digits, 10);
  if (Number.isInteger(number) && number >= 1 && number <= 515) return number;
  return null;
}

function matchCase(template, word) {
  return /^[A-Z]/.test(template) ? word.charAt(0).toUpperCase() + word.slice(1) : word;
}

function splitToken(token) {
  const lead = (token.match(/^[([{'"]+/) || [""])[0];
  const trail = (token.match(/[).,;:}\]'"]+$/) || [""])[0];
  const core = token.slice(lead.length, token.length - trail.length);
  return { lead, core, trail };
}

const review = [];
const changes = [];

function transformSection(number, text, choices) {
  return text.replace(turnRegex, (full, verb, ws1, connector, ws2, token, offset) => {
    const { lead, core, trail } = splitToken(token);
    const target = normalizeToken(core);

    // Gate: only act when the resolved number is a real exit of this section.
    if (target === null || !choices.has(target)) return full;

    const span = full;

    // Connector-less phrases ("turn 196") are ambiguous to rebuild safely.
    if (connector === undefined) {
      review.push({ number, span, target, reason: "no connector" });
      return full;
    }
    const connLower = connector.toLowerCase();
    if (skipConnectors.has(connLower)) {
      review.push({ number, span, target, reason: `connector "${connLower}"` });
      return full;
    }
    // Alpha-only tokens (az, age, go, ...) are too risky to auto-apply.
    if (!/[0-9$§£%]/.test(core)) {
      review.push({ number, span, target, reason: "alpha-only number token" });
      return full;
    }

    const verbOut = keepVerbs.has(verb.toLowerCase()) ? verb : matchCase(verb, "turn");
    const connOut = meaningfulConnector.test(connector) ? connector : "to";
    // OCR sometimes glues the connector to the number ("lo256", "to.448"); always
    // keep at least one space between the connector and the section number.
    const ws2Out = ws2 && ws2.length ? ws2 : " ";
    const numberOut = `${lead}${target}${trail}`;
    const rebuilt = `${verbOut}${ws1}${connOut}${ws2Out}${numberOut}`;

    if (rebuilt === span) return full; // already canonical (e.g. "turn to 196")

    changes.push({ number, before: span.trim(), after: rebuilt.trim(), target });
    return rebuilt;
  });
}

// ---- load, transform, write ----
const raw = fs.readFileSync(bookDataPath, "utf8");
const data = JSON.parse(raw.slice(PREFIX.length).replace(/;\s*$/, ""));

for (const key of Object.keys(data.sections)) {
  const section = data.sections[key];
  const choices = new Set(section.choices || []);
  if (!choices.size) continue;
  section.text = transformSection(Number(key), String(section.text || ""), choices);
}

if (!dryRun && changes.length) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n";
  const out = `${PREFIX}${JSON.stringify(data, null, 2)};\n`.replace(/\n/g, eol);
  fs.writeFileSync(bookDataPath, out, "utf8");
}

// ---- report ----
function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

const lines = [
  "# Howl of the Werewolf Applied Turn-Reference Fixes",
  "",
  dryRun ? "Dry run only; no files were changed." : "Applied to `playable/book-data.js`.",
  "",
  `- Auto-applied rewrites: ${changes.length}`,
  `- Flagged for human review (not applied): ${review.length}`,
  "",
  "Each rewrite is gated on the resolved target already being a stored choice of the section.",
  "",
  "## Applied rewrites",
  "",
  "| Section | Before | After |",
  "| ---: | --- | --- |"
];
if (!changes.length) {
  lines.push("| - | - | - |");
} else {
  for (const change of changes) {
    lines.push(`| ${change.number} | ${escapeMd(change.before)} | ${escapeMd(change.after)} |`);
  }
}

lines.push("", "## Flagged for human review (not applied)", "");
if (!review.length) {
  lines.push("None.");
} else {
  lines.push("| Section | Phrase | Resolves to | Reason |", "| ---: | --- | ---: | --- |");
  for (const item of review) {
    lines.push(`| ${item.number} | ${escapeMd(item.span.trim())} | ${item.target} | ${escapeMd(item.reason)} |`);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

if (!dryRun && changes.length) {
  execFileSync(process.execPath, [buildReviewScript], { cwd: projectRoot, stdio: "pipe" });
}

console.log(JSON.stringify({
  dryRun,
  appliedRewrites: changes.length,
  flaggedForReview: review.length,
  report: path.relative(projectRoot, reportPath),
  target: path.relative(projectRoot, bookDataPath)
}, null, 2));
