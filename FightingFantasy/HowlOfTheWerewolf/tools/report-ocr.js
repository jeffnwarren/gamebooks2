const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));

const data = window.GAMEBOOK_DATA;
const sections = data.sections || {};
const flags = [
  ["stray replacement/control glyph", /[�Â§]/g, 7],
  ["at-sign inside prose", /[A-Za-z]@[A-Za-z]|@[A-Za-z]{2,}/g, 5],
  ["common bad turn word", /\b(?:tum|hurn|hirn|hum|hon|faim|fiirn|tumi|tiurn|furn|burn|bun|humm)\s+(?:to|lo|te|bo|eo|fo)?\s*[0-9OoQIiLlAaEeSsBbGgqQjJzZ$§%(){}.,'"]{1,6}\b/gi, 4],
  ["broken stat word", /\b(?:sraMINA|sTaMINA|srAMINA|sxILL|sKIL1|SKIL1|sxi1|Luek|Lueky|LucK|LuCK|5TAMINA|STAMINAS|sTamMINA|skILLB|skILL®)\b/g, 4],
  ["common OCR word", /\b(?:vour|vou|yau|yout|lhe|ihe|thal|fom|fron|Camivale|writen|belore|tuming|tums|tumed|looky|mear|nat|bo|te|lo|ta)\b/gi, 3],
  ["bad intro/background token", /\b(?:thenext|zoobs|arumal|raang|beretfytngly|pourice|Tumours|harmtoanyone|fullimpact|Farry)\b/gi, 5],
  ["known passage typo", /\b(?:sleadily|greal|wolt|poing|Twm|nun)\b/gi, 5],
  ["bracketed letter in word", /[A-Za-z]\][A-Za-z]|[A-Za-z]\[[A-Za-z]/g, 3],
  ["digit in prose word", /\b[A-Za-z]+[0-9][A-Za-z]+\b/g, 3],
  ["unlikely lonely OCR symbol", /\s[=@#%]\s/g, 2],
  ["joined you text", /\b(?:you|your|the|and)[A-Z][a-z]/g, 2],
  ["unclosed parenthetical sentence", /\([^)]{80,}$/gm, 2],
  ["page-art residue", /\b(?:eee|SSS|OOO|i_i_i|Wh Ht|a aca a)\b/g, 3]
];

function context(text, index, length) {
  const source = String(text || "").replace(/\s+/g, " ").trim();
  const start = Math.max(0, index - 70);
  const end = Math.min(source.length, index + length + 90);
  return source.slice(start, end);
}

function scoreText(text) {
  const hits = [];
  let score = 0;
  for (const [label, pattern, weight] of flags) {
    const source = String(text || "");
    const normalized = source.replace(/\s+/g, " ");
    const matches = [...normalized.matchAll(pattern)];
    if (!matches.length) continue;
    score += matches.length * weight;
    hits.push({
      label,
      count: matches.length,
      examples: [...new Set(matches.slice(0, 4).map((match) => match[0].replace(/\s+/g, " ").trim().slice(0, 80)))],
      contexts: [...new Set(matches.slice(0, 3).map((match) => context(source, match.index || 0, match[0].length)))]
    });
  }
  return { score, hits };
}

function snippet(text) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 220);
}

const rows = [];
for (const [key, section] of Object.entries(sections)) {
  const result = scoreText(section.text);
  if (result.score > 0) {
    rows.push({
      location: Number(key),
      score: result.score,
      page: section.page,
      hits: result.hits,
      text: snippet(section.text)
    });
  }
}

if (data.intro?.text) {
  const intro = scoreText(data.intro.text);
  if (intro.score > 0) rows.push({ location: "intro/raw", score: intro.score, hits: intro.hits, text: snippet(data.intro.text) });
}

rows.sort((a, b) => b.score - a.score);

console.log(JSON.stringify({
  title: data.title,
  scannedSections: Object.keys(sections).length,
  flaggedLocations: rows.length,
  top: rows.slice(0, Number.parseInt(process.argv[2], 10) || 40)
}, null, 2));
