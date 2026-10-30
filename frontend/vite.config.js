import { defineConfig, loadEnv } from "vite";
import { readFileSync, readdirSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const toolFiles = readdirSync(root).filter((file) => file.endsWith(".html") && !["index.html", "data-sources.html", "文字.html"].includes(file));

function toolNavigation(site) {
  return {
    name: "tool-navigation",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const file = context.filename.split("/").pop();
        if (file === "文字.html") return html;
        const canonical = site ? new URL(file === "index.html" ? "" : file, site).href : null;
        const tags = [{ tag: "link", attrs: { rel: "apple-touch-icon", sizes: "180x180", href: "./apple-touch-icon.png?v=2" }, injectTo: "head" }];
        if (canonical) tags.push({ tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" });
        if (file === "index.html" || toolFiles.includes(file)) {
          const launcher = readFileSync(new URL("./index.html", import.meta.url), "utf8");
          const originalMenu = launcher.match(/<nav class="navigation"[\s\S]*?<\/nav>/)[0];
          const menu = originalMenu.replace(/<button class="helper-link" type="button" data-file="([^"]+)">([\s\S]*?)<\/button>/g,
            (_, filename, content) => `<a class="helper-link" data-file="${filename}" href="./${filename}" target="_top">${content}</a>`);
          if (file === "index.html") {
            html = html.replace(originalMenu, menu);
          } else {
            const menuCSS = launcher.slice(launcher.indexOf("    .navigation {"), launcher.indexOf("    .helper-frame {"));
            tags.push(
              { tag: "style", injectTo: "head", children: `${menuCSS}
                .navigation { --surface: #fff; --ink: #23251f; --muted: #777970; --line: #e7e6df; --accent: #356653; --selected: #eaf1ec; --selected-ink: #254d3e; --shadow: 0 12px 30px rgb(42 45 35 / 14%); }
                :root[data-theme="dark"] .navigation { --surface: #222923; --ink: #edf1eb; --muted: #a5afa5; --line: #3a443b; --accent: #9dceab; --selected: #2e4033; --selected-ink: #bee4c7; --shadow: 0 12px 30px rgb(0 0 0 / 35%); }
                .navigation, .navigation * { box-sizing: border-box; }
                .navigation a { text-decoration: none; }
                .navigation :focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; }
                html[data-embedded] .navigation { display: none; }` },
              { tag: "script", injectTo: "head-prepend", children: 'if (window.self !== window.top) document.documentElement.dataset.embedded = "";' },
              { tag: "script", attrs: { type: "module", src: "./src/index.js" }, injectTo: "body" }
            );
            html = html.replace(/<body\b[^>]*>/, (body) => `${body}\n${menu}`);
          }
          tags.push({ tag: "noscript", injectTo: "body", children: "<style>.navigation .menu[hidden] { display: block; } .navigation .menu-button { display: none; }</style>" });
        }
        html = html.replace(/href="\.\/#helper=([^"]+)"/g, 'href="./$1"');
        return { html, tags };
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
      if (!site) return;
      server.middlewares.use((request, response, next) => {
        const path = request.url?.split("?")[0];
        if (path === "/robots.txt") {
          response.setHeader("Content-Type", "text/plain; charset=utf-8");
          response.end(`User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);
        } else if (path === "/sitemap.xml") {
          const pages = ["", ...toolFiles, "data-sources.html"];
          response.setHeader("Content-Type", "application/xml; charset=utf-8");
          response.end(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((file) =>
            `  <url><loc>${new URL(file, site).href}</loc></url>`).join("\n")}\n</urlset>\n`);
        } else next();
      });
    },
    writeBundle(options) {
      const directory = options.dir || `${root}/dist`;
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
