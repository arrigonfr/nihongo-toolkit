import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { createDatabase } from "../src/database.js";
import { insertKanjis, insertWords } from "../scripts/import-data.js";
import { planJlpt, applyJlpt, pendingJlpt, syncJlpt, hasTable, estimateKanji, validateAssignment, parseJlptArgs, parseKezuruVocabulary } from "../scripts/jlpt-enrichment-lib.js";

test("report accepts a bare flag, filename or stdout without consuming other options", () => {
  assert.equal(parseJlptArgs([]).report, undefined);
  for (const args of [["--report"], ["--report", "-"], ["--report=-"]]) assert.equal(parseJlptArgs(args).report, "-");
  const values = parseJlptArgs(["--report", "--offline", "--estimates"]);
  assert.equal(values.report, "-");
  assert.equal(values.offline, true);
  assert.equal(values.estimates, true);
  for (const args of [["--report", "plan.json"], ["--report=plan.json"]]) assert.equal(parseJlptArgs(args).report, "plan.json");
  assert.equal(parseJlptArgs(["--db", "dictionary.sqlite", "--report"]).db, "dictionary.sqlite");
  assert.throws(() => parseJlptArgs(["--report="]), /nonempty filename/);
  assert.throws(() => parseJlptArgs(["--report", "--unknown"]), /Unknown option/);
  assert.throws(() => parseJlptArgs(["--db", "--report"]), { code: "ERR_PARSE_ARGS_INVALID_OPTION_VALUE" });
});

const source = { name: "Test study list", url: "https://example.com/pinned.json", sha256: "a".repeat(64), license: "CC BY-SA 4.0", revision: "b".repeat(40) };
test("Kezuru source retains exact spellings/readings and rejects malformed snapshots", () => {
  const rows = parseKezuruVocabulary(JSON.stringify([
    { kanji: " 猫 ", kana_writing: " ねこ ", definition: "Not imported" },
    { kanji: null, kana_writing: "ああ" }
  ]), 5, source);
  assert.deepEqual(rows.map(({ word, reading, level }) => ({ word, reading, level })), [
    { word: "猫", reading: "ねこ", level: 5 }, { word: "ああ", reading: "ああ", level: 5 }
  ]);
  assert.equal(rows[0].source, source);
  assert.equal("definition" in rows[0], false);
  for (const data of ["[]", "{}", '[{"kanji":null,"kana_writing":""}]', '[{"kanji":["猫"],"kana_writing":"ねこ"}]']) {
    assert.throws(() => parseKezuruVocabulary(data, 4, source), /Invalid Kezuru/);
  }
  assert.throws(() => parseKezuruVocabulary('[{"kanji":null,"kana_writing":"ねこ"}]', 3, source), /Invalid Kezuru/);
});
const record = (word, reading, level = 4, extra = {}) => ({ kind: "word", word, reading, level, source, ...extra });
const kanjiRecord = (word, level = 3) => ({ kind: "kanji", word, level, source });
function word(id = "100", text = "猫", reading = "ねこ", common = true) {
  return { id, kanji: [{ text, common }], kana: [{ text: reading, common, appliesToKanji: ["*"] }],
    sense: [{ gloss: [{ lang: "eng", text: "cat" }], partOfSpeech: ["n"], misc: [], appliesToKanji: ["*"], appliesToKana: ["*"] }] };
}
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "nihon-jlpt-")), path = join(dir, "dictionary.sqlite");
  const db = createDatabase(path);
  insertKanjis(db, { characters: ["猫", "犬", "龘"].map((literal) => ({
    literal, misc: { strokeCounts: [9], grade: null, jlptLevel: null, frequency: null, radicalNames: [], variants: [] },
    readingMeaning: { groups: [] }, radicals: [], dictionaryReferences: [], queryCodes: [], codepoints: []
  })) }, new Map());
  insertWords(db, { words: [word()], tags: {} });
  return { db, dir, path, close() { db.close(); rmSync(dir, { recursive: true, force: true }); } };
}
function rate(db, id = "existing", wordId = 1, text = "猫", reading = "ねこ", level = 5) {
  db.prepare("INSERT INTO vocabulary VALUES (?,?,?,?,?,?,?,?,?,?,?)")
    .run(id, wordId, text, reading, "neko", '["cat"]', level, '["noun"]', "[]", "[]", "[]");
}

test("JLPT preview is read-only; apply updates application tables and journals provenance exactly once", () => {
  const f = fixture();
  try {
    const plan = planJlpt(f.db, [record("猫", "ネコ"), kanjiRecord("猫")]);
    assert.equal(plan.assignments.length, 2);
    assert.equal(hasTable(f.db, "jlpt_assignments"), false);
    assert.equal(f.db.prepare("SELECT count(*) n FROM vocabulary").get().n, 0);
    assert.equal(applyJlpt(f.db, plan.assignments), 2);
    assert.equal(applyJlpt(f.db, plan.assignments), 0);
    assert.equal(f.db.prepare("SELECT jlpt FROM kanjis WHERE character='猫'").get().jlpt, 3);
    assert.equal(f.db.prepare("SELECT jlpt FROM vocabulary").get().jlpt, 4);
    const row = f.db.prepare("SELECT * FROM jlpt_assignments WHERE kind='word'").get();
    assert.equal(row.reading, "ねこ");
    assert.equal(row.method, "dataset");
    assert.deepEqual(JSON.parse(row.sources), [source]);
    assert.equal(pendingJlpt(f.db, "target").length, 2);
    assert.equal(planJlpt(f.db, [record("猫", "ねこ"), kanjiRecord("猫")]).assignments.length, 0);
  } finally { f.close(); }
});

test("existing application and seed ratings are never replaced", () => {
  const f = fixture();
  try {
    rate(f.db);
    f.db.prepare("UPDATE kanjis SET jlpt=5 WHERE character='猫'").run();
    assert.equal(planJlpt(f.db, [record("猫", "ねこ", 1), kanjiRecord("猫", 1)], { estimates: true }).assignments.length, 0);
    f.db.exec(readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8"));
    f.db.exec("DELETE FROM vocabulary");
    f.db.prepare(`INSERT INTO vocabulary_words(word_id,word,reading,meaning,meanings,parts_of_speech,tags,jlpt,is_common,source,license)
      VALUES(1,'猫','ねこ','cat','[]','[]','[]',2,1,'original','CC BY')`).run();
    assert.equal(planJlpt(f.db, [record("猫", "ねこ", 1)], { estimates: true }).assignments.length, 0);
    assert.equal(f.db.prepare("SELECT jlpt FROM vocabulary_words").get().jlpt, 2);
  } finally { f.close(); }
});

test("readings, senses and homographs are matched exactly, never by spelling alone", () => {
  const f = fixture();
  try {
    assert.equal(planJlpt(f.db, [record("猫", "いぬ")]).assignments.length, 0);
    insertWords(f.db, { words: [word("101")], tags: {} }, { append: true });
    const ambiguous = planJlpt(f.db, [record("猫", "ねこ")]);
    assert.equal(ambiguous.assignments.length, 0);
    assert.match(ambiguous.unmatched[0].reason, /Ambiguous/);
    assert.equal(planJlpt(f.db, [record("猫", "ねこ", 4, { jmdict_id: "100" })]).assignments.length, 1);
    const restricted = word("102", "生", "せい");
    restricted.kanji.push({ text: "性", common: false });
    restricted.kana.push({ text: "しょう", common: false, appliesToKanji: ["性"] });
    restricted.sense[0].appliesToKana = ["せい"];
    insertWords(f.db, { words: [restricted], tags: {} }, { append: true });
    assert.equal(planJlpt(f.db, [record("生", "しょう"), record("性", "しょう")]).assignments.length, 0);
    assert.equal(planJlpt(f.db, [record("生", "せい")]).assignments.length, 1);
  } finally { f.close(); }
});

test("published kana-only spellings work without assigning all alternate spellings", () => {
  const f = fixture();
  try {
    const plan = planJlpt(f.db, [record("ねこ", "ねこ")]);
    assert.equal(plan.assignments.length, 1);
    applyJlpt(f.db, plan.assignments);
    assert.equal(f.db.prepare("SELECT word FROM vocabulary").get().word, "ねこ");
    assert.equal(f.db.prepare("SELECT count(*) n FROM vocabulary WHERE word='猫'").get().n, 0);
  } finally { f.close(); }
});

test("conflicting dataset levels block heuristics; listed evidence beats supplementary guesses", () => {
  const f = fixture();
  try {
    f.db.prepare("UPDATE kanjis SET grade=1 WHERE character='猫'").run();
    const conflict = planJlpt(f.db, [record("猫", "ねこ", 4), record("猫", "ねこ", 2), kanjiRecord("猫", 5), kanjiRecord("猫", 3)], { estimates: true });
    assert.equal(conflict.assignments.length, 0);
    assert.equal(conflict.conflicts.length, 2);
    const preferred = planJlpt(f.db, [record("猫", "ねこ", 4), record("猫", "ねこ", 2, { estimated: true })]);
    assert.equal(preferred.assignments[0].jlpt, 4);
    assert.equal(preferred.assignments[0].method, "dataset");
  } finally { f.close(); }
});

test("estimates are opt-in, low confidence and leave unsupported rare entries unknown", () => {
  const f = fixture();
  try {
    f.db.prepare("UPDATE kanjis SET grade=1 WHERE character='猫'").run();
    assert.equal(planJlpt(f.db, []).assignments.length, 0);
    const plan = planJlpt(f.db, [], { estimates: true });
    assert.equal(plan.assignments.length, 2);
    assert.ok(plan.assignments.every((a) => a.method === "estimate" && a.confidence === "low"));
    assert.equal(plan.assignments.find((a) => a.kind === "word").jlpt, 3);
    applyJlpt(f.db, plan.assignments);
    assert.match(f.db.prepare("SELECT jlpt_source FROM kanjis WHERE character='猫'").get().jlpt_source, /ESTIMATE/);
    assert.equal(f.db.prepare("SELECT jlpt FROM kanjis WHERE character='龘'").get().jlpt, null);
    assert.equal(estimateKanji({ frequency: 2501 }), null);
    assert.equal(estimateKanji({ frequency: 2500 }).level, 1);
    assert.equal(estimateKanji({ jlpt_old: 2 }).level, 2);
    assert.throws(() => validateAssignment({ ...plan.assignments[0], jlpt: 6 }), /Invalid/);
  } finally { f.close(); }
});

test("apply is atomic when ratings change between preview and apply", () => {
  const f = fixture();
  try {
    const plan = planJlpt(f.db, [kanjiRecord("犬"), record("猫", "ねこ")]);
    rate(f.db);
    assert.throws(() => applyJlpt(f.db, plan.assignments), /since planning/);
    assert.equal(f.db.prepare("SELECT jlpt FROM kanjis WHERE character='犬'").get().jlpt, null);
    assert.equal(hasTable(f.db, "jlpt_changes"), false);
  } finally { f.close(); }
});

test("Turso sync remaps stable JMdict identities, preserves provenance, and retries after a lost checkpoint", async () => {
  const local = fixture(), remote = fixture();
  const client = createClient({ url: `file:${remote.path}` });
  try {
    remote.db.exec(`BEGIN; PRAGMA defer_foreign_keys=ON;
      UPDATE words SET id=77; UPDATE kanji_words SET word_id=77; UPDATE word_forms SET word_id=77; COMMIT;`);
    const plan = planJlpt(local.db, [kanjiRecord("犬"), record("猫", "ねこ")]);
    applyJlpt(local.db, plan.assignments);
    assert.equal(await syncJlpt(local.db, client, "remote"), 2);
    assert.equal(remote.db.prepare("SELECT word_id FROM vocabulary").get().word_id, 77);
    assert.deepEqual(remote.db.prepare("SELECT * FROM jlpt_assignments ORDER BY id").all(), local.db.prepare("SELECT * FROM jlpt_assignments ORDER BY id").all());
    assert.equal(await syncJlpt(local.db, client, "remote"), 0);
    local.db.exec("DELETE FROM jlpt_sync");
    assert.equal(await syncJlpt(local.db, client, "remote"), 2);
    assert.equal(remote.db.prepare("SELECT count(*) n FROM vocabulary").get().n, 1);
    assert.equal(pendingJlpt(local.db, "different-destination").length, 2);
  } finally { client.close(); local.close(); remote.close(); }
});

test("remote conflicts roll back the entire batch and do not advance the checkpoint", async () => {
  const local = fixture(), remote = fixture();
  const client = createClient({ url: `file:${remote.path}` });
  try {
    applyJlpt(local.db, planJlpt(local.db, [kanjiRecord("犬"), record("猫", "ねこ")]).assignments);
    rate(remote.db);
    await assert.rejects(syncJlpt(local.db, client, "remote"), /already rated/);
    assert.equal(remote.db.prepare("SELECT jlpt FROM kanjis WHERE character='犬'").get().jlpt, null);
    assert.equal(remote.db.prepare("SELECT count(*) n FROM jlpt_assignments").get().n, 0);
    assert.equal(pendingJlpt(local.db, "remote").length, 2);
  } finally { client.close(); local.close(); remote.close(); }
});

test("missing or changed dictionary parents abort; estimates need explicit permission", async () => {
  const local = fixture(), remote = fixture();
  const client = createClient({ url: `file:${remote.path}` });
  try {
    local.db.exec("UPDATE kanjis SET grade=1 WHERE character='猫'");
    applyJlpt(local.db, planJlpt(local.db, [], { estimates: true }).assignments);
    await assert.rejects(syncJlpt(local.db, client, "remote"), /allow-estimates/);
    assert.equal(hasTable(remote.db, "jlpt_assignments"), false);
    remote.db.exec("UPDATE words SET jmdict_id='different'");
    await assert.rejects(syncJlpt(local.db, client, "remote", { allowEstimates: true }), /JMdict entry missing/);
    assert.equal(remote.db.prepare("SELECT jlpt FROM kanjis WHERE character='猫'").get().jlpt, null);
    remote.db.exec(`UPDATE words SET jmdict_id='100',kana_forms='[{"text":"いぬ","common":true,"appliesToKanji":["*"]}]'`);
    await assert.rejects(syncJlpt(local.db, client, "remote", { allowEstimates: true }), /spelling\/reading changed/);
    assert.equal(pendingJlpt(local.db, "remote").length, 2);
  } finally { client.close(); local.close(); remote.close(); }
});
