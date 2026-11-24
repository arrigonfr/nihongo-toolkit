import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { editorialIdentity, editorialTools } from "../frontend/editorial-tools.js";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const server = { host: "127.0.0.1", port: 0, strictPort: false, watch: null };
let vite, browser;
try {
  process.env.DISABLED_PAGES = "";
  process.env.EDITORIAL_PREVIEWS = "";
  vite = await createServer({ root, server, logLevel: "error" });
  await vite.listen();
  const closed = `http://127.0.0.1:${vite.httpServer.address().port}`;
  for (const slug of Object.keys(editorialTools)) {
    const html = await (await fetch(`${closed}/${slug}`)).text();
    assert.match(html, /This page is currently unavailable/);
    assert.doesNotMatch(html, /src\/editorial-session/);
  }
  await vite.close();
  process.env.EDITORIAL_PREVIEWS = "1";
  vite = await createServer({ root, server, logLevel: "error" });
  await vite.listen();
  const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 360, height: 840 }, hasTouch: true, reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.setDefaultTimeout(8000);
  await page.goto(origin);
  for (const [slug, [name, group]] of Object.entries(editorialTools)) {
    assert.equal(await page.locator(`.home-tool-group article[data-file="${slug}.html"] h4`).innerText(), name);
    assert.equal(await page.locator(`.menu-group[aria-label="${group}"] [data-file="${slug}.html"]`).count(), 1);
  }
  await page.locator(".home-tool-index-links").getByRole("link", { name: "Joshi Renshū", exact: true }).click();
  await page.waitForURL("**/joshi-renshuu");
  const reference = await context.newPage();
  await reference.goto(`${origin}/eawase`);
  await reference.locator(".study-intro-content h1 > span").waitFor();
  const introMetrics = p => p.locator(".study-intro").evaluate(intro => {
    const props = (el, keys) => keys.map(k => getComputedStyle(el)[k]);
    const type = ["fontFamily", "fontSize", "fontWeight", "lineHeight", "letterSpacing"];
    return [
      props(intro, ["paddingTop", "paddingBottom"]),
      props(intro.querySelector(".eyebrow"), type),
      props(intro.querySelector("h1"), [...type, "marginTop", "marginBottom"]),
      props(intro.querySelector("h1 > br + span"), type),
      props(intro.querySelector("p"), [...type, "maxWidth"])
    ];
  });
  const legacyPage = await context.newPage();
  for (const route of ["kana", "yomi", "imi", "goi", "katsuyo-renshuu", "kotoba", "kanji-chizucho", "katsuyo", "fumitoki", "shiryo", "kanji-kuizu", "kotoba-sagashi", "pazuru", "shiritori", "faq", "contact", "kanji/", "kanji-of-the-day"]) {
    for (const width of [360, 1200]) {
      await legacyPage.setViewportSize({ width, height: 840 });
      await legacyPage.goto(`${origin}/${route}`);
      await legacyPage.locator(".study-intro-content > h1 > br + span").waitFor();
      if (!["faq", "contact"].includes(route) && width === 360) {
        await legacyPage.locator("#helpButton").click();
        const help = legacyPage.locator("#helpDialog[open]");
        assert.ok(await help.locator("p").first().isVisible(), route);
        assert.equal(await help.locator(".help-steps").isVisible(), false, route);
        await help.getByText("How to use this tool", { exact: true }).click();
        assert.ok(await help.locator(".help-steps li:nth-child(3)").isVisible(), route);
        await legacyPage.keyboard.press("Escape");
      }
      await reference.setViewportSize({ width, height: 840 });
      await legacyPage.waitForFunction(w => innerWidth === w, width);
      assert.deepEqual(await introMetrics(legacyPage), await introMetrics(reference), `${route}: Eawase intro at ${width}px`);
    }
  }
  await legacyPage.close();
  await page.goBack();
  await page.goForward();
  await page.waitForURL("**/joshi-renshuu");
  for (const [slug, [name, , , , , key]] of Object.entries(editorialTools)) {
    const [, old] = editorialIdentity[slug];
    await page.goto(`${origin}/${old}.html?from=bookmark`);
    assert.equal(page.url(), `${origin}/${slug}?from=bookmark`);
    await page.locator('#workspace[aria-busy="false"]').waitFor();
    assert.doesNotMatch(await page.locator("#workspace").innerText(), /could not load/i, slug);
    const intro = page.locator(".study-intro-content");
    assert.ok(!(await intro.locator("h1").innerText()).includes(name));
    assert.equal(await intro.locator("p").count(), 1);
    assert.ok(await page.locator("main > .editorial-notice").isVisible());
    const header = page.locator(".shell > header.study-header");
    assert.equal(await header.locator(".brand-name").textContent(), `${name}NihongoToolkit`);
    assert.equal(await header.locator(".brand-mark img").getAttribute("src"), await header.locator(`[data-file="${slug}.html"] .helper-icon img`).getAttribute("src"));
    assert.equal(await header.locator(".brand-mark img").getAttribute("src"), `/tool-icons/${slug}.webp`);
    assert.ok(await header.locator(".brand-mark img").evaluate(async img => { await img.decode(); return img.naturalWidth === 128 && img.naturalHeight === 128; }));
    const dialog = page.locator("#helpDialog");
    await page.locator("#helpButton").focus();
    await page.keyboard.press("Enter");
    assert.ok(await dialog.isVisible());
    assert.ok(await dialog.locator("p").first().isVisible(), slug);
    assert.equal(await dialog.locator(".help-steps").isVisible(), false, slug);
    await dialog.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.ok(await dialog.locator(".help-steps li:nth-child(3)").isVisible(), slug);
    await page.keyboard.press("Escape");
    assert.equal(await dialog.isVisible(), false);
    if (key === "guide") {
      assert.ok(await page.locator("#workspace input").count() > 0);
    } else {
      await page.locator("#editorialLength").selectOption("extended");
      await page.reload();
      assert.equal(await page.locator("#editorialLength").inputValue(), "extended");
      await page.getByRole("button", { name: "Start session" }).tap();
      assert.ok(await page.locator("#roundBody").isVisible());
      await page.getByRole("button", { name: "Stop session" }).tap();
      assert.match(await page.locator("#resultSummary").innerText(), /^0 of \d+ answered/);
      assert.equal(await page.locator("#retryMissed").isVisible(), false);
      await page.getByRole("button", { name: "Practice again" }).tap();
      assert.ok(await page.locator("#settingsPanel").isVisible());
    }
    for (const width of [360, 1200]) {
      await page.setViewportSize({ width, height: 840 });
      await reference.setViewportSize({ width, height: 840 });
      assert.deepEqual(await introMetrics(page), await introMetrics(reference), `${slug}: Eawase intro at ${width}px`);
      const expected = Math.min(width - (width <= 600 ? 24 : 40), 1280);
      assert.equal(Math.round((await header.boundingBox()).width), expected, `${slug}: shared header width`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Overflow: ${slug}, ${width}px`);
    }
    await page.locator("#themeButton").click();
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.reload();
    await page.locator("#helpButton").waitFor();
    assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
    await page.setViewportSize({ width: 360, height: 840 });
  }
  await page.goto(`${origin}/shiryo?kanji=語#worksheet`);
  await page.getByRole("link", { name: "Draw 語 on screen" }).waitFor();
  assert.equal(await page.locator("#sheetPreview svg[aria-label='Handwriting worksheet'] > g").count(), 1);
  assert.deepEqual(errors, []);
  console.log("Seven local-only routes, menu, history, session controls, help, responsive layouts and theme persistence passed.");
} finally {
  await browser?.close();
  await vite?.close();
}
