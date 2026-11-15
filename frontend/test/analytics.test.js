import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pageFile, publicPath } from "../src/routes.js";
import { runInNewContext } from "node:vm";
import config from "../vite.config.js";

test("public URLs and tool identifiers round-trip across clean and HTML routes", () => {
  assert.equal(pageFile("/favicon.svg"), "favicon.svg");
  assert.equal(pageFile("/kanji-stroke-orders-license.txt"), "kanji-stroke-orders-license.txt");
  for (const file of ["index.html", "kana.html", "kanji-chizucho.html", "data-sources.html"]) {
    assert.equal(pageFile(`/${publicPath(file)}`), file);
    assert.equal(pageFile(`/${file}`), file);
  }
});

test("deployment metadata and sitemap use final clean URLs and explicit site identity", () => {
  const previousSite = process.env.VITE_SITE_URL;
  const site = "https://nihongo-toolkit.pages.dev/";
  const directory = mkdtempSync(join(tmpdir(), "nihon-seo-"));
  try {
    process.env.VITE_SITE_URL = site;
    const { plugins } = config({ mode: "test" });
    const navigation = plugins.find((plugin) => plugin.name === "tool-navigation");
    plugins.find((plugin) => plugin.name === "deployment-seo").writeBundle({ dir: directory });
    const sitemap = readFileSync(join(directory, "sitemap.xml"), "utf8");
    assert.equal((sitemap.match(/<loc>/g) || []).length, 17);
    assert.ok(!sitemap.includes(".html"));
    assert.equal(readFileSync(join(directory, "robots.txt"), "utf8"), `User-agent: *\nAllow: /\n\nSitemap: ${site}sitemap.xml\n`);
    const root = new URL("../", import.meta.url);
    for (const file of readdirSync(root).filter((name) => name.endsWith(".html") && name !== "文字.html")) {
      const result = navigation.transformIndexHtml.handler(readFileSync(new URL(file, root), "utf8"), { filename: new URL(file, root).pathname });
      const canonical = result.tags.find((tag) => tag.attrs?.rel === "canonical").attrs.href;
      assert.equal(canonical, new URL(publicPath(file), site).href);
      assert.ok(sitemap.includes(`<loc>${canonical}</loc>`));
      assert.ok(!/href="\.\/[^"?#]+\.html/.test(result.html));
      assert.ok(!result.html.includes('class="dashboard-back"'));
      if (file === "index.html") {
        const data = JSON.parse(result.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        assert.equal(data.url, undefined);
        assert.equal(data["@graph"].length, 3);
        const identity = data["@graph"][0];
        assert.equal(identity["@type"], "WebSite");
        assert.equal(identity.name, "Nihongo Toolkit");
        assert.equal(identity.url, site);
        assert.ok(identity.alternateName.includes(new URL(site).hostname));
        assert.equal(identity.publisher.name, identity.name);
        assert.equal(identity.publisher.logo.url, `${site}logo.svg`);
        assert.notEqual(identity.publisher["@id"], data["@graph"][1]["@id"]);
        assert.notEqual(identity.publisher.logo["@id"], identity["@id"]);
        assert.equal(data["@graph"][2].screenshot, `${site}og-image.png`);
        assert.ok(!/FSRS|Cloud sync|AI-powered/.test(JSON.stringify(data)));
      }
      const meta = (name) => result.tags.find((tag) => (tag.attrs?.property || tag.attrs?.name) === name)?.attrs.content;
      assert.equal(meta("og:image"), `${site}og-image.png`);
      assert.equal(meta("twitter:image"), meta("og:image"));
      assert.equal(meta("twitter:card"), "summary_large_image");
      assert.equal(meta("og:image:width"), "1200");
      assert.equal(meta("og:image:height"), "630");
    }
  } finally {
    if (previousSite === undefined) delete process.env.VITE_SITE_URL;
    else process.env.VITE_SITE_URL = previousSite;
    rmSync(directory, { recursive: true, force: true });
  }
});

test("social assets have the dimensions declared in metadata", () => {
  const image = readFileSync(new URL("../public/og-image.png", import.meta.url));
  assert.equal(image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  const logo = readFileSync(new URL("../public/logo.svg", import.meta.url), "utf8");
  assert.match(logo, /width="512" height="512"/);
});

test("all graph identities and image URLs follow a configured production domain", () => {
  const previousSite = process.env.VITE_SITE_URL;
  try {
    process.env.VITE_SITE_URL = "https://example.com";
    const navigation = config({ mode: "test" }).plugins.find((plugin) => plugin.name === "tool-navigation");
    const index = new URL("../index.html", import.meta.url);
    const result = navigation.transformIndexHtml.handler(readFileSync(index, "utf8"), { filename: index.pathname });
    const data = JSON.parse(result.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    const [website, webpage, application] = data["@graph"];
    assert.equal(website.url, "https://example.com/");
    assert.equal(website["@id"], "https://example.com/#website");
    assert.equal(webpage.isPartOf["@id"], website["@id"]);
    assert.equal(website.publisher.logo.url, "https://example.com/logo.svg");
    assert.equal(website.publisher.logo.contentUrl, website.publisher.logo.url);
    assert.equal(application.screenshot, "https://example.com/og-image.png");
    assert.ok(!JSON.stringify(data).includes("nihongo-toolkit.pages.dev"));
  } finally {
    if (previousSite === undefined) delete process.env.VITE_SITE_URL;
    else process.env.VITE_SITE_URL = previousSite;
  }
});

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
