import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { chmodSync, closeSync, existsSync, linkSync, openSync, readFileSync, unlinkSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { englishGlosses } from "../src/content-translations.js";

export const LANGUAGES = ["es", "pt"];
export const KINDS = ["kanji", "sense", "sentence"];
const DICTIONARY_LICENSE = "CC BY-SA 4.0";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const sourceHash = (english) => sha256(JSON.stringify(english));

export function ensureTranslationSchema(db) {
  db.exec("SAVEPOINT translation_schema");
  try {
    db.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    db.exec(`CREATE TABLE IF NOT EXISTS translation_sync_deletions (
    deletion_id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL, item_id TEXT NOT NULL, lang TEXT NOT NULL, deleted_at TEXT NOT NULL,
    UNIQUE (kind, item_id, lang)
  );
  CREATE TABLE IF NOT EXISTS translation_deletion_log (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL, item_id TEXT NOT NULL, lang TEXT NOT NULL, old_row TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS translation_deletion_progress (
    destination TEXT PRIMARY KEY, last_seq INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS content_translation_reviews (
    kind TEXT NOT NULL, item_id TEXT NOT NULL, lang TEXT NOT NULL,
    source_hash TEXT NOT NULL, value_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('approved','rejected','uncertain')),
    reviewer_type TEXT NOT NULL DEFAULT 'human' CHECK(reviewer_type IN ('human','ai')),
    reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (kind, item_id, lang)
  );
  CREATE TRIGGER IF NOT EXISTS content_translations_safe_delete
  AFTER DELETE ON content_translations BEGIN
    INSERT INTO translation_deletion_log (kind, item_id, lang, old_row)
    VALUES (OLD.kind, OLD.item_id, OLD.lang,
      json_object('kind',OLD.kind,'item_id',OLD.item_id,'lang',OLD.lang,'value',OLD.value,
        'method',OLD.method,'source',OLD.source,'license',OLD.license,'attribution',OLD.attribution,
        'source_hash',OLD.source_hash,'updated_at',OLD.updated_at));
  END;
  DROP TRIGGER IF EXISTS content_translations_sync_delete;`);
    const reviewColumns = db.prepare("PRAGMA table_info(content_translation_reviews)").all().map((column) => column.name);
    if (!reviewColumns.includes("reviewer_type")) {
      db.exec(`ALTER TABLE content_translation_reviews ADD COLUMN reviewer_type TEXT NOT NULL DEFAULT 'human'
        CHECK(reviewer_type IN ('human','ai'))`);
    }
    const reviewSchema = db.prepare(`SELECT sql FROM sqlite_master
      WHERE type='table' AND name='content_translation_reviews'`).get()?.sql ?? "";
    if (!reviewSchema.includes("'uncertain'")) {
      db.exec(`CREATE TABLE content_translation_reviews_migrated (
        kind TEXT NOT NULL, item_id TEXT NOT NULL, lang TEXT NOT NULL,
        source_hash TEXT NOT NULL, value_hash TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('approved','rejected','uncertain')),
        reviewer_type TEXT NOT NULL DEFAULT 'human' CHECK(reviewer_type IN ('human','ai')),
        reviewer TEXT NOT NULL, reviewed_at TEXT NOT NULL, note TEXT NOT NULL DEFAULT '',
        PRIMARY KEY (kind, item_id, lang)
      );
      INSERT INTO content_translation_reviews_migrated
        (kind,item_id,lang,source_hash,value_hash,status,reviewer_type,reviewer,reviewed_at,note)
        SELECT kind,item_id,lang,source_hash,value_hash,status,reviewer_type,reviewer,reviewed_at,note
        FROM content_translation_reviews;
      DROP TABLE content_translation_reviews;
      ALTER TABLE content_translation_reviews_migrated RENAME TO content_translation_reviews;`);
    }
    db.exec("RELEASE translation_schema");
  } catch (error) {
    db.exec("ROLLBACK TO translation_schema; RELEASE translation_schema");
    throw error;
  }
}


function kanjiItem(row) {
  const english = JSON.parse(row.meanings);
  if (!english.length) return null;
  return {
    kind: "kanji", item_id: row.character, english, license: DICTIONARY_LICENSE,
    context: { kanji: row.character, on: JSON.parse(row.on_readings), kun: JSON.parse(row.kun_readings) }
  };
}

function senseItems(row) {
  return JSON.parse(row.senses).flatMap((sense, index) => {
    const english = englishGlosses(sense);
    if (!english.length) return [];
    return [{
      kind: "sense", item_id: `${row.jmdict_id}:${index}`, english, license: DICTIONARY_LICENSE,
      context: { word: row.word, reading: row.reading, partOfSpeech: sense.partOfSpeech || [], notes: sense.info || [] }
    }];
  });
}

function sentenceItem(row) {
  return {
    kind: "sentence", item_id: row.id, english: [row.en], license: row.license,
    context: { ja: row.ja },
    attribution: row.attribution.startsWith("{") ? JSON.parse(row.attribution) : { text: row.attribution }
  };
}

const withHash = (item) => item && { ...item, source_hash: sourceHash(item.english) };
const KANJI_COLUMNS = "character, meanings, on_readings, kun_readings";
const WORD_COLUMNS = "w.jmdict_id, w.word, w.reading, w.senses";
const SENTENCE_FILTER = `(source <> 'ai-generated' OR CASE WHEN json_valid(attribution)
  THEN json_extract(attribution, '$.reviewed') END = 1)`;

// Learner-relevant content first: JLPT kanji/vocabulary, then common words, then the rest.
export function* translationItems(db, kind) {
  if (kind === "kanji") {
    for (const row of db.prepare(`SELECT ${KANJI_COLUMNS} FROM kanjis
      ORDER BY jlpt IS NULL, jlpt DESC, frequency IS NULL, frequency, id`).iterate()) {
      const item = withHash(kanjiItem(row));
      if (item) yield item;
    }
  } else if (kind === "sense") {
    for (const row of db.prepare(`SELECT ${WORD_COLUMNS},
      (SELECT max(v.jlpt) FROM vocabulary v WHERE v.word_id = w.id) AS jlpt
      FROM words w ORDER BY jlpt IS NULL, jlpt DESC, w.is_common DESC, w.id`).iterate()) {
      for (const item of senseItems(row)) yield withHash(item);
    }
  } else if (kind === "sentence") {
    for (const row of db.prepare(`SELECT id, ja, en, license, attribution FROM sentences
      WHERE ${SENTENCE_FILTER} ORDER BY id`).iterate()) yield withHash(sentenceItem(row));
    for (const item of vocabularyExamples(db).values()) yield item;
  } else throw new Error(`Unknown translation kind: ${kind}`);
}

// Tatoeba examples stored only in vocabulary.examples share the sentences-table id scheme (`tatoeba:<id>`).
const vocabularyExampleCache = new WeakMap();
function vocabularyExamples(db) {
  if (vocabularyExampleCache.has(db)) return vocabularyExampleCache.get(db);
  const items = new Map();
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'vocabulary'").get()) {
    for (const row of db.prepare(`SELECT 'tatoeba:' || json_extract(e.value, '$.tatoeba_id') AS id,
        min(json_extract(e.value, '$.ja')) AS ja, min(json_extract(e.value, '$.en')) AS en
      FROM vocabulary v, json_each(v.examples) e
      WHERE json_extract(e.value, '$.tatoeba_id') IS NOT NULL
        AND trim(coalesce(json_extract(e.value, '$.ja'), '')) <> '' AND trim(coalesce(json_extract(e.value, '$.en'), '')) <> ''
        AND NOT EXISTS (SELECT 1 FROM sentences s WHERE s.id = 'tatoeba:' || json_extract(e.value, '$.tatoeba_id'))
      GROUP BY 1 ORDER BY 1`).iterate()) {
      items.set(row.id, withHash({ kind: "sentence", item_id: row.id, english: [row.en], license: "CC BY 2.0 FR",
        context: { ja: row.ja }, attribution: {} }));
    }
  }
  vocabularyExampleCache.set(db, items);
  return items;
}

export function translationItem(db, kind, itemId) {
  if (kind === "kanji") {
    const row = db.prepare(`SELECT ${KANJI_COLUMNS} FROM kanjis WHERE character = ?`).get(itemId);
    return row ? withHash(kanjiItem(row)) : null;
  }
  if (kind === "sense") {
    const [jmdictId, index] = String(itemId).split(":");
    const row = db.prepare(`SELECT ${WORD_COLUMNS} FROM words w WHERE w.jmdict_id = ?`).get(jmdictId);
    return withHash(row && senseItems(row).find((item) => item.item_id === `${jmdictId}:${index}`));
  }
  if (kind === "sentence") {
    const row = db.prepare(`SELECT id, ja, en, license, attribution FROM sentences WHERE id = ? AND ${SENTENCE_FILTER}`).get(itemId);
    return row ? withHash(sentenceItem(row)) : vocabularyExamples(db).get(String(itemId)) ?? null;
  }
  return null;
}

export function validateTranslation(item, value) {
  if (!Array.isArray(value) || !value.length) throw new Error(`${item.kind} ${item.item_id}: value must be a non-empty array`);
  if (item.kind === "sentence" && value.length !== 1) throw new Error(`sentence ${item.item_id}: expected exactly one translation`);
  if (value.length > Math.max(20, item.english.length * 2)) throw new Error(`${item.kind} ${item.item_id}: too many glosses`);
  const limit = Math.max(200, item.english.join(" ").length * 3);
  return value.map((text) => {
    if (typeof text !== "string" || !text.trim()) throw new Error(`${item.kind} ${item.item_id}: empty translation`);
    if (/[\u0000-\u001f\u007f]/.test(text)) throw new Error(`${item.kind} ${item.item_id}: control characters are not allowed`);
    if (text.length > limit) throw new Error(`${item.kind} ${item.item_id}: translation is implausibly long`);
    return text.trim();
  });
}

// Human translations always win; machine output never replaces a human row.
export function translationWriter(db) {
  const statement = db.prepare(`INSERT INTO content_translations
    (kind, item_id, lang, value, method, source, license, attribution, source_hash, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(kind, item_id, lang) DO UPDATE SET value = excluded.value, method = excluded.method,
      source = excluded.source, license = excluded.license, attribution = excluded.attribution,
      source_hash = excluded.source_hash, updated_at = excluded.updated_at
    WHERE NOT (content_translations.method = 'human' AND excluded.method = 'machine'
      AND content_translations.source_hash = excluded.source_hash)`);
  return ({ item, lang, value, method, source, license = item.license, attribution = {} }) => {
    if (!LANGUAGES.includes(lang)) throw new Error(`Unsupported language: ${lang}`);
    return Number(statement.run(item.kind, item.item_id, lang, JSON.stringify(validateTranslation(item, value)),
      method, source, license, JSON.stringify(attribution), item.source_hash, new Date().toISOString()).changes);
  };
}

const SYNC_COLUMNS = ["kind", "item_id", "lang", "value", "method", "source", "license", "attribution", "source_hash", "updated_at"];
const syncKey = (row) => JSON.stringify([row.kind, row.item_id, row.lang]);
export const translationValueHash = (value) => sha256(value);

function reviewLookup(db) {
  return new Map(db.prepare(`SELECT kind,item_id,lang,source_hash,value_hash,status,reviewer_type
    FROM content_translation_reviews`).all().map((row) => [syncKey(row), row]));
}

function reviewStatus(row, reviews) {
  const review = reviews.get(syncKey(row));
  return review?.source_hash === row.source_hash && review.value_hash === translationValueHash(row.value)
    ? review.status : null;
}

function currentReview(row, reviews) {
  const review = reviews.get(syncKey(row));
  return review?.source_hash === row.source_hash && review.value_hash === translationValueHash(row.value)
    ? review : null;
}

export function writeTranslationReview(db, {
  kind, item_id, lang, source_hash, value_hash, status, reviewer_type = "human", reviewer, note = ""
}) {
  if (!KINDS.includes(kind) || !LANGUAGES.includes(lang)) throw new Error("Unsupported translation review item");
  if (!["approved", "rejected", "uncertain"].includes(status)) throw new Error("Review status must be approved, rejected or uncertain");
  if (!["human", "ai"].includes(reviewer_type)) throw new Error("Reviewer type must be human or ai");
  if (typeof reviewer !== "string" || !reviewer.trim()) throw new Error("Reviewer name is required");
  if (typeof note !== "string" || note.length > 2000) throw new Error("Review note must be 2000 characters or fewer");
  const current = db.prepare(`SELECT source_hash, value FROM content_translations
    WHERE kind=? AND item_id=? AND lang=? AND method='machine'`).get(kind, item_id, lang);
  if (!current || current.source_hash !== source_hash || translationValueHash(current.value) !== value_hash) {
    throw new Error(`Translation changed since review export: ${kind} ${item_id} ${lang}`);
  }
  db.prepare(`INSERT INTO content_translation_reviews
    (kind,item_id,lang,source_hash,value_hash,status,reviewer_type,reviewer,reviewed_at,note)
    VALUES (?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(kind,item_id,lang) DO UPDATE SET source_hash=excluded.source_hash,value_hash=excluded.value_hash,
      status=excluded.status,reviewer_type=excluded.reviewer_type,reviewer=excluded.reviewer,
      reviewed_at=excluded.reviewed_at,note=excluded.note`)
    .run(kind, item_id, lang, source_hash, value_hash, status, reviewer_type, reviewer.trim(), new Date().toISOString(), note);
}

export function pendingTranslationReviews(db, kind, lang, limit = 100) {
  if (!KINDS.includes(kind) || !LANGUAGES.includes(lang)) throw new Error("Unsupported translation review selection");
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Review limit must be a positive integer");
  const saved = new Map(db.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
    WHERE kind=? AND lang=? AND method='machine'`).all(kind, lang).map((row) => [row.item_id, row]));
  const reviews = reviewLookup(db);
  const output = [];
  for (const item of translationItems(db, kind)) {
    if (output.length >= limit) break;
    const row = saved.get(item.item_id);
    const previousReview = row && reviewStatus(row, reviews);
    const current = row && currentReview(row, reviews);
    if (!row || (previousReview === "approved" && current.reviewer_type === "human")) continue;
    output.push({
      kind, item_id: row.item_id, lang, source_hash: row.source_hash,
      value_hash: translationValueHash(row.value), english: item.english, context: item.context,
      translation: JSON.parse(row.value), source: row.source, license: row.license,
      attribution: JSON.parse(row.attribution), previous_review: previousReview,
      previous_reviewer_type: current?.reviewer_type ?? null
    });
  }
  return output;
}

export function translationReviewCoverage(db, kind, lang) {
  if (!KINDS.includes(kind) || !LANGUAGES.includes(lang)) throw new Error("Unsupported translation review selection");
  const rows = db.prepare(`SELECT kind,item_id,lang,source_hash,value FROM content_translations
    WHERE kind=? AND lang=? AND method='machine'`).all(kind, lang);
  const reviews = reviewLookup(db);
  const counts = { machine: rows.length, approved: 0, humanApproved: 0, aiApproved: 0, rejected: 0, uncertain: 0, pending: 0 };
  for (const row of rows) {
    const review = reviews.get(syncKey(row));
    const status = review?.source_hash === row.source_hash && review.value_hash === translationValueHash(row.value)
      ? review.status : null;
    if (status === "approved" && review.reviewer_type === "human") {
      counts.approved++;
      counts.humanApproved++;
    } else if (status === "approved") {
      counts.aiApproved++;
      counts.pending++;
    } else if (status === "rejected") counts.rejected++;
    else if (status === "uncertain") counts.uncertain++;
    else counts.pending++;
  }
  return counts;
}
// Rows are re-sent from this far before the watermark, so writes whose timestamps were taken just before a sync aren't missed.
const SYNC_OVERLAP_MS = 60_000;

// The local database is the source of truth; explicit deletions are tracked separately.
function pendingTranslationRows(db, destination) {
  db.exec("CREATE TABLE IF NOT EXISTS translation_sync (destination TEXT PRIMARY KEY, synced_until TEXT NOT NULL)");
  const last = db.prepare("SELECT synced_until FROM translation_sync WHERE destination = ?").get(destination)?.synced_until;
  const since = last ? new Date(Date.parse(last) - SYNC_OVERLAP_MS).toISOString() : "";
  const reviews = reviewLookup(db);
  return db.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations WHERE updated_at > ?
    ORDER BY updated_at, kind, item_id, lang`).all(since)
    .filter((row) => row.method === "human" || (
      currentReview(row, reviews)?.reviewer_type === "human" && reviewStatus(row, reviews) === "approved"
    ));
}

export function pendingTranslationSync(db, destination) {
  db.exec("BEGIN IMMEDIATE");
  try { return pendingTranslationRows(db, destination); }
  finally { db.exec("COMMIT"); }
}

export function pendingTranslationDeletes(db, destination) {
  const last = db.prepare("SELECT last_seq FROM translation_deletion_progress WHERE destination=?").get(destination)?.last_seq ?? 0;
  return db.prepare("SELECT seq, kind, item_id, lang, old_row FROM translation_deletion_log WHERE seq>? ORDER BY seq").all(last);
}

export async function auditTranslationContents(db, client, pageSize = 500, { ignoreUnreviewedLocal = false } = {}) {
  const localRows = db.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
    ORDER BY kind, item_id, lang`).all();
  const local = new Map(localRows.map((row) => [syncKey(row), row]));
  const reviews = ignoreUnreviewedLocal ? reviewLookup(db) : null;
  const seen = new Set();
  const issues = { matched: 0, contentMismatches: [], localOnly: [], pendingReview: 0, remoteOnly: [], protectedHuman: 0,
    protectedHumanKeys: [] };
  let cursor = null;
  while (true) {
    const result = cursor
      ? await client.execute({
        sql: `SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
          WHERE (kind, item_id, lang) > (?, ?, ?)
          ORDER BY kind, item_id, lang LIMIT ?`,
        args: [cursor.kind, cursor.item_id, cursor.lang, pageSize]
      })
      : await client.execute({
        sql: `SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
          ORDER BY kind, item_id, lang LIMIT ?`,
        args: [pageSize]
      });
    const rows = result.rows;
    for (const remote of rows) {
      const key = syncKey(remote), expected = local.get(key);
      if (!expected) {
        issues.remoteOnly.push(key);
      } else {
        seen.add(key);
        const differs = SYNC_COLUMNS.some((column) => remote[column] !== expected[column]);
        if (!differs) issues.matched++;
        else if (remote.method === "human" && expected.method === "machine") {
          issues.protectedHuman++;
          issues.protectedHumanKeys.push(key);
        }
        else if (differs) issues.contentMismatches.push(key);
      }
    }
    if (!rows.length) break;
    cursor = rows.at(-1);
    if (rows.length < pageSize) break;
  }
  for (const row of localRows) {
    const key = syncKey(row);
    if (!seen.has(key)) {
      if (ignoreUnreviewedLocal && row.method === "machine" && reviewStatus(row, reviews) !== "approved") issues.pendingReview++;
      else issues.localOnly.push(key);
    }
  }
  return issues;
}

export async function backupTranslationContents(db, client, output, pageSize = 500) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new Error("pageSize must be a positive integer");
  if (existsSync(output)) throw new Error(`Refusing to overwrite existing backup: ${output}`);
  const temporary = join(dirname(output), `.${basename(output)}.partial-${randomUUID()}`);
  const fd = openSync(temporary, "wx", 0o600);
  closeSync(fd);
  let backup;
  let transaction = false;
  try {
    backup = new DatabaseSync(temporary);
    chmodSync(temporary, 0o600);
    backup.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    backup.exec("CREATE TABLE translation_backup_metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    backup.exec("BEGIN IMMEDIATE");
    transaction = true;
    const insert = backup.prepare(`INSERT INTO content_translations (${SYNC_COLUMNS.join(", ")})
      VALUES (${SYNC_COLUMNS.map(() => "?").join(", ")})`);
    const localRows = db.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
      ORDER BY kind, item_id, lang`).all();
    const local = new Map(localRows.map((row) => [syncKey(row), row]));
    const seen = new Set(), digest = createHash("sha256");
    const issues = { matched: 0, contentMismatches: [], localOnly: [], remoteOnly: [], protectedHuman: 0,
      protectedHumanKeys: [] };
    let cursor = null, rowCount = 0;
    while (true) {
      const result = cursor
        ? await client.execute({
          sql: `SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
            WHERE (kind, item_id, lang) > (?, ?, ?) ORDER BY kind, item_id, lang LIMIT ?`,
          args: [cursor.kind, cursor.item_id, cursor.lang, pageSize]
        })
        : await client.execute({
          sql: `SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
            ORDER BY kind, item_id, lang LIMIT ?`, args: [pageSize]
        });
      for (const row of result.rows) {
        const values = SYNC_COLUMNS.map((column) => row[column]);
        insert.run(...values);
        digest.update(`${JSON.stringify(values)}\n`);
        rowCount++;
        const key = syncKey(row), expected = local.get(key);
        if (!expected) issues.remoteOnly.push(key);
        else {
          seen.add(key);
          if (SYNC_COLUMNS.every((column) => row[column] === expected[column])) issues.matched++;
          else if (row.method === "human" && expected.method === "machine") {
            issues.protectedHuman++;
            issues.protectedHumanKeys.push(key);
          } else issues.contentMismatches.push(key);
        }
      }
      if (!result.rows.length) break;
      cursor = result.rows.at(-1);
      if (result.rows.length < pageSize) break;
    }
    for (const row of localRows) {
      const key = syncKey(row);
      if (!seen.has(key)) issues.localOnly.push(key);
    }
    const metadata = backup.prepare("INSERT INTO translation_backup_metadata VALUES (?, ?)");
    metadata.run("created_at", new Date().toISOString());
    metadata.run("remote_row_count", String(rowCount));
    metadata.run("remote_rows_sha256", digest.digest("hex"));
    backup.exec("COMMIT");
    transaction = false;
    const check = backup.prepare("PRAGMA quick_check").get();
    if (check.quick_check !== "ok") throw new Error(`Translation backup failed integrity check: ${check.quick_check}`);
    backup.close();
    backup = null;
    linkSync(temporary, output);
    unlinkSync(temporary);
    return { rowCount, ...issues };
  } catch (error) {
    if (transaction) {
      try { backup.exec("ROLLBACK"); }
      catch (rollbackError) { throw new AggregateError([error, rollbackError], "Backup failed and rollback could not be confirmed"); }
    }
    throw error;
  } finally {
    backup?.close();
    if (existsSync(temporary)) unlinkSync(temporary);
  }
}

export function planTranslationRepair(localDb, remoteDb) {
  const localRows = localDb.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
    ORDER BY kind, item_id, lang`).all();
  const remoteRows = remoteDb.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
    ORDER BY kind, item_id, lang`).all();
  const local = new Map(localRows.map((row) => [syncKey(row), row]));
  const remote = new Map(remoteRows.map((row) => [syncKey(row), row]));
  const plan = {
    exact: [], additions: [], remoteOnly: [], machineUpdates: [], humanUpdates: [],
    humanConflicts: [], protectedHuman: []
  };
  for (const [key, row] of local) {
    const current = remote.get(key);
    if (!current) {
      plan.additions.push({ key: JSON.parse(key), method: row.method, source: row.source });
      continue;
    }
    const differs = SYNC_COLUMNS.some((column) => row[column] !== current[column]);
    if (!differs) plan.exact.push(JSON.parse(key));
    else if (current.method === "human" && row.method === "machine") {
      plan.protectedHuman.push({ key: JSON.parse(key), remoteSource: current.source });
    } else if (current.method === "human" && row.method === "human") {
      plan.humanConflicts.push({ key: JSON.parse(key), localSource: row.source, remoteSource: current.source });
    } else if (row.method === "human") {
      plan.humanUpdates.push({ key: JSON.parse(key), localSource: row.source, remoteSource: current.source });
    } else {
      plan.machineUpdates.push({ key: JSON.parse(key), localSource: row.source, remoteSource: current.source });
    }
  }
  for (const [key] of remote) {
    if (!local.has(key)) plan.remoteOnly.push(JSON.parse(key));
  }
  return plan;
}

async function syncTranslationDeletes(db, client, deletions, batchSize) {
  const groups = new Map();
  for (const deletion of deletions) {
    const key = syncKey(deletion);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(deletion);
  }
  const exists = db.prepare("SELECT 1 FROM content_translations WHERE kind=? AND item_id=? AND lang=?");
  let deleted = 0;
  const eligible = [...groups.values()].filter(([row]) => !exists.get(row.kind, row.item_id, row.lang));
  for (let start = 0; start < eligible.length; start += batchSize) {
    const batch = eligible.slice(start, start + batchSize);
    const tx = await client.transaction("write");
    try {
      for (const group of batch) {
        const row = group[0], args = [row.kind, row.item_id, row.lang];
        const current = (await tx.execute({ sql: `SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations
          WHERE kind=? AND item_id=? AND lang=?`, args })).rows[0];
        if (!current) continue;
        const expected = group.map((entry) => JSON.parse(entry.old_row));
        if (current.method === "human" || !expected.some((old) => SYNC_COLUMNS.every((column) => current[column] === old[column]))) {
          throw new Error(`Conflicting or human remote translation ${syncKey(row)}; refusing deletion`);
        }
        await tx.execute({ sql: "DELETE FROM content_translations WHERE kind=? AND item_id=? AND lang=?", args });
        deleted++;
      }
      await tx.commit();
    } catch (error) {
      try { await tx.rollback(); }
      catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Deletion batch failed and its rollback could not be confirmed");
      }
      throw error;
    } finally { tx.close(); }
  }
  return deleted;
}

export async function syncTranslations(db, client, destination, { batchSize = 200, onBatch } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("batchSize must be a positive integer");
  await client.executeMultiple(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
  // Keep the local snapshot and deletion journal stable until all remote operations finish.
  db.exec("BEGIN IMMEDIATE");
  try {
    if (db.prepare("SELECT count(*) n FROM translation_sync_deletions").get().n) {
      throw new Error("Legacy deletion records lack the deleted row; review them manually before syncing");
    }
    const rows = pendingTranslationRows(db, destination);
    const deletions = pendingTranslationDeletes(db, destination);
    const sql = `INSERT INTO content_translations (${SYNC_COLUMNS.join(", ")}) VALUES (${SYNC_COLUMNS.map(() => "?").join(", ")})
      ON CONFLICT(kind, item_id, lang) DO UPDATE SET ${SYNC_COLUMNS.slice(3).map((column) => `${column} = excluded.${column}`).join(", ")}
      WHERE content_translations.method <> 'human'`;
    const save = db.prepare(`INSERT INTO translation_sync VALUES (?, ?)
      ON CONFLICT(destination) DO UPDATE SET synced_until = excluded.synced_until`);
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      await client.batch(batch.map((row) => ({ sql, args: SYNC_COLUMNS.map((column) => row[column]) })), "write");
      save.run(destination, batch.at(-1).updated_at);
      onBatch?.(start + batch.length, rows.length);
    }
    const deleted = await syncTranslationDeletes(db, client, deletions, batchSize);
    if (deletions.length) {
      db.prepare(`INSERT INTO translation_deletion_progress VALUES (?, ?)
        ON CONFLICT(destination) DO UPDATE SET last_seq=excluded.last_seq`).run(destination, deletions.at(-1).seq);
    }
    const result = { synced: rows.length, deleted, ...await auditTranslationContents(db, client, 500, { ignoreUnreviewedLocal: true }) };
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function translationStatus(db, kind, lang) {
  const saved = new Map(db.prepare("SELECT item_id, method, source_hash FROM content_translations WHERE kind = ? AND lang = ?")
    .all(kind, lang).map((row) => [row.item_id, row]));
  const counts = { total: 0, human: 0, machine: 0, stale: 0, missing: 0 };
  const pending = [];
  for (const item of translationItems(db, kind)) {
    counts.total++;
    const row = saved.get(item.item_id);
    if (!row) { counts.missing++; pending.push(item); }
    else if (row.source_hash !== item.source_hash) { counts.stale++; pending.push(item); }
    else counts[row.method]++;
  }
  return { counts, pending };
}

export function parseTatoebaLinks(text) {
  const links = new Map();
  for (const line of text.split("\n")) {
    const [source, target] = line.split("\t");
    if (!source || !target) continue;
    links.set(source, [...(links.get(source) || []), target]);
  }
  return links;
}

export function parseTatoebaSentences(text, lang) {
  const sentences = new Map();
  for (const line of text.split("\n")) {
    const [id, language, sentence, owner] = line.split("\t");
    if (language !== lang || !sentence?.trim()) continue;
    sentences.set(id, { id: Number(id), text: sentence.trim(), owner: owner && owner !== "\\N" ? owner : null });
  }
  return sentences;
}

// Deterministically pick the lowest-ID direct translation that still exists.
export function pickTatoebaTranslation(japaneseId, links, sentences) {
  return (links.get(String(japaneseId)) || []).map((id) => sentences.get(id)).filter(Boolean)
    .sort((a, b) => a.id - b.id)[0] ?? null;
}

const LANGUAGE_NAMES = { es: ["Spanish", "es"], pt: ["Brazilian Portuguese", "pt-BR"] };

// TranslateGemma's documented single-text prompt. Glosses travel as one "; "-joined list so the
// model sees sibling glosses as context; a leading "(qualifier) text" is moved after the text in
// single-gloss fallbacks because the model tends to drop the head word otherwise.
export function translateGemmaPrompt(item, lang, english = item.english) {
  const [name, code] = LANGUAGE_NAMES[lang];
  const list = item.kind === "kanji" ? `meanings of the kanji ${item.context.kanji}`
    : `glosses for the Japanese word ${item.context.word} (${item.context.reading})`;
  const hint = item.kind === "sentence" ? ""
    : ` The text is a semicolon-separated list of dictionary ${list}; translate each one and keep the semicolons.`;
  const text = item.kind === "sentence" ? english[0]
    : english.length === 1 ? english[0].replace(/^\(([^)]*)\)\s*(.+)$/, "$2 ($1)") : english.join("; ");
  return `You are a professional English (en) to ${name} (${code}) translator. Your goal is to accurately convey the meaning and nuances of the original English text while adhering to ${name} grammar, vocabulary, and cultural sensitivities.${hint}
Produce only the ${name} translation, without any additional explanations or commentary. Please translate the following English text into ${name}:


${text}`;
}

// Splits raw model text into a value aligned with `english`, or null when a gloss list comes back misaligned.
export function splitModelOutput(item, text, english = item.english) {
  const clean = text.trim().replace(/^["“]([^"”]*)["”]$/, "$1").replace(/\s*\n+\s*/g, " ");
  if (item.kind === "sentence") return [clean];
  const parts = clean.split(";").map((part) => part.trim()).filter(Boolean);
  // A single gloss often comes back as a synonym list; keep the first, preferring one that keeps
  // the English qualifier, because later synonyms drift ("to catch (in a trap)" -> "encajar").
  if (english.length === 1 && parts.length > 1) {
    return [english[0].includes("(") ? parts.find((part) => part.includes("(")) ?? parts[0] : parts[0]];
  }
  return parts.length === english.length ? parts : null;
}

const fold = (text) => text.normalize("NFC").toLocaleLowerCase().replace(/\s+/g, " ").trim();
const withoutParentheticals = (text) => text.replace(/\([^()]*\)/g, "").trim();
const sentenceCount = (text) => (text.match(/[.?!。]+(?=\s|$)/g) || []).length;
function balanced(text) {
  let depth = 0;
  for (const char of text) {
    if (char === "(" || char === "[") depth++;
    else if ((char === ")" || char === "]") && --depth < 0) return false;
  }
  return depth === 0;
}

// Drops case-insensitive duplicates such as "empujar; empujar; empujar" -> ["empujar"].
export const dedupeGlosses = (values) => values.filter((value, index) =>
  values.findIndex((other) => fold(other) === fold(value)) === index);

// Heuristics for machine output that is structurally valid but not usable study content.
export function qualityIssue(item, value) {
  for (const text of value) {
    if (/[\u2581\ufffd]/.test(text)) return "tokenizer artifacts";
    if (!balanced(text)) return "unbalanced brackets";
    if (/^[;,:.]/.test(text) || (/[;,:]$/.test(text) && !item.english.some((english) => english.endsWith(text.at(-1))))) {
      return "stray separator";
    }
    const words = `${fold(text).replace(/[.!?。…]+$/u, "")} `;
    if (/(\S.{3,}?\s)\1{2,}/u.test(words) || /(?<!\p{L})(\p{L}+)(?:\s+\1(?!\p{L})){2,}/u.test(words)) return "repetition loop";
  }
  if (item.kind === "sentence") {
    const english = item.english[0], text = value[0], ratio = text.length / english.length;
    if (fold(text) === fold(english) && /\p{L}{3}/u.test(english)) return "untranslated";
    if (english.length > 15 && (ratio < 0.25 || ratio > 3)) return "implausible length";
    if (sentenceCount(english) > 1 && sentenceCount(text) < sentenceCount(english) && ratio < 0.75) return "dropped sentence";
    return null;
  }
  const englishHasHeads = item.english.every((gloss) => /\p{L}/u.test(withoutParentheticals(gloss)));
  if (englishHasHeads && value.some((text) => !/\p{L}/u.test(withoutParentheticals(text)))) return "only a parenthetical";
  if (value.length === item.english.length && value.every((text, index) => fold(text) === fold(item.english[index]))
    && item.english.join("").length > 12) return "untranslated";
  return null;
}

// Structural validation (throws) plus dedupe; returns the usable value and any quality issue.
export function checkTranslation(item, value) {
  let clean = validateTranslation(item, value);
  if (item.kind !== "sentence") clean = dedupeGlosses(clean);
  return { value: clean, issue: qualityIssue(item, clean) };
}
