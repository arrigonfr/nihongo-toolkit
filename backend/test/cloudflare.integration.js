import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdir, rm, access } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { openDatabase } from "../src/database.js";
import { isPracticeKanji } from "../src/practice-kanji.js";
import { segmentText } from "../src/tokenizer.js";
import { asyncDatabase } from "../src/async-database.js";
import { createDatabase } from "../src/database.js";
import { exportD1 } from "../scripts/export-d1.js";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

test("Worker + real D1 integration: migrations, batched enrichment, all API families, static pages and lossless tokenizer", { timeout: 180000 }, async (t) => {
  await access("frontend/dist/_dictionary/base.gz").catch(() => {
    throw new Error("Run npm run build:cloudflare before the Cloudflare integration test.");
  });

  await t.test("Wrangler local import stops at budget, resumes, skips completed files and refuses another snapshot", { timeout: 120000 }, async () => {
    const directory = resolve(`backend/.cache/import-${randomUUID()}`);
    await mkdir(directory, { recursive: true });
    const source = createDatabase(":memory:");
    const require = createRequire(import.meta.url);
    function run(args) {
      return spawnSync(process.execPath, args, { encoding: "utf8",
        env: { ...process.env, WRANGLER_SEND_METRICS: "false" }, maxBuffer: 5 * 1024 * 1024 });
    }
    try {
      source.prepare("INSERT INTO metadata VALUES (?, ?)").run("test", "first snapshot");
      await exportD1(source, `${directory}/export`);
      const migrations = run([join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js"), "d1", "migrations", "apply",
        "DB", "--local", "--persist-to", `${directory}/state`]);
      assert.equal(migrations.status, 0, migrations.stderr + migrations.stdout);
      const args = ["backend/scripts/import-d1.js", "--input", `${directory}/export`, "--persist-to", `${directory}/state`];
      const stopped = run([...args, "--budget", "1"]);
      assert.equal(stopped.status, 2, stopped.stderr + stopped.stdout);
      assert.match(stopped.stdout, /daily budget/);
      const imported = run([...args, "--budget", "100"]);
      assert.equal(imported.status, 0, imported.stderr + imported.stdout);
      assert.match(imported.stdout, /Counts and foreign keys verified/);
      const replayed = run([...args, "--budget", "100"]);
      assert.equal(replayed.status, 0, replayed.stderr + replayed.stdout);
      assert.doesNotMatch(replayed.stdout, /Importing \d/);
      source.prepare("UPDATE metadata SET value = ?").run("different snapshot");
      await exportD1(source, `${directory}/other`);
      const other = run(["backend/scripts/import-d1.js", "--input", `${directory}/other`, "--persist-to", `${directory}/state`]);
      assert.notEqual(other.status, 0);
      assert.match(other.stderr, /different export/);
    } finally {
      source.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
  const directory = resolve(`backend/.cache/cloudflare-${randomUUID()}`);
  await mkdir(directory, { recursive: true });
  let mf;
  const local = openDatabase();
  try {
    const output = await build({
      stdin: {
        contents: `import worker from "./backend/src/worker.js";
          export default { async fetch(request, env) {
            let batches = 0;
            const DB = {
              prepare(sql) { const stmt = env.DB.prepare(sql); return {
                bind(...args) { if(args.length > 100) throw Error("D1 parameter limit"); return stmt.bind(...args); }
              }; },
              batch(stmts) { if (++batches > 50) throw Error("D1 query limit"); return env.DB.batch(stmts); }
            };
            const response = await worker.fetch(request, { ...env, DB });
            const result = new Response(response.body, response);
            result.headers.set("X-Test-Batches", batches);
            return result;
          } };`,
        resolveDir: resolve(".")
      },
      bundle: true, write: false, format: "esm", platform: "node",
      alias: { "#tokenizer-loader": resolve("backend/src/tokenizer-worker.js") }
    });
    mf = new Miniflare({
      name: "nihon-test", modules: true, script: output.outputFiles[0].text,
      compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
      defaultPersistRoot: directory,
      d1Databases: { DB: "nihon-integration" },
      bindings: { SENTENCE_API_FALLBACK: "false", TRANSLATION_API_FALLBACK: "false", WORD_API_FALLBACK: "false" },
      assets: { directory: resolve("frontend/dist"), binding: "ASSETS", workerName: "nihon-test",
        routerConfig: { invoke_user_worker_ahead_of_assets: true, has_user_worker: true },
        assetConfig: { html_handling: "none", not_found_handling: "404-page" } }
    });
    const db = await mf.getD1Database("DB");
    const schema = await readFile("backend/migrations/0001_dictionary.sql", "utf8");
    for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    // Reapplying our schema is harmless (Wrangler additionally tracks versions).
    for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) await db.prepare(statement).run();
    const kanjis = local.prepare("SELECT * FROM kanjis WHERE jlpt = 5 OR character IN ('読','食','学','日','猫')").all();
    const words = local.prepare(`SELECT DISTINCT w.* FROM words w JOIN vocabulary v ON v.word_id = w.id
      WHERE v.jlpt = 5 LIMIT 300`).all();
    for (const row of local.prepare("SELECT * FROM words WHERE word IN ('読む','食べる','学校','本','猫','行く','すもも')").all()) {
      if (!words.some((word) => word.id === row.id)) words.push(row);
    }
    const wordIds = new Set(words.map((row) => row.id));
    const kanjiIds = new Set(kanjis.map((row) => row.id));
    async function insert(table, rows) {
      for (let i = 0; i < rows.length; i += 100) {
        await db.batch(rows.slice(i, i + 100).map((row) => db.prepare(
          `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.keys(row).map(() => "?").join(",")})`
        ).bind(...Object.values(row))));
      }
    }
    await insert("kanjis", kanjis);
    await insert("words", words);
    await insert("vocabulary", local.prepare("SELECT * FROM vocabulary").all().filter((row) => wordIds.has(row.word_id)));
    await insert("kanji_words", local.prepare("SELECT * FROM kanji_words").all().filter((row) => wordIds.has(row.word_id) && kanjiIds.has(row.kanji_id)));
    await insert("metadata", local.prepare("SELECT * FROM metadata").all());
    await insert("strokes", local.prepare("SELECT * FROM strokes").all().filter((row) => kanjis.some((k) => k.character === row.character)));
    await insert("practice_kanjis", kanjis.filter((row) =>
      isPracticeKanji(row.character, JSON.parse(row.on_readings), JSON.parse(row.kun_readings), JSON.parse(row.meanings)))
      .map((row) => ({ kanji_id: row.id })));
    let batches = 0;
    const adapter = asyncDatabase({ prepare: (sql) => db.prepare(sql), batch: (stmts) => { batches++; return db.batch(stmts); } });
    const results = await Promise.all(Array.from({ length: 100 }, (_, i) => adapter.prepare("SELECT ? AS n").get(i)));
    assert.equal(results[99].n, 99);
    assert.equal(batches, 1);
    await adapter.prepare("SELECT ? AS n").get(99);
    assert.equal(batches, 1, "request cache avoids duplicate lookups");

    async function request(path, expected = 200, init) {
      const response = await mf.dispatchFetch(`https://nihon.test${path}`, init);
      const text = await response.text();
      assert.equal(response.status, expected, `${path}: ${text.slice(0, 500)}`);
      assert.ok(Number(response.headers.get("X-Test-Batches")) < 40, path);
      return { response, text, json: () => JSON.parse(text) };
    }
    assert.equal((await request("/api/health")).json().ready, true);
    const batch = (await request("/api/kanji/batch?limit=100")).json().items;
    assert.ok(batch.length > 50);
    assert.ok(batch.every((item) => Array.isArray(item.components) && Array.isArray(item.examples)));
    const excludedBatch = (await request(`/api/kanji/batch?limit=100&exclude=${batch[0].id}`)).json().items;
    assert.ok(excludedBatch.every((item) => item.id !== batch[0].id));
    await request("/api/kanji/batch?level=1,2,3,4,5&limit=100&" + Array.from({ length: 100 }, (_, i) => `exclude=${900000 + i}`).join("&"));
    await request("/api/words/batch?limit=100&kanji=1&expand=1");
    await request("/api/word-search/vocabulary?level=5");
    await request("/api/kanji?level=5");
    await request("/api/kanji/日");
    await request("/api/kanji/日/words?limit=100");
    assert.match((await request("/api/kanji/日/strokes")).text, /<svg/);
    await request("/api/kanji/candidates?reading=にち");
    assert.ok((await request("/api/words?q=食べました")).json().data.length);
    await request(`/api/words?q=${encodeURIComponent("あ".repeat(30))}`);
    assert.ok((await request("/api/conjugator?q=食べる")).json().items.length);
    await request("/api/conjugator?random=true&level=5");
    await request("/api/shiritori/words?q=猫");
    await request("/api/shiritori/words?random=1");
    await request(`/api/shiritori/words?prev=${encodeURIComponent(JSON.stringify({ word: "あ".repeat(60), reading: "あ".repeat(60) }))}`);
    await request("/api/sentences?q=猫");
    const sentences = ["私は昨日学校に行きました。", "本を読んでいます。", "寿司を食べませんでした。",
      "これは高くなかった。", "すもももももももものうち", "ドイツ語はやさしい言語ではありません。", "猫 は\n元気です。🙂"];
    for (const text of sentences) {
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
    assert.match((await request("/")).text, /<!doctype html>/i);
    await request("/活用.html");
    await request("/api/missing", 404);
    await request("/api/health", 403, { headers: { Origin: "https://untrusted.test" } });
    await request("/api/health", 204, { method: "OPTIONS", headers: { Origin: "https://nihon.test" } });
    await request("/api/health", 405, { method: "POST" });
    assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
  } finally {
    local.close();
    await mf?.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
