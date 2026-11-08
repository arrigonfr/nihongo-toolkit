import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const originalFlag = process.env.TRACK_VISITS;
const originalBase = process.env.VITE_API_BASE_URL;
process.env.VITE_API_BASE_URL = "";
let vite, browser;
const errors = [];
const payload = {
  tokens: [
    { text: "食べた", base: "食べる", type: "word", result: { id: 1, jlpt: ["jlpt-n5"] } },
    { text: "食べる", base: "食べる", type: "word", result: { id: 1, jlpt: ["jlpt-n5"] } },
    { text: "未知", base: "未知", type: "word" },
    { text: "。", type: "punctuation" }
  ],
  kanji: [{ character: "食", jlpt: 5 }, { character: "未", jlpt: 3 }],
  translation: "A test sentence."
};

try {
  process.env.TRACK_VISITS = "true";
  vite = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false })));
  const reports = [], requests = [], pendingReports = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.abort();
    if (url.pathname === "/api/page-views") {
      reports.push(route.request().postDataJSON());
      pendingReports.push(route);
      return;
    }
    if (url.pathname.startsWith("/api/")) { requests.push(route); return; }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  const go = async (name) => {
    requests.length = 0;
    await page.goto(`${base}/${name}`);
    await page.locator("#colorThemeSelect").waitFor();
  };
  const nextRequest = async () => {
    const deadline = Date.now() + 5000;
    while (!requests.length && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));
    assert.ok(requests.length, `Expected backend request on ${page.url()}`);
    return requests.shift();
  };
  const assertLoading = async (selector) => {
    const button = page.locator(selector);
    assert.equal(await button.isDisabled(), true, `${selector} locked`);
    assert.equal(await button.evaluate((node) => node.classList.contains("request-loading-button")), true);
    assert.ok(await page.locator(".request-loading-panel[aria-busy=true]").count());
    assert.ok((await page.locator(".request-loading-panel").all()).length);
    assert.equal(await page.locator(".request-loading-panel").first().isVisible(), true, "target loading panel is visible");
    assert.notEqual(await button.evaluate((node) => getComputedStyle(node, "::before").content), "none");
  };
  const assertCooldown = async (selector, route, json = { error: "Please try again." }, status = 503) => {
    await assertLoading(selector);
    await route.fulfill({ status, json });
    await page.waitForTimeout(350);
    assert.equal(await page.locator(selector).isDisabled(), true, `${selector} remains locked after result`);
    await page.waitForFunction((selector) => !document.querySelector(selector).classList.contains("request-loading-button"), selector);
  };

  await go("fumitoki.html?private=excluded#fragment");
  await page.fill("#sourceText", "食べた食べる未知。");
  await page.click("#parseButton");
  await assertCooldown("#parseButton", await nextRequest(), payload, 200);
  assert.equal(await page.locator("#parseButton").isEnabled(), true);
  assert.deepEqual(await page.locator(".analysis-stats h3").allTextContents(), ["2 distinct words", "3 distinct kanji"]);
  assert.equal(await page.locator(".jlpt-donut").count(), 12);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, "statistics fit mobile");
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.match(await page.locator(".analysis-stats").textContent(), /Grammar distribution is deferred/);
  assert.equal(await page.locator('.analysis-stats [aria-label="N5: 1 of 2, 50%"]').count(), 1);
  // An uncompleted analytics POST must not block parsing or rendering.
  assert.deepEqual(reports, [{ page: "/fumitoki.html" }]);
  await pendingReports.shift().fulfill({ status: 202 });
  await page.reload();
  await page.waitForFunction(() => document.getElementById("parseButton"));
  await page.waitForTimeout(100);
  assert.deepEqual(reports, [{ page: "/fumitoki.html" }, { page: "/fumitoki.html" }]);
  await pendingReports.shift().fulfill({ status: 503 });
  await page.fill("#sourceText", "食べる");
  await page.click("#parseButton");
  await assertCooldown("#parseButton", await nextRequest());
  assert.match(await page.locator("#status").textContent(), /could not be analyzed/);
  assert.equal(await page.locator("#parseButton").isEnabled(), true);

  await page.fill("#sourceText", "古い");
  await page.click("#parseButton");
  const oldAnalysis = await nextRequest();
  await page.fill("#sourceText", "食べた食べる未知。");
  await page.locator("#sourceText").press("Enter");
  await assertCooldown("#parseButton", await nextRequest(), payload, 200);
  await oldAnalysis.fulfill({ status: 503, json: { error: "Stale failure" } });
  await page.waitForTimeout(550);
  assert.deepEqual(await page.locator(".analysis-stats h3").allTextContents(), ["2 distinct words", "3 distinct kanji"]);
  assert.match(await page.locator("#status").textContent(), /Parsed/);
  await page.locator(".token").filter({ hasText: "未知" }).click();
  const cancelledLookup = await nextRequest();
  await assertLoading("#lookupForm button");
  assert.equal(await page.locator("#closePanel").isEnabled(), true);
  await page.click("#closePanel");
  await cancelledLookup.abort().catch(() => {});
  await page.waitForTimeout(550);
  assert.equal(await page.locator("#detailPanel").isHidden(), true);
  assert.equal(await page.locator("#lookupForm button").isEnabled(), true);
  assert.match(await page.locator("#status").textContent(), /Parsed/);
  assert.equal(reports.length, 2, "failed page views are not retried");

  // Isolated request failures exercise all backend-driven game/search start paths.
  const cases = [
    ["kotoba.html", "#searchButton", "#query", "食べる"],
    ["kanji-chizucho.html", "#searchButton", "#query", "食"],
    ["katsuyo.html", "#randomButton"],
    ["goi.html", "#startButton"],
    ["imi.html", "#startSessionButton"],
    ["yomi.html", "#startSessionButton"],
    ["eawase.html", "#startButton"],
    ["kotoba-sagashi.html", "#startButton"],
    ["pazuru.html", "#newPuzzleBtn"],
    ["shiritori.html", "#newGame"],
    ["kanji-kuizu.html", "#start"]
  ];
  for (const [name, selector, input, value] of cases) {
    await go(name);
    if (input) await page.fill(input, value);
    await page.click(selector);
    if (name === "pazuru.html") {
      assert.equal(await page.locator(".request-loading-panel").getAttribute("id"), "cwWorkspace");
      assert.equal(await page.locator("#cwWorkspace").evaluate((node) => getComputedStyle(node).position), "relative");
    }
    await assertCooldown(selector, await nextRequest());
    assert.equal(await page.locator(selector).isEnabled(), true, `${name}: failure allows retry`);
    console.log(`PASS loading/error/cooldown: ${name}`);
  }

  await go("yomi.html");
  await page.click("#startSessionButton");
  await assertCooldown("#startSessionButton", await nextRequest(), { items: [
    { id: 1, kanji: "日", jlpt: 5, meanings: ["day"], on_readings: ["ニチ"], kun_readings: ["ひ"], categories: [], examples: [] }
  ] }, 200);
  assert.equal(await page.locator("#glyph").textContent(), "日");
  assert.equal(await page.locator("#answerInput").isEnabled(), true);

  // Shared helper ownership, render-time state and exact 500 ms cooldown.
  await go("fumitoki.html");
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.evaluate(async () => {
    const { beginLoading } = await import("/src/request-loading.js");
    const button = document.getElementById("parseButton"), panel = document.getElementById("parsedText");
    window.finishOld = beginLoading(button, panel);
    window.finishNew = beginLoading(button, panel);
    button.disabled = false;
    window.oldFinished = window.finishOld();
  });
  await page.clock.runFor(500);
  await assertLoading("#parseButton");
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await page.locator("#parseButton").evaluate((node) => getComputedStyle(node, "::before").animationName), "none");
  await page.evaluate(() => { window.newFinished = window.finishNew(); });
  await page.clock.runFor(499);
  await assertLoading("#parseButton");
  await page.clock.runFor(1);
  assert.equal(await page.locator("#parseButton").isEnabled(), true);
  await page.evaluate(async () => {
    const { beginLoading } = await import("/src/request-loading.js");
    const button = document.getElementById("parseButton");
    const done = beginLoading(button, document.getElementById("parsedText"));
    button.disabled = true;
    void done();
  });
  await page.clock.runFor(500);
  assert.equal(await page.locator("#parseButton").isDisabled(), true, "game rules remain disabled");
  assert.equal(await page.locator(".request-loading-status").count(), 0);
  await page.clock.resume();
  assert.deepEqual(errors, []);
  for (const route of pendingReports) await route.fulfill({ status: 202 }).catch(() => {});
  await context.close();
  await vite.close();
  vite = null;

  for (const flag of ["", "false", "TRUE", "1"]) {
    process.env.TRACK_VISITS = flag;
    vite = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false } });
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const off = await browser.newContext();
    let count = 0;
    await off.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/page-views") { count++; return route.fulfill({ status: 202 }); }
      return url.origin === origin ? route.continue() : route.abort();
    });
    const tab = await off.newPage();
    await tab.goto(origin);
    await tab.waitForTimeout(200);
    assert.equal(count, 0, `TRACK_VISITS=${JSON.stringify(flag)} does not report`);
    await off.close();
    await vite.close();
    vite = null;
  }
  console.log("PASS Fumitoki totals; non-blocking/reload page views; strict flags; helper ownership and 500ms timing");
} finally {
  await browser?.close();
  await vite?.close();
  if (originalFlag === undefined) delete process.env.TRACK_VISITS;
  else process.env.TRACK_VISITS = originalFlag;
  if (originalBase === undefined) delete process.env.VITE_API_BASE_URL;
  else process.env.VITE_API_BASE_URL = originalBase;
}
