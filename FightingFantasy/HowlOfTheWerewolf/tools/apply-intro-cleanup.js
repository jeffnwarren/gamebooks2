const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const bookDataPath = path.join(projectRoot, "playable", "book-data.js");
const reportPath = path.join(projectRoot, "proofreading", "review", "applied-intro-cleanup.md");
const dryRun = process.argv.includes("--dry-run");

global.window = {};
require(bookDataPath);

function escapeMd(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\n/g, "\\n");
}

function applyReplacement(state, from, to, note) {
  const before = state.text;
  let count = 0;

  if (from instanceof RegExp) {
    state.text = state.text.replace(from, (...args) => {
      count += 1;
      return typeof to === "function" ? to(...args) : to;
    });
  } else {
    const parts = state.text.split(from);
    count = parts.length - 1;
    state.text = parts.join(to);
  }

  if (count > 0) {
    state.applied.push({
      from: from instanceof RegExp ? `/${from.source}/${from.flags}` : from,
      to: typeof to === "function" ? note || "[computed]" : to,
      count,
      note: note || ""
    });
  }

  return before !== state.text;
}

function cleanupIntroText(text) {
  const state = { text: String(text || ""), applied: [] };

  const replacements = [
    ["attributes\nYou", "attributes.\nYou"],
    ["adventures\nSkill, Stamina and Luck", "adventures.\nSkill, Stamina and Luck"],
    ["gamebooks\nRoll one dice, Divide", "gamebooks.\nRoll one die. Divide"],
    ["giving you a fatal of between\n6 and to, Enter", "giving you a total of between\n8 and 10. Enter"],
    ["Adventure Sheet\nRoll two dice", "Adventure Sheet.\nRoll two dice"],
    ["STAMINA box\nRoll one dice", "STAMINA box.\nRoll one die"],
    ["Add 6 lo the number, piving", "Add 6 to the number, giving"],
    ["Luck box\nFor reasons", "LUCK box.\nFor reasons"],
    ["smal] in the boxes", "small in the boxes"],
    ["Your skIL. reflects", "Your SKILL reflects"],
    ["indicates how lucky you are\nBattles", "indicates how lucky you are.\nBattles"],
    ["across. Jn some", "across. In some"],
    ["described below\nEnter your opponent's SKILL, and STAMINA Scores", "described below.\nEnter your opponent's SKILL and STAMINA scores"],
    ["Adventure\nSheet, You should", "Adventure\nSheet. You should"],
    ["particular opponent. Then follow this sequence\n1.", "particular opponent. Then follow this sequence:\n1."],
    ["to find tts Attack Strength", "to find its Attack Strength"],
    ["3. if your Attack Strength", "3. If your Attack Strength"],
    ["eppo-\nnent's", "oppo-\nnent's"],
    ["see Luck section\n5.", "see Luck section).\n5."],
    ["you, se subtract", "you, so subtract"],
    ["You may use LUCK\nta reduce", "You may use LUCK\nto reduce"],
    ["see LUCK section\n6.", "see LUCK section).\n6."],
    ["until lhe STAMINA score", "until the STAMINA score"],
    ["new character\nFighting More Than One Opponent", "new character.\nFighting More Than One Opponent"],
    ["fight each in burn", "fight each in turn"],
    ["\nf they are treated", "\nIf they are treated"],
    ["opponents one ata time", "opponents one at a time"],
    ["which one to fight Attack your chosen", "which one to fight. Attack your chosen"],
    ["separately\nLuck", "separately.\nLuck"],
    ["Al various times", "At various times"],
    ["Thay usÃ© LUCK", "may use LUCK"],
    ["Thay usé LUCK", "may use LUCK"],
    ["disastrous\nThe procedure", "disastrous.\nThe procedure"],
    ["Luck works as follows\nroll two dice", "Luck works as follows: roll two dice"],
    ["will be penalised\nEach time", "will be penalised.\nEach time"],
    ["Point from your current Luck score", "point from your current LUCK score"],
    ["Lising Luck tn Battles", "Using Luck in Battles"],
    ["alwaya have", "always have"],
    ["your Luc, either", "your LUCK, either"],
    ["received\nIf you have", "received.\nIf you have"],
    ["lf you are Lucky", "If you are Lucky"],
    ["score. Tf you", "score. If you"],
    ["normal a points", "normal 2 points"],
    ["now score only 1\nWhenever", "now score only 1).\nWhenever"],
    ["to bry to minimise", "to try to minimise"],
    ["only grazes you\ndeduct", "only grazes you;\ndeduct"],
    ["normally\nRemember", "normally.\nRemember"],
    ["Luck\nscore each ime", "LUCK\nscore each time"],
    ["From time to Hime", "From time to time"],
    ["a\nParagraph may", "a\nparagraph may"],
    ["Al various times", "At various times"],
    ["Testing your Lick. roll two dice", "Testing your Luck: roll two dice"],
    ["your favows If", "your favour. If"],
    ["the consequences\nHowever", "the consequences.\nHowever"],
    ["each ime you Test your Skil\nStoming", "each time you Test your Skill.\nStamina"],
    ["adventure. [t will", "adventure. It will"],
    ["traps and pitfalls\nand it will", "traps and pitfalls,\nand it will"],
    ["book immediately. Braye", "book immediately. Brave"],
    ["Provisions yau", "Provisions you"],
    ["filling mn the details", "filling in the details"],
    ["Each Ome\nyou eat", "Each time\nyou eat"],
    ["up te 4", "up to 4"],
    ["Meal\nfom your", "Meal\nfrom your"],
    ["Provisions. 'You may", "Provisions. You may"],
    ["created your awn luck", "created your own luck"],
    ["action, Details", "action. Details"],
    ["where appropniate", "where appropriate"],
    ["its [niftel value", "its initial value"],
    ["mstructs you", "instructs you"],
    ["Change Points\nas you", "Change Points\nAs you"],
    ["anything bo you", "anything to you"],
    ["change 1s\nMonitored", "change is\nmonitored"],
    ["with 4 CHANGE", "with a CHANGE"],
    ["zero, However\nducing", "zero. However,\nduring"],
    ["careful\nnole", "careful\nnote"],
    ["in Lhe\nappropriate", "in the\nappropriate"],
    ["Adwatare Sheet, Once", "Adventure Sheet. Once"],
    ["thal you", "that you"],
    ["your Provisions\nGold Pieces", "your Provisions,\nGold Pieces"],
    ["olher items", "other items"],
    ["along Ihe way", "along the way"],
    ["To find cut", "To find out"],
    ["rell two dice", "roll two dice"],
    ["Adventure Sheet, Your", "Adventure Sheet. Your"],
    ["On YOUT qurst", "on your quest"],
    ["Printed throughout", "printed throughout"],
    ["slopping\nona page", "stopping\non a page"],
    ["need\nlo roll only one dice", "need\nto roll only one die"],
    ["read ordy", "read only"],
    ["two, lotal", "two, total"],
    ["Tt was madness", "It was madness"],
    ["make it\nta thenext village", "make it\nto the next village"],
    ["nightfall, As dusk", "nightfall. As dusk"],
    ["descended\nwhat possessed", "descended,\nwhat possessed"],
    ["expenenced sword-for-hire", "experienced sword-for-hire"],
    ["this ime once\nand for al], Your", "this time, once\nand for all. Your"],
    ["your @ars", "your ears"],
    ["quickening\ntheirs\nYou", "quickening\ntheirs.\nYou"],
    ["black fingers\nSuddenly", "black fingers.\nSuddenly"],
    ["trees, [t may", "trees. It may"],
    ["beacon of hape", "beacon of hope"],
    ["The\nlight 1 shining", "The\nlight is shining"],
    ["set aside for you\nA howl", "set aside for you.\nA howl"],
    ["You\nmmediately stumble", "You\nimmediately stumble"],
    ["darkness\nGrowling", "darkness.\nGrowling"],
    ["a Jean, hungry look", "a lean, hungry look"],
    ["gfey pelts", "grey pelts"],
    ["Jow against ther skulls", "low against their skulls"],
    ["lps curling back fom", "lips curling back from"],
    ["realise, fo your horror", "realise, to your horror"],
    ["that you are\nYou unsheathe", "that you are surrounded.\nYou unsheathe"],
    ["ciled leather scabbard, You", "oiled leather scabbard. You"],
    ["knowing that itis only", "knowing that it is only"],
    ["to Gght for your", "to fight for your"],
    ["last few months\nGrowing", "last few months.\nGrowing"],
    ["Mauristatia, The", "Mauristatia. The"],
    ["borders and enter. that", "borders and enter that"],
    ["seems sa beretfytngly real", "seems so terrifyingly real"],
    ["real\nA snarl", "real.\nA snarl"],
    ["one, Pushing", "one. Pushing"],
    ["as id moves", "as it moves"],
    ["is ihe un-\ndoubtable leader", "is the un-\ndoubted leader"],
    ["like 4\nmoumer's", "like a\nmourner's"],
    ["pall of night\nYou", "pall of night.\nYou"],
    ["seen ils like before\nThe creature", "seen its like before.\nThe creature"],
    ["grey that nuns from", "grey that runs from"],
    ["evil intentis", "evil intent is"],
    ["guttural grow]", "guttural growl"],
    ["fises from deep", "rises from deep"],
    ["prepares to pounce\nTurn to paragraph 1", "prepares to pounce.\nTurn to paragraph 1"]
  ];

  for (const [from, to] of replacements) {
    applyReplacement(state, from, to);
  }

  applyReplacement(
    state,
    /\n--- PAGE BREAK ---\n\nsecre[\s\S]*?eee\n\n--- PAGE BREAK ---\n\nBAD MOON RISING/,
    "\n--- PAGE BREAK ---\n\nADVENTURE SHEET\n\n--- PAGE BREAK ---\n\nBAD MOON RISING",
    "Remove adventure sheet OCR residue"
  );

  applyReplacement(
    state,
    /\n--- PAGE BREAK ---\n\nii i ;[\s\S]*$/i,
    "\n--- PAGE BREAK ---\n",
    "Remove trailing illustration OCR residue"
  );

  const followUps = [
    ["IIf they are treated", "If they are treated"],
    ["You\niimmediately stumble", "You\nimmediately stumble"],
    ["specifically tells you so\nYour", "specifically tells you so.\nYour"],
    ["its Attack Strength\n2.", "its Attack Strength.\n2."],
    ["your Attack Strength\n3.", "your Attack Strength.\n3."],
    ["from step 1 above\n4.", "from step 1 above.\n4."],
    ["Points from your STAMINA", "points from your STAMINA"],
    ["the normal way; If your Attack Strength", "the normal way; if your Attack Strength"],
    [
      "the more you rely on your Luck, the\nUsing Luck in Battles",
      "the more you rely on your Luck, the\nmore risky this will become.\nUsing Luck in Battles"
    ],
    ["score each time you Test your Luck\n", "score each time you Test your Luck.\n"],
    ["to\nthe contrary\nAt various times", "to\nthe contrary.\nAt various times"],
    ["start all over again\nYou can restore", "start all over again.\nYou can restore"],
    ["engaged in battle\nLuck", "engaged in battle.\nLuck"],
    ["the\ncontrary\nChange Points", "the\ncontrary.\nChange Points"],
    ["CHANGE points, You start", "CHANGE points. You start"],
    ["drop below 1\nEquipment and Gold", "drop below 1.\nEquipment and Gold"],
    ["on your quest\nAlternative Dice", "on your quest.\nAlternative Dice"],
    ["two, total the two dice symbols\ni2", "two, total the two dice symbols."]
  ];

  for (const [from, to] of followUps) {
    applyReplacement(state, from, to);
  }

  return state;
}

function replaceIntroLiteral(source, original, cleaned) {
  const originalLiteral = JSON.stringify(original);
  const cleanedLiteral = JSON.stringify(cleaned);
  const first = source.indexOf(originalLiteral);
  if (first < 0) {
    throw new Error("Could not find the intro text literal in playable/book-data.js.");
  }
  const second = source.indexOf(originalLiteral, first + originalLiteral.length);
  if (second >= 0) {
    throw new Error("Intro text literal was not unique; refusing to update book-data.js.");
  }
  return `${source.slice(0, first)}${cleanedLiteral}${source.slice(first + originalLiteral.length)}`;
}

const data = window.GAMEBOOK_DATA || {};
const originalIntro = data.intro?.text || "";
const result = cleanupIntroText(originalIntro);
const source = fs.readFileSync(bookDataPath, "utf8");
const updatedSource = replaceIntroLiteral(source, originalIntro, result.text);

if (!dryRun && updatedSource !== source) {
  fs.writeFileSync(bookDataPath, updatedSource, "utf8");
}

const lines = [
  "# Howl of the Werewolf Intro Cleanup",
  "",
  dryRun ? "Dry run only; no files were changed." : "Applied to `playable/book-data.js`.",
  "",
  "| From | To | Count | Note |",
  "| --- | --- | ---: | --- |"
];

if (result.applied.length === 0) {
  lines.push("| - | - | 0 | - |");
} else {
  for (const entry of result.applied) {
    lines.push(`| ${escapeMd(entry.from)} | ${escapeMd(entry.to)} | ${entry.count} | ${escapeMd(entry.note)} |`);
  }
}

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${lines.join("\n")}\n`, "utf8");

console.log(JSON.stringify({
  dryRun,
  appliedFixTypes: result.applied.length,
  appliedInstances: result.applied.reduce((sum, entry) => sum + entry.count, 0),
  changed: updatedSource !== source,
  report: path.relative(projectRoot, reportPath),
  target: path.relative(projectRoot, bookDataPath)
}, null, 2));
