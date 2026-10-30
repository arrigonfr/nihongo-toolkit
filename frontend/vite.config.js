import { defineConfig, loadEnv } from "vite";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { legacyRoutes } from "./src/routes.js";

const root = fileURLToPath(new URL(".", import.meta.url));
const toolFiles = readdirSync(root).filter((file) => file.endsWith(".html") && !["index.html", "data-sources.html", "文字.html"].includes(file));

function toolNavigation(site) {
  function addTagManager(html) {
    html = html.replace(/<head\b[^>]*>/i, (head) => `${head}\n<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','GTM-T7N85X93');</script>`);
    return html.replace(/<body\b[^>]*>/i, (body) => `${body}\n<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T7N85X93" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`);
  }
  return {
    name: "tool-navigation",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const file = context.filename.split("/").pop();
        if (file === "文字.html") return addTagManager(html);
        const canonical = site ? new URL(file === "index.html" ? "" : file, site).href : null;
        const tags = [{ tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "./apple-touch-icon.png?v=2" }, injectTo: "head" }];
        if (canonical) tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" });
        if (file === "index.html" || toolFiles.includes(file)) {
          const launcher = readFileSync(new URL("./index.html", import.meta.url), "utf8");
          const originalMenu = launcher.match(/<nav class="navigation"[\s\S]*?<\/nav>/)[0];
          let menu = originalMenu.replace(/<button class="helper-link" type="button" data-file="([^"]+)">([\s\S]*?)<\/button>/g,
            (_, filename, content) => `<a class="helper-link" data-file="${filename}" href="./${filename}" target="_top">${content}</a>`);
          if (file !== "index.html") menu = menu.replace('<nav class="navigation" aria-label="Helper navigation">', '<nav class="navigation" aria-label="Helper navigation"><a class="dashboard-back" href="./" aria-label="Back to dashboard" title="Back to dashboard">←</a>');
          if (file === "index.html") {
            html = html.replace(originalMenu, menu);
            const groups = menu.match(/<section class="menu-group"[\s\S]*<\/section>/)[0].replaceAll('class="helper-link"', 'class="dashboard-link"');
            html = html.replace("<!-- dashboard-tools -->", groups);
          } else {
            const name = menu.match(new RegExp(`data-file="${file}"[^>]*>\\s*<span class="helper-name">([^<]+)`))?.[1].replace(/\s*·\s*$/, "");
            if (name) html = html.replace(/<title>[^<]*<\/title>/, `<title>${name} · Nihongo Toolkit</title>`);
            const menuCSS = launcher.slice(launcher.indexOf("    .navigation {"), launcher.indexOf("    .helper-frame {"));
            tags.push(
              { tag: "style", injectTo: "head", children: `${menuCSS}
                .navigation { --surface: var(--card, #fff); --selected: var(--accent-soft, #eaf1ec); --selected-ink: var(--accent-strong, #254d3e); }
                .dashboard-back { position: absolute; top: 12px; left: 0; display: grid; place-items: center; width: 40px; height: 40px; border: 1px solid var(--line); border-radius: 8px; background: var(--surface); color: var(--ink); font-size: 24px; text-decoration: none; }
                body header.study-header { position: relative; padding-left: 50px; }
                .navigation, .navigation * { box-sizing: border-box; }
                .navigation a { text-decoration: none; }
                .navigation :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
                html[data-embedded] .navigation, html[data-embedded] .dashboard-back { display: none; }
                html[data-embedded] body header.study-header { padding-left: 0; }` },
              { tag: "script", injectTo: "head-prepend", children: 'if (window.self !== window.top) document.documentElement.dataset.embedded = "";' },
              { tag: "style", injectTo: "head-prepend", children: 'html.loading-styles body { visibility: hidden; }' },
              { tag: "script", injectTo: "head-prepend", children: 'document.documentElement.classList.add("loading-styles"); document.addEventListener("DOMContentLoaded", () => document.documentElement.classList.remove("loading-styles"), { once: true });' },
              { tag: "script", attrs: { type: "module", src: "./src/index.js" }, injectTo: "body" }
            );
            html = html.replace(/<body\b[^>]*>/, (body) => `${body}\n${menu}`);
          }
          tags.push({ tag: "noscript", injectTo: "body", children: "<style>.navigation .menu[hidden] { display: block; } .navigation .menu-button { display: none; }</style>" });
        }
        html = html.replace(/href="\.\/#helper=([^"]+)"/g, 'href="./$1"');
        return { html: addTagManager(html), tags };
      }
    }
  };
}
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, root, ""), ...process.env };
  const site = env.VITE_SITE_URL ? new URL("/", env.VITE_SITE_URL).href : undefined;
  if (site && !site.startsWith("https://")) {
    throw new Error("VITE_SITE_URL must be the public HTTPS site URL.");
  }
  return {
  plugins: [toolNavigation(site), {
    name: "deployment-seo",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0];
        let legacy;
        try { legacy = legacyRoutes[decodeURIComponent(path?.slice(1) || "")]; } catch { return next(); }
        if (legacy) {
          response.statusCode = 302;
          response.setHeader("Location", `/${legacy}${request.url.includes("?") ? `?${request.url.split("?").slice(1).join("?")}` : ""}`);
          response.end();
        } else if (site && path === "/robots.txt") {
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(`User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);
        } else if (site && path === "/sitemap.xml") {
          const pages = ["", ...toolFiles, "data-sources.html"];
          response.setHeader("Content-Type", "application/xml; charset=utf-8");
          response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((file) =>
            `  <url><loc>${new URL(file, site).href}</loc></url>`).join("\n")}\n</urlset>\n`);
        } else next();
      });
    },
    writeBundle(options) {
      const directory = options.dir || `${root}/dist`;
      for (const [oldName, newName] of Object.entries(legacyRoutes)) {
        writeFileSync(`${directory}/${oldName}`, `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=./${newName}"><link rel="canonical" href="./${newName}"><title>Redirecting</title></head><body><a href="./${newName}">Continue</a></body></html>`);
      }
      writeFileSync(`${directory}/robots.txt`, `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}sitemap.xml\n` : ""}`);
      if (!site) { rmSync(`${directory}/sitemap.xml`, { force: true }); return; }
      const pages = ["", ...toolFiles, "data-sources.html"];
      writeFileSync(`${directory}/sitemap.xml`, `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((file) =>
        `  <url><loc>${new URL(file, site).href}</loc></url>`).join("\n")}\n</urlset>\n`);
    }
  }],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: readdirSync(root).filter((file) => file.endsWith(".html"))
        .map((file) => fileURLToPath(new URL(file, import.meta.url)))
    }
  }
  };
});
