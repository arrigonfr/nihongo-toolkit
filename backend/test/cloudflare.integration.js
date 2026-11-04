import test from "node:test";
import assert from "node:assert/strict";
import { access, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { openDatabase } from "../src/database.js";
import { segmentText } from "../src/tokenizer.js";
import { isPracticeKanji } from "../src/practice-kanji.js";

// Exercise the real web client and Worker against a local libSQL HTTP protocol fixture.
function libsqlResponse(db, stmt) {
  const args = (stmt.args || []).map((arg) => arg.type === "null" ? null
    : arg.type === "integer" ? Number(arg.value) : arg.value);
  const query = db.prepare(stmt.sql);
  const cols = query.columns().map((column) => ({ name: column.name, decltype: column.type }));
  const rows = query.all(...args).map((row) => cols.map(({ name }) => {
    const value = row[name];
    return value === null ? { type: "null" }
      : typeof value === "number" ? { type: Number.isInteger(value) ? "integer" : "float", value: Number.isInteger(value) ? String(value) : value }
        : { type: "text", value };
  }));
  return { cols, rows, affected_row_count: 0, last_insert_rowid: null };
}

test("Worker + Turso web client: API parity, practice filtering and lossless tokenizer", { timeout: 180000 }, async () => {
  await access("frontend/dist/_dictionary/base.gz");
  const directory = resolve(`backend/.cache/cloudflare-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  const local = openDatabase();
  let mf;
  let unavailable = false;
  try {
    const output = await build({
      entryPoints: ["backend/src/worker.js"],
      bundle: true, write: false, format: "esm", platform: "browser",
      external: ["node:*"],
      alias: { "#tokenizer-loader": resolve("backend/src/tokenizer-worker.js") }
    });
    const options = {
      name: "nihon-test", modules: true, script: output.outputFiles[0].text,
      compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
      defaultPersistRoot: directory,
      bindings: { TURSO_DATABASE_URL: "https://database.test", TURSO_AUTH_TOKEN: "test-token",
        SENTENCE_API_FALLBACK: "false", TRANSLATION_API_FALLBACK: "false", WORD_API_FALLBACK: "false" },
      outboundService: async (request) => {
        try {
          assert.equal(new URL(request.url).hostname, "database.test");
          assert.equal(request.headers.get("authorization"), "Bearer test-token");
          if (unavailable) return new Response("Database unavailable", { status: 503 });
          const body = await request.json();
          const sql = new Map();
          const results = body.requests.map((request) => {
            if (request.type === "close") return { type: "ok", response: { type: "close" } };
            if (request.type === "store_sql") {
              sql.set(request.sql_id, request.sql);
              return { type: "ok", response: { type: "store_sql" } };
            }
            if (request.type === "close_sql") {
              sql.delete(request.sql_id);
              return { type: "ok", response: { type: "close_sql" } };
            }
            assert.equal(request.type, "batch");
            const step_results = [];
            function matches(condition) {
              if (!condition) return true;
              if (condition.type === "ok") return step_results[condition.step] != null;
              if (condition.type === "not") return !matches(condition.cond);
              if (condition.type === "and") return condition.conds.every(matches);
              if (condition.type === "or") return condition.conds.some(matches);
              if (condition.type === "is_autocommit") return !local.isTransaction;
              throw new Error(`Unsupported batch condition: ${condition.type}`);
            }
            for (const { stmt, condition } of request.batch.steps) {
              step_results.push(matches(condition) ? libsqlResponse(local, { ...stmt, sql: stmt.sql ?? sql.get(stmt.sql_id) }) : null);
            }
            return { type: "ok", response: { type: "batch", result: { step_results, step_errors: [] } } };
          });
          return Response.json({ baton: null, base_url: null, results });
        } catch (error) {
          console.error("libSQL protocol fixture failed:", error);
          throw error;
        }
      },
      assets: { directory: resolve("frontend/dist"), binding: "ASSETS", workerName: "nihon-test",
        routerConfig: { invoke_user_worker_ahead_of_assets: true, has_user_worker: true },
        assetConfig: { html_handling: "none", not_found_handling: "404-page" } }
    };
    mf = new Miniflare(options);
    async function request(path, expected = 200, init) {
      const response = await mf.dispatchFetch(`https://nihon.test${path}`, init);
      const text = await response.text();
      assert.equal(response.status, expected, `${path}: ${text.slice(0, 500)}`);
      return { response, text, json: () => JSON.parse(text) };
    }
    assert.equal((await request("/api/health")).json().ready, true);
    const batch = (await request("/api/kanji/batch?limit=100")).json().items;
    assert.equal(batch.length, 100);
    assert.ok(batch.every((item) => isPracticeKanji(item.kanji, item.on_readings, item.kun_readings, item.meanings)));
    assert.ok(batch.every((item) => Array.isArray(item.components) && Array.isArray(item.examples)));
    const excludedBatch = (await request(`/api/kanji/batch?limit=100&exclude=${batch[0].id}`)).json().items;
    assert.equal(excludedBatch.length, 100);
    assert.ok(excludedBatch.every((item) => item.id !== batch[0].id));
    for (const path of [
      "/api/kanji/batch?level=1,2,3,4,5&limit=100&" + Array.from({ length: 100 }, (_, i) => `exclude=${900000 + i}`).join("&"),
      "/api/words/batch?limit=100&kanji=1&expand=1", "/api/word-search/vocabulary?level=5",
      "/api/kanji?level=5", "/api/kanji/日", "/api/kanji/日/words?limit=100",
      "/api/kanji/candidates?reading=にち", `/api/words?q=${encodeURIComponent("あ".repeat(30))}`,
      "/api/conjugator?random=true&level=5", "/api/shiritori/words?q=猫", "/api/shiritori/words?random=1",
      `/api/shiritori/words?prev=${encodeURIComponent(JSON.stringify({ word: "あ".repeat(60), reading: "あ".repeat(60) }))}`,
      "/api/sentences?q=猫"
    ]) await request(path);
    assert.match((await request("/api/kanji/日/strokes")).text, /<svg/);
    assert.ok((await request("/api/words?q=食べました")).json().data.length);
    assert.ok((await request("/api/conjugator?q=食べる")).json().items.length);
    for (const text of ["私は昨日学校に行きました。", "本を読んでいます。", "寿司を食べませんでした。",
      "これは高くなかった。", "すもももももももものうち", "ドイツ語はやさしい言語ではありません。", "猫 は\n元気です。🙂"]) {
      const tokens = (await request(`/api/analyze?text=${encodeURIComponent(text)}`)).json().tokens;
      const expected = await segmentText(text);
      assert.deepEqual(tokens.map(({ text, type }) => ({ text, type })), expected.map(({ text, type }) => ({ text, type })));
      assert.equal(tokens.map((token) => token.text).join(""), text);
      if (text === "本を読んでいます。") {
        const verb = tokens.find((token) => token.text === "読んでいます");
        assert.equal(verb.base, "読む");
        assert.equal(verb.reading, "よんでいます");
        assert.ok(verb.result);
      }
    }
    await request(`/api/analyze?text=${encodeURIComponent("猫は本を読む。".repeat(60))}`);
    for (const path of ["/", "/活用.html", "/_dictionary/tid.gz", "/api/missing"]) await request(path, 404);
    await request("/api/health", 403, { headers: { Origin: "https://untrusted.test" } });
    await request("/api/health", 204, { method: "OPTIONS", headers: { Origin: "https://nihon.test" } });
    await request("/api/health", 405, { method: "POST" });
    unavailable = true;
    await request("/api/health", 503);
    unavailable = false;
    assert.equal((await request("/api/health")).json().ready, true);
    await mf.setOptions({ ...options, bindings: {} });
    assert.equal((await request("/api/health", 503)).json().error, "Database unavailable");
  } finally {
    local.close();
    await mf?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
