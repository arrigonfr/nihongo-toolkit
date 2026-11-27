import test from "node:test";
import assert from "node:assert/strict";
import { escapeHTML, escapeXML, html, raw } from "../src/html.js";

test("escapeHTML escapes all HTML meta-characters and handles nullish values", () => {
  assert.equal(escapeHTML(`<img src="x" onerror='alert(1)'> &`), "&lt;img src=&quot;x&quot; onerror=&#39;alert(1)&#39;&gt; &amp;");
  assert.equal(escapeHTML(null), "");
  assert.equal(escapeHTML(undefined), "");
  assert.equal(escapeHTML(0), "0");
});

test("escapeXML escapes XML meta-characters while preserving apostrophes", () => {
  assert.equal(escapeXML(`don't <break> "svg" & text`), "don't &lt;break&gt; &quot;svg&quot; &amp; text");
});

test("html tagged template auto-escapes interpolations, flattens arrays, and respects raw()", () => {
  const unsafe = `<script>alert("xss")</script>`;
  const items = ["a & b", "c < d"];
  const rendered = html`<div data-x="${unsafe}">${items.map((item) => raw(html`<span>${item}</span>`))}${raw("<em>ok</em>")}${false}${null}</div>`;
  assert.equal(
    rendered,
    `<div data-x="&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"><span>a &amp; b</span><span>c &lt; d</span><em>ok</em></div>`
  );
});
