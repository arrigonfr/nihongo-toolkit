import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { runInNewContext } from "node:vm";
import config from "../vite.config.js";

test("every page configures host-only analytics cookies before loading Google tags", () => {
  const { plugins } = config({ mode: "test" });
  const navigation = plugins.find((plugin) => plugin.name === "tool-navigation");
  const root = new URL("../", import.meta.url);
  for (const file of readdirSync(root).filter((name) => name.endsWith(".html"))) {
    const result = navigation.transformIndexHtml.handler(
      readFileSync(new URL(file, root), "utf8"),
      { filename: new URL(file, root).pathname }
    );
    const html = typeof result === "string" ? result : result.html;
    const bootstrap = html.match(/<script>(window\.dataLayer[\s\S]*?)<\/script>/);
    assert.ok(bootstrap, file);
    const window = {};
    runInNewContext(bootstrap[1], { window, dataLayer: window.dataLayer = [] });
    const commands = window.dataLayer.map((args) => Array.from(args));
    assert.deepEqual(commands[0], ["set", "cookie_domain", "none"], file);
    assert.equal(commands[2][0], "config", file);
    assert.equal(commands[2][1], "G-LL2V1JZBER", file);
    assert.equal(commands[2][2].cookie_domain, "none", file);
    assert.ok(html.indexOf(bootstrap[0]) < html.indexOf('src="https://www.googletagmanager.com/gtag/js'), file);
    assert.ok(html.indexOf(bootstrap[0]) < html.indexOf("'gtm.start'"), file);
  }
});
