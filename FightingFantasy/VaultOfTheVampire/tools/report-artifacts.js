const path = require("path");
const { scanArtifacts, summarize } = require(path.resolve(__dirname, "..", "..", "tools", "ocr-artifacts.js"));

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));

const showAll = process.argv.includes("--all");
const limit = showAll ? Infinity : 8;

const data = window.GAMEBOOK_DATA;
const findings = scanArtifacts(data);
findings.sort((a, b) => b.weight - a.weight || a.section.localeCompare(b.section, undefined, { numeric: true }));

const byCategory = new Map();
for (const finding of findings) {
  if (!byCategory.has(finding.category)) byCategory.set(finding.category, []);
  byCategory.get(finding.category).push(finding);
}

console.log(`${data.title}: ${findings.length} OCR-artifact findings`);
console.log(`  gate:   ${findings.filter((f) => f.severity === "gate").length}`);
console.log(`  review: ${findings.filter((f) => f.severity === "review").length}`);
console.log("");

for (const [category, items] of byCategory) {
  const severity = items[0].severity.toUpperCase();
  console.log(`[${severity}] ${category} (${items.length})`);
  for (const finding of items.slice(0, limit)) {
    console.log(`   §${finding.section}: ${finding.context}`);
  }
  if (items.length > limit) console.log(`   …and ${items.length - limit} more (run with --all)`);
  console.log("");
}

console.log("By category:", JSON.stringify(summarize(findings)));
