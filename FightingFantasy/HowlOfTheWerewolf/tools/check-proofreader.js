const { chromium } = require("playwright");
const path = require("path");
const { pathToFileURL } = require("url");

const appUrl = pathToFileURL(path.resolve(__dirname, "..", "playable", "proofreader.html")).href;
const storageKey = "howl-of-the-werewolf-proofreader-state-v1";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1500, height: 1100 } });

  await page.goto(appUrl);
  await page.evaluate((key) => localStorage.removeItem(key), storageKey);

  await page.goto(`${appUrl}#intro-2`);
  await page.waitForSelector("#proofEditor .auto-suspect");

  const before = await page.evaluate(() => ({
    title: document.querySelector("#pageTitle")?.textContent.trim(),
    text: document.querySelector("#proofEditor")?.innerText || "",
    suspects: document.querySelectorAll("#proofEditor .auto-suspect").length,
    pageButtons: document.querySelectorAll("#pageList .proof-page-button").length,
    pdfHref: document.querySelector("#openPdfLink")?.href || ""
  }));

  const failures = [];
  if (before.title !== "Introduction Page 2") failures.push(`wrong title: ${before.title}`);
  if (!before.text.includes("Enter your opponent")) failures.push("Battles text was not rendered");
  if (before.suspects < 4) failures.push(`too few automatic flags: ${before.suspects}`);
  if (before.pageButtons < 20) failures.push(`too few page buttons: ${before.pageButtons}`);
  if (!before.pdfHref.includes("#page=2")) failures.push(`wrong PDF link: ${before.pdfHref}`);

  await page.fill("#correctionInput", "SKILL");
  await page.evaluate(() => {
    const suspect = document.querySelector("#proofEditor .auto-suspect");
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(suspect);
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.click("#markBtn");

  const afterMark = await page.evaluate(() => ({
    marks: document.querySelectorAll("#proofEditor .human-mark").length,
    stored: Boolean(JSON.parse(localStorage.getItem("howl-of-the-werewolf-proofreader-state-v1")).pages["intro-2"])
  }));

  if (afterMark.marks !== 1) failures.push(`human mark was not applied: ${afterMark.marks}`);
  if (!afterMark.stored) failures.push("human mark was not saved");

  await page.reload();
  await page.waitForSelector("#proofEditor .human-mark");
  const afterReload = await page.$$eval("#proofEditor .human-mark", (marks) => marks.length);
  if (afterReload !== 1) failures.push(`human mark did not persist after reload: ${afterReload}`);

  await page.evaluate((key) => localStorage.removeItem(key), storageKey);
  await browser.close();

  if (failures.length) {
    console.error(JSON.stringify({ failures, before, afterMark, afterReload }, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify({ ok: true, before, afterMark, afterReload }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
