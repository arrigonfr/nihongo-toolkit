import { defineConfig, loadEnv } from "vite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const toolFiles = readdirSync(root).filter((file) => file.endsWith(".html") && !["index.html", "data-sources.html", "文字.html"].includes(file));
const site = "https://nihon-tools.netlify.app/";

function toolNavigation() {
  return {
    name: "tool-navigation",
    transformIndexHtml: {
      order: "pre",
      handler(html, context) {
        const file = context.filename.split("/").pop();
        if (file === "文字.html") return html;
        const canonical = new URL(file === "index.html" ? "" : file, site).href;
        const tags = [{ tag: "link", attrs: { rel: "canonical", href: canonical }, injectTo: "head" }];
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
  if (env.NETLIFY === "true") {
    const backend = new URL(env.VITE_API_BASE_URL);
    if (backend.protocol !== "https:" || ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)) {
      throw new Error("Set VITE_API_BASE_URL to your deployed HTTPS Vercel URL in Netlify before building.");
    }
  }
  return {
  plugins: [toolNavigation()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: readdirSync(root).filter((file) => file.endsWith(".html"))
        .map((file) => fileURLToPath(new URL(file, import.meta.url)))
    }
  }
  };
});
