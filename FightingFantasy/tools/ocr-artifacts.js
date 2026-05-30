"use strict";

// Shared OCR-artifact detector for the playable gamebooks.
//
// One reusable place to encode the recurring OCR defects we keep finding by hand
// (stray exclamations, glued/garbled stat blocks, leaked section-number headers,
// trailing page-scan residue, common substitution typos). Each book's
// check-proofreader.js / report-proofread.js requires this module so a fix here
// benefits every book at once.
//
// Detectors are split by severity:
//   - "gate"   : high-confidence, zero-tolerance defects. A book's proofreader
//                gate fails the build if any remain.
//   - "review" : fuzzier suspects worth a human look; surfaced in reports only.
//
// scanArtifacts(data) walks every section plus the intro/background text and
// returns a flat list of findings: { category, severity, weight, section,
// match, context }.

function collapse(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function snippet(text, index, match, pad = 28) {
  const flat = String(text || "");
  const start = Math.max(0, index - pad);
  const end = Math.min(flat.length, index + match.length + pad);
  return (start > 0 ? "…" : "") + collapse(flat.slice(start, end)) + (end < flat.length ? "…" : "");
}

function regexFinder(regex) {
  return (text) => {
    const out = [];
    const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
    let match;
    while ((match = re.exec(text))) {
      out.push({ match: match[0], index: match.index });
      if (match.index === re.lastIndex) re.lastIndex += 1;
    }
    return out;
  };
}

// A section's own number leaking into the start of its prose, preceded by OCR
// junk — e.g. "ee eS po 24 Your hands…" or "a | ae = oe: a 131 …". Tied to the
// section number so ordinary prose that merely contains a number can't trip it.
function leakedHeaderFinder(text, entry) {
  if (!Number.isInteger(entry.number)) return [];
  const head = text.slice(0, 40);
  const shortTokens = new RegExp(`^(?:[A-Za-z]{1,3}[ \\t]+){2,}${entry.number}\\b`);
  const symbolJunk = new RegExp(`^[A-Za-z0-9 \\t]*[|=:][A-Za-z0-9 \\t|=:.,'-]*\\b${entry.number}\\b[ \\t]+[A-Za-z]`);
  for (const re of [shortTokens, symbolJunk]) {
    const match = head.match(re);
    if (match) return [{ match: collapse(match[0]), index: 0 }];
  }
  return [];
}

const DETECTORS = [
  // ----- GATE: zero-tolerance defects -----
  {
    category: "stray exclamation",
    severity: "gate",
    weight: 8,
    // A space before "!", or "!" followed by a lowercase word. A real exclamation
    // hugs its word and is followed by whitespace + a capital or quote.
    find: regexFinder(/[ \t]+!|![ \t]+[a-z]/g)
  },
  {
    category: "garbled stat block",
    severity: "gate",
    weight: 9,
    // A stat word glued directly to a digit (e.g. "SKILL8") or a known OCR
    // misspelling. Legit punctuation ("FAITH?") and the blank adventure-sheet
    // OCR ("SKILL = STAMINA =") are deliberately not matched.
    find: regexFinder(
      /(?:SKILL|STAMINA|FAITH|LUCK)[0-9]|\b(?:sxkILL|sKILL|skILL|sxILL|SKIL1|sxi1|sraMINA|srAMINA|sTaMINA|sTamMINA|staMINA|sKiLi|sKiLL|Fa1TH|FarrH|LUcK)\b/g
    )
  },
  {
    category: "replacement glyph",
    severity: "gate",
    weight: 7,
    find: regexFinder(/�/g)
  },
  {
    category: "leaked section header",
    severity: "gate",
    weight: 8,
    find: leakedHeaderFinder
  },

  // ----- REVIEW: surfaced in reports only -----
  {
    category: "suspicious turn reference",
    severity: "review",
    weight: 6,
    // A turn-word followed by a target that is not a clean number.
    find: regexFinder(/\b[Tt]urn\s+to\d|\b[Tt]urn\s+(?:lo|te|bo|eo|fo|ta|io)\s*[0-9]/g)
  },
  {
    category: "trailing scan residue",
    severity: "review",
    weight: 5,
    // After a sentence end, a tail of very short tokens or symbol noise.
    find: regexFinder(/[.!?'")\]][ \t]+[A-Za-z]{1,3}(?:[ \t]+[A-Za-z]{1,3}){1,5}[ \t]*$|[ \t][=|][^A-Za-z]*$/g)
  },
  {
    category: "mojibake glyph",
    severity: "review",
    weight: 4,
    find: regexFinder(/Ã.|Â.|â€./g)
  },
  {
    category: "digit inside word",
    severity: "review",
    weight: 4,
    find: regexFinder(/\b[A-Za-z]{2,}[0-9][A-Za-z]{2,}\b/g)
  },
  {
    category: "bracket/pipe inside word",
    severity: "review",
    weight: 4,
    find: regexFinder(/[A-Za-z][|\][][A-Za-z]/g)
  },
  {
    category: "joined words",
    severity: "review",
    weight: 3,
    find: regexFinder(/\b(?:ofthe|tothe|tolook|inthe|onthe|atthe|Itisa|itis|Itis|Ifyou|Ifthe|openit)\b/g)
  }
];

function scanArtifacts(data, options = {}) {
  const sections = (data && data.sections) || {};
  const entries = [];
  for (const key of Object.keys(sections)) {
    const section = sections[key];
    const number = Number.isInteger(section.number) ? section.number : Number.parseInt(key, 10);
    entries.push({ id: String(number), number, text: section.text || "" });
  }
  if (data && data.intro && data.intro.text) {
    entries.push({ id: "intro", number: null, text: data.intro.text });
  }

  const ignore = new Set(options.ignoreCategories || []);
  const findings = [];
  for (const entry of entries) {
    for (const detector of DETECTORS) {
      if (ignore.has(detector.category)) continue;
      for (const hit of detector.find(entry.text, entry)) {
        findings.push({
          category: detector.category,
          severity: detector.severity,
          weight: detector.weight,
          section: entry.id,
          match: hit.match,
          context: snippet(entry.text, hit.index, hit.match)
        });
      }
    }
  }
  return findings;
}

function summarize(findings) {
  const byCategory = {};
  for (const finding of findings) {
    byCategory[finding.category] = (byCategory[finding.category] || 0) + 1;
  }
  return byCategory;
}

module.exports = { scanArtifacts, summarize, DETECTORS };
