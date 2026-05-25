const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

const appUrl = pathToFileURL(path.resolve(__dirname, "..", "playable", "index.html")).href;
const locations = ["intro", "background"];
const redFlags = [
  ["joined next village", /\bthenext\b/i],
  ["bad ear OCR", /@ars/i],
  ["bad roots OCR", /\bzoobs\b/i],
  ["bad hope OCR", /\bhape\b/i],
  ["bad animal OCR", /\barumal\b/i],
  ["bad racing OCR", /\braang\b/i],
  ["bad terrifying OCR", /\bberetfytngly\b/i],
  ["bad growl OCR", /grow\]/i],
  ["bad pounce OCR", /\bpourice\b/i],
  ["bad rumours OCR", /\bTumours\b/i],
  ["bad From OCR", /F\)\s*om/i],
  ["joined harm text", /\bharmtoanyone\b/i],
  ["joined impact text", /\bfullimpact\b/i],
  ["bad Faith OCR", /\bFarry\b/i],
  ["bad Skill OCR", /\bsKIL1\b|\bSKIL1\b/i],
  ["bad Stamina OCR", /\bsrAMINA\b/i],
  ["bad opening It OCR", /\bTt was\b/i],
  ["bad bracketed It OCR", /\[[tI]\s+may\b/i],
  ["missing sentence break", /\b(?:theirs You|fingers Suddenly|darkness Growling)\b/i],
  ["trailing page art", /\bTurn to paragraph 1\s+ii\b/i]
];

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1200 } });
  const failures = [];
  const summary = [];

  for (const location of locations) {
    await page.goto(`${appUrl}#${location}`);
    await page.waitForSelector(".intro-block");
    const text = await page.$eval("#sectionText", (element) => element.innerText.trim());
    summary.push({
      location,
      characters: text.length,
      paragraphs: text.split(/\n{2,}/).filter(Boolean).length
    });

    for (const [label, pattern] of redFlags) {
      const match = text.match(pattern);
      if (match) {
        failures.push({
          location,
          label,
          match: match[0],
          index: match.index
        });
      }
    }
  }

  await browser.close();

  if (failures.length) {
    console.error(JSON.stringify({ failures, summary }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, summary }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
