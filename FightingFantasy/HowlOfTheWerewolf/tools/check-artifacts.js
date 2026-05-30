const path = require("path");
const { scanArtifacts, summarize } = require(path.resolve(__dirname, "..", "..", "tools", "ocr-artifacts.js"));

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));

const data = window.GAMEBOOK_DATA;
const findings = scanArtifacts(data);
const gate = findings.filter((finding) => finding.severity === "gate");
const review = findings.filter((finding) => finding.severity === "review");

const result = {
  title: data.title,
  ok: gate.length === 0,
  gateFindings: gate.length,
  reviewFindings: review.length,
  gateByCategory: summarize(gate),
  reviewByCategory: summarize(review)
};

if (gate.length) {
  result.gate = gate.map((finding) => ({ section: finding.section, category: finding.category, context: finding.context }));
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result, null, 2));
