import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { Miniflare } from "miniflare";

test("real Worker/D1 migration, concurrent UPSERTs, CORS and isolation from Turso", { timeout: 60000 }, async () => {
  const directory = resolve(`backend/.cache/page-views-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  let mf;
  try {
    const output = await build({
      entryPoints: ["backend/src/worker.js"], bundle: true, write: false,
      format: "esm", platform: "browser", external: ["node:*"],
      alias: { "#tokenizer-loader": resolve("backend/src/tokenizer-worker.js") }
    });
    mf = new Miniflare({
      modules: true, script: output.outputFiles[0].text,
      compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
      defaultPersistRoot: directory, d1Databases: ["PAGE_VIEWS_DB"],
      bindings: { TRACK_VISITS: "true", ALLOWED_ORIGINS: "https://nihongo-toolkit.pages.dev" },
      outboundService: () => { throw new Error("No external requests are permitted"); }
    });
    const db = await mf.getD1Database("PAGE_VIEWS_DB");
    await db.exec((await readFile("backend/migrations/page-views/0001_daily_page_views.sql", "utf8")).replace(/\n/g, " "));
    const url = "https://worker.test/api/page-views";
    const headers = { Origin: "https://nihongo-toolkit.pages.dev", "Content-Type": "application/json" };
    const options = await mf.dispatchFetch(url, { method: "OPTIONS", headers: { ...headers, "Access-Control-Request-Method": "POST" } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-methods"), "POST, OPTIONS");
    assert.equal(options.headers.get("access-control-allow-origin"), headers.Origin);
    const responses = await Promise.all(Array.from({ length: 40 }, (_, i) => mf.dispatchFetch(url, {
      method: "POST", headers, body: JSON.stringify({ page: i < 30 ? "/fumitoki.html" : "/" })
    })));
    assert.ok(responses.every((response) => response.status === 202));
    let rows;
    for (let i = 0; i < 100; i++) {
      rows = (await db.prepare("SELECT * FROM daily_page_views ORDER BY page").all()).results;
      if (rows.reduce((total, row) => total + row.views, 0) === 40) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(rows.length, 2);
    assert.deepEqual(rows.map((row) => row.views), [10, 30]);
    assert.ok(rows.every((row) => row.date === row.updated_at.slice(0, 10) && row.updated_at.endsWith("Z")));
    assert.deepEqual((await db.prepare("PRAGMA table_info(daily_page_views)").all()).results.map((row) => row.name), ["date", "page", "views", "updated_at"]);
    await assert.rejects(db.prepare("INSERT INTO daily_page_views VALUES ('2026-01-01', '/', -1, 'now')").run());
    const rejected = await mf.dispatchFetch(url, { method: "POST", headers: { ...headers, Origin: "https://evil.test" }, body: '{"page":"/"}' });
    assert.equal(rejected.status, 403);
    assert.equal(rejected.headers.get("access-control-allow-origin"), null);
    // No Turso credentials are present: success above proves storage independence.
    assert.equal((await mf.dispatchFetch(url)).status, 405);
    await mf.setOptions({
      modules: true, script: output.outputFiles[0].text,
      compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
      defaultPersistRoot: directory,
      bindings: { TRACK_VISITS: "false" },
      outboundService: () => { throw new Error("No external requests are permitted"); }
    });
    assert.equal((await mf.dispatchFetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"page":"/"}' })).status, 503, "disabled Worker needs neither D1 nor Turso");
  } finally {
    await mf?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
