const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

const appUrl = pathToFileURL(path.resolve(__dirname, "..", "playable", "index.html")).href;

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });

  await page.goto(`${appUrl}#intro`);
  await page.waitForSelector(".intro-block");

  const headings = await page.$$eval(".intro-block h3", (elements) =>
    elements.map((element) => element.textContent.trim())
  );
  const counts = await page.$$eval(".intro-block", (blocks) =>
    blocks.map((block) => ({
      heading: block.querySelector("h3")?.textContent.trim(),
      paragraphs: block.querySelectorAll("p").length,
      steps: block.querySelectorAll("li").length
    }))
  );
  const firstText = await page.$eval("#sectionText", (element) =>
    element.innerText.trim().slice(0, 1200)
  );

  console.log(JSON.stringify({ headings, counts, firstText }, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
