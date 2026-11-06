import test from "node:test";
import assert from "node:assert/strict";
import { createSentenceFallback, localExamples, localExamplesMany, shuffleExamples } from "../src/examples.js";
import { DatabaseSync } from "node:sqlite";
import { asyncDatabase } from "../src/async-database.js";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDatabase } from "../src/database.js";
import { createHandler } from "../src/app.js";

test("bulk examples preserve deduplication, ordering and provenance with bounded returned rows", async () => {
  const source = new DatabaseSync(":memory:");
  source.exec(`CREATE TABLE vocabulary (word_id INTEGER, examples TEXT, word TEXT DEFAULT '日本',
      reading TEXT DEFAULT 'にほん', romaji TEXT DEFAULT 'nihon', other_forms TEXT DEFAULT '[]');
    CREATE TABLE word_forms (kind INTEGER, form TEXT, word_id INTEGER, PRIMARY KEY(kind, form, word_id));
    INSERT INTO word_forms VALUES (0, '別表記', 1);
    CREATE TABLE sentences (id INTEGER PRIMARY KEY, source TEXT, source_id TEXT, ja TEXT, en TEXT, license TEXT, attribution TEXT);
    CREATE TABLE word_sentences (word_id INTEGER, sentence_id INTEGER, PRIMARY KEY(word_id, sentence_id));`);
  const native = [1, 2, 3].map((id) => ({ ja: `文${id}`, en: `Sentence ${id}`, tatoeba_id: id }));
  for (const id of [1, 2, 3]) source.prepare("INSERT INTO vocabulary (word_id, examples) VALUES (?, ?)").run(id, JSON.stringify(native.slice(0, id === 2 ? 0 : id === 3 ? 3 : 2)));
  for (let id = 1; id <= 140; id++) {
    source.prepare("INSERT INTO sentences VALUES (?, ?, ?, ?, ?, ?, ?)").run(
      id, id % 2 ? "tatoeba" : "ai-generated", String(id), `文${Math.ceil(id / 2)}`, `Sentence ${id}`, "test", JSON.stringify({ reviewed: id % 4 === 0, owner: "author" })
    );
    for (const wordId of [1, 2, 3]) source.prepare("INSERT INTO word_sentences VALUES (?, ?)").run(wordId, id);
  }
  let count = 0, returned = 0;
  const counted = asyncDatabase({ prepare(sql) {
    const stmt = source.prepare(sql);
    return { all(...args) {
      count++;
      const rows = stmt.all(...args);
      if (sql.includes("WITH candidates")) returned += rows.length;
      return rows;
    } };
  } });
  try {
    const bulk = await localExamplesMany(counted, [1, 2, 3, 1]);
    assert.equal(count, 3);
    assert.ok(returned <= 10);
    for (const id of [1, 2, 3]) assert.deepEqual(bulk.get(id), await localExamples(source, { wordId: id }));
    assert.deepEqual(await localExamples(source, { query: "別表記" }), bulk.get(2),
      "deferred notebook lookups resolve alternate indexed spellings");
  } finally { source.close(); }
});

test("local examples retain source furigana", async () => {
  const db = { prepare: () => ({ all: () => [{ examples: JSON.stringify([
    { ja: "食べる", furigana: "{食|た}べる", en: "Eat.", tatoeba_id: 1 }
  ]) }] }) };
  assert.equal((await localExamples(db, { wordId: 1 }))[0].furigana, "{食|た}べる");
});

test("local query examples must contain the requested spelling or annotated reading", async () => {
  const db = { prepare: () => ({ all: () => [{ examples: JSON.stringify([
    { ja: "猫です。", en: "A cat." },
    { ja: "日本です。", furigana: "{日本|にほん}です。", en: "Japan." }
  ]) }] }) };
  assert.deepEqual((await localExamples(db, { query: "日本" })).map((item) => item.japanese), ["日本です。"]);
  assert.deepEqual((await localExamples(db, { query: "にほん" })).map((item) => item.japanese), ["日本です。"]);
  assert.deepEqual(await localExamples(db, { query: "犬" }), []);
});

test("sentence fallback validates matches, keeps attribution, caches and coalesces requests", async () => {
  let calls = 0;
  const lookup = createSentenceFallback({ enabled: true, fetchImpl: async (url) => {
    calls++;
    assert.equal(url.hostname, "api.tatoeba.org");
    assert.equal(url.searchParams.get("sort"), "random");
    assert.equal(url.searchParams.get("q"), "日本");
    return { ok: true, json: async () => ({ data: [
      { id: 1, text: "日本です。", lang: "jpn", owner: "author", license: "CC BY 2.0 FR",
        translations: [{ id: 2, lang: "eng", text: "It is Japan.", owner: "translator" }] },
      { id: 3, text: "本日です。", lang: "jpn", translations: [{ lang: "eng", text: "Today." }] },
      { id: 4, text: "日本です。", lang: "jpn", translations: [{ lang: "eng", text: "Duplicate." }] },
      { id: 5, text: "日本", lang: "jpn", translations: [] }
    ] }) };
  } });
  const [a, b] = await Promise.all([lookup("日本"), lookup("日本")]);
  assert.deepEqual(a, b);
  assert.equal(a.length, 1);
  assert.equal(a[0].owner, "author");
  assert.equal(a[0].translationOwner, "translator");
  assert.equal(a[0].translationId, 2);
  await lookup("日本");
  assert.equal(calls, 1);
});

test("random sampling keeps all candidates without mutating the cached pool", () => {
  const pool = [1, 2, 3, 4, 5];
  const shuffled = shuffleExamples(pool, () => 0);
  assert.deepEqual(pool, [1, 2, 3, 4, 5]);
  assert.notDeepEqual(shuffled, pool);
  assert.deepEqual([...shuffled].sort(), pool);
});

test("sentence endpoint supplements local examples, excludes displayed sentences and reports provider errors", async () => {
  const db = createDatabase(":memory:");
  db.prepare("INSERT INTO vocabulary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    "test", null, "日本", "にほん", "nihon", '["Japan"]', 5, "[]",
    JSON.stringify([{ ja: "日本です。", en: "It is Japan.", tatoeba_id: 1 }]), "[]", "[]"
  );
  let calls = 0;
  let failing = false;
  const server = createServer(createHandler({ database: db, sentenceFallback: async () => {
    calls++;
    if (failing) throw new Error("Offline");
    return [{ id: 2, japanese: "日本に住む。", english: "I live in Japan.", translationId: 3, owner: "author" }];
  } }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const get = (params) => fetch(`http://127.0.0.1:${server.address().port}/api/sentences?${new URLSearchParams({ q: "日本", ...params })}`);
  try {
    const local = await (await get({})).json();
    assert.equal(local.data[0].text, "日本です。");
    assert.equal(calls, 0);
    const random = await (await get({ random: "1", exclude: '["日本です。"]' })).json();
    assert.equal(random.data.length, 1);
    assert.equal(random.data[0].text, "日本に住む。");
    assert.equal(random.data[0].translations[0].id, 3);
    assert.equal(calls, 1);
    failing = true;
    const saved = await (await get({ random: "1" })).json();
    assert.equal(saved.data[0].text, "日本です。");
    assert.match(saved.warning, /Online examples are unavailable/);
    assert.equal((await get({ q: "未登録" })).status, 502);
    assert.equal((await get({ exclude: "{}" })).status, 400);
    assert.equal((await get({ exclude: "[" })).status, 400);
  } finally { server.close(); await once(server, "close"); db.close(); }
});

test("sentence fallback can be disabled and provider failures are not cached as empty results", async () => {
  const disabled = createSentenceFallback({ enabled: false, fetchImpl: () => assert.fail("Must not fetch") });
  assert.deepEqual(await disabled("日本"), []);
  let calls = 0;
  const failing = createSentenceFallback({ enabled: true, fetchImpl: async () => {
    calls++;
    return { ok: false, status: 429 };
  } });
  await assert.rejects(failing("日本"), /429/);
  await assert.rejects(failing("日本"), /429/);
  assert.equal(calls, 2);
});
