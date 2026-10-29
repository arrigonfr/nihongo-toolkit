import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";
import { toolPage } from "./tool-page.mjs";

let vite, browser;
try {
  vite = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), server: { host: "127.0.0.1", port: 0, strictPort: false } });
  await vite.listen();
  browser = await chromium.launch();
  const context = await browser.newContext();
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const raw = await context.newPage(), page = toolPage(raw), errors = [];
  raw.on("pageerror", (error) => errors.push(error.message));
  const go = async (file) => {
    await page.goto(`http://127.0.0.1:${vite.httpServer.address().port}/${encodeURIComponent(file)}.html`);
    await page.evaluate(() => document.querySelectorAll("details").forEach((node) => { node.open = true; }));
  };
  const change = async (id, value) => {
    const input = page.locator(`#${id}`);
    assert.equal(await input.isEnabled(), true, `${id} must be usable`);
    await input.evaluate((node, next) => {
      if (node.type === "checkbox") node.checked = next;
      else node.value = String(next);
      node.dispatchEvent(new Event("change", { bubbles: true }));
    }, value);
  };
  const disabled = async (...ids) => {
    for (const id of ids) {
      assert.equal(await page.locator(`#${id}`).isDisabled(), true, `${id} must be disabled`);
      assert.ok(await page.locator(`#${id}`).getAttribute("aria-describedby"), `${id} explains why`);
    }
  };
  const enabled = async (...ids) => {
    for (const id of ids) assert.equal(await page.locator(`#${id}`).isEnabled(), true, `${id} must be enabled`);
  };
  const checkNotes = async () => {
    const misplaced = await page.evaluate(() => [...document.querySelectorAll(".setting-availability")].filter((note) => {
      const bounds = note.getBoundingClientRect();
      if (!bounds.width) return false;
      const container = note.closest("label, .setting") || note.parentElement;
      const label = container.getBoundingClientRect();
      const control = (container.querySelector(".study-levels") || container.querySelector("input, select")).getBoundingClientRect();
      return bounds.left < label.left - 1 || bounds.right > label.right + 1 || bounds.top < control.bottom - 1;
    }).map((note) => note.id));
    assert.deepEqual(misplaced, [], "Availability notes stay below their controls within the label");
  };
  for (const file of ["絵合わせ", "言葉探し"]) {
    await go(file);
    await change("setting-hints", "unlimited");
    await disabled("setting-hintLimit", "setting-seconds", "setting-mistakes", "setting-rounds");
    await checkNotes();
    await change("setting-hints", "limited");
    await change("setting-hintLimit", 7);
    await change("setting-mode", "timed");
    await enabled("setting-seconds");
    await disabled("setting-timer");
    await change("setting-seconds", 83);
    await change("setting-mode", "daily");
    await disabled("setting-hints", "setting-hintLimit", "setting-seconds", "setting-reveals");
    await checkNotes();
    await page.reload();
    await disabled("setting-hintLimit", "setting-seconds");
    await change("setting-mode", "classic");
    await enabled("setting-hintLimit");
    assert.equal(await page.inputValue("#setting-hintLimit"), "7");
    assert.equal(await page.inputValue("#setting-seconds"), "83");
    await change("setting-mode", "sudden");
    await enabled("setting-mistakes");
    await change("setting-mode", "marathon");
    await enabled("setting-rounds");
    if (file === "絵合わせ") {
      await change("setting-mode", "listening");
      await disabled("setting-display", "setting-pairing");
      await change("setting-content", "kana");
      assert.equal(await page.textContent("#settingsError"), "");
      assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("nihon:memory-v1")).settings.content), "kana");
      await change("setting-mode", "classic");
      await enabled("setting-display", "setting-pairing");
      await change("setting-mode", "moves");
      await disabled("setting-moveLimit");
      await enabled("setting-flips");
      await change("setting-grid", "custom");
      await enabled("setting-count");
      await change("setting-content", "kana");
      await disabled("setting-examples");
      await enabled("setting-groups");
      await change("setting-groups", "all");
      await change("setting-groups", "hiragana");
    } else {
      await change("setting-mode", "clue");
      await disabled("setting-list", "setting-meanings");
      await change("setting-mode", "quick");
      await disabled("sizePreset", "setting-size");
      await change("setting-mode", "classic");
      await change("sizePreset", "custom");
      await enabled("setting-size");
      await change("setting-size", 11);
      await change("sizePreset", "8");
      assert.equal(await page.inputValue("#setting-size"), "8");
    }
    assert.ok(await page.locator("#settingsForm fieldset").count() >= 6);
  }
  await go("活用練習");
  await disabled("setting-seconds", "setting-mistakes", "setting-reverseTask", "setting-hintLimit", "setting-revealLimit");
  await change("setting-mode", "reverse");
  await enabled("setting-reverseTask", "setting-input");
  await disabled("setting-prompt", "setting-meaning", "setting-type", "setting-repeat");
  await change("setting-reverseTask", "form");
  await disabled("setting-input");
  await change("setting-mode", "timed");
  await enabled("setting-seconds", "setting-input", "setting-prompt");
  await disabled("setting-questions", "setting-timer");
  await change("setting-hints", "limited");
  await enabled("setting-hintLimit");
  await change("setting-reveals", "limited");
  await enabled("setting-revealLimit");
  await go("活用");
  await page.locator("#list-groups ~ .chips .chip-action:text-is(\"Clear\")").evaluate((node) => node.click());
  await disabled("setting-politeness", "setting-polarity", "setting-tense");
  await page.locator("#list-groups ~ .chips .chip-action:text-is(\"All\")").evaluate((node) => node.click());
  await enabled("setting-politeness", "setting-polarity", "setting-tense");
  assert.equal(await page.locator("#settings .settings-section").count(), 6);
  await go("パズル");
  await disabled("hintLimitInput", "timedMinutesInput", "customWordsInput");
  await change("checkAvailSelect", "limited");
  await enabled("hintLimitInput");
  await page.click('[data-mode="relaxed"]');
  await disabled("checkAvailSelect", "revealAvailSelect", "hintLimitInput");
  await page.click('[data-mode="timed"]');
  await enabled("checkAvailSelect", "hintLimitInput", "timedMinutesInput");
  await page.click('[data-mode="kanjiChallenge"]');
  await disabled("answerModeSelect");
  await page.click('[data-mode="reverse"]');
  await disabled("kanjiFocusToggle");
  assert.equal(await page.locator(".cw-settings .settings-section").count(), 3);
  await raw.setViewportSize({ width: 390, height: 844 });
  for (const file of ["絵合わせ", "言葉探し", "活用練習", "活用", "パズル"]) {
    await go(file);
    await checkNotes();
    const overflow = await page.evaluate(() => [...document.querySelectorAll("fieldset")].filter((node) => {
      const bounds = node.getBoundingClientRect();
      return bounds.width && (bounds.right > innerWidth + 1 || bounds.left < 0);
    }).map((node) => node.querySelector("legend")?.textContent));
    assert.deepEqual(overflow, [], `${file} settings fit on mobile`);
  }
  assert.deepEqual(errors, []);
  console.log("Grouped settings and dependency checks passed for all five tools.");
} finally {
  await browser?.close();
  await vite?.close();
}
