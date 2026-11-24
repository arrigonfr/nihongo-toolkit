import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import config from "../vite.config.js";
import { editorialTools } from "../editorial-tools.js";

test("editorial opt-in never includes a draft entry or draft chunk in a build", () => {
  const previous = process.env.EDITORIAL_PREVIEWS;
  process.env.EDITORIAL_PREVIEWS = "1";
  try {
    const production = config({ mode: "production", command: "build" });
    const inputs = production.build.rollupOptions.input;
    for (const slug of Object.keys(editorialTools)) assert.ok(!inputs.some(path => path.endsWith(`/${slug}.html`)));
    const gate = production.plugins.find(plugin => plugin.name === "page-availability");
    assert.throws(() => gate.generateBundle({}, { leak: { type: "chunk", modules: { "/src/preview-guide/index.js": {} } } }), /cannot be included/);
    const index = new URL("../index.html", import.meta.url);
    const source = readFileSync(index, "utf8");
    const menu = configuration => configuration.plugins.find(plugin => plugin.name === "tool-navigation")
      .transformIndexHtml.handler(source, { filename: index.pathname }).html;
    const built = menu(production);
    const preview = menu(config({ mode: "development", command: "serve" }));
    for (const slug of Object.keys(editorialTools)) {
      assert.ok(!built.includes(`data-file="${slug}.html"`));
      assert.ok(preview.includes(`href="./${slug}"`));
    }
  } finally {
    if (previous === undefined) delete process.env.EDITORIAL_PREVIEWS;
    else process.env.EDITORIAL_PREVIEWS = previous;
  }
});
