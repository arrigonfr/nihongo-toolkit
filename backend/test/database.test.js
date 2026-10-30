import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDatabase } from "../src/database.js";
import { insertKanjis, insertWords, insertVocabulary } from "../scripts/import-data.js";
import { createHandler, dictionaryRecord } from "../src/app.js";

function fixture() {
  const db = createDatabase(":memory:");
  insertKanjis(db, { characters: [{
    literal: "日", codepoints: [{ type: "ucs", value: "65e5" }], radicals: [{ type: "classical", value: 72 }],
    dictionaryReferences: [], queryCodes: [],
    misc: { grade: 1, strokeCounts: [4], jlptLevel: 4, frequency: 1, radicalNames: [], variants: [] },
    readingMeaning: { nanori: ["あ"], groups: [{
      readings: [{ type: "ja_on", value: "ニチ" }, { type: "ja_kun", value: "ひ" }],
      meanings: [{ lang: "en", value: "day" }, { lang: "es", value: "día" }]
    }] }
  }] }, new Map([["日", { level: 5 }]]));
  insertWords(db, { tags: { n: "noun" }, words: [{
    id: "1", kanji: [{ text: "日本", common: true, tags: [] }],
    kana: [{ text: "にほん", common: true, tags: [], appliesToKanji: ["日本"] },
      { text: "かな", common: false, tags: [], appliesToKanji: [] }],
    sense: [{
      gloss: [{ lang: "eng", text: "Japan" }], partOfSpeech: ["n"], misc: [], field: [], dialect: [],
      appliesToKanji: ["日本"], appliesToKana: ["にほん"], related: [], antonym: [], info: []
    }]
  }] });
  insertVocabulary(db, [{
    id: "study-1", jmdict_id: 1, word: "日本", reading: "にほん", romaji: "nihon",
    meanings: ["Japan"], level: "N5", examples: [{ ja: "日本です。", en: "It is Japan.", tatoeba_id: 123 }]
  }]);
  db.prepare("INSERT INTO strokes VALUES (?, ?)").run("日", '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return db;
}

test("import retains multilingual data, overlapping categories, old/new JLPT and links", () => {
  const db = fixture();
  try {
    const row = db.prepare("SELECT * FROM kanjis").get();
    assert.equal(row.unicode, "U+65E5");
    assert.deepEqual(JSON.parse(row.categories), ["Kyoiku", "Joyo"]);
    assert.equal(row.jlpt, 5);
    assert.equal(row.jlpt_old, 4);
    assert.equal(row.is_kokuji, null);
    assert.deepEqual(JSON.parse(row.meanings_by_language).es, ["día"]);
    assert.equal(db.prepare("SELECT count(*) AS n FROM kanji_words").get().n, 1);
    assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.throws(() => db.prepare("INSERT INTO kanji_words VALUES (999,1)").run(), /FOREIGN KEY/);
    const word = dictionaryRecord(db.prepare("SELECT * FROM words").get(), { n: "noun" });
    assert.deepEqual(word.japanese, [{ word: "日本", reading: "にほん" }, { reading: "かな" }]);
    assert.deepEqual(word.senses[0].parts_of_speech, ["noun"]);
  } finally { db.close(); }
});

test("API serves SQLite batches, search, relations and strokes with validation and CORS", async () => {
  const db = fixture();
  let fallbacks = 0;
  const server = createServer(createHandler({
    database: db, origins: ["http://localhost:5173"],
    sentenceFallback: async () => {
      fallbacks++;
      return [{ id: 999, japanese: "外部", english: "External", license: "CC BY 2.0 FR" }];
    }
  }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (path, options) => fetch(`${base}${path}`, options);
  try {
    const health = await get("/api/health");
    assert.equal(health.status, 200);
    assert.equal((await health.json()).counts.words, 1);
    db.prepare("DELETE FROM metadata WHERE key = 'jmdict_tags'").run();
    insertWords(db, { tags: { n: "noun" }, words: [
      { id: "2", kanji: [{ text: "海中", common: true, tags: [] }], kana: [{ text: "かいちゅう", common: true, tags: [], appliesToKanji: ["海中"] }], sense: [{ gloss: [{ lang: "eng", text: "underwater" }], partOfSpeech: ["n"], misc: [], field: [], dialect: [], appliesToKanji: [], appliesToKana: [], related: [], antonym: [], info: [] }] },
      { id: "3", kanji: [{ text: "水", common: false, tags: [] }], kana: [{ text: "みず", common: false, tags: [], appliesToKanji: ["水"] }], sense: [{ gloss: [{ lang: "eng", text: "water (cold)" }], partOfSpeech: ["n"], misc: [], field: [], dialect: [], appliesToKanji: [], appliesToKana: [], related: [], antonym: [], info: [] }] }
    ] });
    assert.equal((await (await get("/api/words?keyword=Water&limit=1")).json()).data[0].slug, "水");
    db.prepare("DELETE FROM metadata WHERE key = 'jmdict_tags'").run();
    insertWords(db, { tags: { n: "noun" }, words: [
      ["4", "露", "つゆ", "water", false], ["5", "井戸", "いど", "water well", true], ["6", "深水", "しんすい", "deep water", true]
    ].map(([id, word, reading, meaning, common]) => ({
      id, kanji: [{ text: word, common, tags: [] }], kana: [{ text: reading, common, tags: [], appliesToKanji: [word] }],
      sense: [{ gloss: [{ lang: "eng", text: meaning }], partOfSpeech: ["n"], misc: [], field: [], dialect: [], appliesToKanji: [], appliesToKana: [], related: [], antonym: [], info: [] }]
    })) });
    assert.deepEqual((await (await get("/api/words?keyword=Water&limit=5")).json()).data.map((item) => item.slug), ["露", "水", "井戸", "深水", "海中"]);
    const response = await get("/api/kanji/batch?limit=40&mode=both&level=5", { headers: { Origin: "http://localhost:5173" } });
    assert.equal(response.headers.get("access-control-allow-origin"), "http://localhost:5173");
    const { items } = await response.json();
    assert.equal(items.length, 1);
    assert.equal(items[0].kanji, "日");
    const candidates = await (await get("/api/kanji/candidates?reading=にち")).json();
    assert.deepEqual(candidates, { items: [{ kanji: "日" }] });
    assert.equal((await get("/api/kanji/candidates?reading=bad")).status, 400);
    assert.equal((await (await get("/api/kanji/batch?mode=reading&level=5,3")).json()).items[0].kanji, "日");
    assert.equal((await get("/api/kanji/batch?mode=reading&level=4,3")).status, 503);
    assert.equal((await get("/api/kanji/batch?mode=reading&level=none")).status, 503);
    assert.deepEqual(items[0].on_readings, ["ニチ"]);
    assert.deepEqual(items[0].radicals, [{
      type: "classical", value: 72, character: "日", name: "ひ・にち", meaning: "sun / day"
    }]);
    for (const key of ["variants", "dictionary_references", "query_codes", "reading_meaning", "codepoints"]) {
      assert.equal(key in items[0], false, key);
    }
    assert.equal(items[0].examples[0].word, "日本");
    assert.equal(items[0].examples[0].reading, "にほん");
    assert.deepEqual(items[0].examples[0].meanings, ["Japan"]);
    assert.equal(items[0].sentences[0].japanese, "日本です。");
    const words = await (await get("/api/words/batch?level=N5")).json();
    assert.equal(words.items[0].furigana, "にほん");
    assert.equal(words.items[0].level, 5);
    assert.equal(words.items[0].exampleSourceId, 123);
    const searchWords = await (await get("/api/word-search/vocabulary?level=5-4")).json();
    assert.equal(searchWords.items.length, 1);
    assert.equal(searchWords.items[0].word, "日本");
    assert.equal(searchWords.items[0].reading, "にほん");
    assert.equal(searchWords.items[0].meaning, "Japan");
    assert.equal(searchWords.items[0].level, 5);
    assert.deepEqual(await (await get("/api/word-search/vocabulary?level=1")).json(), { items: [] });
    assert.deepEqual(await (await get("/api/word-search/vocabulary?level=all")).json(), searchWords);
    assert.equal((await get("/api/word-search/vocabulary?level=6")).status, 400);
    assert.equal((await (await get(`/api/kanji/${encodeURIComponent("日")}/words`)).json()).items[0].slug, "日本");
    assert.equal((await (await get("/api/words?keyword=nihon")).json()).data[0].slug, "日本");
    assert.equal((await (await get("/api/sentences?q=nihon")).json()).data[0].id, 123);
    assert.equal(fallbacks, 0, "Local examples must not call the provider");
    assert.equal((await (await get("/api/words?keyword=nihon")).json()).data[0].examples[0].id, 123);
    assert.equal((await (await get("/api/sentences?q=missing")).json()).data[0].id, 999);
    assert.equal(fallbacks, 1);
    assert.equal((await get(`/api/kanji/${encodeURIComponent("日")}/strokes`)).headers.get("content-type"), "image/svg+xml; charset=utf-8");
    assert.equal((await (await get("/api/kanji?level=5&limit=1")).json()).nextOffset, null);
    for (const path of ["/api/words/batch?limit=0", "/api/words/batch?limit=101",
      "/api/kanji/batch?mode=bogus", "/api/kanji?level=6", "/api/kanji?level=", "/api/words?keyword=",
      "/api/kanji/two", "/api/kanji?offset=-1", "/api/%xx"]) {
      assert.equal((await get(path)).status, 400, path);
    }
    assert.equal((await get("/api/words/batch?exclude=study-1")).status, 503);
    assert.equal((await get("/api/words/batch?level=1")).status, 503);
    assert.equal((await get("/api/health", { headers: { Origin: "https://untrusted.example" } })).status, 403);
    assert.equal((await get("/api/health", { method: "OPTIONS", headers: { Origin: "http://localhost:5173" } })).status, 204);
    assert.equal((await get("/api/health", { method: "POST" })).status, 405);
    assert.equal((await get("/api/missing")).status, 404);
    assert.equal((await (await get("/api/words?keyword=%27%20OR%201%3D1--")).json()).data.length, 0);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
