import test from "node:test";
import assert from "node:assert/strict";
import { disabledPages, pageAvailability } from "../page-availability.js";

test("disabled page names are normalized and unknown names fail closed", () => {
  assert.deepEqual([...disabledPages(" shiryo, kana.html,shiryo, ", ["shiryo.html", "kana.html"])], ["shiryo.html", "kana.html"]);
  assert.equal(disabledPages("", ["shiryo.html"]).size, 0);
  assert.throws(() => disabledPages("shriyo", ["shiryo.html"]), /Unknown DISABLED_PAGES/);
});

test("page replacement removes original HTML and rejects leaked worksheet imports", () => {
  const plugin = pageAvailability(new Set(["shiryo.html", "kana.html"]));
  const original = '<script src="./src/resources.js"></script><p>Full content</p>';
  const html = plugin.transformIndexHtml.handler(original, { filename: "/frontend/shiryo.html" });
  assert.ok(!html.includes("resources.js") && !html.includes("Full content"));
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.match(html, /cropped, watermarked sample/);
  assert.match(html, /src="\.\/src\/shiryo-preview.js"/);
  assert.match(html, /id="sheetPicker"/);
  assert.match(html, /Ko-fi/);
  assert.match(plugin.transformIndexHtml.handler(original, { filename: "/frontend/kana.html" }), /currently unavailable/);
  assert.equal(plugin.transformIndexHtml.handler(original, { filename: "/frontend/goi.html" }), original);
  assert.throws(() => plugin.generateBundle({}, {
    leaked: { type: "chunk", modules: { "/frontend/src/worksheet.js": {} } }
  }), /Disabled Shiryō module/);
});
