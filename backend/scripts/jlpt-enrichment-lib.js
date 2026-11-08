import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { databasePath } from "../src/database.js";
import { dictionaryForms } from "../src/shiritori.js";
import { kana } from "../src/shiritori-rules.js";
import { romanizeKana } from "../../frontend/src/romanize.js";
import { transaction } from "./enrichment-lib.js";
import { parseArgs } from "node:util";
import { openJlptRevision } from "./sources.js";

export function parseJlptArgs(args) {
  const normalized = [];
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") { normalized.push(...args.slice(index)); break; }
    if (["--db", "--openjlpt-revision", "--anki-revision"].includes(arg)) {
      normalized.push(arg);
      if (index + 1 < args.length) normalized.push(args[++index]);
    } else if (arg === "--report") {
      const next = args[index + 1];
      normalized.push(next !== undefined && (!next.startsWith("-") || next === "-")
        ? `--report=${args[++index]}` : "--report=-");
    } else normalized.push(arg);
  }
  const { values } = parseArgs({ args: normalized, options: {
    db: { type: "string" }, apply: { type: "boolean" }, estimates: { type: "boolean" },
    report: { type: "string" }, offline: { type: "boolean" }, help: { type: "boolean" },
    "openjlpt-revision": { type: "string", default: openJlptRevision },
    "anki-revision": { type: "string", default: "1ad66734417aca9dbcca6b2d5ee440cb13ab3ba0" }
  } });
  if (values.report === "") throw new Error("--report requires a nonempty filename, or use --report alone for stdout");
  return values;
}

export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const jlptSchema = `
CREATE TABLE IF NOT EXISTS jlpt_assignments (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK(kind IN ('kanji','word')),
  word TEXT NOT NULL, reading TEXT NOT NULL, jmdict_id TEXT,
  jlpt INTEGER NOT NULL CHECK(jlpt BETWEEN 1 AND 5),
  method TEXT NOT NULL CHECK(method IN ('dataset','estimate')),
  confidence TEXT NOT NULL, sources TEXT NOT NULL CHECK(json_valid(sources)),
  reason TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jlpt_changes (
  seq INTEGER PRIMARY KEY, assignment TEXT NOT NULL CHECK(json_valid(assignment))
);
CREATE TABLE IF NOT EXISTS jlpt_sync (
  destination TEXT PRIMARY KEY, last_seq INTEGER NOT NULL
);`;
const fields = ["id", "kind", "word", "reading", "jmdict_id", "jlpt", "method", "confidence", "sources", "reason", "created_at"];
const validLevel = (value) => Number.isInteger(value) && value >= 1 && value <= 5;
const pairKey = (word, reading) => `${word.normalize("NFC")}\0${kana(reading)}`;
export const hasTable = (db, name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));

export function parseKezuruVocabulary(text, level, source) {
  const rows = JSON.parse(text);
  if (![4, 5].includes(level) || !Array.isArray(rows) || !rows.length) throw new Error("Invalid Kezuru vocabulary snapshot");
  return rows.map((row) => {
    if (!row || typeof row.kana_writing !== "string" || !row.kana_writing.trim()
      || row.kanji !== null && (typeof row.kanji !== "string" || !row.kanji.trim())) {
      throw new Error("Invalid Kezuru spelling/reading record");
    }
    return { kind: "word", word: (row.kanji ?? row.kana_writing).trim(),
      reading: row.kana_writing.trim(), level, source };
  });
}

export function openJlptDatabase(path = databasePath, readOnly = false) {
  if (!existsSync(path)) throw new Error(`Database not found: ${path}`);
  const db = new DatabaseSync(path, { readOnly });
  try {
    for (const table of ["words", "kanjis", "vocabulary"]) {
      if (!hasTable(db, table)) throw new Error(`Imported dictionary table missing: ${table}`);
    }
    db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
    return db;
  } catch (error) { db.close(); throw error; }
}

export function validateAssignment(item) {
  if (!item || !["word", "kanji"].includes(item.kind) || !validLevel(item.jlpt)
    || !["dataset", "estimate"].includes(item.method) || !["study-list", "low"].includes(item.confidence)
    || typeof item.word !== "string" || !item.word || typeof item.reading !== "string"
    || typeof item.reason !== "string" || !item.reason || !Array.isArray(JSON.parse(item.sources))
    || typeof item.created_at !== "string" || !Number.isFinite(Date.parse(item.created_at))) {
    throw new Error("Invalid JLPT assignment");
  }
  if (item.kind === "kanji" ? !/^\p{Unified_Ideograph}$/u.test(item.word)
    : !item.jmdict_id || !/^[ぁ-ゖァ-ヶー・]+$/u.test(item.reading)) throw new Error(`Invalid JLPT entry identity: ${item.word} / ${item.reading}`);
  const sources = JSON.parse(item.sources);
  if (!sources.length || sources.some((source) => !source?.name || !source.license || !/^https:\/\//.test(source.url)
    || item.method === "dataset" && (!/^[a-f0-9]{64}$/.test(source.sha256) || !/^[a-f0-9]{40}$/.test(source.revision)))
    || item.confidence !== (item.method === "dataset" ? "study-list" : "low")) throw new Error("Invalid JLPT provenance");
  if (item.id !== assignmentId(item)) throw new Error("JLPT assignment identity mismatch");
}

function assignmentId(item) {
  return `jlpt-${item.method}:${hash(JSON.stringify([item.kind, item.jmdict_id ?? null, item.word, item.reading]))}`;
}
function assignment(kind, word, reading, jmdictId, level, evidence) {
  const item = { kind, word, reading, jmdict_id: jmdictId, jlpt: level, ...evidence, created_at: new Date().toISOString() };
  item.sources = JSON.stringify(item.sources);
  item.id = assignmentId(item);
  validateAssignment(item);
  return item;
}

export function estimateKanji(row) {
  if (row.jlpt_old) return { level: ({ 4: 5, 3: 4, 2: 2, 1: 1 })[row.jlpt_old],
    reason: `Heuristic v1: legacy JLPT ${row.jlpt_old}; old level 2 does not distinguish modern N2/N3.` };
  if (row.grade >= 1 && row.grade <= 6) return {
    level: row.grade === 1 ? 5 : row.grade === 2 ? 4 : row.grade <= 4 ? 3 : 2,
    reason: `Heuristic v1: Japanese school grade ${row.grade}; school curriculum is not a JLPT assignment.`
  };
  if (row.frequency >= 1 && row.frequency <= 2500) return {
    level: row.frequency <= 500 ? 3 : row.frequency <= 1500 ? 2 : 1,
    reason: `Heuristic v1: Mainichi frequency rank ${row.frequency}; frequency is not JLPT difficulty.`
  };
  return null;
}

export function planJlpt(db, records, { estimates = false } = {}) {
  const kanjis = db.prepare("SELECT character,jlpt,jlpt_old,grade,frequency FROM kanjis").all();
  const kanjiByChar = new Map(kanjis.map((row) => [row.character, row]));
  const words = db.prepare("SELECT * FROM words ORDER BY id").all();
  const byId = new Map(words.map((row) => [row.id, row]));
  const requested = new Set(records.filter((row) => row.kind === "word").map((row) => pairKey(row.word, row.reading)));
  const kanaRecords = new Map();
  for (const record of records) {
    if (record.kind !== "word" || !/^[ぁ-ゖァ-ヶー]+$/u.test(record.word) || kana(record.word) !== kana(record.reading)) continue;
    const reading = kana(record.reading);
    if (!kanaRecords.has(reading)) kanaRecords.set(reading, []);
    kanaRecords.get(reading).push(record);
  }
  const index = new Map(), canonical = new Map();
  for (const row of words) {
    const kanaLevels = JSON.parse(row.kana_forms).flatMap((reading) => kanaRecords.get(kana(reading.text)) || []);
    for (const form of dictionaryForms(row, {}, kanaLevels)) {
      if (!form.meaning || form.proper) continue;
      const key = pairKey(form.word, form.reading);
      if (requested.has(key)) {
        if (!index.has(key)) index.set(key, new Map());
        index.get(key).set(row.id, form);
      }
      if (row.is_common && form.word === row.word && form.reading === row.reading) canonical.set(row.id, form);
    }
  }
  const rated = new Map();
  for (const row of db.prepare("SELECT word_id,word,reading,jlpt FROM vocabulary").all()) {
    rated.set(`${row.word_id}\0${pairKey(row.word, row.reading)}`, row.jlpt);
  }
  if (hasTable(db, "vocabulary_words")) {
    for (const row of db.prepare("SELECT word_id,word,reading,jlpt FROM vocabulary_words WHERE jlpt IS NOT NULL").all()) {
      rated.set(`${row.word_id}\0${pairKey(row.word, row.reading)}`, row.jlpt);
    }
  }
  const candidates = new Map(), conflicts = [], unmatched = [];
  for (const record of records) {
    if (!["word", "kanji"].includes(record.kind) || !validLevel(record.level) || !record.source
      || typeof record.word !== "string" || !record.word
      || record.kind === "word" && typeof record.reading !== "string") throw new Error("Invalid JLPT source record");
    let wordId = null, form;
    if (record.kind === "kanji") {
      if (!kanjiByChar.has(record.word)) { unmatched.push({ word: record.word, reason: "Not in local KANJIDIC" }); continue; }
      if (kanjiByChar.get(record.word).jlpt !== null) continue;
    } else {
      let matches = [...(index.get(pairKey(record.word, record.reading)) || [])];
      if (record.jmdict_id) matches = matches.filter(([id]) => byId.get(id).jmdict_id === String(record.jmdict_id));
      if (matches.length !== 1) {
        unmatched.push({ word: record.word, reading: record.reading, reason: matches.length ? "Ambiguous dictionary identity" : "No exact permitted spelling/reading" });
        continue;
      }
      [wordId, form] = matches[0];
      if (rated.has(`${wordId}\0${pairKey(form.word, form.reading)}`) || rated.has(`null\0${pairKey(form.word, form.reading)}`)) continue;
    }
    const key = record.kind === "kanji" ? `kanji:${record.word}` : `word:${wordId}\0${pairKey(form.word, form.reading)}`;
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push({ record, wordId, form });
  }
  const assignments = [], blocked = new Set();
  for (const [key, items] of candidates) {
    const listed = items.filter(({ record }) => !record.estimated);
    const evidence = listed.length ? listed : items;
    const levels = [...new Set(evidence.map(({ record }) => record.level))];
    if (levels.length !== 1) {
      blocked.add(key);
      conflicts.push({ key, levels, sources: evidence.map(({ record }) => record.source) });
      continue;
    }
    const { record, wordId, form } = evidence[0];
    const method = listed.length ? "dataset" : "estimate";
    if (method === "estimate" && !estimates) continue;
    assignments.push(assignment(record.kind, form?.word ?? record.word, form?.reading ?? "",
      wordId === null ? null : byId.get(wordId).jmdict_id, levels[0], {
        method, confidence: method === "dataset" ? "study-list" : "low",
        sources: [...new Map(evidence.map(({ record }) => [JSON.stringify(record.source), record.source])).values()],
        reason: method === "dataset" ? "Exact community study-list match; not an official JLPT assignment." : "Source explicitly labels this supplementary kanji as an estimate."
      }));
  }
  const heuristicSource = [{ name: "Nihon heuristic v1", license: "Derived from EDRDG CC BY-SA 4.0", url: "https://www.edrdg.org/",
    dictionaryMetadata: Object.fromEntries(db.prepare("SELECT key,value FROM metadata WHERE key IN ('sources','revisions','imported_at')").all()
      .map((row) => row.key === "sources" ? ["sourcesSha256", hash(row.value)] : [row.key, row.value])) }];
  const assignedKanji = new Map(assignments.filter((a) => a.kind === "kanji").map((a) => [a.word, a.jlpt]));
  if (estimates) {
    for (const row of kanjis) {
      if (row.jlpt !== null || assignedKanji.has(row.character) || blocked.has(`kanji:${row.character}`)) continue;
      const guess = estimateKanji(row);
      if (!guess) continue;
      assignments.push(assignment("kanji", row.character, "", null, guess.level, {
        method: "estimate", confidence: "low", sources: heuristicSource, reason: guess.reason
      }));
      assignedKanji.set(row.character, guess.level);
    }
    const assignedWords = new Set(assignments.filter((a) => a.kind === "word").map((a) => `${a.jmdict_id}\0${pairKey(a.word, a.reading)}`));
    for (const [id, form] of canonical) {
      const row = byId.get(id), pair = pairKey(form.word, form.reading);
      if (rated.has(`${id}\0${pair}`) || rated.has(`null\0${pair}`) || assignedWords.has(`${row.jmdict_id}\0${pair}`) || blocked.has(`word:${id}\0${pair}`)) continue;
      const characters = [...new Set([...form.word].filter((c) => /\p{Script=Han}/u.test(c)))];
      const levels = characters.map((c) => kanjiByChar.get(c)?.jlpt ?? assignedKanji.get(c));
      if (levels.some((level) => !validLevel(level))) continue;
      assignments.push(assignment("word", form.word, form.reading, row.jmdict_id, Math.min(3, ...levels), {
        method: "estimate", confidence: "low", sources: heuristicSource,
        reason: `Heuristic v1: JMdict common canonical form; ${characters.length ? `hardest constituent kanji N${Math.min(...levels)}` : "kana-only"}. Never estimates easier than N3; kanji familiarity does not establish word difficulty.`
      }));
    }
  }
  return { assignments, conflicts, unmatched, coverage: { totalKanji: kanjis.length, unratedKanji: kanjis.filter((k) => k.jlpt === null).length, totalWords: words.length },
    summary: { dataset: assignments.filter((a) => a.method === "dataset").length, estimates: assignments.filter((a) => a.method === "estimate").length,
      kanji: assignments.filter((a) => a.kind === "kanji").length, words: assignments.filter((a) => a.kind === "word").length,
      conflicts: conflicts.length, unmatched: unmatched.length } };
}

function sourceLabel(item) {
  return `${item.method === "estimate" ? "ESTIMATE (low confidence)" : "Community study list"}: ${item.reason}`;
}
function vocabularyInsert(item, row) {
  const form = dictionaryForms(row, {}, [item]).find((form) => form.word === item.word && form.reading === item.reading);
  if (!form?.meaning) throw new Error(`Dictionary spelling/reading changed: ${item.word} / ${item.reading}`);
  return { sql: `INSERT INTO vocabulary
    (id,word_id,word,reading,romaji,meanings,jlpt,parts_of_speech,examples,other_forms,other_readings)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  args: [item.id, row.id, item.word, item.reading, romanizeKana(item.reading), JSON.stringify(form.meaning.split("; ")),
    item.jlpt, JSON.stringify(form.partOfSpeech.split(", ").filter(Boolean)), "[]", "[]", "[]"] };
}
const assignmentInsert = (item) => ({
  sql: `INSERT INTO jlpt_assignments (${fields.join(",")}) VALUES (${fields.map(() => "?").join(",")})`,
  args: fields.map((field) => item[field])
});

export function applyJlpt(db, assignments) {
  return transaction(db, () => {
    db.exec(jlptSchema);
    let applied = 0;
    for (const item of assignments) {
      validateAssignment(item);
      const previous = db.prepare("SELECT jlpt FROM jlpt_assignments WHERE id=?").get(item.id);
      if (previous) {
        if (previous.jlpt !== item.jlpt) throw new Error(`Existing assignment has a different level: ${item.word}`);
        continue;
      }
      if (item.kind === "kanji") {
        const row = db.prepare("SELECT jlpt FROM kanjis WHERE character=?").get(item.word);
        if (!row) throw new Error(`Kanji no longer exists: ${item.word}`);
        if (row.jlpt !== null) throw new Error(`Kanji gained a level since planning: ${item.word}`);
        db.prepare("UPDATE kanjis SET jlpt=?,jlpt_source=? WHERE character=? AND jlpt IS NULL").run(item.jlpt, sourceLabel(item), item.word);
      } else {
        const row = db.prepare("SELECT * FROM words WHERE jmdict_id=?").get(item.jmdict_id);
        if (!row) throw new Error(`JMdict entry no longer exists: ${item.jmdict_id}`);
        if (db.prepare("SELECT 1 FROM vocabulary WHERE (word_id=? OR word_id IS NULL) AND word=? AND reading=?").get(row.id, item.word, item.reading)) {
          throw new Error(`Word gained a level since planning: ${item.word}`);
        }
        if (hasTable(db, "vocabulary_words") && db.prepare("SELECT 1 FROM vocabulary_words WHERE word_id=? AND word=? AND reading=? AND jlpt IS NOT NULL")
          .get(row.id, item.word, item.reading)) throw new Error(`Seed word gained a level since planning: ${item.word}`);
        const statement = vocabularyInsert(item, row);
        db.prepare(statement.sql).run(...statement.args);
        if (hasTable(db, "vocabulary_words")) db.prepare(`UPDATE vocabulary_words SET jlpt=?,source=source || ? WHERE word_id=? AND word=? AND reading=? AND jlpt IS NULL`)
          .run(item.jlpt, `; ${sourceLabel(item)}`, row.id, item.word, item.reading);
      }
      const insert = assignmentInsert(item);
      db.prepare(insert.sql).run(...insert.args);
      db.prepare("INSERT INTO jlpt_changes(assignment) VALUES (?)").run(JSON.stringify(item));
      applied++;
    }
    return applied;
  });
}

export function pendingJlpt(db, destination) {
  if (!hasTable(db, "jlpt_changes")) return [];
  const cursor = db.prepare("SELECT last_seq FROM jlpt_sync WHERE destination=?").get(destination)?.last_seq ?? 0;
  return db.prepare("SELECT seq,assignment FROM jlpt_changes WHERE seq>? ORDER BY seq").all(cursor);
}

export async function syncJlpt(db, client, destination, { allowEstimates = false, batchSize = 25 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new Error("Batch size must be 1-100");
  const changes = pendingJlpt(db, destination);
  for (const change of changes) {
    const item = JSON.parse(change.assignment);
    validateAssignment(item);
    if (item.method === "estimate" && !allowEstimates) throw new Error("Pending estimates require --allow-estimates; no rows have been synced.");
  }
  if (!changes.length) return 0;
  await client.executeMultiple(jlptSchema);
  const seed = (await client.execute("SELECT 1 FROM sqlite_master WHERE name='vocabulary_words'")).rows.length > 0;
  for (let offset = 0; offset < changes.length; offset += batchSize) {
    const batch = changes.slice(offset, offset + batchSize);
    const items = batch.map((change) => JSON.parse(change.assignment));
    const tx = await client.transaction("write");
    try {
      const read = async (table, column, values) => values.length
        ? (await tx.execute({ sql: `SELECT * FROM ${table} WHERE ${column} IN (${values.map(() => "?").join(",")})`, args: values })).rows : [];
      const previousRows = new Map((await read("jlpt_assignments", "id", items.map((item) => item.id))).map((row) => [row.id, row]));
      const kanjiRows = new Map((await read("kanjis", "character", items.filter((item) => item.kind === "kanji").map((item) => item.word))).map((row) => [row.character, row]));
      const wordRows = new Map((await read("words", "jmdict_id", items.filter((item) => item.kind === "word").map((item) => item.jmdict_id))).map((row) => [row.jmdict_id, row]));
      const vocabularyRows = await read("vocabulary", "word", items.filter((item) => item.kind === "word").map((item) => item.word));
      const seedRows = seed ? await read("vocabulary_words", "word_id", [...wordRows.values()].map((row) => row.id)) : [];
      const writes = [];
      for (const item of items) {
        const previous = previousRows.get(item.id);
        if (previous && fields.some((field) => previous[field] !== item[field])) throw new Error(`Remote provenance conflict: ${item.word}`);
        if (item.kind === "kanji") {
          const remote = kanjiRows.get(item.word);
          if (!remote) throw new Error(`Remote kanji missing: ${item.word}`);
          if (remote.jlpt !== null && (remote.jlpt !== item.jlpt || remote.jlpt_source !== sourceLabel(item) || !previous)) {
            throw new Error(`Remote kanji already rated: ${item.word}; refusing to overwrite`);
          }
          writes.push({ sql: "UPDATE kanjis SET jlpt=?,jlpt_source=? WHERE character=? AND jlpt IS NULL",
            args: [item.jlpt, sourceLabel(item), item.word] });
        } else {
          const row = wordRows.get(item.jmdict_id);
          if (!row) throw new Error(`Remote JMdict entry missing: ${item.jmdict_id}; sync dictionary enrichment first`);
          const insert = vocabularyInsert(item, row);
          const rated = vocabularyRows.filter((v) => (v.word_id === row.id || v.word_id === null) && v.word === item.word && v.reading === item.reading);
          if (rated.length && (rated.length !== 1 || rated[0].id !== item.id || rated[0].jlpt !== item.jlpt || !previous)) {
            throw new Error(`Remote word already rated: ${item.word}; refusing to overwrite`);
          }
          if (seedRows.some((v) => v.word_id === row.id && v.word === item.word && v.reading === item.reading && v.jlpt !== null && v.jlpt !== item.jlpt)) {
            throw new Error(`Remote seed word already has a different level: ${item.word}`);
          }
          if (!rated.length) writes.push(insert);
          if (seed) writes.push({ sql: "UPDATE vocabulary_words SET jlpt=?,source=source || ? WHERE word_id=? AND word=? AND reading=? AND jlpt IS NULL",
            args: [item.jlpt, `; ${sourceLabel(item)}`, row.id, item.word, item.reading] });
        }
        if (!previous) writes.push(assignmentInsert(item));
      }
      if (writes.length) await tx.batch(writes);
      await tx.commit();
    } catch (error) { await tx.rollback(); throw error; }
    finally { tx.close(); }
    db.prepare("INSERT INTO jlpt_sync VALUES (?,?) ON CONFLICT(destination) DO UPDATE SET last_seq=excluded.last_seq")
      .run(destination, batch.at(-1).seq);
  }
  return changes.length;
}
