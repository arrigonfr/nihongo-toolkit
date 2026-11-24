import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { enrichRadicals } from "../../backend/src/radicals.js";
import { catalogueGroupLabel, compareCatalogueGroups } from "./catalogue-groups.js";
import { kanjiReportPath } from "../src/contact-fields.js";

const escape = (value) => String(value).replace(/[&<>"']/g, (char) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const cataloguePath = "/kanji/";
const dailyPath = "/kanji-of-the-day";
const embedPath = "/embed/kanji-of-the-day";

// Some compatibility ideographs normalize to another entry's filename.
export const kanjiSlug = (character) => character === character.normalize("NFC")
  ? character : `u-${character.codePointAt(0).toString(16)}`;
const entryPath = (slug) => `${cataloguePath}${encodeURIComponent(slug)}`;

function nonBlankTexts(values) {
  return Array.isArray(values) ? values.filter((value) => typeof value === "string")
    .map((value) => value.trim()).filter(Boolean) : [];
}

export function selectDailyKanji(visible) {
  const entries = visible.filter(({ frequency }) => frequency)
    .map(({ character, frequency, on, kun, meanings }) => ({
      character, frequency,
      readings: [nonBlankTexts(on)[0], nonBlankTexts(kun)[0]].filter(Boolean),
      meanings: nonBlankTexts(meanings).slice(0, 2)
    }))
    .filter(({ readings, meanings }) => readings.length && meanings.length)
    .sort((a, b) => a.frequency - b.frequency || a.character.codePointAt(0) - b.character.codePointAt(0))
    .slice(0, 365)
    .map(({ character, readings, meanings }) => ({
      character, path: entryPath(kanjiSlug(character)), readings, meanings
    }));
  if (entries.length < 2) throw new Error("Not enough common kanji with both a Japanese reading and an English meaning for the daily rotation.");
  return entries;
}

function document(shell, { title, description, canonical, body }) {
  return shell.replace("<!-- catalogue-head -->", () => `<title>${escape(title)} | NihongoToolkit</title>
<meta name="description" content="${escape(description)}">
${canonical ? `<link rel="canonical" href="${escape(canonical)}">` : ""}`)
    .replace("<!-- catalogue-body -->", () => body);
}

function strokeDiagram(character, drawing) {
  if (!drawing) return "";
  const [paths, numbers] = drawing;
  return `<section aria-labelledby="stroke-order"><h2 id="stroke-order">Stroke order</h2>
<svg class="stroke-order" viewBox="0 0 109 109" width="218" height="218" role="img" aria-label="Numbered stroke order for ${escape(character)}">
<g fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">${paths.map((path) => `<path d="${escape(path)}"/>`).join("")}</g>
${numbers.map(([x, y, number]) => `<text x="${escape(x)}" y="${escape(y)}">${escape(number)}</text>`).join("")}</svg>
<p>Diagram adapted from <a href="https://kanjivg.tagaini.net/">KanjiVG</a> by Ulrich Apel and contributors, <a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA 3.0</a>.</p></section>`;
}

function detail(shell, entry, drawings, entries, site, disabled) {
  const { character, meanings, on, kun, names, strokes, jlpt, jlptSource, frequency, compounds, kind, radical } = entry;
  const mainRadical = enrichRadicals([{ value: radical }])[0].character;
  const japanese = (text) => `<span lang="ja">${escape(text)}</span>`;
  const readings = (items) => items.length ? japanese(items.join("、")) : "Not listed";
  const related = (word) => [...word].map((part) =>
    part !== character && entries.has(kanjiSlug(part))
      ? `<a href="${entryPath(kanjiSlug(part))}">${escape(part)}</a>` : escape(part)).join("");
  const tools = [
    ["kanji-chizucho", "Explore in Kanji Atlas"],
    ["yomi", "Practice kanji readings"],
    ["imi", "Practice kanji meanings"]
  ].filter(([page]) => !disabled.has(`${page}.html`));
  const meaning = meanings.join("; ");
  const incomplete = !meanings.length || !(on.length || kun.length || names.length);
  return document(shell, {
    title: `${character} Kanji — ${meanings[0] || `${strokes} strokes`}`,
    description: `${character} kanji: ${meaning ? `${meaning}. ` : ""}${strokes} strokes${on.length || kun.length ? `. Readings: ${[...on, ...kun].slice(0, 4).join(", ")}` : ""}.`,
    canonical: site && new URL(entryPath(kanjiSlug(character)), site).href,
    body: `<article><h1><span class="glyph" lang="ja">${escape(character)}</span> <span>Kanji</span></h1>
<p class="meaning">${escape(meaning || "No English meanings listed.")}</p>
${incomplete && !disabled.has("contact.html") ? `<p><a href="${kanjiReportPath(character)}">Suggest a missing Japanese reading or English meaning</a></p>` : ""}
<dl>
<div><dt>On'yomi</dt><dd>${readings(on)}</dd></div>
<div><dt>Kun'yomi</dt><dd>${readings(kun)}</dd></div>
${names.length ? `<div><dt>Name readings</dt><dd>${readings(names)}</dd></div>` : ""}
<div><dt>Stroke count</dt><dd>${escape(strokes)}</dd></div>
${mainRadical ? `<div><dt>Dictionary indexing radical</dt><dd>${japanese(mainRadical)} (${escape(radical)}). Its shape may differ inside the character.</dd></div>` : ""}
${kind === "kanji-and-radical" ? "<div><dt>Character type</dt><dd>Kanji and radical</dd></div>" : ""}
${jlpt ? `<div><dt>JLPT study estimate</dt><dd>N${escape(jlpt)}${jlptSource ? ` (${escape(jlptSource)})` : ""}</dd></div>` : ""}
${frequency ? `<div><dt>Newspaper frequency rank</dt><dd>${escape(frequency)}</dd></div>` : ""}
</dl>
${strokeDiagram(character, drawings[character])}
${compounds?.length ? `<section><h2>Example words</h2><ul class="compounds">${compounds.map(([word, reading, gloss]) =>
    `<li><span lang="ja">${related(word)}</span> (${japanese(reading)}) — ${escape(gloss)}</li>`).join("")}</ul></section>` : ""}
${tools.length ? `<nav class="tool-links" aria-label="Study tools">${tools.map(([page, label]) =>
    `<a href="/${page}${page === "kanji-chizucho" ? `?kanji=${encodeURIComponent(character)}` : ""}">${label}</a>`).join("")}</nav>` : ""}
<p>Character and word data from EDRDG’s <a href="https://www.edrdg.org/wiki/KANJIDIC_Project.html">KANJIDIC2</a> and <a href="https://www.edrdg.org/jmdict/j_jmdict.html">JMdict</a>, adapted by NihongoToolkit under <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>.</p>
</article>`
  });
}

function catalogueIndex(shell, entries, site) {
  const groups = new Map();
  for (const entry of entries.values()) {
    const level = entry.jlpt ?? Infinity;
    const group = groups.get(level) || [];
    group.push(entry);
    groups.set(level, group);
  }
  const radicals = enrichRadicals(Array.from({ length: 214 }, (_, index) => ({ value: index + 1 })));
  return document(shell, {
    title: "Japanese Kanji Catalogue",
    description: "Browse Japanese kanji by stroke count, dictionary radical, or estimated JLPT level. Find meanings, readings, and stroke-order diagrams where available.",
    canonical: site && new URL(cataloguePath, site).href,
    body: `<section class="study-intro tool-intro" aria-labelledby="catalogue-title">
  <div class="study-intro-content">
    <span class="eyebrow"><span lang="ja">漢字一覧</span> · Kanji catalogue</span>
    <h1 id="catalogue-title">Choose a kanji. <br><span>Explore its readings.</span></h1>
    <p>Browse ${entries.size.toLocaleString("en")} kanji and look up their readings and meanings. JLPT levels are study estimates, not official classifications.</p>
  </div>
</section>
<p><a href="${dailyPath}">See today’s kanji</a></p>
<div class="catalogue-controls" hidden>
  <label>Search kanji <input id="catalogue-search" type="search" placeholder="Character, reading or meaning"></label>
  <label>Group by <select id="catalogue-group"><option value="jlpt" selected>JLPT study estimate</option><option value="strokes">Stroke count</option><option value="radical">Dictionary radical</option></select></label>
  <p id="catalogue-results" role="status"></p>
</div>
<script type="application/json" id="catalogue-radicals">${JSON.stringify(radicals.map(({ character, meaning }) => `${character} (${meaning})`)).replaceAll("<", "\\u003c")}</script>
<div id="catalogue-list">
${[...groups].sort(([a], [b]) => compareCatalogueGroups("jlpt", a, b)).map(([level, records]) =>
    `<details><summary>${catalogueGroupLabel("jlpt", level)} (${records.length})</summary><ul class="characters">${records.map(({ character, meanings, on, kun, names, strokes, jlpt, radical }) =>
      `<li><a href="${entryPath(kanjiSlug(character))}" lang="ja" data-strokes="${strokes}" data-jlpt="${jlpt ?? ""}" data-radical="${radical ?? ""}" data-search="${escape([...meanings, ...on, ...kun, ...names].join(" "))}">${escape(character)}</a></li>`).join("")}</ul></details>`).join("\n")}
</div>`
  });
}

function dailyCard(entries, embed = false) {
  const external = embed ? ' target="_blank" rel="noopener noreferrer"' : "";
  return `<section class="daily-kanji" aria-labelledby="daily-card-title" data-daily-kanji>
  <h2 id="daily-card-title">${embed ? "Kanji of the day" : "Today’s kanji"}</h2>
  <time></time>
  <div class="daily-kanji-details" hidden>
    <span class="daily-glyph" lang="ja"></span>
    <div><p class="daily-readings" lang="ja"></p><p class="daily-meanings"></p>
    <a class="daily-entry-link"${external}>View full kanji entry${embed ? " ↗" : ""}</a></div>
  </div>
  <noscript><p>Enable JavaScript to see today’s kanji, or <a href="${cataloguePath}"${external}>browse the catalogue</a>.</p></noscript>
  <p class="daily-credits"><a href="${dailyPath}"${external}>NihongoToolkit</a> ·
    Data: <a href="https://www.edrdg.org/wiki/KANJIDIC_Project.html"${external}>EDRDG KANJIDIC2</a>
    (<a href="https://creativecommons.org/licenses/by-sa/4.0/"${external}>CC BY-SA 4.0</a>)</p>
  <script type="application/json">${JSON.stringify(entries).replaceAll("<", "\\u003c")}</script>
</section>`;
}

function dailyPage(shell, entries, site) {
  shell = shell.replace('<span class="brand-mark" aria-hidden="true"><img src="/tool-icons/kanji-catalogue.webp"', '<span class="brand-mark" aria-hidden="true"><img src="/tool-icons/kanji-of-the-day.webp"')
    .replace('<span class="brand-name">Kanji catalogue', '<span class="brand-name">Kanji of the Day');
  return document(shell, {
    title: "Kanji of the Day",
    description: "Learn one common Japanese kanji each day, with readings, meanings and a free widget for your site.",
    canonical: site && new URL(dailyPath, site).href,
    body: `<section class="study-intro tool-intro" aria-labelledby="daily-title">
  <div class="study-intro-content">
    <span class="eyebrow"><span lang="ja">今日の漢字</span> · Kanji of the Day</span>
    <h1 id="daily-title">A new day. <br><span>Another kanji.</span></h1>
    <p>Learn one common kanji every day. The character changes at midnight UTC for everyone.</p>
  </div>
</section>
${dailyCard(entries)}
<section class="daily-embed-controls" id="daily-embed-controls" hidden>
  <h2>Embed this widget</h2>
  <p>Paste this code into an HTML block on your site or blog.</p>
  <label for="daily-embed-code">Iframe embed code</label>
  <textarea id="daily-embed-code" data-path="${site ? escape(new URL(embedPath, site).href) : embedPath}" rows="3" readonly></textarea>
  <div class="study-toolbar"><button id="copy-daily-embed" type="button">Copy embed code</button></div>
  <p id="daily-copy-status" role="status"></p>
</section>`
  });
}

export function kanjiCatalogue(site, disabled) {
  const [, ...rows] = readFileSync(new URL("./catalogue.jsonl", import.meta.url), "utf8").trimEnd().split("\n");
  const visible = rows.map((row) => JSON.parse(row)).filter((entry) => entry.kind !== "radical-only");
  const entries = new Map(visible.map((entry) => {
    if (!/^\p{Script=Han}$/u.test(entry.character)) throw new Error(`Invalid catalogue character: ${entry.character}`);
    return [kanjiSlug(entry.character), entry];
  }));
  if (!entries.size || entries.size !== visible.length) throw new Error("Empty catalogue or duplicate kanji routes.");

  const dailyEntries = selectDailyKanji(visible);

  const shellFile = new URL("./catalogue-shell.html", import.meta.url);
  const embedFile = new URL(`..${embedPath}.html`, import.meta.url);
  let drawings;
  const render = (shell, entry) => detail(shell, entry, drawings ??= JSON.parse(readFileSync(new URL("../src/worksheet-strokes.json", import.meta.url), "utf8")), entries, site, disabled);
  const notFound = (shell) => document(shell, {
    title: "Page not found",
    description: "This NihongoToolkit page could not be found.",
    body: '<h1>Page not found</h1><p><a href="/kanji/">Browse the kanji catalogue</a> or <a href="/">return to all tools</a>.</p>'
  });

  return {
    paths: [dailyPath, cataloguePath, ...[...entries.keys()].map(entryPath)],
    plugin: {
      name: "kanji-catalogue",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (!["GET", "HEAD"].includes(request.method)) return next();
          const path = new URL(request.url, "http://localhost").pathname;
          const daily = path === dailyPath || path === `${dailyPath}.html`;
          const embed = path === embedPath || path === `${embedPath}.html`;
          if (path === "/kanji") {
            response.writeHead(308, { Location: cataloguePath });
            return response.end();
          }
          if (!daily && !embed && (!path.startsWith(cataloguePath) ||
              ["/kanji/catalogue.css", "/kanji/catalogue.js", "/kanji/catalogue-groups.js", "/kanji/daily.js", "/kanji/daily.css"].includes(path))) return next();
          let entry;
          try { entry = entries.get(decodeURIComponent(path.slice(cataloguePath.length))); }
          catch (error) { if (!(error instanceof URIError)) throw error; }
          const index = path === cataloguePath;
          try {
            const shell = request.method === "HEAD" ? null : await server.transformIndexHtml(
              embed ? `${embedPath}.html` : "/kanji/catalogue-shell.html", readFileSync(embed ? embedFile : shellFile, "utf8"));
            const html = shell && (embed ? shell.replace("<!-- daily-card -->", () => dailyCard(dailyEntries, true))
              : daily ? dailyPage(shell, dailyEntries, site)
              : index ? catalogueIndex(shell, entries, site) : entry ? render(shell, entry) : notFound(shell));
            response.writeHead(daily || embed || index || entry ? 200 : 404, { "Content-Type": "text/html; charset=utf-8" });
            response.end(html ?? undefined);
          } catch (error) {
            next(error);
          }
        });
      },
      writeBundle: { order: "post", handler({ dir }) {
        const directory = join(dir, "kanji");
        const builtShell = join(directory, "catalogue-shell.html");
        const shell = readFileSync(builtShell, "utf8");
        const embedOutput = join(dir, `${embedPath.slice(1)}.html`);
        const embedShell = readFileSync(embedOutput, "utf8");
        writeFileSync(embedOutput, embedShell.replace("<!-- daily-card -->", () => dailyCard(dailyEntries, true)));
        writeFileSync(join(dir, `${dailyPath.slice(1)}.html`), dailyPage(shell, dailyEntries, site));
        writeFileSync(join(directory, "index.html"), catalogueIndex(shell, entries, site));
        for (const [slug, entry] of entries) writeFileSync(join(directory, `${slug}.html`), render(shell, entry));
        // A top-level 404 opts Cloudflare Pages out of its SPA fallback.
        writeFileSync(join(dir, "404.html"), notFound(shell));
        unlinkSync(builtShell);
      } }
    }
  };
}
