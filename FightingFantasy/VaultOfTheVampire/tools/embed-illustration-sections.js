// Inject the curated `section` field from illustrations.json into the
// illustrations embedded in playable/book-data.js, WITHOUT regenerating the
// file (a full merge-ocr-data.py rerun would wipe the hand-applied graph
// fixes that live only in book-data.js). Matches entries by image filename,
// is idempotent, and preserves all other formatting.
const fs = require("fs");
const path = require("path");

const playable = path.join(__dirname, "..", "playable");
const illustrationsJsonPath = path.join(playable, "illustrations.json");
const bookDataPath = path.join(playable, "book-data.js");

const illustrations = JSON.parse(fs.readFileSync(illustrationsJsonPath, "utf8"));
const sectionByImage = new Map();
for (const item of illustrations.fullPageIllustrations || []) {
  if (item && item.image && Number.isInteger(item.section)) {
    sectionByImage.set(item.image, item.section);
  }
}

let src = fs.readFileSync(bookDataPath, "utf8");
let injected = 0;
let alreadyPresent = 0;

for (const [image, section] of sectionByImage) {
  // Find the "image": "<image>" property line and capture its indentation.
  const imageRe = new RegExp(
    `(^([ \\t]*)"image": ${JSON.stringify(image)})(,?)(\\r?\\n)`,
    "m"
  );
  const match = src.match(imageRe);
  if (!match) {
    console.warn(`! image not found in book-data.js: ${image}`);
    continue;
  }
  const startIdx = match.index;
  // Look a little past the image line to see if `section` is already there.
  const window = src.slice(startIdx, startIdx + 200);
  if (/"section":/.test(window.split("}")[0])) {
    alreadyPresent += 1;
    continue;
  }
  const indent = match[2];
  const imageLine = match[1]; // without trailing comma
  const eol = match[4];
  // Ensure the image line ends with a comma, then append the section line.
  const replacement = `${imageLine},${eol}${indent}"section": ${section}${eol}`;
  src = src.slice(0, startIdx) + replacement + src.slice(startIdx + match[0].length);
  injected += 1;
}

fs.writeFileSync(bookDataPath, src);
console.log(
  JSON.stringify(
    { image_mappings: sectionByImage.size, injected, alreadyPresent },
    null,
    2
  )
);
