import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { databasePath } from "../src/database.js";

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const tables = ["enrichment_sources", "words", "kanji_words", "sentences", "word_sentences", "enrichment_word_sources"];
export const schema = `
CREATE TABLE IF NOT EXISTS enrichment_sources (
  id TEXT PRIMARY KEY, url TEXT NOT NULL, sha256 TEXT NOT NULL,
  license TEXT NOT NULL, retrieved_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrichment_word_sources (
  word_id INTEGER NOT NULL REFERENCES words(id), source_id TEXT NOT NULL REFERENCES enrichment_sources(id),
  PRIMARY KEY(word_id, source_id)
);
CREATE TABLE IF NOT EXISTS enrichment_changes (
  seq INTEGER PRIMARY KEY, table_name TEXT NOT NULL, row_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS enrichment_sync (
  destination TEXT PRIMARY KEY, last_seq INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS enrichment_attempts (
  word_id INTEGER NOT NULL REFERENCES words(id), provider TEXT NOT NULL,
  attempted_at TEXT NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL,
  PRIMARY KEY(word_id, provider)
);
CREATE TABLE IF NOT EXISTS enrichment_candidates (
  word TEXT NOT NULL, reading TEXT NOT NULL, source_url TEXT NOT NULL,
  PRIMARY KEY(word, reading, source_url)
);
CREATE TABLE IF NOT EXISTS enrichment_progress (
  source_id TEXT PRIMARY KEY, next_offset INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS enrichment_generated (
  id TEXT PRIMARY KEY, word_id INTEGER NOT NULL REFERENCES words(id), ja TEXT NOT NULL, en TEXT NOT NULL,
  attribution TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
  UNIQUE(word_id, ja)
);`;

export function openEnrichment(path = databasePath) {
  if (!existsSync(path)) throw new Error(`Database not found: ${path}`);
  const db = new DatabaseSync(path);
  if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name='words'").get()) {
    db.close();
    throw new Error("An imported dictionary database is required");
  }
  db.exec("PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000");
  db.exec(readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8"));
  db.exec(schema);
  for (const table of tables) {
    const columns = db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
    db.exec(`CREATE TRIGGER IF NOT EXISTS enrichment_insert_${table} AFTER INSERT ON ${table} BEGIN
      INSERT INTO enrichment_changes(table_name,row_json) VALUES ('${table}',
        json_object(${columns.flatMap((column) => [`'${column}'`, `NEW.${column}`]).join(",")}));
    END`);
  }
  return db;
}

export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function recordSource(db, { url, hash, license }) {
  const id = sha256(`${url}\n${hash}`);
  db.prepare("INSERT OR IGNORE INTO enrichment_sources VALUES (?,?,?,?,?)")
    .run(id, url, hash, license, new Date().toISOString());
  return id;
}

export function coverage(db, target = 3) {
  return db.prepare(`SELECT count(*) words,
    sum(n = 0) without_examples, sum(n < ?) below_target, sum(n >= ?) at_target,
    (SELECT count(*) FROM sentences) sentences,
    (SELECT count(*) FROM sentences WHERE source='ai-generated') generated_sentences
    FROM (SELECT w.id, count(DISTINCT s.ja) n FROM words w
      LEFT JOIN word_sentences ws ON ws.word_id=w.id
      LEFT JOIN sentences s ON s.id=ws.sentence_id GROUP BY w.id)`).get(target, target);
}

export function missingWords(db, target = 3) {
  return db.prepare(`SELECT w.*, count(DISTINCT s.ja) example_count FROM words w
    LEFT JOIN word_sentences ws ON ws.word_id=w.id
    LEFT JOIN sentences s ON s.id=ws.sentence_id
    GROUP BY w.id HAVING count(DISTINCT s.ja) < ?
    ORDER BY COALESCE((SELECT max(v.jlpt) FROM vocabulary v WHERE v.word_id=w.id),0) DESC,
      w.is_common DESC, w.id`).all(target);
}

export function sentenceWriter(db) {
  const insert = db.prepare("INSERT OR IGNORE INTO sentences VALUES (?,?,?,?,?,?,?)");
  const link = db.prepare("INSERT OR IGNORE INTO word_sentences VALUES (?,?,?)");
  const saved = db.prepare("SELECT ja FROM sentences WHERE id=?");
  return (sentence, matches) => {
    if (!matches.length) return 0;
    const existing = saved.get(sentence.id);
    const id = existing && existing.ja !== sentence.ja
      ? `${sentence.id}:${sha256(sentence.ja).slice(0, 16)}` : sentence.id;
    if (id !== sentence.id && !saved.get(id)) console.warn(`Preserving changed source sentence as ${id}`);
    const changes = Number(insert.run(id, sentence.ja, sentence.en, sentence.source,
      sentence.sourceId ?? null, sentence.license, sentence.attribution).changes);
    for (const match of matches) link.run(match.id, id, match.matched);
    return changes;
  };
}

export const hiragana = (value) => value.replace(/[\u30a1-\u30f6]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0x60));

export function lexicalIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const kana = JSON.parse(row.kana_forms);
    for (const form of [...JSON.parse(row.kanji_forms), ...kana]) {
      const readings = kana.filter((reading) => reading.appliesToKanji.includes("*")
        || reading.appliesToKanji.includes(form.text) || reading.text === form.text).map((reading) => hiragana(reading.text));
      const entries = index.get(form.text) ?? [];
      entries.push({ id: row.id, readings });
      index.set(form.text, entries);
    }
  }
  return index;
}

export function sentenceMatches(text, tokenizer, index) {
  const matches = new Map();
  for (const token of tokenizer.tokenize(text)) {
    const form = token.basic_form === "*" ? token.surface_form : token.basic_form;
    let candidates = index.get(form) ?? [];
    if (candidates.length > 1 && token.reading) {
      candidates = candidates.filter((candidate) => candidate.readings.includes(hiragana(token.reading)));
    }
    const ids = [...new Set(candidates.map((candidate) => candidate.id))];
    // Homographs with multiple dictionary entries require manual sense disambiguation.
    if (ids.length === 1) matches.set(ids[0], { id: ids[0], matched: token.surface_form });
  }
  return [...matches.values()];
}

export function parseParallel(line) {
  const [en, ja, credit] = line.split("\t");
  if (!en || !ja || !credit) throw new Error("Malformed parallel sentence row");
  const match = /tatoeba\.org #(\d+) \((.*?)\) & #(\d+) \((.*?)\)/.exec(credit);
  if (!match || !/CC-BY 2\.0 \(France\)/.test(credit)) throw new Error("Missing supported license/attribution");
  return { id: `tatoeba:${match[3]}`, ja, en, source: "tatoeba", sourceId: match[3],
    license: "CC BY 2.0 FR",
    attribution: JSON.stringify({ owner: match[4], translationId: Number(match[1]), translationOwner: match[2],
      sourceUrl: `https://tatoeba.org/sentences/show/${match[3]}`, collection: "https://www.manythings.org/anki/" }) };
}

export function exampleGenerationPrompt(word, count) {
  const meanings = JSON.parse(word.meanings);
  if (!Array.isArray(meanings) || !meanings.length
      || meanings.some((meaning) => typeof meaning !== "string" || !meaning.trim())) {
    throw new Error(`Word ${word.id} needs English dictionary meanings before generating examples`);
  }
  const target = { japanese: word.word, reading: word.reading, englishMeaning: meanings[0].trim() };
  return {
    target,
    messages: [
      { role: "system", content: [
        "You write accurate Japanese learning examples.",
        'Return only JSON {"examples":[{"ja":"...","en":"..."}]}.',
        "The user supplies a Japanese base word, its reading, and ONE intended English dictionary meaning.",
        "Use that Japanese word naturally with exactly that intended sense in every Japanese sentence.",
        "The corresponding English sentence must faithfully express that same meaning and translate the whole Japanese sentence.",
        "Do not switch to a different sense, invent a synonym with a different meaning, or omit the target meaning from the translation.",
        "The target must be an actual word in context, not merely characters inside an unrelated longer word (for example, pet is not trumpet).",
        "Use the supplied Japanese spelling. Write distinct complete sentences with Japanese punctuation.",
        "No definitions, quotations of the word, dictionary discussions, romaji, or placeholder sentences.",
        "Before answering, check that each Japanese/English pair uses the supplied meaning consistently.",
        "If unsure about usage or translation, return an empty examples array rather than guessing."
      ].join(" ") },
      { role: "user", content: JSON.stringify({ target, count }) }
    ]
  };
}

export function validateGeneratedExamples(examples, word, needed, existing = new Set()) {
  const accepted = [];
  for (const example of Array.isArray(examples) ? examples : []) {
    if (typeof example?.ja !== "string" || typeof example.en !== "string") continue;
    const ja = example.ja.trim(), en = example.en.trim();
    if (!ja.includes(word) || ja.length < 5 || ja.length > 200 || en.length < 5 || en.length > 500
        || !/[。！？]$/.test(ja) || !/[A-Za-z]/.test(en) || /[「」『』]|という言葉|という単語/.test(ja)
        || existing.has(ja)) continue;
    existing.add(ja);
    accepted.push({ ja, en });
    if (accepted.length === needed) break;
  }
  return accepted;
}

export function queueGenerated(db, wordId, example, attribution) {
  const id = `ai:${sha256(`${wordId}\n${example.ja}`)}`;
  return Number(db.prepare("INSERT OR IGNORE INTO enrichment_generated (id,word_id,ja,en,attribution) VALUES (?,?,?,?,?)")
    .run(id, wordId, example.ja, example.en, JSON.stringify(attribution)).changes);
}

export function reviewGenerated(db, ids, status) {
  if (!["approved", "rejected"].includes(status)) throw new Error("Review status must be approved or rejected");
  return transaction(db, () => {
    const save = sentenceWriter(db);
    for (const id of ids) {
      const row = db.prepare("SELECT * FROM enrichment_generated WHERE id=?").get(id);
      if (!row || row.status !== "pending") throw new Error(`Not a pending generated example: ${id}`);
      if (status === "approved") {
        const word = db.prepare("SELECT word FROM words WHERE id=?").get(row.word_id);
        save({ id, ja: row.ja, en: row.en, source: "ai-generated",
          license: "AI-generated; model terms apply",
          attribution: JSON.stringify({ ...JSON.parse(row.attribution), reviewed: true, reviewedAt: new Date().toISOString() })
        }, [{ id: row.word_id, matched: word.word }]);
      }
      db.prepare("UPDATE enrichment_generated SET status=? WHERE id=?").run(status, id);
    }
  });
}

export function quarantineUnreviewed(db) {
  return transaction(db, () => {
    const rows = db.prepare(`SELECT s.*,ws.word_id FROM sentences s JOIN word_sentences ws ON ws.sentence_id=s.id
      WHERE s.source='ai-generated' AND COALESCE(CASE WHEN json_valid(s.attribution)
        THEN json_extract(s.attribution,'$.reviewed') END,0)=0`).all();
    const synced = db.prepare("SELECT max(last_seq) n FROM enrichment_sync").get().n ?? 0;
    for (const row of rows) {
      const changes = db.prepare(`SELECT seq FROM enrichment_changes WHERE
        (table_name='sentences' AND json_extract(row_json,'$.id')=?)
        OR (table_name='word_sentences' AND json_extract(row_json,'$.sentence_id')=?)`).all(row.id, row.id);
      if (!changes.length) throw new Error(`Missing unsynced journal evidence for quarantine: ${row.id}`);
      if (changes.some((change) => change.seq <= synced)) throw new Error(`Cannot locally quarantine an already synced sentence: ${row.id}`);
      queueGenerated(db, row.word_id, row, JSON.parse(row.attribution));
      db.prepare("DELETE FROM word_sentences WHERE sentence_id=?").run(row.id);
      db.prepare("DELETE FROM sentences WHERE id=?").run(row.id);
      for (const change of changes) db.prepare("DELETE FROM enrichment_changes WHERE seq=?").run(change.seq);
    }
    return rows.length;
  });
}

export async function syncChanges(db, client, destination, { batchSize = 100 } = {}) {
  let cursor = db.prepare("SELECT last_seq FROM enrichment_sync WHERE destination=?").get(destination)?.last_seq ?? 0;
  const definitions = new Map(tables.map((table) => {
    const info = db.prepare(`PRAGMA table_info(${table})`).all();
    return [table, { columns: info.map((column) => column.name),
      primary: info.filter((column) => column.pk).sort((a, b) => a.pk - b.pk).map((column) => column.name) }];
  }));
  const localTags = JSON.parse(db.prepare("SELECT value FROM metadata WHERE key='jmdict_tags'").get()?.value ?? "{}");
  while (true) {
    const changes = db.prepare("SELECT * FROM enrichment_changes WHERE seq>? ORDER BY seq LIMIT ?").all(cursor, batchSize);
    if (!changes.length) return cursor;
    const inserts = [], checks = [];
    for (const change of changes) {
      const definition = definitions.get(change.table_name);
      if (!definition) throw new Error(`Unexpected journal table: ${change.table_name}`);
      const { columns, primary } = definition;
      const row = JSON.parse(change.row_json), table = change.table_name;
      if (table === "sentences" && row.source === "ai-generated" && JSON.parse(row.attribution).reviewed !== true) {
        throw new Error(`Unreviewed generated sentence cannot be synced: ${row.id}`);
      }
      if (Object.keys(row).length !== columns.length || columns.some((column) => !(column in row))) {
        throw new Error(`Invalid journal row for ${table}`);
      }
      inserts.push({ sql: `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")}) ON CONFLICT DO NOTHING`,
        args: columns.map((column) => row[column]) });
      checks.push({ stmt: { sql: `SELECT * FROM ${table} WHERE ${primary.map((key) => `${key}=?`).join(" AND ")}`,
        args: primary.map((key) => row[key]) }, expected: row, label: `${table} ${JSON.stringify(primary.map((key) => row[key]))}` });
      for (const [field, parent, identity] of [
        ["word_id", "words", "jmdict_id"], ["kanji_id", "kanjis", "character"],
        ["sentence_id", "sentences", "ja,en"], ["source_id", "enrichment_sources", "sha256"]
      ]) {
        if (field === "source_id" && table !== "enrichment_word_sources") continue;
        if (row[field] === undefined) continue;
        const expected = db.prepare(`SELECT ${identity} FROM ${parent} WHERE id=?`).get(row[field]);
        if (!expected) throw new Error(`Missing local ${parent} parent ${row[field]}`);
        checks.push({ stmt: { sql: `SELECT ${identity} FROM ${parent} WHERE id=?`, args: [row[field]] },
          expected, label: `${parent} snapshot identity ${row[field]}` });
      }
    }
    const tx = await client.transaction("write");
    try {
      await tx.batch(inserts);
      const results = await tx.batch(checks.map((check) => check.stmt));
      checks.forEach((check, i) => {
        const row = results[i].rows[0];
        if (!row || Object.entries(check.expected).some(([column, value]) => row[column] !== value)) {
          throw new Error(`Conflicting remote ${check.label}; refusing to overwrite or mislink data`);
        }
      });
      const remoteTags = JSON.parse((await tx.execute("SELECT value FROM metadata WHERE key='jmdict_tags'")).rows[0]?.value ?? "{}");
      await tx.execute({ sql: "INSERT INTO metadata VALUES ('jmdict_tags',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        args: [JSON.stringify({ ...remoteTags, ...localTags })] });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally { tx.close(); }
    cursor = changes.at(-1).seq;
    db.prepare("INSERT INTO enrichment_sync VALUES (?,?) ON CONFLICT(destination) DO UPDATE SET last_seq=excluded.last_seq")
      .run(destination, cursor);
    console.log(`Synced through change ${cursor}`);
  }
}
