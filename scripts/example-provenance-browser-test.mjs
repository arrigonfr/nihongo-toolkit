import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "playwright";

let server, browser;
try {
  server = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 5189, strictPort: false } });
  await server.listen();
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  await page.route("**/api/sentences?*", (route) => route.fulfill({ json: { data: [{
    id: "ai:test", text: "猫が眠っています。", source: "ai-generated", generated: true,
    license: "AI-generated; unverified", attribution: '{"model":"local-test"}',
    translations: [{ lang: "eng", text: "The cat is sleeping." }]
  }] } }));
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`);
  const result = await page.evaluate(async () => {
    const { loadSentences, sentencesHTML } = await import("/src/examples.js");
    const examples = await loadSentences("猫");
    const synthetic = document.createElement("div");
    synthetic.innerHTML = sentencesHTML(examples);
    const authentic = document.createElement("div");
    authentic.innerHTML = sentencesHTML([{ id: 1, japanese: "猫です。", english: "A cat.",
      source: "Tatoeba", owner: "author", translationId: 2, translationOwner: "translator" }]);
    return { generated: examples[0].generated, text: synthetic.textContent,
      syntheticLinks: synthetic.querySelectorAll("a").length,
      authenticLinks: [...authentic.querySelectorAll("a")].map((link) => link.href) };
  });
  assert.equal(result.generated, true);
  assert.match(result.text, /AI-generated.*Unverified/);
  assert.equal(result.syntheticLinks, 0);
  assert.deepEqual(result.authenticLinks, ["https://tatoeba.org/sentences/show/1", "https://tatoeba.org/sentences/show/2"]);
  console.log("Example provenance browser checks passed");
} finally {
  await browser?.close();
  await server?.close();
}
