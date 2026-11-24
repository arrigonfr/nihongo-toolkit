import { defineConfig, loadEnv } from "vite";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { legacyRoutes, publicPath } from "./src/routes.js";
import { disabledPages, pageAvailability } from "./page-availability.js";
import { kanjiCatalogue } from "./kanji/pages.js";
import { editorialIdentity, editorialPage, editorialTools } from "./editorial-tools.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const toolFiles = readdirSync(root).filter((file) => file.endsWith(".html") && !["index.html", "data-sources.html", "文字.html"].includes(file));
const seoPages = {
  ...Object.fromEntries(Object.entries(editorialTools).map(([slug, [name,,, description]]) =>
    [`${slug}.html`, { title: `${name} | NihongoToolkit`, description }])),
  "faq.html": {
    title: "Frequently Asked Questions | NihongoToolkit",
    description: "Find help typing Japanese kana, using study controls, and navigating NihongoToolkit."
  },
  "contact.html": {
    title: "Contact | NihongoToolkit",
    description: "Send feedback, feature requests, data corrections and bug reports to NihongoToolkit."
  },
  "index.html": {
    title: "NihongoToolkit",
    description: "Free Japanese learning tools for kana, kanji, vocabulary, conjugation practice, dictionary lookup, word games, and printable study sheets.",
    image: { path: "og-image.png", type: "image/png", width: "1200", height: "630", alt: "NihongoToolkit homepage with Japanese learning tools and its student mascot." }
  },
  "kana.html": {
    title: "Hiragana and Katakana Practice | NihongoToolkit",
    description: "Practice reading and recognizing Japanese hiragana and katakana with interactive kana exercises."
  },
  "yomi.html": {
    title: "Kanji Reading Practice | NihongoToolkit",
    description: "Practice Japanese kanji readings with interactive exercises for reading characters in context."
  },
  "imi.html": {
    title: "Kanji Meaning Practice | NihongoToolkit",
    description: "Build your understanding of Japanese kanji with focused meaning practice and review."
  },
  "goi.html": {
    title: "Japanese Vocabulary Practice | NihongoToolkit",
    description: "Build Japanese vocabulary with interactive JLPT-focused practice, review, and study sessions."
  },
  "katsuyo-renshuu.html": {
    title: "Japanese Conjugation Practice | NihongoToolkit",
    description: "Practice Japanese verb and adjective conjugations with focused interactive exercises."
  },
  "kotoba.html": {
    title: "Japanese Dictionary | NihongoToolkit",
    description: "Look up Japanese words, readings, meanings, and example information in an interactive dictionary."
  },
  "kanji-chizucho.html": {
    title: "Explore Kanji and Compounds | NihongoToolkit",
    description: "Explore Japanese kanji, their components, and related compounds in an interactive character atlas."
  },
  "katsuyo.html": {
    title: "Japanese Verb and Adjective Conjugator | NihongoToolkit",
    description: "Look up Japanese verb and adjective conjugations across common forms with an interactive conjugator."
  },
  "shiryo.html": {
    title: "Printable Japanese Study Sheets | NihongoToolkit",
    description: "Browse and print Japanese learning reference sheets and study cheatsheets."
  },
  "fumitoki.html": {
    title: "Japanese Sentence Breakdown | NihongoToolkit",
    description: "Break down Japanese sentences to explore words, readings, and grammatical structure."
  },
  "eawase.html": {
    title: "Japanese Vocabulary Matching Game | NihongoToolkit",
    description: "Play a Japanese memory-matching game pairing vocabulary words with their kana readings."
  },
  "kotoba-sagashi.html": {
    title: "Japanese Vocabulary Word Search | NihongoToolkit",
    description: "Find Japanese vocabulary in an interactive word-search puzzle and practice as you play."
  },
  "pazuru.html": {
    title: "Japanese Vocabulary Crossword | NihongoToolkit",
    description: "Solve a Japanese vocabulary crossword puzzle to practice words and their meanings."
  },
  "shiritori.html": {
    title: "Japanese Shiritori Word Game | NihongoToolkit",
    description: "Play shiritori, the Japanese word-chain game, and keep the chain going with Japanese words."
  },
  "kanji-kuizu.html": {
    title: "Kanji Quiz Game | NihongoToolkit",
    description: "Play a Japanese kanji quiz and spot the matching character in an interactive game."
  },
  "data-sources.html": {
    title: "Data Sources and Licenses | NihongoToolkit",
    description: "Review the data sources, attributions, and licenses used by NihongoToolkit's Japanese learning tools."
  }
};

function toolNavigation(site, disabled = new Set(), editorial = false) {
  function addTagManager(html) {
    html = html.replace(/<head\b[^>]*>/i, (head) => `${head}
<script>window.dataLayer = window.dataLayer || []; function gtag(){dataLayer.push(arguments);} gtag('set', 'cookie_domain', 'none'); gtag('js', new Date()); gtag('config', 'G-LL2V1JZBER', { cookie_domain: 'none' });</script>
<script async src="https://www.googletagmanager.com/gtag/js?id=G-LL2V1JZBER"></script>
<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-T7N85X93');</script>`);
    return html.replace(/<body\b[^>]*>/i, (body) => `${body}\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T7N85X93" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`);
  }
  return {
    name: "tool-navigation",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const file = context.filename.split("/").pop();
        if (file === "kanji-of-the-day.html") return html;
        const reference = file === "catalogue-shell.html";
        if (file === "文字.html") return addTagManager(html);
        const canonical = site && !reference ? new URL(publicPath(file), site).href : null;
        if (file === "index.html" && site) {
          html = html.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/, (_, open, content, close) => {
            const data = JSON.parse(content);
            const website = data["@graph"].find((node) => node["@type"] === "WebSite");
            const source = new URL(website.url);
            for (const node of data["@graph"]) {
              if (node.alternateName) node.alternateName = [...[node.alternateName].flat().filter((name) => name !== source.hostname), new URL(site).hostname];
            }
            const normalized = JSON.stringify(data, (key, value) => {
              if (typeof value !== "string" || !(value === source.origin || value.startsWith(`${source.origin}/`))) return value;
              const url = new URL(value);
              return new URL(`${url.pathname}${url.search}${url.hash}`, site).href;
            });
            return `${open}${normalized.replaceAll("<", "\\u003c")}${close}`;
          });
        }
        const tags = [{ tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: reference ? "/apple-touch-icon.png?v=6" : "./apple-touch-icon.png?v=6" }, injectTo: "head" }];
        if (!reference) tags.push({ tag: "script", attrs: { type: "module", src: "./src/page-views.js" }, injectTo: "body" });
        if (canonical) tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" });
        if (reference || file === "index.html" || file === "data-sources.html" || toolFiles.includes(file)) {
          const launcher = readFileSync(new URL("./index.html", import.meta.url), "utf8");
          const originalMenu = launcher.match(/<nav class="navigation"[\s\S]*?<\/nav>/)[0];
          let menu = originalMenu;
          if (editorial) {
            for (const [slug, [name, group, purpose, description, example]] of Object.entries(editorialTools)) {
              const [japanese] = editorialIdentity[slug];
              const link = `<a class="helper-link" data-file="${slug}.html" href="./${slug}.html" target="_top" data-purpose="${purpose}" data-description="${description}" data-example="${example}"><span class="helper-name">${name} · <span class="helper-icon" aria-hidden="true"><img src="/tool-icons/${slug}.webp" alt="" width="26" height="26"></span> · <span lang="ja">${japanese}</span></span><span class="helper-description">${purpose}</span></a>`;
              menu = menu.replace(new RegExp(`(<section class="menu-group" aria-label="${group}">[\\s\\S]*?)(</section>)`), `$1${link}$2`);
            }
          }
          menu = menu.replace(/<button class="helper-link" type="button" data-file="([^"]+)">([\s\S]*?)<\/button>/g,
            (_, filename, content) => `<a class="helper-link" data-file="${filename}" href="./${filename}" target="_top">${content}</a>`);
          for (const disabledFile of disabled) {
            menu = menu.replace(`data-file="${disabledFile}"`, `data-file="${disabledFile}" data-unavailable`);
          }
          menu = menu.replace('<div class="menu" id="helperMenu" hidden>', '<div class="menu" id="helperMenu" hidden><a class="helper-link home-link" href="./" target="_top"><span class="helper-icon" aria-hidden="true"><img src="/logo-mark.webp" alt="" width="26" height="26"></span><span class="helper-name">Home</span></a>');
          if (file === "index.html") {
            html = html.replace(originalMenu, menu);
          } else {
            const name = menu.match(new RegExp(`data-file="${file}"[^>]*>\\s*<span class="helper-name">([^<]+)`))?.[1].replace(/\s*·\s*$/, "");
            if (name && !seoPages[file]) html = html.replace(/<title>[^<]*<\/title>/, `<title>${name} · NihongoToolkit</title>`);
            const menuCSS = launcher.slice(launcher.indexOf("    .navigation {"), launcher.indexOf("    .helper-frame {"));
            tags.push(
              { tag: "style", injectTo: "head", children: `${menuCSS}
                .navigation { --surface: var(--card, #fff); --selected: var(--accent-soft, #eaf1ec); --selected-ink: var(--accent-strong, #254d3e); }
                body header.study-header { position: relative; }
                .navigation, .navigation * { box-sizing: border-box; }
                .navigation a { text-decoration: none; }
                .navigation :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
                html[data-embedded] .navigation, html[data-embedded] .dashboard-back { display: none; }
                html[data-embedded] body header.study-header { padding-left: 0; }` },
              { tag: "script", injectTo: "head-prepend", children: 'if (window.self !== window.top) document.documentElement.dataset.embedded = "";' },
              { tag: "style", injectTo: "head-prepend", children: 'html.loading-styles body { visibility: hidden; }' },
              { tag: "script", injectTo: "head-prepend", children: 'document.documentElement.classList.add("loading-styles"); document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.remove("loading-styles"), { once: true });' },
              { tag: "script", attrs: { type: "module", src: reference ? "/src/index.js" : "./src/index.js" }, injectTo: "body" }
            );
            html = html.replace(/<body\b[^>]*>/, (body) => `${body}\n${menu}`);
          }
          tags.push({ tag: "noscript", injectTo: "body", children: "<style>.navigation .menu[hidden] { display: block; } .navigation .menu-button { display: none; }</style>" });
        }
        html = html.replace(/href="\.\/#helper=([^"]+)"/g, 'href="./$1"');
        html = html.replace(/href="\.\/([^"?#]+\.html)([?#][^"]*)?"/g, (match, target, suffix = "") =>
          seoPages[target] ? `href="./${publicPath(target)}${suffix}"` : match);
        if (reference) html = html.replaceAll('href="./', 'href="/');
        const seo = disabled.has(file) ? null : seoPages[file];
        if (seo) {
          html = html.replace(/<title>[^<]*<\/title>/i, `<title>${seo.title}</title>`);
          tags.push(
            { tag: "meta", attrs: { name: "description", content: seo.description }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:title", content: seo.title }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:description", content: seo.description }, injectTo: "head" },
            { tag: "meta", attrs: { property: "og:type", content: "website" }, injectTo: "head" },
            { tag: "meta", attrs: { name: "twitter:card", content: site ? "summary_large_image" : "summary" }, injectTo: "head" },
            { tag: "meta", attrs: { name: "twitter:title", content: seo.title }, injectTo: "head" },
            { tag: "meta", attrs: { name: "twitter:description", content: seo.description }, injectTo: "head" }
          );
          if (file !== "index.html") {
            tags.push({ tag: "meta", attrs: { property: "og:site_name", content: "NihongoToolkit" }, injectTo: "head" });
          }
          if (canonical) {
            const image = new URL("og-image.png", site).href;
            const imageAlt = "NihongoToolkit homepage with Japanese practice tools, dictionary tools, and word games";
            const ogImage = seo.image
              ? [{ property: "og:image", content: new URL(seo.image.path, site).href }, { property: "og:image:type", content: seo.image.type }, ...(seo.image.width ? [{ property: "og:image:width", content: seo.image.width }, { property: "og:image:height", content: seo.image.height }] : []), { property: "og:image:alt", content: seo.image.alt }]
              : [{ property: "og:image", content: image }, { property: "og:image:type", content: "image/png" }, { property: "og:image:width", content: "1200" }, { property: "og:image:height", content: "630" }, { property: "og:image:alt", content: imageAlt }];
            tags.push(
              { tag: "meta", attrs: { property: "og:url", content: canonical }, injectTo: "head" },
              ...ogImage.map((attrs) => ({ tag: "meta", attrs, injectTo: "head" })),
              // X does not display SVG cards, so Twitter keeps the PNG preview.
              { tag: "meta", attrs: { name: "twitter:image", content: image }, injectTo: "head" },
              { tag: "meta", attrs: { name: "twitter:image:alt", content: imageAlt }, injectTo: "head" }
            );
          }
        }
        return { html: editorialPage(file) ? html : addTagManager(html), tags: editorialPage(file)
          ? tags.filter(tag => tag.attrs?.src !== "./src/page-views.js") : tags };
      }
    }
  };
}
export default defineConfig(({ mode, command, isPreview }) => {
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const disabled = disabledPages(env.DISABLED_PAGES, readdirSync(root).filter((file) => file.endsWith(".html")));
  if (disabled.size && command === "serve" && !isPreview) {
    throw new Error("DISABLED_PAGES requires a production build. Do not expose the Vite development server; it serves source files.");
  }
  const editorial = true;
  const site = env.VITE_SITE_URL ? new URL("/", env.VITE_SITE_URL).href : undefined;
  if (site && !site.startsWith("https://")) {
    throw new Error("VITE_SITE_URL must be the public HTTPS site URL.");
  }
  const catalogue = kanjiCatalogue(site, disabled);
  const robots = `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}sitemap.xml\n` : ""}`;
  const sitemap = () => {
    const paths = ["", ...toolFiles.filter(file => !editorialPage(file)), "data-sources.html"].map(publicPath).concat(catalogue.paths);
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) =>
      `  <url><loc>${new URL(path, site).href}</loc></url>`).join("\n")}\n</urlset>\n`;
  };
  return {
  define: {
    "process.env.TRACK_VISITS": JSON.stringify(env.TRACK_VISITS || ""),
    "import.meta.env.EDITORIAL_PREVIEWS_ENABLED": JSON.stringify(editorial)
  },
  worker: { format: "es" },
  plugins: [pageAvailability(disabled), toolNavigation(site, disabled, editorial), catalogue.plugin, {
    name: "deployment-seo",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0];
        let legacy;
        if (editorial) {
          const alias = path?.slice(1).replace(/\.html$/, "");
          const match = Object.entries(editorialIdentity).find(([, [, old]]) => old === alias);
          if (match) {
            response.writeHead(302, { Location: `/${match[0]}${request.url.slice(path.length)}` });
            return response.end();
          }
        }
        try { legacy = legacyRoutes[decodeURIComponent(path?.slice(1) || "")]; } catch { return next(); }
        if (legacy) {
          response.statusCode = 302;
          response.setHeader("Location", `/${legacy}${request.url.includes("?") ? `?${request.url.split("?").slice(1).join("?")}` : ""}`);
          response.end();
        } else if (path === "/robots.txt") {
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(robots);
        } else if (path === "/sitemap.xml") {
          response.writeHead(site ? 200 : 404, {
            "Content-Type": site ? "application/xml; charset=utf-8" : "text/plain; charset=utf-8"
          });
          response.end(site ? sitemap() : "Set VITE_SITE_URL to generate a sitemap.\n");
        } else next();
      });
    },
    writeBundle(options) {
      const directory = options.dir || `${root}/dist`;
      for (const [oldName, newName] of Object.entries(legacyRoutes)) {
        writeFileSync(`${directory}/${oldName}`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=./${publicPath(newName)}"><link rel="canonical" href="./${publicPath(newName)}"><title>Redirecting</title></head><body><a href="./${publicPath(newName)}">Continue</a></body></html>`);
      }
      writeFileSync(`${directory}/robots.txt`, robots);
      if (!site) { rmSync(`${directory}/sitemap.xml`, { force: true }); return; }
      writeFileSync(`${directory}/sitemap.xml`, sitemap());
    }
  }],
  server: { port: 5173, strictPort: true },
  build: {
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: readdirSync(root).filter((file) => file.endsWith(".html"))
        .map((file) => fileURLToPath(new URL(file, import.meta.url)))
        .concat(["./kanji/catalogue-shell.html", "./embed/kanji-of-the-day.html"]
          .map((file) => fileURLToPath(new URL(file, import.meta.url))))
    }
  }
  };
});
