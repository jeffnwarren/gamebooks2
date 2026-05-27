const fs = require("fs");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));

const data = window.GAMEBOOK_DATA;
const sections = data.sections || {};
const outDir = path.resolve(__dirname, "..", "proofreading");
const chunkDir = path.join(outDir, "chunks");
const chunkTargetLength = 18000;

function ensureCleanDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  for (const item of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, item);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    } else {
      fs.unlinkSync(fullPath);
    }
  }
}

function sourcePages(text) {
  return String(text || "")
    .replace(/\r/g, "")
    .split(/\n\s*--- PAGE BREAK ---\s*\n/g)
    .map((page) => page.trim())
    .filter(Boolean);
}

function header(label, pdfPage) {
  return `=== ${label} | PDF PAGE ${pdfPage} ===`;
}

function rawBlocks() {
  const blocks = [];
  const introStartPage = Number.isInteger(data.intro?.page) ? data.intro.page : 1;

  sourcePages(data.intro?.text || "").forEach((text, index) => {
    const pdfPage = introStartPage + index;
    const label = index >= 6 ? `BACKGROUND PAGE ${index - 5}` : `INTRODUCTION PAGE ${index + 1}`;
    blocks.push({
      id: `intro-${index + 1}`,
      label,
      pdfPage,
      text
    });
  });

  Object.values(sections)
    .filter((section) => section && Number.isInteger(section.number))
    .sort((a, b) => a.number - b.number)
    .forEach((section) => {
      blocks.push({
        id: `section-${section.number}`,
        label: `SECTION ${section.number}`,
        pdfPage: section.page,
        text: section.text || ""
      });
    });

  return blocks;
}

function readableText(text) {
  let value = String(text || "")
    .replace(/\r/g, "")
    .replace(/([A-Za-z]{2,})-\n([a-z]{2,})/g, "$1$2")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  value = value
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");

  return value;
}

function fileText(blocks, transform) {
  const lines = [
    data.title || "Howl of the Werewolf",
    "Proofreading copy generated from playable/book-data.js",
    "Use the section and PDF page headers to trace Grammarly findings back to the source.",
    ""
  ];

  for (const block of blocks) {
    const text = transform(block.text);
    if (!text) continue;
    lines.push(header(block.label, block.pdfPage), "", text, "");
  }

  return `${lines.join("\n").trim()}\n`;
}

function writeChunks(blocks) {
  fs.mkdirSync(chunkDir, { recursive: true });
  const chunks = [];
  let current = [];
  let currentLength = 0;

  function flush() {
    if (!current.length) return;
    chunks.push(current);
    current = [];
    currentLength = 0;
  }

  for (const block of blocks) {
    const text = readableText(block.text);
    if (!text) continue;

    const blockText = `${header(block.label, block.pdfPage)}\n\n${text}\n`;
    if (current.length && currentLength + blockText.length > chunkTargetLength) {
      flush();
    }
    current.push({ ...block, blockText });
    currentLength += blockText.length;
  }
  flush();

  const indexLines = [
    data.title || "Howl of the Werewolf",
    "Grammarly chunk index",
    ""
  ];

  chunks.forEach((chunk, index) => {
    const number = String(index + 1).padStart(3, "0");
    const name = `chunk-${number}.txt`;
    const first = chunk[0];
    const last = chunk[chunk.length - 1];
    const body = [
      data.title || "Howl of the Werewolf",
      `Proofreading chunk ${index + 1} of ${chunks.length}`,
      `Range: ${first.label} through ${last.label}`,
      "",
      ...chunk.map((item) => item.blockText.trim()),
      ""
    ].join("\n\n");

    fs.writeFileSync(path.join(chunkDir, name), `${body.trim()}\n`, "utf8");
    indexLines.push(`${name}: ${first.label} through ${last.label}`);
  });

  fs.writeFileSync(path.join(chunkDir, "index.txt"), `${indexLines.join("\n")}\n`, "utf8");
  return chunks.length;
}

function writeReadme(chunkCount) {
  const text = `# ${data.title} Proofreading Text

Generated from \`playable/book-data.js\`.

- \`story-raw.txt\`: raw OCR text with stable intro/section/PDF page headers.
- \`story-readable.txt\`: line-wrapped text normalized into paragraphs for grammar tools.
- \`chunks/\`: smaller readable text chunks for pasting into tools with length limits.

There are ${chunkCount} chunk files. Keep the headers when copying text into Grammarly so any finding can be traced back to its PDF page or numbered section.
`;

  fs.writeFileSync(path.join(outDir, "README.md"), text, "utf8");
}

fs.mkdirSync(outDir, { recursive: true });
ensureCleanDir(chunkDir);

const blocks = rawBlocks();
fs.writeFileSync(path.join(outDir, "story-raw.txt"), fileText(blocks, (value) => String(value || "").trim()), "utf8");
fs.writeFileSync(path.join(outDir, "story-readable.txt"), fileText(blocks, readableText), "utf8");
const chunkCount = writeChunks(blocks);
writeReadme(chunkCount);

console.log(JSON.stringify({
  title: data.title,
  output: path.relative(path.resolve(__dirname, ".."), outDir),
  blocks: blocks.length,
  chunks: chunkCount,
  files: [
    "proofreading/story-raw.txt",
    "proofreading/story-readable.txt",
    "proofreading/chunks/index.txt"
  ]
}, null, 2));
