const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

const sections = process.argv.slice(2);
if (sections.length === 0) sections.push("1");
const appUrl = pathToFileURL(path.resolve(__dirname, "..", "playable", "index.html")).href;

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  for (const section of sections) {
    await page.goto(`${appUrl}#${section}`);
    await page.waitForSelector(".choice-list");

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
