// Spanish/Portuguese study-content translations (translations.sql). Without the table, content stays English.
const encoder = new TextEncoder();

// Must match sourceHash in scripts/translation-lib.js.
export async function sourceHash(english) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(JSON.stringify(english)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const englishGlosses = (sense) => (sense.gloss || [])
  .filter((gloss) => gloss.lang === "eng" && gloss.text?.trim()).map((gloss) => gloss.text.trim());

export const sentenceTranslationId = (example) => example.id == null ? null
  : example.source && example.source !== "Tatoeba" ? String(example.id) : `tatoeba:${example.id}`;

// items: [{ id, english? }]. With `english`, rows made from different English source text are skipped.
export async function contentTranslations(db, kind, items) {
  const result = new Map();
  const wanted = new Map(items.filter((item) => item.id != null).map((item) => [String(item.id), item.english]));
  if (!wanted.size) return result;
  const table = await db.prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'content_translations'").get();
  if (!table) return result;
  const rows = await db.prepare(`SELECT item_id, lang, value, method, source_hash, attribution FROM content_translations
    WHERE kind = ? AND item_id IN (SELECT value FROM json_each(?))`).all(kind, JSON.stringify([...wanted.keys()]));
  const hashes = new Map();
  for (const row of rows) {
    const english = wanted.get(row.item_id);
    if (english) {
      if (!hashes.has(row.item_id)) hashes.set(row.item_id, await sourceHash(english));
      if (hashes.get(row.item_id) !== row.source_hash) continue;
    }
    if (!result.has(row.item_id)) result.set(row.item_id, {});
    result.get(row.item_id)[row.lang] = { text: JSON.parse(row.value), machine: row.method === "machine",
      attribution: row.attribution.startsWith("{") ? JSON.parse(row.attribution) : {} };
  }
  return result;
}

// Adds `translations: { es: { definitions, machine } }` to dictionaryRecord senses.
export async function translateSenses(db, words) {
  const items = words.flatMap(({ row }) => JSON.parse(row.senses).map((sense, index) => ({
    id: `${row.jmdict_id}:${index}`, english: englishGlosses(sense)
  })).filter((item) => item.english.length));
  const found = await contentTranslations(db, "sense", items);
  for (const { row, record } of words) {
    record.senses.forEach((sense, index) => {
      const languages = found.get(`${row.jmdict_id}:${index}`);
      if (languages) sense.translations = Object.fromEntries(Object.entries(languages)
        .map(([lang, { text, machine }]) => [lang, { definitions: text, machine }]));
    });
  }
}

// Adds `translations_by_language: { es: { text, machine } }` to example sentences.
export async function translateExamples(db, examples) {
  const found = await contentTranslations(db, "sentence", examples.map((example) => ({ id: sentenceTranslationId(example) })));
  for (const example of examples) {
    const languages = found.get(sentenceTranslationId(example));
    if (languages) example.translations_by_language = Object.fromEntries(Object.entries(languages)
      .map(([lang, { text, machine, attribution }]) => [lang, { text: text[0], machine,
        ...(!machine && attribution.translationId ? { translationId: attribution.translationId, translationOwner: attribution.translationOwner } : {})
      }]));
  }
  return examples;
}
