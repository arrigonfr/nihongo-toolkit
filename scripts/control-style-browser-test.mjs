import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null } });
let browser;
try {
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 900 }, reducedMotion: "reduce" });
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  let switches = 0, chips = 0;
  for (const file of ["kana.html", "imi.html", "yomi.html", "goi.html", "kotoba.html", "fumitoki.html", "kanji-chizucho.html", "katsuyo.html", "katsuyo-renshuu.html", "pazuru.html", "shiritori.html", "kotoba-sagashi.html", "eawase.html", "shiryo.html"]) {
    await page.goto(`${base}/${encodeURIComponent(file)}${file === "shiryo.html" ? "#worksheet" : ""}`);
    if (["kana.html", "imi.html", "yomi.html", "katsuyo.html", "katsuyo-renshuu.html"].includes(file)) {
      const eyebrow = page.locator(".study-intro-content > .eyebrow, .study-intro-content > .cw-eyebrow");
      await eyebrow.waitFor();
      assert.equal(await eyebrow.evaluate((node) => {
        const probe = document.createElement("span");
        probe.style.color = "var(--text-warm)";
        node.append(probe);
        const matches = getComputedStyle(node).color === getComputedStyle(probe).color;
        probe.remove();
        return matches;
      }), true, `${file}: shared eyebrow color`);
    }
    await page.evaluate(() => document.querySelectorAll("details").forEach((details) => { details.open = true; }));
    const result = await page.evaluate(() => {
      const inputs = [...document.querySelectorAll('input[type="checkbox"]')];
      const chipInputs = inputs.filter((input) => input.closest(".chips"));
      const visibleSwitches = inputs.filter((input) => !input.closest(".chips") && !input.hidden && input.getClientRects().length);
      return {
        chipCount: chipInputs.length,
        badChips: chipInputs.filter((input) => getComputedStyle(input).clipPath !== "inset(50%)").map((input) => input.outerHTML),
        switchCount: visibleSwitches.length,
        badSwitches: visibleSwitches.filter((input) => getComputedStyle(input).appearance !== "none" || input.getBoundingClientRect().width !== 38 || input.getBoundingClientRect().height !== 22).map((input) => ({ id: input.id, width: input.getBoundingClientRect().width, height: input.getBoundingClientRect().height })),
        visibleHidden: inputs.filter((input) => input.hidden && getComputedStyle(input).display !== "none").map((input) => input.id)
      };
    });
    assert.deepEqual(result.badChips, [], `${file}: chip checkboxes are hidden`);
    assert.deepEqual(result.badSwitches, [], `${file}: checkboxes are switches`);
    assert.deepEqual(result.visibleHidden, [], `${file}: source controls stay hidden`);
    switches += result.switchCount; chips += result.chipCount;
  }
  await page.locator("#sheetGrayscale").focus();
  const checked = await page.locator("#sheetGrayscale").isChecked();
  await page.keyboard.press("Space");
  assert.notEqual(await page.locator("#sheetGrayscale").isChecked(), checked);
  assert.ok(switches > 10 && chips > 10);
  console.log(`Control style checks passed: ${switches} switches and ${chips} chip checkboxes.`);
} finally {
  await browser?.close();
  await server.close();
}