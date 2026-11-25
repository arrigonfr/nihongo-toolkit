import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client";
import { createDatabase } from "../src/database.js";
import { insertKanjis, insertWords } from "../scripts/import-data.js";
import {
  auditTranslationContents, backupTranslationContents, checkTranslation, ensureTranslationSchema, planTranslationRepair, syncTranslations, pickTatoebaTranslation, splitModelOutput, parseTatoebaLinks, parseTatoebaSentences,
  pendingTranslationDeletes, pendingTranslationReviews, pendingTranslationSync, translationItem, translationItems, translationReviewCoverage,
  translationStatus, translationValueHash, translationWriter, validateTranslation, writeTranslationReview
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

function translationClient(remote) {
  return {
    executeMultiple: async (sql) => remote.exec(sql),
    execute: async (query) => {
      const { sql, args = [] } = typeof query === "string" ? { sql: query } : query;
      return { rows: remote.prepare(sql).all(...args) };
    },
    batch: async (statements) => {
      remote.exec("BEGIN");
      try {
        for (const { sql, args } of statements) remote.prepare(sql).run(...args);
        remote.exec("COMMIT");
      } catch (error) {
        remote.exec("ROLLBACK");
        throw error;
      }
    },
    transaction: async () => {
      remote.exec("BEGIN");
      return {
        execute: async ({ sql, args }) => {
          const stmt = remote.prepare(sql);
          if (/^\s*SELECT/i.test(sql)) return { rows: stmt.all(...args) };
          stmt.run(...args);
          return { rows: [] };
        },
        commit: async () => remote.exec("COMMIT"),
        rollback: async () => remote.exec("ROLLBACK"),
        close: () => {}
      };
    }
  };
}

function approveMachineRows(db) {
  for (const row of db.prepare("SELECT kind,item_id,lang,source_hash,value FROM content_translations WHERE method='machine'").all()) {
    writeTranslationReview(db, {
      ...row, value_hash: translationValueHash(row.value), status: "approved", reviewer: "fixture reviewer"
    });
  }
}

async function syncApproved(db, client, destination, options) {
  approveMachineRows(db);
  return syncTranslations(db, client, destination, options);
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

test("machine translations require current hash-bound human approval before they can sync", () => {
  const db = fixture(), item = translationItem(db, "sense", "1:0");
  translationWriter(db)({ item, lang: "es", value: ["Japón"], method: "machine", source: "local model" });
  const [review] = pendingTranslationReviews(db, "sense", "es");
  assert.deepEqual(review.english, ["Japan"]);
  assert.equal(review.context.word, "日本");
  assert.deepEqual(review.translation, ["Japón"]);
  assert.equal(review.previous_review, null);
  assert.equal(translationReviewCoverage(db, "sense", "es").pending, 1);
  assert.deepEqual(pendingTranslationSync(db, "turso"), []);

  writeTranslationReview(db, { ...review, status: "approved", reviewer: "test reviewer", note: "Checked against Japanese and English" });
  assert.equal(translationReviewCoverage(db, "sense", "es").approved, 1);
  assert.equal(pendingTranslationSync(db, "turso").length, 1);
  assert.deepEqual(pendingTranslationReviews(db, "sense", "es"), []);

  db.prepare("UPDATE content_translations SET value=?").run('["incorrecto"]');
  assert.equal(translationReviewCoverage(db, "sense", "es").pending, 1, "editing translation invalidates prior approval");
  assert.equal(pendingTranslationSync(db, "turso").length, 0);
  assert.equal(pendingTranslationReviews(db, "sense", "es")[0].previous_review, null);
  assert.throws(() => writeTranslationReview(db, { ...review, status: "approved", reviewer: "test reviewer" }),
    /changed since review export/);
  db.close();
});

test("AI approvals remain pending for human review and cannot enable sync", () => {
  const db = fixture(), item = translationItem(db, "sense", "1:0");
  translationWriter(db)({ item, lang: "es", value: ["Japón"], method: "machine", source: "local model" });
  const [review] = pendingTranslationReviews(db, "sense", "es");
  writeTranslationReview(db, {
    ...review, status: "approved", reviewer_type: "ai", reviewer: "AI reviewer"
  });

  assert.deepEqual(translationReviewCoverage(db, "sense", "es"), {
    machine: 1, approved: 0, humanApproved: 0, aiApproved: 1, rejected: 0, uncertain: 0, pending: 1
  });
  assert.equal(pendingTranslationReviews(db, "sense", "es")[0].previous_reviewer_type, "ai");
  assert.deepEqual(pendingTranslationSync(db, "turso"), []);

  const [humanReview] = pendingTranslationReviews(db, "sense", "es");
  writeTranslationReview(db, {
    ...humanReview, status: "approved", reviewer_type: "human", reviewer: "Human reviewer"
  });
  assert.equal(translationReviewCoverage(db, "sense", "es").approved, 1);
  assert.equal(pendingTranslationSync(db, "turso").length, 1);
  db.close();
});

test("review schema migration preserves legacy decisions and adds uncertain status", () => {
  const db = fixture(), item = translationItem(db, "sense", "1:0");
  translationWriter(db)({ item, lang: "es", value: ["Japón"], method: "machine", source: "local model" });
  const row = db.prepare("SELECT kind,item_id,lang,source_hash,value FROM content_translations").get();
  db.exec(`DROP TABLE content_translation_reviews;
    CREATE TABLE content_translation_reviews (
      kind TEXT NOT NULL, item_id TEXT NOT NULL, lang TEXT NOT NULL,
      source_hash TEXT NOT NULL, value_hash TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('approved','rejected')),
      reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (kind,item_id,lang)
    );`);
  db.prepare(`INSERT INTO content_translation_reviews
    (kind,item_id,lang,source_hash,value_hash,status,reviewer,reviewed_at,note)
    VALUES (?,?,?,?,?,'approved','Legacy reviewer','2025-01-01','')`)
    .run(row.kind, row.item_id, row.lang, row.source_hash, translationValueHash(row.value));

  ensureTranslationSchema(db);
  assert.deepEqual({ ...db.prepare(`SELECT status,reviewer_type FROM content_translation_reviews`).get() },
    { status: "approved", reviewer_type: "human" });
  writeTranslationReview(db, {
    ...row, value_hash: translationValueHash(row.value), status: "uncertain", reviewer: "AI reviewer",
    reviewer_type: "ai"
  });
  assert.deepEqual({ ...db.prepare(`SELECT status,reviewer_type FROM content_translation_reviews`).get() },
    { status: "uncertain", reviewer_type: "ai" });
  db.close();
});

test("sync skips unreviewed machine rows and reports the holdback without writing them", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:"), client = translationClient(remote);
  const item = translationItem(db, "sense", "1:0");
  translationWriter(db)({ item, lang: "es", value: ["Japón"], method: "machine", source: "local model" });
  try {
    const result = await syncTranslations(db, client, "test");
    assert.equal(result.synced, 0);
    assert.equal(result.pendingReview, 1);
    assert.equal(remote.prepare("SELECT count(*) n FROM content_translations").get().n, 0);
  } finally { db.close(); remote.close(); }
});

test("review export and apply CLI preserve context and bind approvals to the exported value", () => {
  const dir = mkdtempSync(join(tmpdir(), "translation-review-cli-"));
  const path = join(dir, "local.sqlite"), output = join(dir, "review.jsonl"), result = join(dir, "reviewed.jsonl");
  const db = createDatabase(path);
  insertKanjis(db, { characters: [{
    literal: "日", codepoints: [], radicals: [], dictionaryReferences: [], queryCodes: [],
    misc: { grade: 1, strokeCounts: [4], jlptLevel: 4, frequency: 1, radicalNames: [], variants: [] },
    readingMeaning: { nanori: [], groups: [{ readings: [{ type: "ja_on", value: "ニチ" }],
      meanings: [{ lang: "en", value: "day" }] }] }
  }] }, new Map([["日", { level: 5 }]]));
  ensureTranslationSchema(db);
  const item = translationItem(db, "kanji", "日");
  translationWriter(db)({ item, lang: "es", value: ["día"], method: "machine", source: "test model" });
  db.close();
  try {
    const exportRun = spawnSync(process.execPath, ["backend/scripts/translations.js", "export-review",
      "--db", path, "--lang", "es", "--kind", "kanji", "--out", output], { encoding: "utf8" });
    assert.equal(exportRun.status, 0, exportRun.stderr);
    const exported = JSON.parse(readFileSync(output, "utf8").trim());
    assert.deepEqual(exported.english, ["day"]);
    assert.equal(exported.context.kanji, "日");
    assert.deepEqual(exported.translation, ["día"]);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    writeFileSync(result, `${JSON.stringify({ ...exported, decision: "approved", note: "Compared with Japanese and English" })}\n`,
      { mode: 0o600 });
    const applyRun = spawnSync(process.execPath, ["backend/scripts/translations.js", "apply-review",
      "--db", path, "--reviewer", "test reviewer", result], { encoding: "utf8" });
    assert.equal(applyRun.status, 0, applyRun.stderr);
    const check = new DatabaseSync(path, { readOnly: true });
    assert.equal(check.prepare("SELECT status FROM content_translation_reviews").get().status, "approved");
    check.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
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
  const client = translationClient(remote);
  const write = translationWriter(db);
  const kanji = translationItem(db, "kanji", "日"), sense = translationItem(db, "sense", "1:0");
  write({ item: kanji, lang: "es", value: ["día"], method: "machine", source: "model" });
  write({ item: sense, lang: "pt", value: ["Japão"], method: "machine", source: "model" });
  assert.deepEqual(await syncApproved(db, client, "turso", { batchSize: 1 }), {
    synced: 2, deleted: 0, matched: 2, contentMismatches: [], localOnly: [], pendingReview: 0, remoteOnly: [], protectedHuman: 0, protectedHumanKeys: []
  });

  db.prepare("UPDATE translation_sync SET synced_until = ?").run(new Date(Date.now() - 120_000).toISOString());
  write({ item: kanji, lang: "es", value: ["día", "sol"], method: "human", source: "KANJIDIC2" });
  assert.deepEqual(await syncApproved(db, client, "turso"), {
    synced: 2, deleted: 0, matched: 2, contentMismatches: [], localOnly: [], pendingReview: 0, remoteOnly: [], protectedHuman: 0, protectedHumanKeys: []
  });
  assert.deepEqual({ ...remote.prepare("SELECT value, method FROM content_translations WHERE item_id = '日'").get() },
    { value: '["día","sol"]', method: "human" });
  assert.equal(remote.prepare("SELECT count(*) AS n FROM content_translations").get().n, 2);
  db.close(); remote.close();
});

test("read-only audit classifies full-content differences across pages using a libsql read transaction", async () => {
  const db = fixture(), dir = mkdtempSync(join(tmpdir(), "translation-audit-"));
  const remote = createClient({ url: `file:${join(dir, "remote.sqlite")}` });
  try {
    await remote.executeMultiple(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    const insertLocal = db.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)");
    const insertRemote = async (id, value, method = "machine") => remote.execute({
      sql: "INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)",
      args: ["sense", id, "es", JSON.stringify([value]), method, "test", "license", "{}", "hash", "2026-01-01"]
    });
    for (const [id, value] of [["a", "same"], ["b", "local"], ["c", "machine"], ["d", "local-only"]]) {
      insertLocal.run("sense", id, "es", JSON.stringify([value]), "machine", "test", "license", "{}", "hash", "2026-01-01");
    }
    await insertRemote("a", "same");
    await insertRemote("b", "different");
    await insertRemote("c", "human", "human");
    await insertRemote("e", "remote-only");
    const plan = await remote.execute(`EXPLAIN QUERY PLAN SELECT kind,item_id,lang FROM content_translations
      WHERE (kind,item_id,lang) > ('sense','a','es') ORDER BY kind,item_id,lang LIMIT 2`);
    assert.match(plan.rows.map((row) => row.detail).join(" "), /SEARCH content_translations USING PRIMARY KEY/);
    const before = (await remote.execute("SELECT * FROM content_translations ORDER BY item_id")).rows.map((row) => ({ ...row }));
    const tx = await remote.transaction("read");
    let result;
    try { result = await auditTranslationContents(db, tx, 2); }
    finally { await tx.rollback(); tx.close(); }
    assert.equal(result.matched, 1);
    assert.deepEqual(result.contentMismatches, ['["sense","b","es"]']);
    assert.deepEqual(result.localOnly, ['["sense","d","es"]']);
    assert.deepEqual(result.remoteOnly, ['["sense","e","es"]']);
    assert.equal(result.protectedHuman, 1);
    assert.deepEqual(result.protectedHumanKeys, ['["sense","c","es"]']);
    assert.deepEqual((await remote.execute("SELECT * FROM content_translations ORDER BY item_id")).rows.map((row) => ({ ...row })), before);
    assert.equal(db.prepare("SELECT count(*) n FROM content_translations").get().n, 4);
  } finally { remote.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("production snapshot backup is atomic, private, complete, and refuses overwrite", async () => {
  const db = fixture(), dir = mkdtempSync(join(tmpdir(), "translation-backup-"));
  const remote = createClient({ url: `file:${join(dir, "remote.sqlite")}` });
  const output = join(dir, "translations-backup.sqlite");
  try {
    await remote.executeMultiple(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    const item = translationItem(db, "kanji", "日");
    const values = ["kanji", "日", "es", '["día","sol"]', "human", "test", item.license, "{}", item.source_hash, "2026-01-01"];
    db.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)").run(...values);
    await remote.execute({ sql: "INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)", args: values });
    const tx = await remote.transaction("read");
    let result;
    try { result = await backupTranslationContents(db, tx, output, 1); }
    finally { await tx.rollback(); tx.close(); }
    assert.equal(result.rowCount, 1);
    assert.equal(result.matched, 1);
    assert.deepEqual(result.contentMismatches, []);
    assert.equal(statSync(output).mode & 0o777, 0o600);
    const backup = new DatabaseSync(output, { readOnly: true });
    assert.equal(backup.prepare("SELECT value FROM content_translations").get().value, values[3]);
    assert.equal(backup.prepare("SELECT value FROM translation_backup_metadata WHERE key='remote_row_count'").get().value, "1");
    assert.equal(backup.prepare("PRAGMA quick_check").get().quick_check, "ok");
    backup.close();
    const second = await remote.transaction("read");
    try { await assert.rejects(backupTranslationContents(db, second, output), /Refusing to overwrite/); }
    finally { await second.rollback(); second.close(); }
    assert.deepEqual((await remote.execute("SELECT value FROM content_translations")).rows.map((row) => row.value), [values[3]]);
  } finally { remote.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("repair plan separates additions, updates, protected human rows, conflicts and remote-only rows", () => {
  const local = fixture(), remote = new DatabaseSync(":memory:");
  try {
    remote.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    const row = (id, value, method, source = "test") =>
      ["sense", id, "es", JSON.stringify([value]), method, source, "license", "{}", "hash", "2026-01-01"];
    const addLocal = local.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)");
    const addRemote = remote.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)");
    addLocal.run(...row("exact", "same", "machine"));
    addLocal.run(...row("addition", "new", "machine"));
    addLocal.run(...row("machine-update", "new", "machine", "local"));
    addLocal.run(...row("human-update", "reviewed", "human", "local"));
    addLocal.run(...row("protected", "generated", "machine", "local"));
    addLocal.run(...row("human-conflict", "local", "human", "local"));
    addRemote.run(...row("exact", "same", "machine"));
    addRemote.run(...row("machine-update", "old", "machine", "remote"));
    addRemote.run(...row("human-update", "old", "machine", "remote"));
    addRemote.run(...row("protected", "reviewed", "human", "remote"));
    addRemote.run(...row("human-conflict", "remote", "human", "remote"));
    addRemote.run(...row("remote-only", "preserve", "machine"));
    const plan = planTranslationRepair(local, remote);
    assert.deepEqual(plan.exact, [["sense", "exact", "es"]]);
    assert.equal(plan.additions.length, 1);
    assert.equal(plan.machineUpdates.length, 1);
    assert.equal(plan.humanUpdates.length, 1);
    assert.equal(plan.protectedHuman.length, 1);
    assert.equal(plan.humanConflicts.length, 1);
    assert.deepEqual(plan.remoteOnly, [["sense", "remote-only", "es"]]);
    assert.equal(JSON.stringify(plan).includes("generated"), false, "plan omits translation text");
    assert.equal(JSON.stringify(plan).includes('"value"'), false, "plan omits translation text");
  } finally { local.close(); remote.close(); }
});

test("isolated libsql sync resumes safely after an interrupted upsert batch", async () => {
  const db = fixture(), dir = mkdtempSync(join(tmpdir(), "translation-resume-"));
  const remote = createClient({ url: `file:${join(dir, "remote.sqlite")}` });
  try {
    const write = translationWriter(db), item = translationItem(db, "kanji", "日");
    write({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
    write({ item, lang: "pt", value: ["dia"], method: "machine", source: "model" });
    let batches = 0;
    const interrupted = {
      executeMultiple: (sql) => remote.executeMultiple(sql),
      execute: (sql) => remote.execute(sql),
      batch: (statements, mode) => {
        if (++batches === 2) throw new Error("simulated interruption");
        return remote.batch(statements, mode);
      }
    };
    await assert.rejects(syncApproved(db, interrupted, "stage", { batchSize: 1 }), /simulated interruption/);
    assert.equal(Number((await remote.execute("SELECT count(*) n FROM content_translations")).rows[0].n), 1);
    const resumed = await syncApproved(db, remote, "stage", { batchSize: 1 });
    assert.equal(resumed.matched, 2);
    assert.deepEqual(resumed.contentMismatches, []);
    assert.equal(Number((await remote.execute("SELECT count(*) n FROM content_translations")).rows[0].n), 2);
  } finally { remote.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("audit and disabled sync apply do not initialize or modify the local database", () => {
  const dir = mkdtempSync(join(tmpdir(), "translation-cli-")), path = join(dir, "local.sqlite");
  const db = createDatabase(path);
  db.close();
  try {
    for (const args of [["audit-turso"], ["sync-turso", "--apply"]]) {
      const run = spawnSync(process.execPath, ["backend/scripts/translations.js", ...args, "--db", path], {
        encoding: "utf8", env: { PATH: process.env.PATH }
      });
      assert.notEqual(run.status, 0);
      assert.match(run.stderr, args[0] === "audit-turso" ? /TURSO_DATABASE_URL and TURSO_AUTH_TOKEN/ : /writes are disabled/);
      const check = new DatabaseSync(path, { readOnly: true });
      assert.equal(check.prepare("SELECT count(*) n FROM sqlite_master WHERE name='content_translations'").get().n, 0);
      check.close();
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("translation sync preserves a remote human row from machine output and audits equal-count content drift", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:");
  const client = translationClient(remote), item = translationItem(db, "kanji", "日");
  translationWriter(db)({ item, lang: "es", value: ["dia"], method: "machine", source: "model" });
  remote.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
  remote.prepare(`INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    "kanji", "日", "es", '["día"]', "human", "KANJIDIC2", item.license, "{}", item.source_hash, "2026-01-01T00:00:00.000Z"
  );
  const result = await syncApproved(db, client, "turso");
  assert.equal(result.protectedHuman, 1);
  assert.deepEqual(result.contentMismatches, []);
  assert.equal(remote.prepare("SELECT value FROM content_translations").get().value, '["día"]');

  db.prepare("UPDATE content_translations SET updated_at=?").run(new Date(Date.now() - 600_000).toISOString());
  db.prepare("UPDATE translation_sync SET synced_until=?").run(new Date().toISOString());
  remote.prepare("UPDATE content_translations SET value=?, method='machine'").run('["incorrecta"]');
  const drift = await syncApproved(db, client, "turso");
  assert.equal(drift.contentMismatches.length, 1, "same row counts must not conceal content drift");
  assert.equal(drift.localOnly.length, 0);
  assert.equal(drift.remoteOnly.length, 0);
  db.close(); remote.close();
});

test("translation sync propagates explicit local deletion but skips reinserted rows", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:"), client = translationClient(remote);
  const write = translationWriter(db), item = translationItem(db, "kanji", "日");
  write({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
  await syncApproved(db, client, "turso");

  db.prepare("DELETE FROM content_translations WHERE kind='kanji' AND item_id='日' AND lang='es'").run();
  assert.equal(pendingTranslationDeletes(db, "turso").length, 1);
  write({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
  assert.equal(pendingTranslationDeletes(db, "turso").length, 1);
  await syncApproved(db, client, "turso");
  assert.equal(remote.prepare("SELECT count(*) n FROM content_translations").get().n, 1);

  db.prepare("DELETE FROM content_translations WHERE kind='kanji' AND item_id='日' AND lang='es'").run();
  const result = await syncApproved(db, client, "turso");
  assert.equal(result.deleted, 1);
  assert.equal(remote.prepare("SELECT count(*) n FROM content_translations").get().n, 0);
  assert.deepEqual(result.localOnly, []);
  assert.deepEqual(result.remoteOnly, []);
  db.close(); remote.close();
});

test("deletion history is replayed independently to two destinations, including after a lost checkpoint", async () => {
  const db = fixture(), a = new DatabaseSync(":memory:"), b = new DatabaseSync(":memory:");
  const clientA = translationClient(a), clientB = translationClient(b);
  try {
    const item = translationItem(db, "kanji", "日");
    translationWriter(db)({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
    await syncApproved(db, clientA, "a");
    await syncApproved(db, clientB, "b");
    db.prepare("DELETE FROM content_translations WHERE kind=? AND item_id=? AND lang=?").run("kanji", "日", "es");
    assert.equal((await syncApproved(db, clientA, "a")).deleted, 1);
    assert.equal(b.prepare("SELECT count(*) n FROM content_translations").get().n, 1);
    assert.equal(pendingTranslationDeletes(db, "b").length, 1);
    assert.equal((await syncApproved(db, clientB, "b")).deleted, 1);
    db.prepare("DELETE FROM translation_deletion_progress WHERE destination=?").run("a");
    assert.equal((await syncApproved(db, clientA, "a")).deleted, 0);
    assert.equal(pendingTranslationDeletes(db, "a").length, 0);
  } finally { db.close(); a.close(); b.close(); }
});

test("deletion conflicts preserve changed and human remote rows, roll back the batch and leave events pending", async () => {
  for (const conflict of ["changed", "human"]) {
    const db = fixture(), remote = new DatabaseSync(":memory:"), client = translationClient(remote);
    try {
      const item = translationItem(db, "kanji", "日"), write = translationWriter(db);
      write({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
      write({ item, lang: "pt", value: ["dia"], method: "machine", source: "model" });
      await syncApproved(db, client, "test");
      db.prepare("DELETE FROM content_translations").run();
      if (conflict === "changed") remote.prepare("UPDATE content_translations SET value=? WHERE lang='pt'").run('["outro"]');
      else remote.prepare("UPDATE content_translations SET method='human' WHERE lang='pt'").run();
      await assert.rejects(syncApproved(db, client, "test"), /Conflicting or human remote translation/);
      assert.equal(remote.prepare("SELECT count(*) n FROM content_translations").get().n, 2, "entire deletion batch rolls back");
      assert.equal(pendingTranslationDeletes(db, "test").length, 2);
      assert.equal(remote.prepare("SELECT method FROM content_translations WHERE lang='pt'").get().method,
        conflict === "human" ? "human" : "machine");
    } finally { db.close(); remote.close(); }
  }
});

test("repeated delete/reinsert/delete preserves remote historical matches", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:"), client = translationClient(remote);
  try {
    const item = translationItem(db, "kanji", "日"), write = translationWriter(db);
    write({ item, lang: "es", value: ["primero"], method: "machine", source: "model" });
    await syncApproved(db, client, "test");
    db.prepare("DELETE FROM content_translations").run();
    write({ item, lang: "es", value: ["segundo"], method: "machine", source: "model" });
    db.prepare("DELETE FROM content_translations").run();
    assert.equal((await syncApproved(db, client, "test")).deleted, 1);
    assert.equal(remote.prepare("SELECT count(*) n FROM content_translations").get().n, 0);
  } finally { db.close(); remote.close(); }
});

test("legacy tombstones without prior contents block sync before any translation writes", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:"), client = translationClient(remote);
  try {
    const item = translationItem(db, "kanji", "日");
    translationWriter(db)({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
    db.prepare("INSERT INTO translation_sync_deletions (kind,item_id,lang,deleted_at) VALUES (?,?,?,?)")
      .run("sense", "old", "es", "2026-01-01");
    await assert.rejects(syncApproved(db, client, "test"), /Legacy deletion records/);
    assert.equal(remote.prepare("SELECT count(*) n FROM content_translations").get().n, 0);
  } finally { db.close(); remote.close(); }
});

test("journal migration retains legacy events and records full rows for future deletions", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    db.exec(`CREATE TABLE translation_sync_deletions (
      deletion_id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT, item_id TEXT, lang TEXT, deleted_at TEXT,
      UNIQUE(kind,item_id,lang));
      CREATE TRIGGER content_translations_sync_delete AFTER DELETE ON content_translations BEGIN
        INSERT INTO translation_sync_deletions(kind,item_id,lang,deleted_at) VALUES (OLD.kind,OLD.item_id,OLD.lang,'old');
      END;`);
    const insert = db.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)");
    const values = (id) => ["sense", id, "es", '["gato"]', "machine", "test", "test", "{}", "hash", "2026-01-01"];
    insert.run(...values("old"));
    db.prepare("DELETE FROM content_translations WHERE item_id='old'").run();
    ensureTranslationSchema(db);
    ensureTranslationSchema(db);
    insert.run(...values("new"));
    db.prepare("DELETE FROM content_translations WHERE item_id='new'").run();
    assert.equal(db.prepare("SELECT count(*) n FROM translation_sync_deletions").get().n, 1);
    const rows = pendingTranslationDeletes(db, "stage");
    assert.equal(rows.length, 1);
    assert.equal(JSON.parse(rows[0].old_row).value, '["gato"]');
    assert.equal(JSON.parse(rows[0].old_row).updated_at, "2026-01-01");
  } finally { db.close(); }
});

test("isolated libsql deletion survives a lost commit response and retries without losing progress", async () => {
  const db = fixture(), dir = mkdtempSync(join(tmpdir(), "translation-delete-retry-"));
  const remote = createClient({ url: `file:${join(dir, "remote.sqlite")}` });
  try {
    const item = translationItem(db, "kanji", "日");
    translationWriter(db)({ item, lang: "es", value: ["día"], method: "machine", source: "model" });
    await syncApproved(db, remote, "stage");
    db.prepare("DELETE FROM content_translations").run();
    const interrupted = {
      executeMultiple: (sql) => remote.executeMultiple(sql),
      execute: (sql) => remote.execute(sql),
      batch: (statements, mode) => remote.batch(statements, mode),
      transaction: async (mode) => {
        const tx = await remote.transaction(mode);
        return {
          execute: (statement) => tx.execute(statement),
          commit: async () => { await tx.commit(); throw new Error("lost commit response"); },
          rollback: () => tx.rollback(),
          close: () => tx.close()
        };
      }
    };
    await assert.rejects(syncApproved(db, interrupted, "stage"), /lost commit response|rollback could not be confirmed/);
    assert.equal(Number((await remote.execute("SELECT count(*) n FROM content_translations")).rows[0].n), 0);
    assert.equal(pendingTranslationDeletes(db, "stage").length, 1);
    const result = await syncApproved(db, remote, "stage");
    assert.equal(result.deleted, 0);
    assert.equal(result.remoteOnly.length, 0);
    assert.equal(pendingTranslationDeletes(db, "stage").length, 0);
  } finally { remote.close(); db.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("sync holds the local write lock while its remote batches are running", async () => {
  const dir = mkdtempSync(join(tmpdir(), "translation-lock-")), path = join(dir, "local.sqlite");
  const db = createDatabase(path), other = new DatabaseSync(path), remote = new DatabaseSync(":memory:");
  try {
    ensureTranslationSchema(db);
    const item = { kind: "sense", item_id: "1:0", english: ["cat"], license: "test", source_hash: "hash" };
    translationWriter(db)({ item, lang: "es", value: ["gato"], method: "machine", source: "model" });
    await syncApproved(db, translationClient(remote), "test", { onBatch: () => {
      assert.throws(() => other.prepare("DELETE FROM content_translations").run(), /locked|busy/i);
    } });
    assert.equal(db.prepare("SELECT count(*) n FROM content_translations").get().n, 1);
  } finally { other.close(); db.close(); remote.close(); rmSync(dir, { recursive: true, force: true }); }
});

test("human-to-human differences do not overwrite remote human translations", async () => {
  const db = fixture(), remote = new DatabaseSync(":memory:"), client = translationClient(remote);
  try {
    const item = translationItem(db, "kanji", "日");
    translationWriter(db)({ item, lang: "es", value: ["local"], method: "human", source: "test" });
    remote.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    remote.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run("kanji", "日", "es", '["remote"]', "human", "test", item.license, "{}", item.source_hash, "2026-01-01");
    const result = await syncApproved(db, client, "test");
    assert.equal(remote.prepare("SELECT value FROM content_translations").get().value, '["remote"]');
    assert.equal(result.contentMismatches.length, 1);
  } finally { db.close(); remote.close(); }
});
