const path = require("path");

const expectedSectionsByTitle = new Map([
  ["Howl of the Werewolf", 515],
  ["Vault of the Vampire", 400]
]);

const turnWordsPattern = [
  "turn", "tur", "tum", "tarn", "tuin", "tuln", "tim", "timi", "tumi", "tium", "tiurn",
  "tucn", "furn", "fum", "fumi", "faim", "fiumn", "hrm", "rurn", "burn", "bun", "barn",
  "hurn", "hun", "hum", "humm", "hirn", "hon", "harn", "ham", "eum", "go", "return", "continue"
].join("|");
const turnConnectorPattern = "at\\s+once\\s+to|back\\s+to|to|lo|te|bo|eo|at|ta|i|l|fo|paragraph|section";
const turnTokenPattern = "[0-9OoQIiLlAaEeSsBbGgqQjJzZyY$Â§%(){}.,'\\\"]{1,6}";
const turnPattern = new RegExp(`\\b(?:${turnWordsPattern})\\b\\s*(?:${turnConnectorPattern})?\\s*(${turnTokenPattern})(?![A-Za-z])`, "gi");

function loadData() {
  global.window = {};
  require(path.resolve(__dirname, "..", "playable", "book-data.js"));
  return global.window.GAMEBOOK_DATA;
}

function normalizeToken(token, maxSection) {
  const cleaned = String(token || "").trim().replace(/[.,:;'"{}\[\]\s]/g, "");
  if (!cleaned || cleaned.includes("-")) return null;
  if (/^\d+$/.test(cleaned)) {
    const exact = Number.parseInt(cleaned, 10);
    if (exact >= 1 && exact <= maxSection) return exact;
    if (maxSection >= 515 && cleaned.length === 3 && cleaned.startsWith("7")) {
      const corrected = Number.parseInt(`3${cleaned.slice(1)}`, 10);
      if (corrected >= 1 && corrected <= maxSection) return corrected;
    }
    return null;
  }

  const map = {
    O: "0", o: "0", Q: "0", I: "1", i: "1", l: "1", L: "1", "|": "1", "!": "1",
    A: "1", a: "1", S: "5", s: "5", "$": "5", "§": "5", B: "8", b: "6", G: "6", Y: "7", y: "7",
    E: "8", e: "8", g: "9", q: "9", Z: "2", z: "2", J: "3", j: "3", "%": "1"
  };
  let digits = "";
  for (const char of cleaned) {
    if (/\d/.test(char)) digits += char;
    else if (map[char]) digits += map[char];
  }
  digits = digits.replace(/00+/g, "0");
  const number = Number.parseInt(digits, 10);
  return Number.isInteger(number) && number >= 1 && number <= maxSection ? number : null;
}

function scanTurnTargets(text, maxSection, currentNumber) {
  const targets = new Set();
  const source = String(text || "").replace(/\s+/g, " ");
  turnPattern.lastIndex = 0;
  let match = turnPattern.exec(source);
  while (match) {
    const target = normalizeToken(match[1], maxSection);
    if (target && target !== currentNumber) targets.add(target);
    match = turnPattern.exec(source);
  }
  return [...targets];
}

function endingLike(text) {
  return /\b(adventure ends|adventure is over|quest ends here|quest has failed|you have failed|you are dead|you die|you have died|you have been killed|you are killed|you pass out|horrible end to your adventure|fate worse than death|met your doom|hollow victory|willing servant always|mindless servant|new master|slay you|barbe-?\s*cued meal|the end|congratulations|you have escaped|start all over again)\b/i.test(String(text || ""));
}

function snippet(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function reachableFromStart(sections) {
  const reached = new Set();
  const queue = [1];
  while (queue.length) {
    const current = queue.shift();
    if (reached.has(current)) continue;
    reached.add(current);
    const section = sections[String(current)];
    for (const target of section?.choices || []) {
      if (!reached.has(target)) queue.push(target);
    }
  }
  return reached;
}

const data = loadData();
const sections = data.sections || {};
const numbers = Object.keys(sections).map(Number).sort((a, b) => a - b);
const maxSection = numbers.at(-1) || 0;
const expected = expectedSectionsByTitle.get(data.title);
const verbose = process.argv.includes("--verbose") || process.argv.includes("--report");
const failures = [];
const warnings = [];

if (!data.title) failures.push("Missing book title.");
if (!expected) warnings.push(`No expected section count is configured for '${data.title}'.`);
if (expected && numbers.length !== expected) failures.push(`Expected ${expected} sections, found ${numbers.length}.`);
if (expected && maxSection !== expected) failures.push(`Expected max section ${expected}, found ${maxSection}.`);

for (let number = 1; number <= (expected || maxSection); number += 1) {
  if (!sections[String(number)]) failures.push(`Missing section ${number}.`);
}

const invalidChoices = [];
const emptySections = [];
const numberMismatches = [];
const noStoredChoices = [];
const scannerFoundUnstored = [];

for (const key of Object.keys(sections)) {
  const section = sections[key];
  const number = Number(key);
  if (section.number !== number) numberMismatches.push({ key, sectionNumber: section.number });
  if (!String(section.text || "").trim()) emptySections.push(number);

  const storedChoices = new Set(section.choices || []);
  for (const target of section.choices || []) {
    if (!sections[String(target)]) invalidChoices.push({ section: number, target });
    if (target === number) invalidChoices.push({ section: number, target, reason: "self-reference" });
  }

  const scannedTargets = scanTurnTargets(section.text, maxSection, number);
  const missingStored = scannedTargets.filter((target) => !storedChoices.has(target));
  if (missingStored.length) {
    scannerFoundUnstored.push({ section: number, targets: missingStored, text: snippet(section.text) });
  }
  if (!storedChoices.size) noStoredChoices.push({ section: number, scannedTargets, endingLike: endingLike(section.text), text: snippet(section.text) });
}

if (numberMismatches.length) failures.push(`Section number/key mismatches: ${JSON.stringify(numberMismatches.slice(0, 10))}`);
if (emptySections.length) failures.push(`Empty sections: ${emptySections.slice(0, 30).join(", ")}`);
if (invalidChoices.length) failures.push(`Invalid stored choices: ${JSON.stringify(invalidChoices.slice(0, 20))}`);

const reached = reachableFromStart(sections);
const unreachable = numbers.filter((number) => !reached.has(number));
const suspiciousDeadEnds = noStoredChoices.filter((item) => !item.endingLike);
const report = {
  title: data.title,
  summary: {
    sections: numbers.length,
    maxSection,
    expectedSections: expected || null,
    sectionsWithStoredChoices: numbers.length - noStoredChoices.length,
    sectionsWithoutStoredChoices: noStoredChoices.length,
    reachableViaStoredChoices: reached.size,
    unreachableViaStoredChoices: unreachable.length,
    scannerFoundUnstoredChoiceTargets: scannerFoundUnstored.length,
    suspiciousNonEndingDeadEnds: suspiciousDeadEnds.length
  },
  warningCounts: {
    unreachable: unreachable.length,
    scannerFoundUnstored: scannerFoundUnstored.length,
    suspiciousNonEndingDeadEnds: suspiciousDeadEnds.length
  },
  failures
};

if (warnings.length) report.notes = warnings;
if (verbose) {
  report.warnings = {
    unreachableSample: unreachable.slice(0, 40),
    scannerFoundUnstoredSample: scannerFoundUnstored.slice(0, 25),
    suspiciousNonEndingDeadEndSample: suspiciousDeadEnds.slice(0, 25)
  };
}

if (failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(report, null, 2));
