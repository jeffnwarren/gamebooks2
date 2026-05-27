const fs = require("fs");
const path = require("path");

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));

const projectRoot = path.resolve(__dirname, "..");
const outDir = path.join(projectRoot, "proofreading", "review");
const data = window.GAMEBOOK_DATA;
const sections = data.sections || {};

const flags = [
  {
    label: "mechanics: suspicious turn reference",
    risk: "pdf-check",
    weight: 9,
    pattern: /\b(?:tum|hurn|hirn|hum|hon|faim|fiirn|tumi|tiurn|furn|burn|bun|barn|tarn|fim|fm|fam|fain|fae|tucn|tuum|Tumi|Twm)\s+(?:to|lo|te|bo|eo|fo|tor|mlo|m|ta)?\s*[0-9OoQIiLlAaEeSsBbGgqQjJzZ$Â§%(){}.,'"]{1,6}\b|\b[Tt]urn\s+(?:lo|te|bo|eo|fo|ta|io|mlo|tor)\s*[0-9OoQIiLlAaEeSsBbGgqQjJzZ$Â§%(){}.,'"]{1,6}\b|\b[Tt]urn\s+to\d+\b|\b[Tt]urn\s+to\s*(?=[0-9OoQIiLlAaEeSsBbGgqQjJzZ$Â§%(){}.,'"]*[A-Za-zÂ§$])[0-9OoQIiLlAaEeSsBbGgqQjJzZ$Â§%(){}.,'"]{1,6}\b/g
  },
  {
    label: "mechanics: suspicious stat block",
    risk: "pdf-check",
    weight: 9,
    pattern: /\b(?:RKILL|sKILL|skILL|sxILL|SKIL1|sxi1|sraMINA|sTamMINA|staMINA|TAMINA|LUcE|5TAMINA)\b|\bSKILL[?&Â§@=A-Z0-9-]{1,8}\b|\bSTAMINA[?&Â§@=A-Z0-9-]{1,8}\b|\b(?:SKILL|STAMINA)\s+(?:[?&Â§@=]+|[A-Z?&Â§@=][A-Z?&Â§@=0-9]{0,3}|[gq])\b/g
  },
  {
    label: "stray replacement/control glyph",
    risk: "pdf-check",
    weight: 7,
    pattern: /[ï¿½Ã‚Â§Â€Â¥Â®]/g
  },
  {
    label: "at-sign or hash inside prose",
    risk: "review",
    weight: 5,
    pattern: /[A-Za-z]@[A-Za-z]|@[A-Za-z]{2,}|[A-Za-z]#[A-Za-z]|#[A-Za-z]{2,}/g
  },
  {
    label: "digit inside prose word",
    risk: "review",
    weight: 4,
    pattern: /\b[A-Za-z]+[0-9][A-Za-z]+\b/g
  },
  {
    label: "known intro/background token",
    risk: "safe-candidate",
    weight: 5,
    pattern: /\b(?:pamebook|sead|famebooks|rojled|roiled|skILt|Adventire|smal\]|mub|samt|skiii|epponent|Bepin|AHtack|siart|Somehmes|setile|Lueky|deducl|nornal|anly|austain|Unducky|TesHig|curtent|poimts|enpaped|batile|occasianally|translormation|cannol|atmour|lanicm|Aditeuiire|thenext|zoobs|arumal|raang|pourice|beretfytngly)\b/gi
  },
  {
    label: "common OCR token",
    risk: "review",
    weight: 3,
    pattern: /\b(?:vour|vou|yau|yout|lhe|ihe|thal|fom|fron|Camivale|writen|belore|tuming|tums|tumed|looky|mear|nat|bo|te|lo|ta|bwo|hwo|ime|arcund|enier|preter|bwist|fwitter|sormw|warkshep|clixir)\b/gi
  },
  {
    label: "bracketed letter in word",
    risk: "review",
    weight: 3,
    pattern: /[A-Za-z][\][|!][A-Za-z]|[\][|!][A-Za-z]{2,}/g
  },
  {
    label: "joined words",
    risk: "safe-candidate",
    weight: 3,
    pattern: /\b(?:thenext|noonecomes|tolook|ofthe|yourAdpenturc|ingood|ititis|Itisa|itis)\b/gi
  },
  {
    label: "possible missing sentence break",
    risk: "review",
    weight: 2,
    pattern: /\b(?:attributes|adventures|below|Sheet|Strength|section|character|time|separately|disastrous|penalised|Luck|favour|again|darkness|fingers|life|real|night|here|value|score)\s+(?=(?:You|Enter|Roll|If|Then|The|This|Your|Although|Sometimes|When|Of|At|But|In|Growling|Suddenly|A|Turn)\b)/g
  },
  {
    label: "unclosed parenthetical sentence",
    risk: "pdf-check",
    weight: 4,
    pattern: /\([^)]{80,}$/gm
  },
  {
    label: "page-art residue",
    risk: "pdf-check",
    weight: 6,
    pattern: /\b(?:eee|SSS|OOO|i_i_i|Wh Ht|a aca a|FE\]\s*EJ|Qui Ren|My Cre)\b/g
  }
];

const safeFixes = [
  ["pamebook", "gamebook"],
  ["sead", "read"],
  ["famebooks", "gamebooks"],
  ["rojled", "rolled"],
  ["roiled", "rolled"],
  ["skILt", "SKILL"],
  ["Adventire", "Adventure"],
  ["smal]", "small"],
  ["mub", "rub"],
  ["samt", "SKILL"],
  ["skiii", "SKILL"],
  ["Bepin", "Begin"],
  ["AHtack", "Attack"],
  ["siart", "start"],
  ["Somehmes", "Sometimes"],
  ["setile", "settle"],
  ["Lueky", "Lucky"],
  ["deducl", "deduct"],
  ["nornal", "normal"],
  ["anly", "only"],
  ["austain", "sustain"],
  ["Unducky", "Unlucky"],
  ["TesHig", "Testing"],
  ["curtent", "current"],
  ["poimts", "points"],
  ["enpaped", "engaged"],
  ["batile", "battle"],
  ["occasianally", "occasionally"],
  ["translormation", "transformation"],
  ["cannol", "cannot"],
  ["atmour", "armour"],
  ["lanicm", "lantern"],
  ["Aditeuiire", "Adventure"],
  ["zoobs", "roots"],
  ["arumal", "animal"],
  ["raang", "racing"],
  ["pourice", "pounce"],
  ["grow]", "growl"],
  ["dwarts", "dwarfs"],
  ["vour", "your"],
  ["Jeast", "least"],
  ["lake a step", "take a step"],
  ["reachon", "reaction"],
  ["invilation", "invitation"],
  ["mun away", "run away"],
  ["arcund", "around"],
  ["enier", "enter"],
  ["would you preter to", "would you prefer to"],
  ["fwitter", "twitter"],
  ["sormw", "sorrow"],
  ["warkshep", "workshop"],
  ["clixir", "elixir"]
];

function introPages() {
  const introStartPage = Number.isInteger(data.intro?.page) ? data.intro.page : 1;
  return String(data.intro?.text || "")
    .replace(/\r/g, "")
    .split(/\n\s*--- PAGE BREAK ---\s*\n/g)
    .map((text, index) => ({
      id: `intro-${index + 1}`,
      label: index >= 6 ? `Background page ${index - 5}` : `Introduction page ${index + 1}`,
      pdfPage: introStartPage + index,
      text: text.trim()
    }))
    .filter((item) => item.text);
}

function allLocations() {
  const locations = introPages();
  Object.values(sections)
    .filter((section) => section && Number.isInteger(section.number))
    .sort((a, b) => a.number - b.number)
    .forEach((section) => {
      locations.push({
        id: `section-${section.number}`,
        label: `Section ${section.number}`,
        pdfPage: section.page,
        text: section.text || ""
      });
    });
  return locations;
}

function normalizeWhitespace(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function context(source, index, length) {
  const start = Math.max(0, index - 80);
  const end = Math.min(source.length, index + length + 100);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}

function analyzeLocation(location) {
  const normalized = normalizeWhitespace(location.text);
  const hits = [];
  let score = 0;

  for (const flag of flags) {
    const matches = [...normalized.matchAll(new RegExp(flag.pattern.source, flag.pattern.flags))]
      .filter((match) => flag.label !== "mechanics: suspicious turn reference" || isSuspiciousTurnText(match[0]));
    if (!matches.length) continue;
    score += matches.length * flag.weight;
    hits.push({
      label: flag.label,
      risk: flag.risk,
      count: matches.length,
      examples: [...new Set(matches.slice(0, 5).map((match) => match[0].trim()))],
      contexts: [...new Set(matches.slice(0, 3).map((match) => context(normalized, match.index || 0, match[0].length)))]
    });
  }

  return {
    ...location,
    score,
    hits,
    preview: normalized.slice(0, 220)
  };
}

function fixRegex(from) {
  if (/^[A-Za-z0-9\]]+$/.test(from)) {
    return new RegExp(`\\b${escapeRegExp(from)}\\b`, "g");
  }
  return new RegExp(escapeRegExp(from), "g");
}

function isSuspiciousTurnText(value) {
  const text = normalizeWhitespace(value).toLowerCase();
  if (/^turn\s+to\s+paragraph\s+\d{1,3}\b/.test(text)) return false;
  if (/^turn\s+to\s+\d{1,3}[).,;:'"]?$/.test(text)) return false;
  if (/^turn\s+to\s+(?:see|tail|face|look|find|make|take|ask|go)\b/.test(text)) return false;
  return true;
}

function safeFixCandidates(locations) {
  const byFix = [];
  for (const [from, to] of safeFixes) {
    const regex = fixRegex(from);
    const instances = [];
    for (const location of locations) {
      const normalized = normalizeWhitespace(location.text);
      const matches = [...normalized.matchAll(regex)];
      if (!matches.length) continue;
      instances.push({
        id: location.id,
        label: location.label,
        pdfPage: location.pdfPage,
        count: matches.length,
        contexts: matches.slice(0, 3).map((match) => context(normalized, match.index || 0, match[0].length))
      });
    }
    const count = instances.reduce((sum, item) => sum + item.count, 0);
    if (count > 0) byFix.push({ from, to, count, instances });
  }
  return byFix.sort((a, b) => b.count - a.count || a.from.localeCompare(b.from));
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|");
}

function writeReviewQueue(rows, locations, fixes) {
  const flagged = rows.filter((row) => row.score > 0);
  const pdfCheck = flagged.filter((row) => row.hits.some((hit) => hit.risk === "pdf-check"));
  const safeCandidateLocations = flagged.filter((row) => row.hits.some((hit) => hit.risk === "safe-candidate"));

  const lines = [
    `# ${data.title} OCR Review Queue`,
    "",
    "Generated from `playable/book-data.js`.",
    "",
    "Use this as a triage list. Do not apply PDF-check items without opening the source page.",
    "",
    "## Summary",
    "",
    `- Locations scanned: ${locations.length}`,
    `- Flagged locations: ${flagged.length}`,
    `- Locations needing PDF/mechanics review: ${pdfCheck.length}`,
    `- Locations with safe-candidate flags: ${safeCandidateLocations.length}`,
    `- Exact safe-fix candidate instances: ${fixes.reduce((sum, fix) => sum + fix.count, 0)}`,
    "",
    "## Top Queue",
    ""
  ];

  for (const row of flagged.slice(0, 80)) {
    lines.push(`### ${row.label} | PDF page ${row.pdfPage} | score ${row.score}`);
    lines.push("");
    lines.push(`Preview: ${row.preview}`);
    lines.push("");
    lines.push("| Risk | Flag | Count | Examples |");
    lines.push("| --- | --- | ---: | --- |");
    for (const hit of row.hits) {
      lines.push(`| ${hit.risk} | ${escapeMd(hit.label)} | ${hit.count} | ${escapeMd(hit.examples.join(", "))} |`);
    }
    lines.push("");
    for (const hit of row.hits.slice(0, 3)) {
      lines.push(`- ${hit.label}: ${hit.contexts[0] || ""}`);
    }
    lines.push("");
  }

  lines.push("## All Flagged Locations", "");
  lines.push("| Location | PDF page | Score | Main flags |");
  lines.push("| --- | ---: | ---: | --- |");
  for (const row of flagged) {
    const main = row.hits.slice(0, 3).map((hit) => `${hit.label} (${hit.count})`).join("; ");
    lines.push(`| ${escapeMd(row.label)} | ${row.pdfPage} | ${row.score} | ${escapeMd(main)} |`);
  }

  fs.writeFileSync(path.join(outDir, "review-queue.md"), `${lines.join("\n").trim()}\n`, "utf8");
}

function writeSafeFixes(fixes) {
  const lines = [
    `# ${data.title} Safe-Fix Candidates`,
    "",
    "These are exact OCR-token candidates only. They intentionally exclude section-number guesses and stat-block guesses.",
    "",
    "| From | To | Count |",
    "| --- | --- | ---: |"
  ];

  for (const fix of fixes) {
    lines.push(`| ${escapeMd(fix.from)} | ${escapeMd(fix.to)} | ${fix.count} |`);
  }

  lines.push("", "## Contexts", "");
  for (const fix of fixes) {
    lines.push(`### ${fix.from} -> ${fix.to}`);
    lines.push("");
    for (const instance of fix.instances.slice(0, 12)) {
      lines.push(`- ${instance.label}, PDF page ${instance.pdfPage} (${instance.count}): ${instance.contexts[0] || ""}`);
    }
    lines.push("");
  }

  fs.writeFileSync(path.join(outDir, "safe-fix-candidates.md"), `${lines.join("\n").trim()}\n`, "utf8");
}

function writeJson(rows, fixes) {
  fs.writeFileSync(
    path.join(outDir, "review-queue.json"),
    `${JSON.stringify({
      title: data.title,
      generatedAt: new Date().toISOString(),
      flaggedLocations: rows.filter((row) => row.score > 0),
      safeFixes: fixes
    }, null, 2)}\n`,
    "utf8"
  );
}

fs.mkdirSync(outDir, { recursive: true });

const locations = allLocations();
const rows = locations.map(analyzeLocation).sort((a, b) => b.score - a.score || a.pdfPage - b.pdfPage);
const fixes = safeFixCandidates(locations);

writeReviewQueue(rows, locations, fixes);
writeSafeFixes(fixes);
writeJson(rows, fixes);

console.log(JSON.stringify({
  title: data.title,
  output: path.relative(projectRoot, outDir),
  scannedLocations: locations.length,
  flaggedLocations: rows.filter((row) => row.score > 0).length,
  safeFixCandidateTypes: fixes.length,
  safeFixCandidateInstances: fixes.reduce((sum, fix) => sum + fix.count, 0),
  files: [
    "proofreading/review/review-queue.md",
    "proofreading/review/safe-fix-candidates.md",
    "proofreading/review/review-queue.json"
  ]
}, null, 2));
