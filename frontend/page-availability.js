import { readFileSync } from "node:fs";

export function disabledPages(value, files) {
  const pages = new Set();
  for (const entry of (value || "").split(",").map((name) => name.trim()).filter(Boolean)) {
    const file = entry.endsWith(".html") ? entry : `${entry}.html`;
    if (!files.includes(file)) throw new Error(`Unknown DISABLED_PAGES entry: ${entry}`);
    pages.add(file);
  }
  return pages;
}

export function unavailablePage(file) {
  if (file === "shiryo.html") return readFileSync(new URL("./templates/shiryo-preview.html", import.meta.url), "utf8");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page unavailable | Nihongo Toolkit</title>
<link rel="icon" href="./favicon.svg">
<style>
body{margin:0;background:#f5f4ef;color:#252b28;font-family:system-ui,sans-serif}
main{max-width:1120px;margin:100px auto 40px;padding:24px}
h1{font-size:clamp(1.8rem,5vw,2.7rem)}p{line-height:1.6}
a{color:#254d3e}
</style></head><body><main>
<h1>This page is currently unavailable</h1>
<p>This tool is not included in this edition.</p>
<p><a href="./">Back to all tools</a></p></main></body></html>`;
}

export function pageAvailability(pages) {
  return {
    name: "page-availability",
    enforce: "pre",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const file = context.filename.split("/").pop();
        return pages.has(file) ? unavailablePage(file) : html;
      }
    },
    generateBundle(_options, bundle) {
      if (!pages.has("shiryo.html")) return;
      // Fail closed if a new entry point accidentally starts importing the paid sheets.
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of Object.keys(output.modules)) {
          if (/\/src\/(?:resources\.js|cheatsheet-[^/]+|worksheet[^/]*|KanjiStrokeOrders[^/]*)$/.test(id)) {
            throw new Error(`Disabled Shiryō module included in build: ${id}`);
          }
        }
      }
    }
  };
}
