const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const projectRoot = path.resolve(__dirname, "..");
const bookDataPath = path.join(projectRoot, "playable", "book-data.js");
const reviewJsonPath = path.join(projectRoot, "proofreading", "review", "review-queue.json");
const reportPath = path.join(projectRoot, "proofreading", "review", "applied-safe-fixes.md");
const buildReviewScript = path.join(__dirname, "build-review-queue.js");
const dryRun = process.argv.includes("--dry-run");

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isWordToken(value) {
  return /^[A-Za-z0-9\]]+$/.test(value);
}

function fixRegex(from) {
  if (isWordToken(from)) {
    return new RegExp(`(^|[^A-Za-z0-9]|\\\\n|\\\\t)(${escapeRegExp(from)})(?=$|[^A-Za-z0-9]|\\\\n|\\\\t)`, "g");
  }
  return new RegExp(escapeRegExp(from), "g");
}

function refreshReviewQueue() {
  execFileSync(process.execPath, [buildReviewScript], {
    cwd: projectRoot,
    stdio: "pipe"
  });
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

refreshReviewQueue();

const review = JSON.parse(fs.readFileSync(reviewJsonPath, "utf8"));
const fixes = Array.isArray(review.safeFixes) ? review.safeFixes : [];
let source = fs.readFileSync(bookDataPath, "utf8");
const applied = [];

for (const fix of fixes) {
  const from = String(fix.from || "");
  const to = String(fix.to || "");
  if (!from || from === to) continue;

  let count = 0;
  source = source.replace(fixRegex(from), (match, prefix, token) => {
    count += 1;
    if (isWordToken(from)) {
      return `${prefix}${to}`;
    }
    return to;
  });

  if (count > 0) {
    applied.push({ from, to, count });
  }
}

if (!dryRun && applied.length > 0) {
  fs.writeFileSync(bookDataPath, source, "utf8");
}

const lines = [
  `# ${review.title || "Howl of the Werewolf"} Applied Safe OCR Fixes`,
  "",
  dryRun ? "Dry run only; no files were changed." : "Applied to `playable/book-data.js`.",
  "",
  "| From | To | Count |",
  "| --- | --- | ---: |"
];

if (applied.length === 0) {
  lines.push("| - | - | 0 |");
} else {
  for (const fix of applied) {
    lines.push(`| ${escapeMd(fix.from)} | ${escapeMd(fix.to)} | ${fix.count} |`);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

if (!dryRun) {
  refreshReviewQueue();
}

console.log(JSON.stringify({
  dryRun,
  appliedFixTypes: applied.length,
  appliedInstances: applied.reduce((sum, fix) => sum + fix.count, 0),
  report: path.relative(projectRoot, reportPath),
  target: path.relative(projectRoot, bookDataPath)
}, null, 2));
