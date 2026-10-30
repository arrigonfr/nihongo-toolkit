import assert from "node:assert/strict";
import { toolPage } from "./tool-page.mjs";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";
const api = createServer(createHandler({ origins: ["http://127.0.0.1:5187"], sentenceFallback: async () => [] }));
let vite, browser;
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
try {
  vite = await createVite({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 5187, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch();
  const context = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = toolPage(await context.newPage());
  const errors = [];
  const writtenText = (selector) => page.locator(selector).evaluate((element) => {
    const copy = element.cloneNode(true);
    copy.querySelectorAll("rt, .study-romaji, .kana-reading").forEach((node) => node.remove());
    return copy.textContent;
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5187/活用.html");
  await page.locator("#wordInput").pressSequentially("taberu");
  assert.equal(await page.inputValue("#wordInput"), "たべる");
  await page.locator("#wordInput").fill("食べる");
  const lookupResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/conjugator" && url.searchParams.get("q") === "食べる";
  });
  await page.locator("#searchForm").evaluate((form) => form.requestSubmit());
  const lookup = await (await lookupResponse).json();
  await page.locator('[data-form="basic-plain"]').waitFor();
  assert.match(await writtenText('[data-form="basic-past-negative-polite"]'), /食べませんでした/);
  assert.match(await page.textContent('[data-form="basic-polite"] .form-note p'), /remove the final る.*Add ます/);
  assert.match(await page.textContent('[data-form="basic-past-negative-polite"] .form-note p'), /Add ませんでした/);
  await page.click("#wordInfo > summary");
  const examples = lookup.items.find((entry) => entry.word === "食べる").examples;
  assert.ok(examples.length, "The dictionary fixture has translated examples");
  for (const example of examples) {
    const item = page.locator("#baseExamples .sentence-item").filter({ hasText: example.english });
    await item.waitFor();
    assert.equal(await item.count(), 1);
    assert.match(await item.textContent(), new RegExp(example.english.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    if (example.id) assert.equal(await item.locator(".sentence-credit").first().getAttribute("href"), `https://tatoeba.org/sentences/show/${example.id}`);
  }
  for (const id of ["furiganaQuickToggle", "romajiQuickToggle", "audioQuickToggle"]) {
    await page.click(`#${id}`);
    assert.ok((await page.textContent("#baseExamples")).includes(examples[0].english), "Translations survive shared study toggles");
  }
  await page.click("#wordInfo > summary");
  await page.click("#settingsPanel > summary");
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-polarity", "negative"]);
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-tense", "past"]);
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-politeness", "polite"]);
  assert.equal(await page.locator('[data-form="basic-plain"]').count(), 0);
  const cheatsheetDownload = page.waitForEvent("download");
  await page.click("#exportConjugations");
  const cheatsheet = await readFile(await (await cheatsheetDownload).path(), "utf8");
  assert.match(cheatsheet, /食べませんでした/);
  assert.doesNotMatch(cheatsheet, /<td lang="ja">食べる</);
  await page.click("#copyTable");
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /食べませんでした/);
  await page.check("#setting-compact");
  assert.equal(await page.locator("#tables .kana-reading").count(), 0);
  await page.check("#setting-contrast");
  await page.click("#saveWord");
  await page.reload();
  await page.locator('#savedWords [data-saved="0"]').waitFor({ state: "attached" });
  await page.click('details:has(#savedWords) > summary');
  await page.click('[data-saved="0"]');
  await page.locator('[data-form="basic-past-negative-polite"]').waitFor();
  assert.equal(await page.locator("#tables").getAttribute("class"), "compact");
  const downloadEvent = page.waitForEvent("download");
  await page.click("#exportWords");
  const download = await downloadEvent;
  const exported = JSON.parse(await readFile(await download.path(), "utf8"));
  assert.equal(exported.version, 1);
  assert.equal(exported.words[0].word, "食べる");
  await page.setInputFiles("#importWords", { name: "words.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, words: [{ word: "高い", reading: "たかい", type: "i-adjective" }] })) });
  await page.waitForFunction(() => document.getElementById("status").textContent === "Saved words imported.");
  assert.equal(await page.locator("[data-saved]").count(), 2);
  await page.setInputFiles("#importWords", { name: "bad.json", mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ version: 1, words: [{ word: "<bad>" }] })) });
  await page.waitForFunction(() => document.getElementById("status").textContent.startsWith("Import failed"));
  assert.equal(await page.locator("[data-saved]").count(), 2, "Invalid import must not replace saved words");
  await page.locator("#wordInput").fill("きる");
  await page.locator("#searchForm").evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => document.getElementById("status").textContent.includes("several interpretations"));
  assert.ok(await page.locator("[data-candidate]").count() >= 2);
  await page.locator("#wordInput").fill("静か");
  await page.locator("#searchForm").evaluate((form) => form.requestSubmit());
  await page.locator('[data-form="pastNegative-polite"]').waitFor();
  assert.match(await writtenText('[data-form="pastNegative-polite"]'), /静かではありませんでした/);
  await page.click("#settingsPanel > summary");
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-polarity", "both"]);
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-tense", "both"]);
  await page.evaluate(([sel, value]) => { const el = document.querySelector(sel); el.value = value; el.dispatchEvent(new Event("change", { bubbles: true })); }, ["#setting-politeness", "both"]);
  await page.uncheck("#setting-compact");
  await page.click("#wordInfo > summary");
  await page.locator("#baseExamples .sentence-item").first().waitFor();
  assert.ok(await page.locator("#baseExamples .sentence-item").count());
  assert.ok(await page.locator("#baseExamples .sentence-item > div:nth-child(2)").evaluateAll((nodes) => nodes.every((node) => node.textContent.trim().length > 0)),
    "Na-adjective base examples include English translations");
  const kanji = page.locator(".kanji-card").first();
  await kanji.locator("summary").click();
  assert.match(await kanji.textContent(), /On’yomi:/);
  await page.locator('[data-form="present-plain"] [data-copy]').click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), "静かだ");
  assert.equal(await page.locator("#setting-script, #setting-appearance").count(), 0, "Display script and appearance selects are gone");
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No overflow at ${width}px`);
  }
  const seen = new Set();
  for (let i = 0; i < 8; i++) {
    await page.click("#randomButton");
    await page.waitForFunction(() => !document.getElementById("randomButton").disabled);
    const reading = await page.locator("#wordInfoContent > p").first().textContent();
    assert.equal(seen.has(reading), false, `random must not repeat ${reading}`);
    seen.add(reading);
  }
  await page.locator("#wordInput").fill("ねこねこねこ");
  await page.locator("#searchForm").evaluate((form) => form.requestSubmit());
  await page.locator("#manualPanel").waitFor();
  await page.click("#manualPanel > summary");
  await page.fill("#manualWord", "食べる");
  await page.fill("#manualReading", "たべる");
  await page.selectOption("#manualType", "ichidan");
  await page.locator("#manualForm").evaluate((form) => form.requestSubmit());
  await page.waitForFunction(() => document.getElementById("wordSummary").textContent.includes("User-confirmed"));
  assert.deepEqual(errors, []);
  console.log("Conjugator browser checks passed: romaji, dictionary, filters, copy, persistence, import/export, kanji, ambiguity, random, mobile, manual classification.");
} finally {
  await browser?.close(); await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
