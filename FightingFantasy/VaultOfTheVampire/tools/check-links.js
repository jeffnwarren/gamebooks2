// Guards against linkify false positives: ordinary words misread as "turn to N"
// references. Mirrors the reader's linkify in playable/app.js. A link whose token
// contains letters (an OCR letter-substitution, e.g. "yo"->70, "gq"->99) is reported
// for human review — it is either a misread word or a real garbled number that should
// be cleaned up to plain digits in the prose. All legitimate references are numeric.
const path = require("path");

function loadData() {
  global.window = {};
  require(path.resolve(__dirname, "..", "playable", "book-data.js"));
  return global.window.GAMEBOOK_DATA;
}

// Keep these two identical to playable/app.js (normalizeToken + linkify's turnPattern).
function normalizeToken(token) {
  const trimmed = String(token || "").trim().replace(/[.,:;'"{}()[\]\s]/g, "");
  if (!trimmed || trimmed.includes("-")) return null;
  if (/^\d+$/.test(trimmed)) {
    const exact = Number.parseInt(trimmed, 10);
    return exact >= 1 && exact <= 400 ? exact : null;
  }
  const map = {
    o: "0", O: "0", a: "1", A: "1", i: "1", I: "1", l: "1", L: "1", z: "2", Z: "2",
    j: "3", J: "3", s: "5", S: "5", "$": "5", b: "6", G: "6", y: "7", Y: "7",
    e: "8", E: "8", q: "9", g: "9", "%": "1"
  };
  let digits = "";
  for (const char of trimmed) {
    if (/[0-9]/.test(char)) digits += char;
    else if (map[char]) digits += map[char];
  }
  digits = digits.replace(/00+/g, "0");
  const number = Number.parseInt(digits, 10);
  return number >= 1 && number <= 400 ? number : null;
}

const turnPattern = /((?:turn|tur|tum|tarn|tuin|tuln|tim|timi|tumi|tium|tiurn|tucn|furn|fum|fumi|faim|fiumn|hrm|rurn|burn|bun|barn|hurn|hun|hum|humm|hirn|hon|harn|ham|eum|go|return|continue)\s+)((?:at\s+once\s+to|back\s+to|to|lo|te|bo|eo|at|ta|i|l|fo)?\s*(?:paragraph|section)?\s*)([0-9OoQIiLlAaEeSsBbGgqQjJzZyY$%(){}.,'"]{1,6})(?![A-Za-z])/gi;

function findSuspiciousLinks(label, text, sections) {
  const flat = String(text || "").replace(/\s+/g, " ");
  const findings = [];
  for (const match of flat.matchAll(turnPattern)) {
    const [whole, , connector, token] = match;
    const target = normalizeToken(token);
    if (!(Number.isInteger(target) && sections[String(target)])) continue;
    // linkify renders a link here. A letter-bearing token without a connector is rejected
    // by the reader; everything else is rendered. Flag any rendered link whose token has letters.
    if (!/[A-Za-z]/.test(token)) continue;
    if (!connector.trim()) continue;
    const index = match.index;
    findings.push({
      where: label,
      token,
      target,
      context: flat.slice(Math.max(0, index - 30), index + whole.length + 30).trim()
    });
  }
  return findings;
}

const data = loadData();
const sections = data.sections || {};
const suspicious = [];
suspicious.push(...findSuspiciousLinks("intro/background", data.intro && data.intro.text, sections));
for (const key of Object.keys(sections)) {
  suspicious.push(...findSuspiciousLinks("§" + key, sections[key].text, sections));
}

const result = { title: data.title, ok: suspicious.length === 0, suspiciousLinks: suspicious };
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exit(1);
