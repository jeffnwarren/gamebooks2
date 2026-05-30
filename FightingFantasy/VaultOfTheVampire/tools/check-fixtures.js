const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

global.window = {};
require(path.resolve(__dirname, "..", "playable", "book-data.js"));

const title = window.GAMEBOOK_DATA.title;
const appUrl = pathToFileURL(path.resolve(__dirname, "..", "playable", "index.html")).href;
const failures = [];

function expect(condition, message) {
  if (!condition) failures.push(message);
}

function within(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

async function goto(page, location, selector = "#sectionText") {
  await page.goto(`${appUrl}#${location}`);
  await page.waitForSelector(selector);
}

async function choiceTargets(page) {
  return page.$$eval("#choiceList .choice-target", (targets) => targets.map((target) => Number(target.textContent.trim())));
}

async function promptTexts(page) {
  await page.waitForSelector("#codewordPrompts");
  return page.$$eval("#codewordPrompts > *", (items) => items.map((item) => item.textContent.trim()));
}

async function statValues(page) {
  return page.$$eval("[data-stat]", (inputs) =>
    Object.fromEntries(inputs.map((input) => [input.dataset.stat, Number(input.value)]))
  );
}

async function setStatInput(page, name, value) {
  await page.$eval(
    `[data-stat="${name}"]`,
    (el, v) => {
      el.value = v;
      el.dispatchEvent(new Event("change", { bubbles: true }));
    },
    value
  );
}

async function fieldNumber(page, selector) {
  return page.$eval(selector, (el) => Number(el.value));
}

async function outputValue(page, selector) {
  return page.$eval(selector, (el) => el.value);
}

async function enemyChips(page) {
  return page.$$eval("#enemyList .enemy-chip", (els) =>
    els.map((el) => ({ text: el.textContent, pressed: el.getAttribute("aria-pressed") }))
  );
}

async function runHowl(page) {
  await goto(page, "background", ".intro-block");
  const background = await page.$eval("#sectionText", (element) => element.innerText);
  expect(background.includes("It was madness even to think"), "Howl background opening text is missing.");
  expect(background.includes("exposed tree roots"), "Howl background should show 'tree roots'.");
  expect(background.includes("animal cry"), "Howl background should show 'animal cry'.");
  expect(!/(thenext|@ars|zoobs|hape|arumal|raang|pourice|Turn to paragraph 1\s+ii)/i.test(background), "Howl background still contains known OCR artifacts.");

  await goto(page, 1, ".choice-list");
  expect(JSON.stringify(await choiceTargets(page)) === JSON.stringify([43, 66, 147]), "Howl section 1 choices changed.");

  await goto(page, 41, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Add Egnarts"), "Howl section 41 should prompt Add Egnarts.");
  await page.locator("#codewordPrompts button").first().click();
  await goto(page, 186, "#codewordPrompts");
  const section186Prompts = await promptTexts(page);
  expect(section186Prompts.includes("Missing Retsis"), "Howl section 186 should check Retsis.");
  expect(section186Prompts.includes("Has Egnarts"), "Howl section 186 should recognize stored Egnarts.");
  await goto(page, 74, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Cross Off Nethcir"), "Howl section 74 should prompt Cross Off Nethcir.");
  await goto(page, 262, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Missing Stoggam"), "Howl section 262 should check Stoggam.");
  await goto(page, 286, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Add Daednu"), "Howl section 286 should prompt Add Daednu.");
  await goto(page, 344, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Missing Daednu"), "Howl section 344 should check Daednu.");

  await goto(page, "intro");
  await page.click("#rollHeroBtn");
  const stats = await statValues(page);
  expect(within(stats.skillInitial, 8, 10) && stats.skill === stats.skillInitial, "Howl SKILL roll should be 8-10 and copied to current SKILL.");
  expect(within(stats.staminaInitial, 12, 22) && stats.stamina === stats.staminaInitial, "Howl STAMINA roll should be 12-22 and copied to current STAMINA.");
  expect(within(stats.luckInitial, 7, 12) && stats.luck === stats.luckInitial, "Howl LUCK roll should be 7-12 and copied to current LUCK.");
  expect(stats.changeInitial === 0 && stats.change === 0, "Howl CHANGE should start at 0.");
  expect(within(stats.gold, 8, 18), "Howl Gold roll should be 8-18.");
}

async function runVault(page) {
  await goto(page, "background", ".intro-block");
  const background = await page.$eval("#sectionText", (element) => element.innerText);
  expect(background.includes("Rumours of great wealth"), "Vault background opening text is missing.");
  expect(background.includes("truth in them. The people"), "Vault background punctuation cleanup regressed.");
  expect(background.includes("From my own days as a warrior"), "Vault background 'From' cleanup regressed.");
  expect(!/(Tumours|harmtoanyone|F\)\s*om|fullimpact|Farry)/i.test(background), "Vault background still contains known OCR artifacts.");

  await goto(page, 1, ".choice-list");
  expect(JSON.stringify(await choiceTargets(page)) === JSON.stringify([201, 174, 148]), "Vault section 1 choices changed.");

  await goto(page, 5, "#sectionIllustration img");
  const section5Illustration = await page.$eval("#sectionIllustration img", (image) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  }));
  expect(section5Illustration.naturalWidth > 0 && section5Illustration.naturalHeight > 0, "Vault section 5 illustration should load.");
  expect(await page.locator("#illustrationList .mini-link").count() === 30, "Vault should list 30 full-page illustrations.");
  await goto(page, 6);
  expect(await page.$eval("#sectionIllustration", (element) => element.hidden), "Vault should not repeat page 11 illustration on section 6.");

  await goto(page, "intro");
  await page.click("#rollHeroBtn");
  const stats = await statValues(page);
  expect(within(stats.skillInitial, 7, 12) && stats.skill === stats.skillInitial, "Vault SKILL roll should be 7-12 and copied to current SKILL.");
  expect(within(stats.staminaInitial, 14, 24) && stats.stamina === stats.staminaInitial, "Vault STAMINA roll should be 14-24 and copied to current STAMINA.");
  expect(within(stats.luckInitial, 7, 12) && stats.luck === stats.luckInitial, "Vault LUCK roll should be 7-12 and copied to current LUCK.");
  expect(within(stats.faithInitial, 4, 9) && stats.faith === stats.faithInitial, "Vault FAITH roll should be 4-9 and copied to current FAITH.");

  // Combat: a single foe auto-populates the enemy fields from the passage text.
  await goto(page, 42, "#enemyList .enemy-chip");
  expect((await fieldNumber(page, "#enemySkill")) === 7, "Vault §42 should auto-fill Enemy Skill 7.");
  expect((await fieldNumber(page, "#enemyStamina")) === 9, "Vault §42 should auto-fill Enemy Stamina 9.");
  const vampireMistChips = await enemyChips(page);
  expect(vampireMistChips.length === 1, "Vault §42 should show one enemy chip.");
  expect(vampireMistChips[0].text.includes("Vampire Mist"), "Vault §42 chip should name the Vampire Mist.");
  expect(vampireMistChips[0].pressed === "true", "Vault §42 single foe should be auto-selected.");

  // Combat: several foes each become a selectable chip; the first is selected.
  await goto(page, 81, "#enemyList .enemy-chip");
  const zombieChips = await enemyChips(page);
  expect(zombieChips.length === 3, "Vault §81 should list three zombie chips.");
  expect(zombieChips[0].pressed === "true", "Vault §81 first foe should be auto-selected.");
  expect(zombieChips.filter((chip) => chip.pressed === "true").length === 1, "Vault §81 should select exactly one foe.");
  expect((await fieldNumber(page, "#enemySkill")) === 6 && (await fieldNumber(page, "#enemyStamina")) === 5,
    "Vault §81 should load the first zombie's stats (Skill 6, Stamina 5).");

  // Combat: non-standard per-hit damage is detected and applied automatically.
  await goto(page, 366, "#enemyList .enemy-chip");
  expect(/Hits for 3/i.test(await outputValue(page, "#combatOutput")), "Vault §366 should announce the Homunculus hits for 3.");
  await setStatInput(page, "skill", 1);
  await setStatInput(page, "staminaInitial", 20);
  await setStatInput(page, "stamina", 20);
  await page.$eval("#enemySkill", (el) => { el.value = 12; }); // force the enemy to win the round
  await page.evaluate(() => { Math.random = () => 0; }); // both sides roll 1+1; enemy Skill decides
  await page.click("#attackRoundBtn");
  const afterHit = await statValues(page);
  expect(afterHit.stamina === 17, "Vault §366 enemy hit should deduct 3 STAMINA (variable damage), 20→17.");
  expect(/hit for 3/i.test(await outputValue(page, "#combatOutput")), "Vault §366 attack round should report a 3-point hit.");

  // STAMINA adjuster: signed amount, applied to hero or enemy, hero healing capped at initial.
  await goto(page, 1, ".choice-list");
  await setStatInput(page, "staminaInitial", 20);
  await setStatInput(page, "stamina", 20);
  await page.fill("#adjustAmount", "4");
  expect((await page.$eval("#adjustSignBtn", (el) => el.getAttribute("aria-pressed"))) === "true",
    "Adjuster should default to subtract (minus).");
  await page.click("#heroAdjustBtn");
  expect((await statValues(page)).stamina === 16, "Hero −4 should drop STAMINA 20→16.");
  await page.click("#adjustSignBtn"); // toggle to plus
  await page.click("#heroAdjustBtn");
  expect((await statValues(page)).stamina === 20, "Hero +4 should restore 16→20 (capped at initial).");
  await page.click("#heroAdjustBtn");
  expect((await statValues(page)).stamina === 20, "Hero +4 again should stay capped at initial 20.");
  await page.$eval("#enemyStamina", (el) => { el.value = 5; });
  await page.click("#enemyAdjustBtn"); // sign is plus
  expect((await fieldNumber(page, "#enemyStamina")) === 9, "Enemy +4 should raise 5→9.");
  await page.click("#adjustSignBtn"); // back to minus
  await page.click("#enemyAdjustBtn");
  expect((await fieldNumber(page, "#enemyStamina")) === 5, "Enemy −4 should drop 9→5.");
}

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  await goto(page, "intro");
  await page.evaluate(() => localStorage.clear());

  if (title === "Howl of the Werewolf") {
    await runHowl(page);
  } else if (title === "Vault of the Vampire") {
    await runVault(page);
  } else {
    failures.push(`No fixture set is configured for '${title}'.`);
  }

  await browser.close();

  if (failures.length) {
    console.error(JSON.stringify({ title, failures }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ title, ok: true }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
