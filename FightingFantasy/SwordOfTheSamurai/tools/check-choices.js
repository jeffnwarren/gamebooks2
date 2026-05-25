const { chromium } = require("playwright");

const sections = process.argv.slice(2);
if (sections.length === 0) sections.push("1");

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  for (const section of sections) {
    await page.goto(`file:///C:/AI/FightingFantasy/SwordOfTheSamurai/playable/index.html#${section}`);
    await page.waitForSelector(".choice-list button");

    const choices = await page.$$eval(".choice-list button", (buttons) =>
      buttons.map((button) => button.innerText.trim().replace(/\s+/g, " "))
    );
    const text = await page.$eval("#sectionText", (element) =>
      element.innerText.trim().slice(0, 180)
    );

    console.log(`SECTION ${section}`);
    console.log("TEXT:", text);
    console.log("CHOICES:", JSON.stringify(choices, null, 2));
  }
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
