import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { englishGlosses } from "../src/content-translations.js";

export const LANGUAGES = ["es", "pt"];
export const KINDS = ["kanji", "sense", "sentence"];
const DICTIONARY_LICENSE = "CC BY-SA 4.0";
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
export const sourceHash = (english) => sha256(JSON.stringify(english));

export function ensureTranslationSchema(db) {
  db.exec(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
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
// Rows are re-sent from this far before the watermark, so writes whose timestamps were taken just before a sync aren't missed.
const SYNC_OVERLAP_MS = 60_000;

// The local database is the source of truth; rows are only ever upserted, never deleted.
export function pendingTranslationSync(db, destination) {
  db.exec("CREATE TABLE IF NOT EXISTS translation_sync (destination TEXT PRIMARY KEY, synced_until TEXT NOT NULL)");
  const last = db.prepare("SELECT synced_until FROM translation_sync WHERE destination = ?").get(destination)?.synced_until;
  const since = last ? new Date(Date.parse(last) - SYNC_OVERLAP_MS).toISOString() : "";
  // The write lock waits for open write transactions (e.g. import-human) so none commit older timestamps after this snapshot.
  db.exec("BEGIN IMMEDIATE");
  try {
    return db.prepare(`SELECT ${SYNC_COLUMNS.join(", ")} FROM content_translations WHERE updated_at > ?
      ORDER BY updated_at, kind, item_id, lang`).all(since);
  } finally { db.exec("COMMIT"); }
}

export async function syncTranslations(db, client, destination, { batchSize = 200, onBatch } = {}) {
  const rows = pendingTranslationSync(db, destination);
  await client.executeMultiple(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
  const sql = `INSERT INTO content_translations (${SYNC_COLUMNS.join(", ")}) VALUES (${SYNC_COLUMNS.map(() => "?").join(", ")})
    ON CONFLICT(kind, item_id, lang) DO UPDATE SET ${SYNC_COLUMNS.slice(3).map((column) => `${column} = excluded.${column}`).join(", ")}`;
  const save = db.prepare(`INSERT INTO translation_sync VALUES (?, ?)
    ON CONFLICT(destination) DO UPDATE SET synced_until = excluded.synced_until`);
  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    await client.batch(batch.map((row) => ({ sql, args: SYNC_COLUMNS.map((column) => row[column]) })), "write");
    save.run(destination, batch.at(-1).updated_at);
    onBatch?.(start + batch.length, rows.length);
  }
  const local = db.prepare("SELECT kind, lang, count(*) AS n FROM content_translations GROUP BY 1, 2 ORDER BY 1, 2").all();
  const remote = (await client.execute("SELECT kind, lang, count(*) AS n FROM content_translations GROUP BY 1, 2 ORDER BY 1, 2")).rows;
  const mismatches = local.filter((row) => Number(remote.find((other) => other.kind === row.kind && other.lang === row.lang)?.n ?? 0) !== row.n)
    .map((row) => `${row.kind} ${row.lang}`);
  return { synced: rows.length, mismatches };
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
