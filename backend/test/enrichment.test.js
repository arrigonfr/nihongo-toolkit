import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { createDatabase } from "../src/database.js";
import { insertWords } from "../scripts/import-data.js";
import { openEnrichment, transaction, sentenceWriter, coverage, parseParallel, lexicalIndex,
  sentenceMatches, schema, syncChanges, validateGeneratedExamples, queueGenerated,
  reviewGenerated, quarantineUnreviewed, exampleGenerationPrompt } from "../scripts/enrichment-lib.js";
import { localExamples } from "../src/examples.js";
import { asyncDatabase } from "../src/async-database.js";

const word = { id: "100", kanji: [{ text: "猫", common: true }], kana: [{ text: "ねこ", common: true, appliesToKanji: ["*"] }],
  sense: [{ gloss: [{ lang: "eng", text: "cat" }], partOfSpeech: ["n"] }] };
const sentence = { id: "tatoeba:1", ja: "猫がいます。", en: "There is a cat.", source: "tatoeba",
  sourceId: "1", license: "CC BY 2.0 FR", attribution: '{"owner":"author","translationId":2,"translationOwner":"translator"}' };

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "nihon-enrichment-"));
  const path = join(dir, "test.sqlite");
  createDatabase(path).close();
  const db = openEnrichment(path);
  return { db, dir, close() { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}

test("append retains IDs, journals only new records, and transaction rollback includes the journal", () => {
  const { db, close } = fixture();
  try {
    insertWords(db, { words: [word], tags: { n: "noun" } }, { append: true });
    insertWords(db, { words: [word], tags: {} }, { append: true });
    assert.equal(db.prepare("SELECT count(*) n FROM words").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM enrichment_changes WHERE table_name='words'").get().n, 1);
    assert.throws(() => transaction(db, () => {
      sentenceWriter(db)(sentence, [{ id: 1, matched: "猫" }]);
      throw new Error("rollback");
    }), /rollback/);
    assert.equal(db.prepare("SELECT count(*) n FROM sentences").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM enrichment_changes").get().n, 1);
  } finally { close(); }
});

test("parallel parser preserves both author credits and rejects unlicensed rows", () => {
  const parsed = parseParallel("A cat.\t猫です。\tCC-BY 2.0 (France) Attribution: tatoeba.org #2 (CK) & #1 (owner)");
  assert.equal(parsed.id, "tatoeba:1");
  assert.equal(JSON.parse(parsed.attribution).translationOwner, "CK");
  assert.throws(() => parseParallel("A cat.\t猫です。\tunknown"), /license/);
});

test("generated examples require target spelling, translations and distinct complete sentences", () => {
  const valid = { ja: "猫が眠っています。", en: "The cat is sleeping." };
  assert.deepEqual(validateGeneratedExamples([
    null, valid, valid, { ja: "犬がいます。", en: "There is a dog." },
    { ja: "「猫」という単語です。", en: "This is the word cat." },
    { ja: "猫がいます。", en: "" }, { ja: "猫", en: "A cat." }
  ], "猫", 3), [valid]);
  assert.deepEqual(validateGeneratedExamples([valid], "猫", 3, new Set([valid.ja])), []);
});

test("generation prompt pins Japanese and English to one dictionary meaning", () => {
  const prompt = exampleGenerationPrompt({
    id: 1, word: "お兄さん", reading: "おにいさん", meanings: '["older brother","young man"]'
  }, 3);
  assert.deepEqual(prompt.target, { japanese: "お兄さん", reading: "おにいさん", englishMeaning: "older brother" });
  assert.deepEqual(JSON.parse(prompt.messages[1].content), { target: prompt.target, count: 3 });
  assert.match(prompt.messages[0].content, /exactly that intended sense/);
  assert.match(prompt.messages[0].content, /same meaning/);
  assert.match(prompt.messages[0].content, /not merely characters inside an unrelated longer word/);
  assert.match(prompt.messages[0].content, /rather than guessing/);
  for (const meanings of ["[]", '[""]', "[null]"]) {
    assert.throws(() => exampleGenerationPrompt({ id: 1, meanings }, 3), /English dictionary meanings/);
  }
});

test("changed upstream sentence text is versioned without replacing existing content", () => {
  const { db, close } = fixture();
  try {
    insertWords(db, { words: [word], tags: {} }, { append: true });
    const save = sentenceWriter(db);
    save(sentence, [{ id: 1, matched: "猫" }]);
    save({ ...sentence, ja: "猫が二匹います。" }, [{ id: 1, matched: "猫" }]);
    assert.equal(db.prepare("SELECT ja FROM sentences WHERE id=?").get(sentence.id).ja, sentence.ja);
    assert.equal(db.prepare("SELECT count(*) n FROM sentences").get().n, 2);
  } finally { close(); }
});

test("lexical matching uses tokens, inflection bases, and rejects ambiguous homographs", () => {
  const rows = [{ id: 1, kanji_forms: '[{"text":"猫"}]', kana_forms: '[{"text":"ねこ","appliesToKanji":["*"]}]' }];
  const index = lexicalIndex(rows);
  const tokenizer = { tokenize: () => [{ surface_form: "猫", basic_form: "猫", reading: "ネコ" }] };
  assert.deepEqual(sentenceMatches("猫", tokenizer, index), [{ id: 1, matched: "猫" }]);
  assert.deepEqual(sentenceMatches("猫", tokenizer, lexicalIndex([...rows, { ...rows[0], id: 2 }])), []);
});

test("stored examples are served with attribution and AI labeling; coverage deduplicates Japanese text", async () => {
  const { db, close } = fixture();
  try {
    insertWords(db, { words: [word], tags: {} }, { append: true });
    const save = sentenceWriter(db);
    save(sentence, [{ id: 1, matched: "猫" }]);
    save({ ...sentence, id: "duplicate" }, [{ id: 1, matched: "猫" }]);
    save({ ...sentence, id: "ai:1", ja: "猫は眠っています。", source: "ai-generated",
      attribution: '{"reviewed":true}' }, [{ id: 1, matched: "猫" }]);
    const examples = await localExamples(asyncDatabase(db), { wordId: 1 });
    assert.equal(examples.length, 2);
    assert.equal(examples[0].owner, "author");
    assert.equal(examples[1].generated, true);
    const queried = await localExamples(asyncDatabase(db), { query: "ねこ" });
    assert.equal(queried.length, 2);
    assert.equal(coverage(db).below_target, 1);
  } finally { close(); }
});

test("generated candidates stay outside coverage, API output and sync journal until reviewed", async () => {
  const { db, close } = fixture();
  try {
    insertWords(db, { words: [word], tags: {} }, { append: true });
    queueGenerated(db, 1, { ja: sentence.ja, en: sentence.en }, { model: "test", reviewed: false });
    assert.equal(coverage(db).sentences, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM enrichment_changes").get().n, 1);
    assert.deepEqual(await localExamples(asyncDatabase(db), { wordId: 1 }), []);
    const id = db.prepare("SELECT id FROM enrichment_generated").get().id;
    reviewGenerated(db, [id], "approved");
    const examples = await localExamples(asyncDatabase(db), { wordId: 1 });
    assert.equal(examples.length, 1);
    assert.equal(examples[0].reviewed, true);
    assert.equal(examples[0].generated, true);
    assert.equal(coverage(db).sentences, 1);
    assert.throws(() => reviewGenerated(db, [id], "approved"), /Not a pending/);
  } finally { close(); }
});

test("quarantine removes unsynced pilot examples and their journal entries without losing drafts", async () => {
  const { db, close } = fixture();
  try {
    insertWords(db, { words: [word], tags: {} }, { append: true });
    sentenceWriter(db)({ ...sentence, id: "ai:pilot", source: "ai-generated", attribution: '{"reviewed":false}' },
      [{ id: 1, matched: "猫" }]);
    assert.deepEqual(await localExamples(asyncDatabase(db), { wordId: 1 }), []);
    assert.equal(quarantineUnreviewed(db), 1);
    assert.equal(db.prepare("SELECT count(*) n FROM enrichment_generated").get().n, 1);
    assert.equal(db.prepare("SELECT count(*) n FROM enrichment_changes").get().n, 1);
    assert.equal(coverage(db).sentences, 0);
  } finally { close(); }
});

test("sync rolls back inserted children when an existing parent belongs to another snapshot", async () => {
  const { db, dir, close } = fixture();
  const remote = createClient({ url: `file:${join(dir, "remote.sqlite")}` });
  try {
    await remote.executeMultiple(readFileSync(new URL("../src/schema.sql", import.meta.url), "utf8")
      + readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8") + schema);
    insertWords(db, { words: [word], tags: {} }, { append: true });
    await syncChanges(db, remote, "test");
    sentenceWriter(db)(sentence, [{ id: 1, matched: "猫" }]);
    await remote.execute("UPDATE words SET jmdict_id='different' WHERE id=1");
    await assert.rejects(syncChanges(db, remote, "test"), /snapshot identity/);
    assert.equal((await remote.execute("SELECT count(*) n FROM sentences")).rows[0].n, 0);
    assert.equal(db.prepare("SELECT last_seq FROM enrichment_sync").get().last_seq, 1);
  } finally { remote.close(); close(); }
});

test("delta sync is idempotent after lost checkpoint and refuses conflicting snapshot IDs atomically", async () => {
  const { db, dir, close } = fixture();
  const remote = createClient({ url: `file:${join(dir, "remote.sqlite")}` });
  try {
    await remote.executeMultiple(readFileSync(new URL("../src/schema.sql", import.meta.url), "utf8")
      + readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8") + schema);
    insertWords(db, { words: [word], tags: { n: "noun" } }, { append: true });
    sentenceWriter(db)(sentence, [{ id: 1, matched: "猫" }]);
    await syncChanges(db, remote, "test", { batchSize: 2 });
    db.exec("DELETE FROM enrichment_sync");
    await syncChanges(db, remote, "test");
    assert.equal((await remote.execute("SELECT count(*) n FROM sentences")).rows[0].n, 1);
    db.exec("DELETE FROM enrichment_sync");
    await remote.execute("UPDATE words SET jmdict_id='different' WHERE id=1");
    await assert.rejects(syncChanges(db, remote, "test"), /Conflicting remote/);
    assert.equal(db.prepare("SELECT count(*) n FROM enrichment_sync").get().n, 0);
    assert.equal((await remote.execute("SELECT jmdict_id FROM words")).rows[0].jmdict_id, "different");
  } finally { remote.close(); close(); }
});
