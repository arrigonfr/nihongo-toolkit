const json = JSON.stringify;
const unique = (values) => [...new Set(values)];

export function insertKanjis(db, dictionary, levels) {
  if (!Array.isArray(dictionary.characters) || !dictionary.characters.length) {
    throw new Error("Invalid or empty KANJIDIC2 dataset");
  }
  const insert = db.prepare(`INSERT INTO kanjis (
    character, unicode, codepoint, on_readings, kun_readings, nanori, meanings,
    meanings_by_language, stroke_count, stroke_counts, jlpt, jlpt_source,
    jlpt_old, grade, categories, is_kokuji, frequency, radicals, radical_names,
    variants, dictionary_references, query_codes, reading_meaning, codepoints
  ) VALUES (${Array(24).fill("?").join(",")})`);
  for (const entry of dictionary.characters) {
    const { literal, misc, readingMeaning } = entry;
    if ([...literal].length !== 1) throw new Error(`Invalid kanji: ${literal}`);
    const groups = readingMeaning?.groups ?? [];
    const readings = groups.flatMap((group) => group.readings);
    const translations = {};
    for (const meaning of groups.flatMap((group) => group.meanings)) {
      (translations[meaning.lang] ??= []).push(meaning.value);
    }
    const meanings = translations.en ?? [];
    const kokuji = meanings.some((meaning) => /\bkokuji\b/i.test(meaning));
    const categories = [];
    if (misc.grade >= 1 && misc.grade <= 6) categories.push("Kyoiku", "Joyo");
    if (misc.grade === 8) categories.push("Joyo");
    if (misc.grade === 9 || misc.grade === 10) categories.push("Jinmeiyo");
    if (kokuji) categories.push("Kokuji");
    const level = levels.get(literal);
    insert.run(literal, `U+${literal.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`,
      literal.codePointAt(0),
      json(unique(readings.filter((r) => r.type === "ja_on").map((r) => r.value))),
      json(unique(readings.filter((r) => r.type === "ja_kun").map((r) => r.value))),
      json(readingMeaning?.nanori ?? []), json(meanings), json(translations),
      misc.strokeCounts[0], json(misc.strokeCounts), level?.level ?? null,
      level ? `OpenJLPT${level.supplementary ? " supplementary estimate" : " / Waller"}` : null,
      misc.jlptLevel, misc.grade, json(categories), kokuji ? 1 : null,
      misc.frequency, json(entry.radicals), json(misc.radicalNames), json(misc.variants),
      json(entry.dictionaryReferences), json(entry.queryCodes), json(readingMeaning),
      json(entry.codepoints));
  }
}

export function insertWords(db, dictionary) {
  if (!Array.isArray(dictionary.words) || !dictionary.words.length) {
    throw new Error("Invalid or empty JMdict dataset");
  }
  const kanjis = new Map(db.prepare("SELECT id, character FROM kanjis").all().map((r) => [r.character, r.id]));
  const insert = db.prepare(`INSERT INTO words
    (jmdict_id, word, reading, meanings, is_common, kanji_forms, kana_forms, senses)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  const relation = db.prepare("INSERT OR IGNORE INTO kanji_words VALUES (?, ?)");
  for (const entry of dictionary.words) {
    const form = entry.kanji.find((k) => k.common) ?? entry.kanji[0];
    const applicable = entry.kana.filter((k) =>
      !form || k.appliesToKanji.includes("*") || k.appliesToKanji.includes(form.text));
    const kana = applicable.find((k) => k.common) ?? applicable[0];
    if (!kana) throw new Error(`JMdict entry ${entry.id} has no applicable reading`);
    const glosses = entry.sense.flatMap((sense) => sense.gloss.filter((g) => g.lang === "eng").map((g) => g.text));
    const result = insert.run(entry.id, form?.text ?? kana.text, kana.text, json(unique(glosses)),
      Number([...entry.kanji, ...entry.kana].some((f) => f.common)),
      json(entry.kanji), json(entry.kana), json(entry.sense));
    for (const character of new Set(entry.kanji.flatMap((k) => [...k.text]))) {
      const kanjiId = kanjis.get(character);
      if (kanjiId) relation.run(kanjiId, result.lastInsertRowid);
    }
  }
  db.prepare("INSERT INTO metadata VALUES ('jmdict_tags', ?)").run(json(dictionary.tags));
}

export function insertVocabulary(db, entries) {
  const words = new Map(db.prepare("SELECT id, jmdict_id FROM words").all().map((r) => [r.jmdict_id, r.id]));
  const insert = db.prepare("INSERT INTO vocabulary VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  let unmatched = 0;
  for (const entry of entries) {
    const wordId = words.get(String(entry.jmdict_id)) ?? null;
    if (!wordId) unmatched++;
    insert.run(entry.id, wordId, entry.word, entry.reading, entry.romaji,
      json(entry.meanings), Number(entry.level.slice(1)), json(entry.pos ?? []),
      json(entry.examples ?? []), json(entry.other_forms ?? []), json(entry.other_readings ?? []));
  }
  if (unmatched) console.warn(`${unmatched} OpenJLPT records have no matching JMdict ID; retained with a NULL word_id.`);
}
