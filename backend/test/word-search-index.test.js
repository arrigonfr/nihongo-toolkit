import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createDatabase } from "../src/database.js";
import { asyncDatabase } from "../src/async-database.js";
import { shiritoriWords } from "../src/shiritori.js";

const migration = readFileSync(new URL("../src/word-search-index.sql", import.meta.url), "utf8");

function insert(db, id, spelling, reading, alternate = spelling) {
  db.prepare(`INSERT INTO words
    (id, jmdict_id, word, reading, meanings, is_common, kanji_forms, kana_forms, senses)
    VALUES (?, ?, ?, ?, '["word"]', 1, ?, ?, ?)`).run(
    id, String(id), spelling, reading,
    JSON.stringify([...new Set([spelling, alternate])].map((text) => ({ text }))),
    JSON.stringify([{ text: reading, appliesToKanji: ["*"] }]),
    JSON.stringify([{ appliesToKanji: ["*"], appliesToKana: ["*"],
      partOfSpeech: ["n"], misc: [], gloss: [{ lang: "eng", text: "word" }] }])
  );
}

test("word-form migration backfills existing data, is repeatable and tracks edits/deletions", () => {
  const db = createDatabase(":memory:");
  try {
    db.exec(`DROP TRIGGER words_forms_insert; DROP TRIGGER words_forms_update;
      DROP TRIGGER words_forms_delete; DROP TABLE word_forms;
      DELETE FROM metadata WHERE key='word_forms_version'`);
    insert(db, 1, "猫", "ねこ", "ネコ");
    db.exec(migration);
    const forms = () => db.prepare("SELECT kind, form FROM word_forms ORDER BY kind, form").all();
    assert.deepEqual(forms().map((row) => row.form), ["ネコ", "猫", "ねこ"]);
    db.exec(migration);
    assert.equal(forms().length, 3);
    db.prepare("UPDATE words SET kana_forms=? WHERE id=1")
      .run(JSON.stringify([{ text: "ネコ", appliesToKanji: ["*"] }]));
    assert.equal(forms().some((row) => row.form === "ねこ"), false);
    insert(db, 2, "犬", "いぬ");
    assert.equal(forms().length, 5);
    db.prepare("DELETE FROM words WHERE id=1").run();
    assert.deepEqual(forms().map((row) => row.form), ["犬", "いぬ"]);
  } finally { db.close(); }
});

test("remote continuations use one indexed query, including alternate forms and lenient voicing", async () => {
  const source = createDatabase(":memory:");
  try {
    insert(source, 1, "子猫", "こねこ", "仔猫");
    insert(source, 2, "胡麻", "ゴマ");
    insert(source, 3, "学校", "がっこう");
    insert(source, 4, "別表記", "べつひょうき", "校庭");
    let queries = [];
    const remote = () => asyncDatabase({
      async batch(statements) {
        return statements.map(({ sql, args }) => {
          queries.push({ sql, args });
          const query = source.prepare(sql);
          return { columns: query.columns().map((c) => c.name), rows: query.all(...args) };
        });
      }
    });
    const search = async (previous, rules = {}) => {
      queries = [];
      return shiritoriWords(remote(), new URLSearchParams({
        prev: JSON.stringify(previous), rules: JSON.stringify(rules)
      }), { n: "noun" }, async () => []);
    };
    const pool = await search({ word: "りんご", reading: "りんご" }, { voicing: true });
    assert.deepEqual(new Set(pool.items.map((row) => row.word)), new Set(["子猫", "仔猫", "胡麻"]));
    assert.equal(queries.length, 1);
    const plan = source.prepare(`EXPLAIN QUERY PLAN ${queries[0].sql}`).all(...queries[0].args);
    const formLookups = plan.filter((row) => /SEARCH word_forms/.test(row.detail));
    assert.ok(formLookups.length > 0);
    assert.ok(formLookups.every((row) => /form>.*form</.test(row.detail)),
      "each prefix must constrain the form range, not scan all forms of a kind");
    assert.ok(!plan.some((row) => /SCAN word_forms/.test(row.detail)));
    const kanji = await search({ word: "学校", reading: "がっこう" }, { mode: "kanji" });
    assert.ok(kanji.items.some((row) => row.word === "校庭"));
    queries = [];
    const exact = await shiritoriWords(remote(), new URLSearchParams({ q: "仔猫", examples: "0" }), { n: "noun" }, async () => []);
    assert.deepEqual(exact.items.map((row) => row.word), ["仔猫"]);
    assert.equal(queries.length, 1, "validation must not wait for notebook examples");
  } finally { source.close(); }
});
