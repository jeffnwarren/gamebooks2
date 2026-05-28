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

async function runHowl(page) {
  await goto(page, "background", ".intro-block");
  const background = await page.$eval("#sectionText", (element) => element.innerText);
  expect(background.includes("It was madness even to think"), "Howl background opening text is missing.");
  expect(background.includes("exposed tree roots"), "Howl background should show 'tree roots'.");
  expect(background.includes("animal cry"), "Howl background should show 'animal cry'.");
  expect(!/(thenext|@ars|zoobs|hape|arumal|raang|pourice|Turn to paragraph 1\s+ii)/i.test(background), "Howl background still contains known OCR artifacts.");

  await goto(page, 1, ".choice-list");
  expect(JSON.stringify(await choiceTargets(page)) === JSON.stringify([43, 66, 147]), "Howl section 1 choices changed.");
  await page.waitForSelector("#sectionIllustration img");
  const section1Illustration = await page.$eval("#sectionIllustration img", (image) => ({
    naturalWidth: image.naturalWidth,
    naturalHeight: image.naturalHeight
  }));
  expect(section1Illustration.naturalWidth > 0 && section1Illustration.naturalHeight > 0, "Howl section 1 illustration should load.");
  expect(await page.locator("#illustrationList .mini-link").count() === 31, "Howl should list 31 full-page illustrations.");
  await goto(page, 2, ".choice-list");
  expect(await page.$eval("#sectionIllustration", (element) => element.hidden), "Howl should not repeat page 9 illustration on section 2.");

  await goto(page, 41, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Add Egnarts"), "Howl section 41 should prompt Add Egnarts.");
  await page.locator("#codewordPrompts button").first().click();
  await goto(page, 186, "#codewordPrompts");
  const section186Prompts = await promptTexts(page);
  expect(section186Prompts.includes("Missing Retsis"), "Howl section 186 should check Retsis.");
  expect(section186Prompts.includes("Has Egnarts"), "Howl section 186 should recognize stored Egnarts.");
  await goto(page, 73, "#codewordPrompts");
  expect((await promptTexts(page)).includes("Cross Off Nethcir"), "Howl section 73 should prompt Cross Off Nethcir.");
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

  await goto(page, "intro");
  await page.click("#rollHeroBtn");
  const stats = await statValues(page);
  expect(within(stats.skillInitial, 7, 12) && stats.skill === stats.skillInitial, "Vault SKILL roll should be 7-12 and copied to current SKILL.");
  expect(within(stats.staminaInitial, 14, 24) && stats.stamina === stats.staminaInitial, "Vault STAMINA roll should be 14-24 and copied to current STAMINA.");
  expect(within(stats.luckInitial, 7, 12) && stats.luck === stats.luckInitial, "Vault LUCK roll should be 7-12 and copied to current LUCK.");
  expect(within(stats.faithInitial, 4, 9) && stats.faith === stats.faithInitial, "Vault FAITH roll should be 4-9 and copied to current FAITH.");
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
