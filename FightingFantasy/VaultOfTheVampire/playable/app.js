(function () {
  "use strict";

  const data = window.GAMEBOOK_DATA;
  const sections = data.sections || {};
  const fullPageIllustrations = Array.isArray(data.illustrations?.fullPageIllustrations)
    ? data.illustrations.fullPageIllustrations.filter((item) => item && item.image && Number.isInteger(item.pdfPage))
    : [];
  // Illustrations carry an explicit `section` = the passage whose scene they depict
  // (curated against the source PDF). Fall back to the spread-page heuristic only for
  // any entry lacking one.
  const illustrationsBySection = new Map();
  const illustrationsByPage = new Map();
  for (const illustration of fullPageIllustrations) {
    if (Number.isInteger(illustration.section)) {
      const items = illustrationsBySection.get(illustration.section) || [];
      items.push(illustration);
      illustrationsBySection.set(illustration.section, items);
    }
    const pageItems = illustrationsByPage.get(illustration.pdfPage) || [];
    pageItems.push(illustration);
    illustrationsByPage.set(illustration.pdfPage, pageItems);
  }
  const firstSectionForPage = new Map();
  for (const section of Object.values(sections)) {
    if (!section || !Number.isInteger(section.page) || !Number.isInteger(section.number)) continue;
    const existing = firstSectionForPage.get(section.page);
    if (!existing || section.number < existing) firstSectionForPage.set(section.page, section.number);
  }
  const orderedSectionNumbers = Object.values(sections)
    .map((section) => section && section.number)
    .filter((number) => Number.isInteger(number))
    .sort((a, b) => a - b);
  // Straight-through reading order for proofreading: intro, background, then 1..400.
  const readingOrder = ["intro", "background", ...orderedSectionNumbers];
  const storageKey = "vault-of-the-vampire-play-state";
  const defaultState = {
    current: "intro",
    showPdf: false,
    back: [],
    forward: [],
    bookmarks: [],
    visited: [],
    stats: {
      skillInitial: 0,
      skill: 0,
      staminaInitial: 0,
      stamina: 0,
      luckInitial: 0,
      luck: 0,
      faithInitial: 0,
      faith: 0,
      provisions: 10,
      gold: 0
    },
    inventory: "Sword\nLeather armour\nShield\nLantern\nBackpack",
    notes: ""
  };

  const refs = {
    introBtn: document.getElementById("introBtn"),
    backgroundBtn: document.getElementById("backgroundBtn"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    backBtn: document.getElementById("backBtn"),
    forwardBtn: document.getElementById("forwardBtn"),
    bookmarkBtn: document.getElementById("bookmarkBtn"),
    jumpForm: document.getElementById("jumpForm"),
    jumpInput: document.getElementById("jumpInput"),
    searchInput: document.getElementById("searchInput"),
    searchResults: document.getElementById("searchResults"),
    bookmarkList: document.getElementById("bookmarkList"),
    visitedList: document.getElementById("visitedList"),
    illustrationList: document.getElementById("illustrationList"),
    sectionTitle: document.getElementById("sectionTitle"),
    sectionIllustration: document.getElementById("sectionIllustration"),
    sectionText: document.getElementById("sectionText"),
    choiceList: document.getElementById("choiceList"),
    sourceBtn: document.getElementById("sourceBtn"),
    sourceView: document.getElementById("sourceView"),
    pageNumber: document.getElementById("pageNumber"),
    pdfLink: document.getElementById("pdfLink"),
    pdfFrame: document.getElementById("pdfFrame"),
    resetBtn: document.getElementById("resetBtn"),
    rollHeroBtn: document.getElementById("rollHeroBtn"),
    diceOutput: document.getElementById("diceOutput"),
    testLuckBtn: document.getElementById("testLuckBtn"),
    attackRoundBtn: document.getElementById("attackRoundBtn"),
    enemySkill: document.getElementById("enemySkill"),
    enemyStamina: document.getElementById("enemyStamina"),
    enemyMinusBtn: document.getElementById("enemyMinusBtn"),
    heroMinusBtn: document.getElementById("heroMinusBtn"),
    combatOutput: document.getElementById("combatOutput"),
    inventoryText: document.getElementById("inventoryText"),
    notesText: document.getElementById("notesText")
  };

  let state = loadState();

  function loadState() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && typeof saved === "object") {
        return {
          ...defaultState,
          ...saved,
          stats: { ...defaultState.stats, ...(saved.stats || {}) }
        };
      }
    } catch (error) {
      console.warn(error);
    }
    return structuredClone(defaultState);
  }

  function saveState() {
    localStorage.setItem(storageKey, JSON.stringify(state));
  }

  function asNumber(value, fallback) {
    const number = Number.parseInt(value, 10);
    return Number.isFinite(number) ? number : fallback;
  }

  function validSection(number) {
    return Number.isInteger(number) && number >= 1 && number <= 400 && sections[String(number)];
  }

  function validLocation(value) {
    return value === "intro" || value === "background" || validSection(value);
  }

  function gotoIntro(pushHistory = true) {
    if (pushHistory && state.current !== "intro") {
      state.back.push(state.current);
      state.forward = [];
    }
    state.current = "intro";
    saveState();
    render();
  }

  function gotoBackground(pushHistory = true) {
    if (pushHistory && state.current !== "background") {
      state.back.push(state.current);
      state.forward = [];
    }
    state.current = "background";
    saveState();
    render();
  }

  function gotoSection(number, pushHistory = true) {
    if (!validSection(number)) {
      refs.diceOutput.value = `No section ${number}`;
      return;
    }

    if (pushHistory && state.current !== number) {
      state.back.push(state.current);
      state.forward = [];
    }
    state.current = number;
    state.visited = [number, ...state.visited.filter((item) => item !== number)].slice(0, 30);
    saveState();
    render();
  }

  function gotoLocation(location, pushHistory = true) {
    if (location === "intro") {
      gotoIntro(pushHistory);
      return;
    }
    if (location === "background") {
      gotoBackground(pushHistory);
      return;
    }
    gotoSection(location, pushHistory);
  }

  function stepReading(delta) {
    const index = readingOrder.indexOf(state.current);
    if (index === -1) return;
    const target = readingOrder[index + delta];
    if (target === undefined) return;
    gotoLocation(target);
  }

  function parseLocationInput(value, fallback = state.current) {
    const text = String(value || "").trim().toLowerCase();
    if (!text) return fallback;
    if (text === "intro" || text === "i") return "intro";
    if (text === "background" || text === "bg" || text === "0" || text === "ii") return "background";

    const number = asNumber(text, Number.NaN);
    return validSection(number) ? number : null;
  }

  function roll(count) {
    const results = Array.from({ length: count }, () => 1 + Math.floor(Math.random() * 6));
    return {
      results,
      total: results.reduce((sum, item) => sum + item, 0)
    };
  }

  function setStat(name, value) {
    state.stats[name] = Math.max(0, asNumber(value, 0));
    saveState();
  }

  function normalizeToken(token) {
    const trimmed = String(token || "")
      .trim()
      .replace(/[.,:;'"{}()[\]\s]/g, "");

    if (!trimmed || trimmed.includes("-")) return null;
    if (/^\d+$/.test(trimmed)) {
      const exact = Number.parseInt(trimmed, 10);
      return exact >= 1 && exact <= 400 ? exact : null;
    }

    const map = {
      o: "0",
      O: "0",
      a: "1",
      A: "1",
      i: "1",
      I: "1",
      l: "1",
      L: "1",
      z: "2",
      Z: "2",
      j: "3",
      J: "3",
      s: "5",
      S: "5",
      "$": "5",
      b: "6",
      G: "6",
      y: "7",
      Y: "7",
      e: "8",
      E: "8",
      q: "9",
      g: "9",
      "%": "1"
    };

    let digits = "";
    for (const char of trimmed) {
      if (/[0-9]/.test(char)) {
        digits += char;
      } else if (map[char]) {
        digits += map[char];
      }
    }

    digits = digits.replace(/00+/g, "0");
    const number = Number.parseInt(digits, 10);
    return number >= 1 && number <= 400 ? number : null;
  }

  function extractChoices(section) {
    const scanned = scanChoiceText(section.text, section.number);
    if (scanned.length > 0) return scanned;

    const borrowed = getBorrowedChoiceText(section);
    const borrowedChoices = borrowed ? scanChoiceText(`${section.text}\n${borrowed}`, section.number) : [];
    if (borrowedChoices.length > 0) return borrowedChoices;

    const fallback = [];
    for (const choice of section.choices || []) {
      if (validSection(choice) && choice !== section.number) {
        fallback.push({ target: choice, label: `Go to ${choice}` });
      }
    }

    return fallback;
  }

  function scanChoiceText(text, currentNumber) {
    const choices = new Map();
    const source = text.replace(/\s+/g, " ").trim();
    const turnPattern = /\b(?:turn|tur|tum|tarn|tuin|tuln|tim|timi|tumi|tium|tiurn|tucn|furn|fum|fumi|faim|fiumn|hrm|rurn|burn|bun|barn|hurn|hun|hum|humm|hirn|hon|harn|ham|eum|go|return|continue)\s+(?:at\s+once\s+to|back\s+to|to|lo|te|bo|eo|at|ta|i|l|fo)?\s*(?:paragraph|section)?\s*([0-9OoQIiLlAaEeSsBbGgqQjJzZyY$%(){}.,'"]{1,6})(?![A-Za-z])/gi;
    let match = turnPattern.exec(source);
    let previousEnd = 0;

    while (match) {
      const target = normalizeToken(match[1]);
      if (validSection(target) && target !== currentNumber && !choices.has(target)) {
        const label = choiceLabelFromPrefix(source.slice(previousEnd, match.index), target);
        choices.set(target, label);
      }
      previousEnd = turnPattern.lastIndex;
      match = turnPattern.exec(source);
    }

    return Array.from(choices, ([target, label]) => ({ target, label }));
  }

  function choiceLabelFromPrefix(prefix, target) {
    let label = prefix.replace(/\s+/g, " ").trim();
    label = label.replace(/^[,.;:)\]-]+/, "").trim();

    const willYou = label.match(/\bWill you\s+([^.!?]*\?)$/i);
    if (willYou) label = willYou[1].trim();

    const questionIndex = label.lastIndexOf("?");
    if (questionIndex >= 0) {
      const beforeQuestion = label.slice(0, questionIndex + 1);
      const previousQuestions = beforeQuestion.slice(0, -1);
      const splitIndex = Math.max(
        previousQuestions.lastIndexOf("?"),
        beforeQuestion.lastIndexOf("."),
        beforeQuestion.lastIndexOf("!"),
        beforeQuestion.lastIndexOf(";")
      );
      label = beforeQuestion.slice(splitIndex + 1).trim();
    } else {
      const splitIndex = Math.max(
        label.lastIndexOf("."),
        label.lastIndexOf("!"),
        label.lastIndexOf(";")
      );
      if (splitIndex >= 0) label = label.slice(splitIndex + 1).trim();
    }

    label = label.replace(/^Will you\s+/i, "").trim();
    label = label.replace(/^leave through\s+/i, "").replace(/\btothe\b/gi, "to the").trim();
    if (!label || label.length < 3) return `Go to ${target}`;
    if (label.length <= 92) return label;
    return `${label.slice(0, 88).trim()}...`;
  }

  function getBorrowedChoiceText(section) {
    const next = sections[String(section.number + 1)];
    if (!next || !section.text.match(/\bWill you\s*$|\bWill you:\s*$|\?\s*$/i)) {
      return "";
    }

    const borrowed = [];
    const lines = next.text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
    let sawTarget = false;

    for (const line of lines) {
      const looksLikeFreshNarration = /^(You|The|As|A|An|There|This|If|Roll|Before|After|Suddenly|Having)\b/.test(line);
      if (borrowed.length && sawTarget && looksLikeFreshNarration) break;

      borrowed.push(line);
      if (line.match(/\b(?:turn|tum|tuin|tuln|furn|fum|hrm|rurn)\s+to\b/i) || line.match(/\bto\s*[0-9A-Za-z]/i)) {
        sawTarget = true;
      }

      if (borrowed.length >= 6) break;
    }

    return borrowed.join("\n");
  }

  function linkify(text) {
    const escaped = escapeHtml(text);
    const turnPattern = /((?:turn|tur|tum|tarn|tuin|tuln|tim|timi|tumi|tium|tiurn|tucn|furn|fum|fumi|faim|fiumn|hrm|rurn|burn|bun|barn|hurn|hun|hum|humm|hirn|hon|harn|ham|eum|go|return|continue)\s+(?:at\s+once\s+to|back\s+to|to|lo|te|bo|eo|at|ta|i|l|fo)?\s*(?:paragraph|section)?\s*)([0-9OoQIiLlAaEeSsBbGgqQjJzZyY$%(){}.,'"]{1,6})/gi;
    return escaped.replace(turnPattern, (full, lead, token) => {
      const target = normalizeToken(token);
      if (!validSection(target)) return full;
      return `${lead}<a href="#${target}" data-section="${target}">${token}</a>`;
    });
  }

  function formatReadableText(text) {
    let value = String(text || "")
      .replace(/\s*--- PAGE BREAK ---\s*/g, " ")
      .replace(/([A-Za-z]{2,})-\s+([a-z]{2,})/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();
    value = polishOcrText(value);
    if (value.match(/\bWill you\b/i) && value.match(/\b(?:turn|tum|tuin|tuln|furn|fum|hrm|rurn)\s+to\b/i)) {
      value = value.replace(/\bWill you\s*:?\s+/i, "Will you:\n");
    }
    value = value.replace(/\b(Now,\s+will you|So,\s+will you|But will you|Which spell will you cast\?)\s+/gi, "$1:\n");
    value = value.replace(/\s+(SKILL\s+\d+\s+STAMINA\s+\d+)/g, "\n$1");
    value = value.replace(/\s+([A-Z][A-Z' -]{3,}\s+SKILL\s+\d+\s+STAMINA\s+\d+)/g, "\n$1");
    value = value.replace(/\s+(If you win|If you are Lucky|If you are Unlucky|Do you have|Roll one die|Roll two dice)\b/g, "\n$1");
    value = value.replace(
      /(\b(?:Turn|Tum|Tuin|Tuln|Furn|Fum|Hrm|Rurn|turn|tum|tuin|tuln|furn|fum|hrm|rurn)\s+to\s+[0-9OoQIiLlAaEeSsBbGgqQjJzZ()%{}.,'"]{1,6})\s+(?=[A-Z])/g,
      "$1\n"
    );
    return value;
  }

  const introHeadingNames = new Map([
    ["introduction", "Introduction"],
    ["skill, stamina, luck and faith", "Skill, Stamina, Luck and Faith"],
    ["magic", "Magic"],
    ["battles", "Battles"],
    ["fighting more than one creature", "Fighting More Than One Creature"],
    ["luck", "Luck"],
    ["using luck in battles", "Using Luck in Battles"],
    ["restoring skill, stamina, luck and faith", "Restoring Skill, Stamina, Luck and Faith"],
    ["skill", "Skill"],
    ["stamina and provisions", "Stamina and Provisions"],
    ["faith", "Faith"],
    ["afflictions", "Afflictions"],
    ["equipment", "Equipment"],
    ["hints on play", "Hints on Play"],
    ["background", "Background"]
  ]);

  const paragraphStarts = [
    "You are advised",
    "Roll one die",
    "Roll two dice",
    "For reasons",
    "Although",
    "Your SKILL score",
    "Your STAMINA score",
    "Your LUCK score",
    "Your FAITH score",
    "During your adventure",
    "Such items",
    "To begin with",
    "Enter the creature's",
    "Click Attack Round",
    "Keep clicking Attack Round",
    "At various times",
    "The procedure",
    "Each time",
    "If things go",
    "On certain pages",
    "However, in battles",
    "If you have just",
    "If the creature",
    "Remember that",
    "Your backpack",
    "When you eat",
    "A separate",
    "Your journey",
    "Make notes",
    "Not all areas",
    "Be very wary",
    "Generally",
    "Don't Test",
    "It will be realized",
    "Reading other",
    "The one true way",
    "May the luck",
    "Rumours of great wealth",
    "Hunched in",
    "You are aroused",
    "The tavern",
    "You ask",
    "What's more",
    "An old woman",
    "She gulps",
    "The low murmur",
    "'Tis the Count",
    "Embarrassed voices",
    "A tall",
    "The eyes",
    "You are about",
    "Outside in",
    "Now turn"
  ];

  function formatIntroHtml(text, options = {}) {
    let blocks = buildIntroBlocks(text);
    if (options.onlyHeading) {
      blocks = blocks.filter((block) => block.heading === options.onlyHeading);
    }
    if (options.excludeHeading) {
      blocks = blocks.filter((block) => block.heading !== options.excludeHeading);
    }
    if (!blocks.length) return linkify(formatReadableText(text));

    return blocks.map((block) => {
      const heading = block.heading;
      const paragraphs = introParagraphs(block.lines.join(" "));
      const body = paragraphs.map((paragraph) => {
        if (paragraph.type === "list") {
          const items = paragraph.items
            .map((item) => `<li>${linkify(item)}</li>`)
            .join("");
          return `<ol class="intro-steps">${items}</ol>`;
        }
        return `<p>${linkify(paragraph.text)}</p>`;
      }).join("");

      return `<section class="intro-block"><h3>${escapeHtml(heading)}</h3>${body}</section>`;
    }).join("");
  }

  function buildIntroBlocks(text) {
    const lines = cleanIntroLines(text);
    const blocks = [];

    for (const line of lines) {
      const heading = introHeadingFor(line);
      if (heading) {
        blocks.push({ heading, lines: [] });
        continue;
      }

      if (!blocks.length) {
        blocks.push({ heading: "Introduction", lines: [] });
      }
      blocks[blocks.length - 1].lines.push(line);
    }

    return blocks.filter((block) => block.lines.length || block.heading);
  }

  function cleanIntroLines(text) {
    const output = [];
    let skippingSheet = false;

    for (const rawLine of String(text || "").replace(/\r/g, "").split("\n")) {
      let line = cleanIntroLine(rawLine);
      if (!line || /^-*\s*PAGE BREAK\s*-*$/i.test(line) || isIntroArtifact(line)) continue;

      if (/^SKILL\s+(?:STAMINA\s+)?LUCK$/i.test(line) || /^SKILL\s+STAMINA\s+LUCK$/i.test(line)) {
        skippingSheet = true;
        continue;
      }
      if (skippingSheet) {
        if (line === "BACKGROUND") {
          skippingSheet = false;
        } else {
          continue;
        }
      }

      const previous = output[output.length - 1];
      if (
        previous &&
        !introHeadingFor(previous) &&
        !introHeadingFor(line) &&
        /[A-Za-z]{2,}-$/.test(previous) &&
        /^[a-z]/.test(line)
      ) {
        output[output.length - 1] = previous.slice(0, -1) + line;
      } else {
        output.push(line);
      }
    }

    return output;
  }

  function introHeadingFor(line) {
    const key = String(line || "")
      .toLowerCase()
      .replace(/\bluck\b/g, "luck")
      .replace(/\s+/g, " ")
      .trim();
    return introHeadingNames.get(key) || "";
  }

  function cleanIntroLine(line) {
    return polishOcrText(String(line || ""))
      .replace(/[|]/g, " ")
      .replace(/\bRoli\b/g, "Roll")
      .replace(/\bsKIL1\b/g, "SKILL")
      .replace(/\bsrAMINA\b/g, "STAMINA")
      .replace(/\bInifial\b/g, "Initial")
      .replace(/\bInifiai\b/g, "Initial")
      .replace(/\bFarry\b/g, "FAITH")
      .replace(/\ba !ot\b/g, "a lot")
      .replace(/\bTumours\b/g, "rumours")
      .replace(/\blantem\b/g, "lantern")
      .replace(/\binan\b/g, "man")
      .replace(/\bF\)\s*om\b/g, "From")
      .replace(/\basa\b/g, "as a")
      .replace(/\bharmtoanyone\b/g, "harm to anyone")
      .replace(/\bfullimpact\b/g, "full impact")
      .replace(/\bLuCK\b/g, "LUCK")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isIntroArtifact(line) {
    if (/^\d{1,2}$/.test(line)) return true;
    if (/^(?:a aca a|Onl EEE|ial ol|OOOO aaa|SSS ee OO|er ibaa ih ba|a %|ee, Fee|1 Es)$/i.test(line)) return true;
    if (/^(?:INITIAL|SPELLS AFFLICTIONS|ITEMS OF TREASURE|EQUIPMENT CARRIED|NOTES|- PROVISIONS)$/i.test(line)) return true;
    if (/^(?:SKILL =|STAMINA =|LUCK =|SKILL STAMIMGA|SEALE|ALLS|SKULL|iNETMAL|kei\.)/i.test(line)) return true;
    return /^[=_'"., |\\/()%\-]+$/.test(line);
  }

  function introParagraphs(text) {
    let value = normalizeIntroText(text);
    const numbered = extractNumberedSteps(value);
    if (numbered) {
      const paragraphs = splitIntroText(numbered.before);
      paragraphs.push({ type: "list", items: numbered.steps });
      return paragraphs.concat(splitIntroText(numbered.after));
    }
    return splitIntroText(value);
  }

  function normalizeIntroText(text) {
    let value = String(text || "")
      .replace(/\s*-+\s*PAGE BREAK\s*-+\s*/gi, " ")
      .replace(/\bPAGE BREAK\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    value = value
      .replace(/weaknesses,\s+You/g, "weaknesses. You")
      .replace(/\bSKILL STAMINA\b/g, "SKILL, STAMINA")
      .replace(/\bSTAMINA LUCK\b/g, "STAMINA, LUCK")
      .replace(/\bSTAMINA and LUCK scores You\b/g, "STAMINA and LUCK scores. You")
      .replace(/\bFAITH scores You\b/g, "FAITH scores. You")
      .replace(/\bcomplete this adventure Skill,/g, "complete this adventure. Skill,")
      .replace(/\btruth in them people\b/g, "truth in them. The people")
      .replace(/\bStill perhaps\b/g, "Still, perhaps")
      .replace(/\bleast she's talking to you which\b/g, "least she's talking to you, which")
      .replace(/'Hart's Blood", stranger\./g, "'Hart's Blood', stranger.")
      .replace(/\bNastassia such a\b/g, "Nastassia, such a")
      .replace(/\bone arm the right sleeve\b/g, "one arm, the right sleeve")
      .replace(/\bone obvious reason - You nod\b/g, "one obvious reason. You nod")
      .replace(/\(so this score will be between 7 and 12\b/g, "(so this score will be between 7 and 12)")
      .replace(/\(this score will be between 7 and 12\b/g, "(this score will be between 7 and 12)")
      .replace(/\(so that this score will be between 4 and 9\b/g, "(so that this score will be between 4 and 9)")
      .replace(/\(death\b/g, "(death)")
      .replace(/\(repeat steps 1-6\b/g, "(repeat steps 1-6)")
      .replace(/\((Again[^.]+see below)\b/g, "($1)")
      .replace(/\((instead of[^.]+1 point)\b/g, "($1)")
      .replace(/\((so far as[^.]+concerned)\b/g, "($1)")
      .replace(/\((and to your LUCK score if you used LUCK - see below)\b/g, "($1)")
      .replace(/\bThe sequence for combat is then\b\.?/g, "The sequence for combat is then:")
      .replace(/\s+([.;:!?])/g, "$1")
      .replace(/([.!?])([A-Z])/g, "$1 $2");

    return value;
  }

  function extractNumberedSteps(text) {
    const firstStep = text.search(/(?<!step\s)\b1\.\s+/i);
    if (firstStep < 0) return null;

    const before = text.slice(0, firstStep).trim();
    const rest = text.slice(firstStep).trim();
    const stepMatches = Array.from(rest.matchAll(/(?<!step\s)\b([1-7])\.\s+/gi));
    if (stepMatches.length < 3) return null;

    const steps = [];
    for (let index = 0; index < stepMatches.length; index += 1) {
      const start = stepMatches[index].index + stepMatches[index][0].length;
      const end = index + 1 < stepMatches.length ? stepMatches[index + 1].index : rest.length;
      steps.push(completeSentence(rest.slice(start, end).trim()));
    }

    const last = stepMatches[stepMatches.length - 1];
    const afterStart = last.index + rest.slice(last.index).search(/\bThis sequence\b/);
    const after = afterStart >= last.index ? rest.slice(afterStart).trim() : "";
    if (after) {
      const lastStepIndex = steps.length - 1;
      steps[lastStepIndex] = completeSentence(steps[lastStepIndex].replace(/\s*This sequence.*$/i, "").trim());
    }

    return { before, steps, after };
  }

  function splitIntroText(text) {
    let value = String(text || "").trim();
    if (!value) return [];

    for (const start of paragraphStarts) {
      const pattern = new RegExp(`\\s+(${escapeRegExp(start)})\\b`, "g");
      value = value.replace(pattern, "\n$1");
    }

    const rawParagraphs = value
      .split(/\n+/)
      .map((item) => item.trim())
      .filter(Boolean);

    const paragraphs = [];
    for (const paragraph of rawParagraphs) {
      for (const chunk of splitLongParagraph(paragraph)) {
        paragraphs.push({ type: "text", text: completeSentence(chunk) });
      }
    }
    return paragraphs;
  }

  function splitLongParagraph(text) {
    const maxLength = 620;
    const value = String(text || "").trim();
    if (value.length <= maxLength) return [value];

    const sentences = value.match(/[^.!?]+[.!?]+(?:['"])?|[^.!?]+$/g) || [value];
    const chunks = [];
    let current = "";

    for (const sentence of sentences.map((item) => item.trim()).filter(Boolean)) {
      if (current && `${current} ${sentence}`.length > maxLength) {
        chunks.push(current);
        current = sentence;
      } else {
        current = current ? `${current} ${sentence}` : sentence;
      }
    }

    if (current) chunks.push(current);
    return chunks;
  }

  function completeSentence(text) {
    const value = String(text || "").trim();
    if (!value) return "";
    if (/[.!?:'"\]]$/.test(value)) return value;
    if (/[.!?]\)$/.test(value)) return value;
    return `${value}.`;
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function polishOcrText(text) {
    let value = text
      .replace(/\btothe\b/gi, "to the")
      .replace(/\bopenit\b/gi, "open it")
      .replace(/\bItis\b/g, "It is")
      .replace(/\bIfyou\b/g, "If you")
      .replace(/\bIfthe\b/g, "If the")
      .replace(/\bturn tc\b/gi, "turn to")
      .replace(/\bTum\b/g, "Turn")
      .replace(/\btum\b/g, "turn")
      .replace(/\bsraMINa\b/g, "STAMINA")
      .replace(/\bsTaMINA\b/g, "STAMINA")
      .replace(/\bsraMINA\b/g, "STAMINA")
      .replace(/\bsxkILL\b/g, "SKILL")
      .replace(/\bsxKILE\b/g, "SKILL")
      .replace(/\bLuck\b/g, "LUCK");

    const joinedWords = new Map([
      ["Vam- pire", "Vampire"],
      ["vam- pire", "vampire"],
      ["dis- patched", "dispatched"],
      ["dis- appears", "disappears"],
      ["pro- posal", "proposal"],
      ["spec- tral", "spectral"],
      ["win- dows", "windows"],
      ["forbid- ding", "forbidding"],
      ["confu- sion", "confusion"],
      ["sor- cery", "sorcery"],
      ["sarcopha- gus", "sarcophagus"],
      ["treacher- ous", "treacherous"],
      ["comfort- able", "comfortable"],
      ["mildewed", "mildewed"]
    ]);

    for (const [from, to] of joinedWords) {
      value = value.replaceAll(from, to);
    }

    value = value.replace(/\s+(?:C-O|SSS(?:\s+\w{1,3})*|OOO+|={1,}\s*[a-z]{0,3}\s*-?|[-=]{3,}[^A-Za-z0-9]*)\s*$/i, "");
    return value;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderSection() {
    if (state.current === "intro") {
      const intro = data.intro || { text: "", page: 1 };
      refs.sectionTitle.textContent = "Introduction";
      refs.jumpInput.value = "i";
      hideSectionIllustration();
      refs.sectionText.classList.remove("empty-text");
      refs.sectionText.classList.add("intro-text");
      refs.sectionText.innerHTML = formatIntroHtml(intro.text || "No introduction text was extracted.", {
        excludeHeading: "Background"
      });
      refs.choiceList.innerHTML = "";
      appendLocationButton("background", "Read the background", "0");
      appendLocationButton(1, "Begin the adventure", "1");
      const pdfUrl = `${data.sourcePdf}#page=${intro.page || 1}`;
      refs.pageNumber.textContent = intro.page || 1;
      refs.pdfLink.href = pdfUrl;
      renderSourcePanel(pdfUrl);
      return;
    }

    if (state.current === "background") {
      const intro = data.intro || { text: "", page: 1 };
      const backgroundPage = 8;
      refs.sectionTitle.textContent = "0";
      refs.jumpInput.value = "0";
      hideSectionIllustration();
      refs.sectionText.classList.remove("empty-text");
      refs.sectionText.classList.add("intro-text");
      refs.sectionText.innerHTML = formatIntroHtml(intro.text || "No background text was extracted.", {
        onlyHeading: "Background"
      });
      refs.choiceList.innerHTML = "";
      appendLocationButton(1, "Begin the adventure", "1");
      const pdfUrl = `${data.sourcePdf}#page=${backgroundPage}`;
      refs.pageNumber.textContent = backgroundPage;
      refs.pdfLink.href = pdfUrl;
      renderSourcePanel(pdfUrl);
      return;
    }

    const section = sections[String(state.current)] || sections["1"];
    refs.sectionTitle.textContent = section.number;
    refs.jumpInput.value = section.number;
    renderSectionIllustration(section);

    if (section.text.trim()) {
      refs.sectionText.classList.remove("empty-text");
      refs.sectionText.classList.remove("intro-text");
      refs.sectionText.innerHTML = linkify(formatReadableText(section.text));
    } else {
      refs.sectionText.classList.remove("intro-text");
      refs.sectionText.classList.add("empty-text");
      refs.sectionText.textContent = "The OCR did not recover text for this section. Use the PDF page below and jump manually.";
    }

    refs.choiceList.innerHTML = "";
    const choices = extractChoices(section);
    if (choices.length === 0) {
      const manual = document.createElement("div");
      manual.className = "empty-text";
      manual.textContent = "No reliable automatic choices found.";
      refs.choiceList.append(manual);
    } else {
      for (const choice of choices) {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.section = choice.target;
        button.innerHTML = `<span>${escapeHtml(choice.label)}</span><span class="choice-target">${choice.target}</span>`;
        refs.choiceList.append(button);
      }
    }

    const pdfUrl = `${data.sourcePdf}#page=${section.page}`;
    refs.pageNumber.textContent = section.page;
    refs.pdfLink.href = pdfUrl;
    renderSourcePanel(pdfUrl);
  }

  function appendLocationButton(location, label, targetLabel) {
    const button = document.createElement("button");
    button.type = "button";
    if (Number.isInteger(location)) {
      button.dataset.section = String(location);
    } else {
      button.dataset.location = location;
    }
    button.innerHTML = `<span>${escapeHtml(label)}</span><span class="choice-target">${escapeHtml(targetLabel)}</span>`;
    refs.choiceList.append(button);
  }

  function renderSourcePanel(pdfUrl) {
    refs.sourceView.classList.toggle("is-open", state.showPdf);
    refs.sourceBtn.textContent = state.showPdf ? "Hide PDF" : "Show PDF";
    refs.sourceBtn.setAttribute("aria-expanded", String(state.showPdf));

    if (state.showPdf) {
      refs.pdfFrame.src = pdfUrl;
    } else {
      refs.pdfFrame.removeAttribute("src");
    }
  }

  function renderLists() {
    renderMiniList(refs.bookmarkList, state.bookmarks, "No bookmarks");
    renderMiniList(refs.visitedList, state.visited, "No visits yet");
    renderIllustrationList();
  }

  function hideSectionIllustration() {
    refs.sectionIllustration.innerHTML = "";
    refs.sectionIllustration.hidden = true;
  }

  function illustrationCaption(illustration) {
    const half = illustration.half === "L" ? "left" : illustration.half === "R" ? "right" : "";
    return half ? `PDF page ${illustration.pdfPage}, ${half}` : `PDF page ${illustration.pdfPage}`;
  }

  function renderSectionIllustration(section) {
    // Prefer the curated section→illustration mapping; fall back to the spread-page
    // heuristic (show on the first section of the page) only for unmapped entries.
    let illustrations = illustrationsBySection.get(section?.number) || [];
    if (!illustrations.length) {
      const page = section?.page;
      const pageItems = (illustrationsByPage.get(page) || []).filter((it) => !Number.isInteger(it.section));
      const firstSection = firstSectionForPage.get(page);
      if (pageItems.length && firstSection === section.number) illustrations = pageItems;
    }
    if (!illustrations.length) {
      hideSectionIllustration();
      return;
    }

    refs.sectionIllustration.innerHTML = "";
    refs.sectionIllustration.hidden = false;
    for (const illustration of illustrations) {
      const figure = document.createElement("figure");
      figure.className = "illustration-figure";

      const image = document.createElement("img");
      image.src = illustration.image;
      image.alt = `Full-page illustration from ${illustrationCaption(illustration)}`;
      image.loading = "eager";

      const caption = document.createElement("figcaption");
      caption.textContent = illustrationCaption(illustration);

      figure.append(image, caption);
      refs.sectionIllustration.append(figure);
    }
  }

  function renderIllustrationList() {
    refs.illustrationList.innerHTML = "";
    if (!fullPageIllustrations.length) {
      const empty = document.createElement("div");
      empty.className = "empty-text";
      empty.textContent = "No illustrations";
      refs.illustrationList.append(empty);
      return;
    }

    for (const illustration of fullPageIllustrations) {
      const target = firstSectionForPage.get(illustration.pdfPage);
      const link = document.createElement("a");
      link.className = "mini-link";
      link.href = target ? `#${target}` : `${data.sourcePdf}#page=${illustration.pdfPage}`;
      if (target) link.dataset.section = String(target);
      link.innerHTML = `<strong>${escapeHtml(illustrationCaption(illustration))}</strong><span>${target ? `Section ${target}` : "PDF"}</span>`;
      refs.illustrationList.append(link);
    }
  }

  function renderMiniList(container, items, emptyText) {
    container.innerHTML = "";
    if (!items.length) {
      const empty = document.createElement("div");
      empty.className = "empty-text";
      empty.textContent = emptyText;
      container.append(empty);
      return;
    }

    for (const item of items.slice(0, 12)) {
      const link = document.createElement("a");
      link.href = `#${item}`;
      link.className = "mini-link";
      link.dataset.section = item;
      const text = sections[String(item)]?.text || "";
      const preview = text.replace(/\s+/g, " ").trim().slice(0, 34);
      link.innerHTML = `<strong>${item}</strong><span>${escapeHtml(preview)}</span>`;
      container.append(link);
    }
  }

  function renderSheet() {
    for (const input of document.querySelectorAll("[data-stat]")) {
      input.value = state.stats[input.dataset.stat] ?? 0;
    }
    refs.inventoryText.value = state.inventory;
    refs.notesText.value = state.notes;
  }

  function renderButtons() {
    const readingIndex = readingOrder.indexOf(state.current);
    refs.prevBtn.disabled = readingIndex <= 0;
    refs.nextBtn.disabled = readingIndex === -1 || readingIndex >= readingOrder.length - 1;
    refs.backBtn.disabled = state.back.length === 0;
    refs.forwardBtn.disabled = state.forward.length === 0;
    refs.bookmarkBtn.disabled = !Number.isInteger(state.current);
    refs.bookmarkBtn.textContent = state.bookmarks.includes(state.current) ? "Bookmarked" : "Bookmark";
  }

  function render() {
    renderSection();
    renderLists();
    renderSheet();
    renderButtons();
  }

  function search(query) {
    const cleaned = query.trim().toLowerCase();
    refs.searchResults.innerHTML = "";
    if (cleaned.length < 2) return;

    const results = Object.values(sections)
      .filter((section) => section.text.toLowerCase().includes(cleaned) || String(section.number) === cleaned)
      .slice(0, 10);

    for (const section of results) {
      const link = document.createElement("a");
      link.href = `#${section.number}`;
      link.className = "mini-link";
      link.dataset.section = section.number;
      const preview = section.text.replace(/\s+/g, " ").trim().slice(0, 36);
      link.innerHTML = `<strong>${section.number}</strong><span>${escapeHtml(preview)}</span>`;
      refs.searchResults.append(link);
    }
  }

  refs.jumpForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const location = parseLocationInput(refs.jumpInput.value, state.current);
    if (!validLocation(location)) {
      refs.diceOutput.value = `No section ${refs.jumpInput.value}`;
      return;
    }
    gotoLocation(location);
  });

  refs.introBtn.addEventListener("click", () => gotoIntro());
  refs.backgroundBtn.addEventListener("click", () => gotoBackground());
  refs.prevBtn.addEventListener("click", () => stepReading(-1));
  refs.nextBtn.addEventListener("click", () => stepReading(1));

  refs.backBtn.addEventListener("click", () => {
    const previous = state.back.pop();
    if (validLocation(previous)) {
      state.forward.push(state.current);
      state.current = previous;
      saveState();
      render();
    }
  });

  refs.forwardBtn.addEventListener("click", () => {
    const next = state.forward.pop();
    if (validLocation(next)) {
      state.back.push(state.current);
      state.current = next;
      saveState();
      render();
    }
  });

  refs.bookmarkBtn.addEventListener("click", () => {
    if (!Number.isInteger(state.current)) return;
    if (state.bookmarks.includes(state.current)) {
      state.bookmarks = state.bookmarks.filter((item) => item !== state.current);
    } else {
      state.bookmarks = [state.current, ...state.bookmarks].slice(0, 30);
    }
    saveState();
    renderLists();
    renderButtons();
  });

  refs.sourceBtn.addEventListener("click", () => {
    state.showPdf = !state.showPdf;
    saveState();
    render();
  });

  refs.resetBtn.addEventListener("click", () => {
    if (!window.confirm("Start a new game and clear the sheet?")) return;
    localStorage.removeItem(storageKey);
    state = structuredClone(defaultState);
    render();
  });

  refs.searchInput.addEventListener("input", () => search(refs.searchInput.value));

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-section], [data-location]");
    if (!target) return;
    event.preventDefault();
    if (target.dataset.location) {
      gotoLocation(target.dataset.location);
    } else {
      gotoSection(asNumber(target.dataset.section, state.current));
    }
  });

  for (const input of document.querySelectorAll("[data-stat]")) {
    input.addEventListener("change", () => {
      setStat(input.dataset.stat, input.value);
      renderSheet();
    });
  }

  refs.inventoryText.addEventListener("input", () => {
    state.inventory = refs.inventoryText.value;
    saveState();
  });

  refs.notesText.addEventListener("input", () => {
    state.notes = refs.notesText.value;
    saveState();
  });

  document.querySelectorAll("[data-roll]").forEach((button) => {
    button.addEventListener("click", () => {
      const count = asNumber(button.dataset.roll, 1);
      const result = roll(count);
      refs.diceOutput.value = `${result.results.join(" + ")} = ${result.total}`;
    });
  });

  refs.rollHeroBtn.addEventListener("click", () => {
    const skill = roll(1).total + 6;
    const stamina = roll(2).total + 12;
    const luck = roll(1).total + 6;
    const faith = roll(1).total + 3;
    state.stats = {
      ...state.stats,
      skillInitial: skill,
      skill,
      staminaInitial: stamina,
      stamina,
      luckInitial: luck,
      luck,
      faithInitial: faith,
      faith
    };
    saveState();
    renderSheet();
  });

  refs.testLuckBtn.addEventListener("click", () => {
    const result = roll(2);
    const lucky = result.total <= state.stats.luck;
    state.stats.luck = Math.max(0, state.stats.luck - 1);
    refs.diceOutput.value = `${result.results.join(" + ")} = ${result.total}. ${lucky ? "Lucky" : "Unlucky"}. Luck now ${state.stats.luck}.`;
    saveState();
    renderSheet();
  });

  refs.attackRoundBtn.addEventListener("click", () => {
    const hero = roll(2);
    const enemy = roll(2);
    const heroAttack = hero.total + state.stats.skill;
    const enemyAttack = enemy.total + asNumber(refs.enemySkill.value, 0);
    let message = `You ${heroAttack} (${hero.results.join("+")}), enemy ${enemyAttack} (${enemy.results.join("+")}). `;
    if (heroAttack > enemyAttack) {
      refs.enemyStamina.value = Math.max(0, asNumber(refs.enemyStamina.value, 0) - 2);
      message += "Enemy hit for 2.";
    } else if (enemyAttack > heroAttack) {
      state.stats.stamina = Math.max(0, state.stats.stamina - 2);
      message += "You are hit for 2.";
    } else {
      message += "Both attacks miss.";
    }
    refs.combatOutput.value = message;
    saveState();
    renderSheet();
  });

  refs.enemyMinusBtn.addEventListener("click", () => {
    refs.enemyStamina.value = Math.max(0, asNumber(refs.enemyStamina.value, 0) - 2);
  });

  refs.heroMinusBtn.addEventListener("click", () => {
    state.stats.stamina = Math.max(0, state.stats.stamina - 2);
    saveState();
    renderSheet();
  });

  window.addEventListener("hashchange", () => {
    if (location.hash === "#intro") {
      if (state.current !== "intro") gotoIntro();
      return;
    }
    const target = parseLocationInput(location.hash.replace("#", ""), state.current);
    if (validLocation(target) && target !== state.current) gotoLocation(target);
  });

  if (location.hash === "#intro") {
    state.current = "intro";
    gotoIntro(false);
  } else {
    const initialHash = parseLocationInput(location.hash.replace("#", ""), state.current);
    if (validLocation(initialHash)) state.current = initialHash;
    if (!validLocation(state.current)) state.current = "intro";
    gotoLocation(state.current, false);
  }
})();
