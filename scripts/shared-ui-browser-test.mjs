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
  await go("仮名.html");
  await page.locator("#colorThemeSelect").waitFor();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "sumi");
  assert.equal(await page.locator('#colorThemeSelect option[value="sumi"]').textContent(), "Sumi");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.selectOption("#colorThemeSelect", "ocean");
  await page.click("#themeButton");
  await page.reload();
  await page.locator("#colorThemeSelect").waitFor();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "ocean");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.evaluate(() => localStorage.removeItem("nihon:appearance-v1"));
  await page.reload();
  await page.locator("#colorThemeSelect").waitFor();
  assert.equal(await page.locator("#colorThemeSelect").inputValue(), "sumi");
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  const tools = ["仮名.html", "意味.html", "読み.html", "語彙.html", "言葉.html", "文解き.html", "漢字地図帳.html", "パズル.html", "しりとり.html", "活用.html", "活用練習.html", "言葉探し.html", "絵合わせ.html"];
  for (const width of [375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    let reference;
    for (const file of tools) {
      await go(file);
      await page.locator("#colorThemeSelect").waitFor();
      const support = page.locator(".study-support");
      assert.equal(await support.locator(".study-support-brand").isVisible(), width <= 600);
      assert.equal(await support.locator("form > img").evaluate((image) => getComputedStyle(image).display !== "none"), width > 600);
      assert.equal(await support.locator("form > span").isVisible(), width > 600);
      assert.equal(await support.locator("form").getAttribute("action"), "https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ");
      assert.equal(await support.locator("form").getAttribute("method"), "post");
      assert.equal(await support.locator("form").getAttribute("target"), "_blank");
      const supportButton = support.getByRole("button", { name: "Buy me a coffee with PayPal" });
      assert.equal(await supportButton.getAttribute("type"), "submit");
      if (width <= 600) {
        const bounds = await supportButton.boundingBox();
        assert.ok(bounds.height >= 44 && bounds.width < 240, `${file}: compact badge with a touch-friendly target`);
      }
      const contribution = page.locator(".study-contribute");
      assert.equal(await contribution.count(), 1, `${file}: one shared contribution message`);
      assert.equal(await contribution.isVisible(), true, `${file}: contribution message is visible`);
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
        await help.hover();
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
      if (file === "しりとり.html") {
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

  await go("語彙.html");
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
      return control.hidden ? control.nextElementSibling.querySelector("input, button") : control;
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
  await other.goto(`${origin}/index.html`);
  const frame = other.frameLocator("#helperFrame");
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
  await go("文解き.html");
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
  await go("パズル.html");
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
  await go("語彙.html");
  await page.selectOption("#modeSelect", "cloze-ej", { force: true });
  const beforeCloze = sentenceCalls;
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#prompt").textContent.startsWith("Complete the sentence"));
  assert.ok(sentenceCalls > beforeCloze, "Cloze questions without local examples fetch real sentences");
  assert.match(await page.locator("#prompt .japanese").textContent(), /___/);
  await page.click("#stopSessionButton");
  failSentences = true;
  await page.click("#startButton");
  await page.waitForFunction(() => document.querySelector("#prompt").textContent.startsWith("Meaning clue"));
  assert.match(await page.locator("#warning").textContent(), /temporarily unavailable.*meaning clue/);
  assert.deepEqual(errors, []);
  console.log("Shared UI checks passed: all headers, centered buttons, help, mobile layout, six palettes, cross-tab/frame persistence, crossword fallback and retry.");
} finally {
  await browser?.close();
  await vite?.close();
  await new Promise((resolve) => api.close(resolve));
}
