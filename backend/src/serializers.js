import { rowsByWordIds } from "./async-database.js";
import { translateExamples, translateSenses } from "./content-translations.js";
import { localExamples, localExamplesMany } from "./examples.js";
import { enrichRadicals, extractComponents } from "./radicals.js";
import { vocabularyAnswers } from "./vocabulary-answers.js";

const parse = JSON.parse;
const unique = (items) => [...new Set(items)];

/**
 * @param {any} row
 * @param {{ svg?: any, lookupKanji?: any }} [options]
 */
export function kanjiRecord(row, { svg = undefined, lookupKanji = undefined } = {}) {
  const parsed = Object.fromEntries(
    ["on_readings", "kun_readings", "nanori", "meanings", "categories", "radicals", "radical_names"].map((key) => [
      key,
      parse(row[key]),
    ]),
  );
  return {
    id: row.id,
    unicode: row.unicode,
    stroke_count: row.stroke_count,
    jlpt: row.jlpt,
    grade: row.grade,
    kanji: row.character,
    freq_mainichi_shinbun: row.frequency,
    ...parsed,
    radicals: enrichRadicals(parsed.radicals),
    components: extractComponents(row.character, svg, lookupKanji),
    jlpt_estimated: row.jlpt !== null,
  };
}

export function vocabularyExample(example) {
  return {
    ja: example.japanese,
    en: example.english,
    furigana: example.furigana,
    tatoeba_id: example.source === "Tatoeba" ? example.id : undefined,
    id: example.id,
    source: example.source,
    generated: example.generated ?? false,
    reviewed: example.reviewed ?? false,
    license: example.license,
    attribution: example.attribution,
    owner: example.owner,
    translationId: example.translationId,
    translationOwner: example.translationOwner,
  };
}

/**
 * @param {any} row
 * @param {{ db?: any, lookupKanji?: any, tags?: Record<string, string>, sensesJson?: any }} [options]
 */
export async function vocabularyRecord(
  row,
  { db = undefined, lookupKanji = undefined, tags = {}, sensesJson = undefined } = {},
) {
  const examples =
    db && row.word_id != null
      ? (await localExamples(db, { wordId: row.word_id, limit: Math.max(3, parse(row.examples).length) })).map(
          vocabularyExample,
        )
      : parse(row.examples);
  const meaningsList = parse(row.meanings);
  const posList = parse(row.parts_of_speech);
  const synonyms = [];
  const antonyms = [];
  const fields = [];
  const info = [];
  if (sensesJson) {
    for (const sense of parse(sensesJson)) {
      for (const rel of sense.related || []) synonyms.push(rel[0]);
      for (const ant of sense.antonym || []) antonyms.push(ant[0]);
      for (const fld of sense.field || []) fields.push(tags[fld] ?? fld);
      for (const note of sense.info || []) info.push(note);
    }
  }
  const kanjiDetails = lookupKanji
    ? (
        await Promise.all(
          unique([...row.word].filter((ch) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(ch))).map((ch) =>
            lookupKanji(ch),
          ),
        )
      ).filter(Boolean)
    : undefined;
  return {
    id: row.id,
    word: row.word,
    furigana: row.reading,
    romaji: row.romaji,
    meaning: meaningsList.join("; "),
    meanings: meaningsList,
    level: row.jlpt,
    ...vocabularyAnswers(row),
    partOfSpeech: posList.map((tag) => tags[tag] ?? tag).join(", "),
    posTags: posList,
    example: examples[0]?.ja ?? "",
    exampleFurigana: examples[0]?.furigana ?? "",
    exampleMeaning: examples[0]?.en ?? "",
    exampleSourceId: examples[0]?.tatoeba_id ?? null,
    examples,
    synonyms: unique(synonyms).slice(0, 4),
    antonyms: unique(antonyms).slice(0, 4),
    fields: unique(fields).slice(0, 4),
    usageNotes: unique(info).slice(0, 2),
    ...(kanjiDetails ? { kanjiDetails } : {}),
    jlpt_estimated: true,
  };
}

export function dictionaryRecord(row, tags, levels = []) {
  const kanji = parse(row.kanji_forms);
  const kana = parse(row.kana_forms);
  const japanese = [];
  for (const reading of kana) {
    const spellings = kanji.filter(
      (form) => reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(form.text),
    );
    if (!spellings.length) japanese.push({ reading: reading.text });
    for (const form of spellings) japanese.push({ word: form.text, reading: reading.text });
  }
  const senses = parse(row.senses).map((sense) => ({
    english_definitions: sense.gloss.filter((g) => g.lang === "eng").map((g) => g.text),
    parts_of_speech: sense.partOfSpeech.map((tag) => tags[tag] ?? tag),
    tags: [...sense.misc, ...sense.field, ...sense.dialect].map((tag) => tags[tag] ?? tag),
    restrictions: [...sense.appliesToKanji, ...sense.appliesToKana].filter((x) => x !== "*"),
    see_also: sense.related.map((ref) => ref.join("・")),
    antonyms: sense.antonym.map((ref) => ref.join("・")),
    info: sense.info,
  }));
  return {
    id: row.id,
    slug: row.word,
    japanese,
    senses,
    is_common: Boolean(row.is_common),
    jlpt: unique(levels).map((level) => `jlpt-n${level}`),
  };
}

export async function exampleWords(db, row, prefetched) {
  const words =
    prefetched ??
    (await db
      .prepare(`SELECT w.* FROM words w JOIN kanji_words kw ON kw.word_id = w.id
    WHERE kw.kanji_id = ? ORDER BY w.is_common DESC, length(w.word), w.id LIMIT 6`)
      .all(row.id));
  return words.flatMap((word) => {
    const form = parse(word.kanji_forms).find((form) => form.text.includes(row.character));
    if (!form) return [];
    const kana = parse(word.kana_forms).filter(
      (reading) => reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(form.text),
    );
    if (!kana.length) return [];
    const reading = kana.find((item) => item.common) ?? kana[0];
    const meanings = unique(
      parse(word.senses)
        .filter(
          (sense) =>
            (sense.appliesToKanji.includes("*") || sense.appliesToKanji.includes(form.text)) &&
            (sense.appliesToKana.includes("*") || sense.appliesToKana.includes(reading.text)),
        )
        .flatMap((sense) => sense.gloss.filter((g) => g.lang === "eng").map((g) => g.text)),
    ).slice(0, 3);
    return [{ word: form.text, reading: reading.text, meanings }];
  });
}

export async function practiceRecords(db, rows) {
  if (!rows.length) return [];
  const words = await db
    .prepare(`SELECT * FROM (
    SELECT kw.kanji_id, w.kanji_forms, w.kana_forms, w.senses,
      row_number() OVER (PARTITION BY kw.kanji_id ORDER BY w.is_common DESC, length(w.word), w.id) AS rank
    FROM kanji_words kw JOIN words w ON w.id = kw.word_id
    WHERE kw.kanji_id IN (SELECT value FROM json_each(?))
  ) WHERE rank <= 6 ORDER BY kanji_id, rank`)
    .all(JSON.stringify(rows.map((row) => row.id)));
  const grouped = new Map();
  for (const word of words) {
    if (!grouped.has(word.kanji_id)) grouped.set(word.kanji_id, []);
    grouped.get(word.kanji_id).push(word);
  }
  return Promise.all(
    rows.map(async (row) => ({
      ...kanjiRecord(row),
      examples: await exampleWords(db, row, grouped.get(row.id) ?? []),
    })),
  );
}

export function createLookupHelpers(db, tags) {
  const toWords = async (rows) => {
    const ids = rows.map((row) => row.id);
    const [levels, examples] = await Promise.all([rowsByWordIds(db, ids), localExamplesMany(db, ids)]);
    const records = rows.map((row) => ({
      ...dictionaryRecord(
        row,
        tags,
        (levels.get(row.id) ?? []).map((item) => item.jlpt),
      ),
      examples: examples.get(row.id) ?? [],
    }));
    await translateSenses(
      db,
      rows.map((row, index) => ({ row, record: records[index] })),
    );
    await translateExamples(
      db,
      records.flatMap((record) => record.examples),
    );
    return records;
  };
  const lookupKanji = async (character) => {
    const found = await db.prepare("SELECT meanings, radical_names FROM kanjis WHERE character = ?").get(character);
    return found ? { meanings: parse(found.meanings), radical_names: parse(found.radical_names) } : null;
  };
  const toKanji = async (row) => {
    const stroke = await db.prepare("SELECT svg FROM strokes WHERE character = ?").get(row.character);
    const characters = unique(
      [...(stroke?.svg?.matchAll(/kvg:(?:element|original)="([^"]+)"/g) ?? [])].map((m) => m[1]),
    );
    const components = new Map(
      await Promise.all(characters.map(async (ch) => /** @type {[string, any]} */ ([ch, await lookupKanji(ch)]))),
    );
    return {
      ...kanjiRecord(row, { svg: stroke?.svg, lookupKanji: (ch) => components.get(ch) }),
      examples: await exampleWords(db, row),
      sentences: await localExamples(db, { query: row.character }),
    };
  };
  const lookupKanjiDetail = async (character) => {
    const found = await db.prepare("SELECT * FROM kanjis WHERE character = ?").get(character);
    if (!found) return null;
    return {
      kanji: found.character,
      meanings: parse(found.meanings),
      on_readings: parse(found.on_readings),
      kun_readings: parse(found.kun_readings),
      jlpt: found.jlpt,
      stroke_count: found.stroke_count,
      examples: await exampleWords(db, found),
    };
  };
  return { toWords, toKanji, lookupKanji, lookupKanjiDetail };
}
