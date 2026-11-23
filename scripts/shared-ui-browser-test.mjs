import assert from "node:assert/strict";
import { toolPage } from "./tool-page.mjs";
import { createServer } from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";
import { createHandler } from "../backend/src/app.js";

const origin = "http://127.0.0.1:5183";
const api = createServer(createHandler({ origins: [origin], sentenceFallback: async () => [] }));
api.listen(0, "127.0.0.1");
await once(api, "listening");
process.env.VITE_API_BASE_URL = `http://127.0.0.1:${api.address().port}`;
let vite, browser;
try {
  vite = await createVite({ root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 5183, strictPort: true } });
  await vite.listen();
  browser = await chromium.launch();
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = toolPage(await context.newPage());
  const errors = [];
  context.on("page", (tab) => tab.on("pageerror", (error) => errors.push(error.message)));
  page.on("pageerror", (error) => errors.push(error.message));
  const go = (file) => page.goto(`${origin}/${encodeURIComponent(file)}`);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await go("faq");
    assert.equal(await page.locator("h1").textContent(), "How can we help?");
    assert.equal(await page.locator(".study-toolbar .study-support").count(), 1);
    assert.equal(await page.locator('a.helper-link[data-file="faq.html"]').getAttribute("aria-current"), "page");
    assert.ok(await page.locator(".faq").textContent().then((text) => text.includes("xtsu") && text.includes("xya")));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `FAQ fits at ${width}px`);
    const answer = page.locator("details").filter({ hasText: "Why are some settings unavailable?" });
    await answer.locator("summary").focus();
    await page.keyboard.press("Enter");
    assert.equal(await answer.locator(".faq-answer").isVisible(), true);
    await page.click(".study-palette > summary");
    await page.click('[data-palette="ocean"]');
    await page.click("#themeButton");
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.reload();
    assert.equal(await page.locator("html").getAttribute("data-theme"), theme);
    assert.equal(await page.locator("html").getAttribute("data-color-theme"), "ocean");
  }
  await page.evaluate(() => localStorage.removeItem("nihon:appearance-v1"));
  await go("");
  assert.equal(await page.locator('.dashboard-link[data-file="faq.html"]').count(), 1);
  assert.equal(await page.locator('.dashboard-link[data-file="faq.html"] .helper-description').textContent(), "Help and common questions");
  await page.locator('.dashboard-link[data-file="faq.html"]').click();
  await page.waitForURL(/\/faq$/);
  await page.goBack();
  assert.equal(await page.locator('.dashboard-link[data-file="faq.html"]').isVisible(), true);
  await page.setViewportSize({ width: 375, height: 900 });
  await go("kotoba.html");
  await page.evaluate(() => localStorage.setItem("kotoba-history-v1", JSON.stringify([{ query: "日本", kanji: false }])));
  await page.reload();
  await page.locator("#historyList .history-item").waitFor();
  const clearHistory = page.locator("#clearHistory");
  const clearBounds = await clearHistory.boundingBox();
  assert.ok(clearBounds.width >= 44 && clearBounds.height >= 44, "Clear history has a touch-friendly target");
  await clearHistory.click();
  assert.equal(await page.locator("#historyList .history-item").count(), 0, "Clear history still clears recent searches");
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [file, selector] of [
      ["", ".dashboard-link .helper-description"],
      ["goi.html", ".intro p:not(.eyebrow)"],
      ["kana.html", ".study-settings-note"]
    ]) {
      await go(file);
      const size = await page.locator(selector).first().evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
      assert.ok(size >= 13, `${file || "dashboard"}: supporting text remains readable at ${width}px`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${file || "dashboard"}: no horizontal overflow at ${width}px`);
    }
  }
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await go("fumitoki.html");
    const layout = page.locator(".layout");
    const parsedCard = layout.locator("section").first();
    const panel = page.locator("#detailPanel");
    const layoutWidth = (await layout.boundingBox()).width;
    assert.ok(Math.abs((await parsedCard.boundingBox()).width - layoutWidth) < 1, "Hidden dictionary panel leaves the full width for parsed text");
    await panel.evaluate((element) => { element.hidden = false; });
    const parsedBounds = await parsedCard.boundingBox();
    const panelBounds = await panel.boundingBox();
    if (width > 760) {
      assert.ok(panelBounds.x >= parsedBounds.x + parsedBounds.width, "Open dictionary panel sits beside parsed text on desktop");
    } else {
      assert.ok(panelBounds.y < parsedBounds.y && Math.abs(parsedBounds.width - layoutWidth) < 1, "Open dictionary panel stacks above parsed text on mobile");
    }
    await panel.evaluate((element) => { element.hidden = true; });
    assert.ok(Math.abs((await parsedCard.boundingBox()).width - layoutWidth) < 1, "Closing the dictionary restores the full width");
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await go("kana.html");
  await page.locator(".study-palette > summary").waitFor();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "sumi");
  assert.equal(await page.locator('#colorThemeSelect option[value="sumi"]').textContent(), "Sumi");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.click(".study-palette > summary");
  await page.click('[data-palette="ocean"]');
  await page.click("#themeButton");
  await page.reload();
  await page.locator(".study-palette > summary").waitFor();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "ocean");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  const pageBackground = () => page.locator("body").evaluate(async (body) => {
    await Promise.all(body.getAnimations().map((animation) => animation.finished));
    return getComputedStyle(body).backgroundColor;
  });
  const oceanBackground = await pageBackground();
  await go("");
  await page.locator(".study-palette > summary").waitFor();
  assert.equal(await pageBackground(), oceanBackground, "The homepage uses the saved light palette");
  await page.click(".study-palette > summary");
  await page.click('[data-palette="sakura"]');
  const sakuraLightBackground = await pageBackground();
  assert.notEqual(sakuraLightBackground, oceanBackground, "Changing palettes updates the homepage immediately");
  await page.click("#themeButton");
  const sakuraDarkBackground = await pageBackground();
  assert.notEqual(sakuraDarkBackground, sakuraLightBackground, "Dark mode updates the homepage background");
  await go("kana.html");
  await page.locator(".study-palette > summary").waitFor();
  assert.equal(await pageBackground(), sakuraDarkBackground, "The tool page uses the same dark palette as the homepage");
  await page.evaluate(() => localStorage.removeItem("nihon:appearance-v1"));
  await page.reload();
  await page.locator(".study-palette > summary").waitFor();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "sumi");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  const tools = ["kana.html", "imi.html", "yomi.html", "goi.html", "kotoba.html", "fumitoki.html", "kanji-chizucho.html", "pazuru.html", "shiritori.html", "katsuyo.html", "katsuyo-renshuu.html", "kotoba-sagashi.html", "eawase.html"];
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    let reference;
    for (const file of tools) {
      await go(file);
      await page.locator(".study-palette > summary").waitFor();
      const support = page.locator(".study-support");
      assert.equal(await support.locator("form > img, form > span, .study-support-brand").count(), 0);
      assert.equal(await page.locator(".study-toolbar .study-support").count(), 1);
      assert.equal(await support.locator("form").getAttribute("action"), "https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ");
      assert.equal(await support.locator("form").getAttribute("method"), "post");
      assert.equal(await support.locator("form").getAttribute("target"), "_blank");
      const supportButton = support.locator("button");
      assert.equal(await supportButton.locator('img[alt="PayPal"]').count(), 1);
      assert.equal(await supportButton.getAttribute("type"), "submit");
      if (width <= 600) {
        const bounds = await supportButton.boundingBox();
        assert.ok(bounds.height >= 44 && bounds.width < 240, `${file}: compact badge with a touch-friendly target`);
      }
      const contribution = page.locator(".study-contribute");
      assert.equal(await contribution.count(), 1, `${file}: one shared contribution message`);
      assert.equal(await contribution.isVisible(), true, `${file}: contribution message is visible`);
      assert.notEqual(await contribution.locator("a").first().evaluate((link) => getComputedStyle(link).color), await contribution.locator("a").last().evaluate((link) => getComputedStyle(link).color));
      assert.deepEqual(await contribution.locator("a").evaluateAll((links) => links.map((link) =>
        [link.href, link.target, link.rel])), [
        ["https://github.com/arrigonfr/nihongo-toolkit/issues", "_blank", "noopener noreferrer"],
        ["https://github.com/arrigonfr/nihongo-toolkit", "_blank", "noopener noreferrer"]
      ], `${file}: feedback links open GitHub outside the launcher`);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const style = await page.locator("header.study-header").evaluate((header) => {
        const mark = header.querySelector(".brand-mark, .cw-brand-mark");
        const name = header.querySelector(".brand-name, .cw-brand-name");
        const css = getComputedStyle(header);
        return [css.padding, css.minHeight, css.height, css.borderBottomWidth,
          getComputedStyle(mark).width, getComputedStyle(mark).height, getComputedStyle(name).font];
      });
      reference ||= style;
      assert.deepEqual(style, reference, `${file}: uniform header and brand sizing`);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${file}: no horizontal overflow`);
      await page.click("#helpButton");
      assert.equal(await page.locator("#helpDialog").evaluate((dialog) => dialog.open), true);
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#helpDialog").evaluate((dialog) => dialog.open), false);
      assert.equal(await page.locator(".study-setting-help, .tip, .study-option").count(), 0, `${file}: no extra help icons or wrappers`);
      assert.equal(await page.locator("header [data-study-help], #colorThemeSelect[aria-describedby], .study-toolbar [aria-describedby]").count(), 0);
      assert.deepEqual(await page.locator('label:has(> input[type="checkbox"]) > .study-setting-name:not(button)').evaluateAll((titles) =>
        titles.filter((title) => title.getBoundingClientRect().width && getComputedStyle(title).textAlign !== "left")
          .map((title) => title.textContent)), [], `${file}: checkbox help titles stay left-aligned`);
      const help = page.locator(".study-setting-name:visible").first();
      if (await help.count()) {
        assert.notEqual((await help.textContent()).trim(), "?");
        await help.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        await help.hover();
        await page.locator("#studySettingTooltip").waitFor({ state: "visible" });
        assert.equal(await page.locator("#studySettingTooltip").isVisible(), true);
        assert.ok((await page.locator("#studySettingTooltip").textContent()).length > 10, `${file}: ${await help.textContent()} => ${await page.locator("#studySettingTooltip").textContent()}`);
        const bubble = await page.locator("#studySettingTooltip").evaluate((node) => {
          const rect = node.getBoundingClientRect(), css = getComputedStyle(node);
          return { fits: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
            background: css.backgroundColor, pointerEvents: css.pointerEvents };
        });
        assert.deepEqual(bubble, { fits: true, background: "rgb(48, 48, 48)", pointerEvents: "none" });
        await help.focus();
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#studySettingTooltip").isVisible(), false);
      }
      if (file === "shiritori.html") {
        assert.equal(await page.locator("#settingsPanel").evaluate((panel) => panel.open), true, "Escape dismisses the tooltip without collapsing settings");
        await page.click("#settingsPanel > summary");
      }
      assert.deepEqual(await page.locator("button").evaluateAll((buttons) => buttons
        .filter((button) => button.getBoundingClientRect().width > 0)
        .filter((button) => {
          const style = getComputedStyle(button);
          return style.textAlign !== "center" || style.alignItems !== "center" || style.justifyContent !== "center";
        }).map((button) => button.id || button.className)), [], `${file}: centered buttons`);
    }
  }

  await go("goi.html");
  const checkboxLabel = page.locator('label:has(#showStatsToggle) .study-setting-name');
  const wasChecked = await page.locator("#showStatsToggle").isChecked();
  await checkboxLabel.click();
  assert.equal(await page.locator("#showStatsToggle").isChecked(), wasChecked, "A title opens help without changing its input");
  assert.equal(await page.locator("#studySettingTooltip").isVisible(), true);
  await page.locator("#levelSelect + .study-levels input").first().focus();
  assert.equal(await page.locator("#studySettingTooltip").isVisible(), false, "Input focus dismisses help instead of reopening it");
  assert.equal(await page.locator('label[for="levelSelect"] .study-setting-name').count(), 0, "JLPT level has no tooltip");
  if (process.env.TOOLTIP_SCREENSHOT) await page.screenshot({ path: process.env.TOOLTIP_SCREENSHOT });
  await page.keyboard.press("Escape");
  await checkboxLabel.click();
  await page.locator("#showStatsToggle").click();
  assert.equal(await page.locator("#showStatsToggle").isChecked(), !wasChecked);
  assert.equal(await page.locator("#studySettingTooltip").isVisible(), false, "Clicking the input closes help and changes the value");
  await checkboxLabel.hover();
  await page.locator("#helpButton").hover();
  assert.equal(await page.locator("#studySettingTooltip").isVisible(), false, "Leaving the title dismisses hovered help");

  const touchContext = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await touchContext.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const touch = toolPage(await touchContext.newPage());
  touch.on("pageerror", (error) => errors.push(error.message));
  for (const file of tools) {
    await touch.goto(`${origin}/${encodeURIComponent(file)}`);
    const title = touch.locator(".study-setting-name:not(button):visible").first();
    if (!await title.count()) continue;
    const inputValue = () => title.evaluate((node) => {
      const input = node.closest("label").control;
      return [input.value, input.checked];
    });
    const before = await inputValue();
    await title.tap();
    assert.equal(await touch.locator("#studySettingTooltip").isVisible(), true, `${file}: title tap opens help`);
    assert.deepEqual(await inputValue(), before, `${file}: help tap does not change the setting`);
    await title.evaluate((node) => {
      const control = node.closest("label").control;
      (control.hidden ? control.nextElementSibling.querySelector("input, button") : control).focus();
    });
    assert.equal(await touch.locator("#studySettingTooltip").isVisible(), false, `${file}: input focus dismisses help`);
    await title.tap();
    const input = await title.evaluateHandle((node) => {
      const control = node.closest("label").control;
      return control.hidden ? control.nextElementSibling.querySelector(".chip-option") : control;
    });
    await input.asElement().tap();
    assert.equal(await touch.locator("#studySettingTooltip").isVisible(), false, `${file}: input tap dismisses help`);
    await touch.keyboard.press("Escape");
    await input.dispose();
    await title.tap();
    await touch.locator("#audioQuickToggle").tap();
    assert.equal(await touch.locator("#studySettingTooltip").isVisible(), false, `${file}: tapping elsewhere dismisses help`);
  }
  await touchContext.close();

  const other = await context.newPage();
  await other.goto(`${origin}/kana.html`);
  const frame = other;
  await frame.locator("#colorThemeSelect").waitFor();
  const palettes = new Set();
  for (const palette of ["matcha", "sakura", "ocean", "wisteria", "amber", "sumi"]) {
    await page.selectOption("#colorThemeSelect", palette);
    await other.waitForFunction((value) => document.documentElement.dataset.colorTheme === value, palette);
    await frame.locator(`#colorThemeSelect option[value="${palette}"]:checked`).waitFor({ state: "attached" });
    for (let i = 0; i < 2; i++) {
      await page.click("#themeButton");
      const mode = await page.locator("html").getAttribute("data-theme");
      await other.waitForFunction((value) => document.documentElement.dataset.theme === value, mode);
      await frame.locator(`html[data-theme="${mode}"]`).waitFor({ state: "attached" });
      palettes.add(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--accent")));
      const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
      assert.notEqual(background, "rgba(0, 0, 0, 0)");
    }
  }
  assert.equal(palettes.size, 12, "Six distinct palettes each have light and dark accents");
  await go("fumitoki.html");
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "sumi");
  await page.reload();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "sumi");

  let sentenceCalls = 0;
  let failSentences = false;
  await page.route("**/api/sentences?**", (route) => {
    sentenceCalls++;
    if (failSentences) return route.fulfill({ status: 502, json: { error: "Offline" } });
    const params = new URL(route.request().url()).searchParams;
    const query = params.get("q");
    const random = params.get("random") === "1";
    if (random) assert.ok(JSON.parse(params.get("exclude")).length);
    return route.fulfill({ json: { data: [{
      id: random ? 321 : 123, text: `${query}${random ? "も" : ""}です。`, furigana: "",
      license: "CC BY 2.0 FR", owner: "test-author",
      translations: [{ id: 456, lang: "eng", text: "An example for browser tests.", owner: "test-translator" }]
    }] } });
  });
  await page.route("**/api/words/batch?**", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const item of data.items) { item.examples = []; item.example = ""; item.exampleMeaning = ""; }
    await route.fulfill({ response, json: data });
  });
  await go("pazuru.html");
  await page.click("#newPuzzleBtn");
  await page.locator("#crosswordGrid .cw-cell:not(.block)").first().waitFor();
  await page.locator("#crosswordGrid .cw-cell.is-active").click();
  await page.locator('[data-popover-action="revealWord"]').click();
  await page.locator("#cwSentenceExamples .sentence-item").waitFor();
  assert.ok(sentenceCalls > 0, "Crossword without local examples uses the sentence endpoint");
  assert.equal(await page.locator("#cwSentenceExamples .sentence-credit").count(), 2);
  const before = await page.locator("#cwSentenceExamples [data-sentence-text]").getAttribute("data-sentence-text");
  await page.click("#cwSentenceExamples .sentence-next");
  await page.waitForFunction((text) => document.querySelector("#cwSentenceExamples [data-sentence-text]")?.dataset.sentenceText !== text, before);
  const retained = await page.locator("#cwSentenceExamples .sentence-results").textContent();
  failSentences = true;
  await page.click("#cwSentenceExamples .sentence-next");
  await page.waitForFunction(() => document.querySelector("#cwSentenceExamples .sentence-next").textContent === "Retry examples");
  assert.equal(await page.locator("#cwSentenceExamples .sentence-results").textContent(), retained, "Refresh errors preserve the existing example");
  failSentences = false;
  await page.click("#cwSentenceExamples .sentence-next");
  await page.waitForFunction(() => document.querySelector("#cwSentenceExamples .sentence-next").textContent === "Another example");
  await go("goi.html");
  await page.selectOption("#modeSelect", "typing-ej", { force: true });
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#prompt").textContent.startsWith("Type the Japanese vocabulary word"));
  assert.equal(await page.locator("#modeSelect option").count(), 4);
  assert.deepEqual(errors, []);
  console.log("Shared UI checks passed: all headers, centered buttons, help, mobile layout, six palettes, cross-tab/frame persistence, crossword fallback and retry.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
