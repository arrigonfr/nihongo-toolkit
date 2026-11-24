import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import config from "../vite.config.js";
import { editorialTools } from "../editorial-tools.js";

test("production includes each preview entry and its public navigation link", () => {
  const production = config({ mode: "production", command: "build" });
  const index = new URL("../index.html", import.meta.url);
  const menu = production.plugins.find(plugin => plugin.name === "tool-navigation")
    .transformIndexHtml.handler(readFileSync(index, "utf8"), { filename: index.pathname }).html;
  for (const slug of Object.keys(editorialTools)) {
    assert.ok(production.build.rollupOptions.input.some(path => path.endsWith(`/${slug}.html`)));
    assert.ok(menu.includes(`href="./${slug}"`));
  }
});
