import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createDatabase } from "../src/database.js";
import { insertKanjis, insertWords } from "../scripts/import-data.js";
import {
  checkTranslation, ensureTranslationSchema, syncTranslations, pickTatoebaTranslation, splitModelOutput, parseTatoebaLinks, parseTatoebaSentences,
  translationItem, translationItems, translationStatus, translationWriter, validateTranslation
} from "../scripts/translation-lib.js";

function fixture() {
  const db = createDatabase(":memory:");
  insertKanjis(db, { characters: [{
    literal: "日", codepoints: [], radicals: [], dictionaryReferences: [], queryCodes: [],
    misc: { grade: 1, strokeCounts: [4], jlptLevel: 4, frequency: 1, radicalNames: [], variants: [] },
    readingMeaning: { nanori: [], groups: [{ readings: [{ type: "ja_on", value: "ニチ" }],
      meanings: [{ lang: "en", value: "day" }, { lang: "en", value: "sun" }] }] }
  }] }, new Map([["日", { level: 5 }]]));
  insertWords(db, { tags: {}, words: [{
    id: "1", kanji: [{ text: "日本", common: true, tags: [] }],
    kana: [{ text: "にほん", common: true, tags: [], appliesToKanji: ["日本"] }],
    sense: [
      { gloss: [{ lang: "eng", text: "Japan" }], partOfSpeech: ["n"], info: [] },
      { gloss: [{ lang: "spa", text: "Japón" }], partOfSpeech: ["n"], info: [] }
    ]
  }] });
  db.exec(readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8"));
  db.prepare(`INSERT INTO sentences (id, ja, en, source, license, attribution) VALUES (?, ?, ?, ?, ?, ?)`)
    .run("7", "日本です。", "It is Japan.", "tatoeba", "CC BY 2.0 FR", "Tatoeba contributors (plain text)");
  ensureTranslationSchema(db);
  return db;
}

test("translation items keep English sense alignment and tolerate plain-text attribution", () => {
  const db = fixture();
  assert.deepEqual([...translationItems(db, "sense")].map((item) => [item.item_id, item.english]), [["1:0", ["Japan"]]]);
  assert.deepEqual(translationItem(db, "sentence", "7").attribution, { text: "Tatoeba contributors (plain text)" });
  assert.deepEqual(translationItem(db, "kanji", "日").english, ["day", "sun"]);
  db.close();
});

test("machine translations never replace current human rows and stale rows become pending", () => {
  const db = fixture();
  const write = translationWriter(db);
  const item = translationItem(db, "kanji", "日");
  write({ item, lang: "es", value: ["día", "sol"], method: "human", source: "KANJIDIC2" });
  assert.equal(write({ item, lang: "es", value: ["dia"], method: "machine", source: "model" }), 0);
  assert.equal(db.prepare("SELECT value FROM content_translations").get().value, '["día","sol"]');
  assert.equal(translationStatus(db, "kanji", "es").counts.human, 1);

  db.prepare("UPDATE kanjis SET meanings = ?").run('["day","sun","Japan"]');
  const { counts, pending } = translationStatus(db, "kanji", "es");
  assert.equal(counts.stale, 1);
  assert.equal(write({ item: pending[0], lang: "es", value: ["día", "sol", "Japón"], method: "machine", source: "model" }), 1);
  db.close();
});

test("translation validation rejects malformed output", () => {
  const sentence = { kind: "sentence", item_id: 1, english: ["Hi."] };
  assert.throws(() => validateTranslation(sentence, []), /non-empty/);
  assert.throws(() => validateTranslation(sentence, ["Hola.", "Buenas."]), /exactly one/);
  assert.throws(() => validateTranslation(sentence, ["  "]), /empty/);
  assert.throws(() => validateTranslation(sentence, ["a\u0000b"]), /control/);
  assert.deepEqual(validateTranslation(sentence, [" Hola. "]), ["Hola."]);
});

test("Tatoeba picking uses the lowest existing direct translation", () => {
  const links = parseTatoebaLinks("10\t30\n10\t20\n10\t99\n");
  const sentences = parseTatoebaSentences("20\tspa\tHola.\talice\n30\tspa\tBuenas.\t\\N\n40\tpor\tOlá.\tbob\n", "spa");
  assert.deepEqual(pickTatoebaTranslation(10, links, sentences), { id: 20, text: "Hola.", owner: "alice" });
  assert.equal(pickTatoebaTranslation(11, links, sentences), null);
});

test("machine output checks dedupe glosses and reject garbled or incomplete text", () => {
  const push = { kind: "sense", item_id: "1:0", english: ["to push", "to shove", "to thrust"] };
  assert.deepEqual(checkTranslation(push, splitModelOutput(push, "empujar; Empujar; empujar")), { value: ["empujar"], issue: null });
  const pool = { kind: "sense", item_id: "2:0", english: ["(swimming) pool"] };
  assert.deepEqual(splitModelOutput(pool, "(piscina);"), ["(piscina)"]);
  const bind = { kind: "sense", item_id: "5:0", english: ["to bind"] };
  assert.deepEqual(splitModelOutput(bind, "atar; unir; sujetar"), ["atar"], "single-gloss synonym lists keep the first");
  const hold = { kind: "sense", item_id: "6:0", english: ["to hold (a play, festival, etc.)"] };
  assert.deepEqual(splitModelOutput(hold, "organizar; realizar (una obra, un festival, etc.)"), ["realizar (una obra, un festival, etc.)"]);
  assert.equal(splitModelOutput(push, "empujar; empellar"), null, "multi-gloss lists must stay aligned");
  assert.equal(checkTranslation(pool, ["(piscina)"]).issue, "only a parenthetical");
  assert.equal(checkTranslation(pool, ["piscina (de natación)"]).issue, null);

  const sentence = (english) => ({ kind: "sentence", item_id: "3", english: [english] });
  assert.equal(checkTranslation(sentence("He was summoned to appear in court."), ["He was summoned to appear in court."]).issue, "untranslated");
  assert.equal(checkTranslation(sentence("Would you please stop singing so loudly? This is not a cheap drinking place."),
    ["¿Podrías dejar de cantar tan fuerte?"]).issue, "dropped sentence");
  assert.equal(checkTranslation(sentence("Hi! How are you?"), ["Hola, ¿cómo estás?"]).issue, null, "merged sentences are kept");
  assert.equal(checkTranslation(sentence("They love each other."), ["Se aman."]).issue, null);
  assert.equal(checkTranslation(sentence("I see."), ["Ya veo ya veo ya veo."]).issue, "repetition loop");
});

test("Turso sync upserts only rows changed since the last sync, including human replacements", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:");
  const client = {
    executeMultiple: async (sql) => remote.exec(sql),
    execute: async (sql) => ({ rows: remote.prepare(sql).all() }),
    batch: async (statements) => {
      remote.exec("BEGIN");
      for (const { sql, args } of statements) remote.prepare(sql).run(...args);
      remote.exec("COMMIT");
    }
  };
  const write = translationWriter(db);
  const kanji = translationItem(db, "kanji", "日"), sense = translationItem(db, "sense", "1:0");
  write({ item: kanji, lang: "es", value: ["día"], method: "machine", source: "model" });
  write({ item: sense, lang: "pt", value: ["Japão"], method: "machine", source: "model" });
  assert.deepEqual(await syncTranslations(db, client, "turso", { batchSize: 1 }), { synced: 2, mismatches: [] });

  db.prepare("UPDATE content_translations SET updated_at = ?").run(new Date(Date.now() - 300_000).toISOString());
  db.prepare("UPDATE translation_sync SET synced_until = ?").run(new Date(Date.now() - 240_000).toISOString());
  write({ item: kanji, lang: "es", value: ["día", "sol"], method: "human", source: "KANJIDIC2" });
  assert.deepEqual(await syncTranslations(db, client, "turso"), { synced: 1, mismatches: [] });
  assert.deepEqual({ ...remote.prepare("SELECT value, method FROM content_translations WHERE item_id = '日'").get() },
    { value: '["día","sol"]', method: "human" });
  assert.equal(remote.prepare("SELECT count(*) AS n FROM content_translations").get().n, 2);
  db.close(); remote.close();
});
