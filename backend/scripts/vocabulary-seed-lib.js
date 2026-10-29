// Pure parsing/mapping helpers for scripts/seed-vocabulary.js (no I/O).

export const ALL_LEVELS = ["N5", "N4", "N3", "N2", "N1"];

export function parseLevels(value) {
  if (!value) return [...ALL_LEVELS];
  const levels = [...new Set(String(value).split(",").map((l) => l.trim().toUpperCase()).filter(Boolean))];
  const bad = levels.filter((l) => !ALL_LEVELS.includes(l));
  if (bad.length || !levels.length) throw new Error(`Invalid levels: ${bad.join(",") || value}`);
  return levels;
}

export const levelNumber = (level) => Number(level.slice(1));

// RFC 4180-ish CSV parser (quoted fields, doubled quotes, newlines in quotes).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f !== "")) rows.push(row);
  return rows;
}

// Rows of the open-anki-jlpt-decks CSV: expression,reading,meaning,tags,guid.
export function parseJlptCsv(text, level) {
  const [header, ...rows] = parseCsv(text);
  const col = (name) => header.indexOf(name);
  const [e, r, m, t] = ["expression", "reading", "meaning", "tags"].map(col);
  if ([e, r, m].includes(-1)) throw new Error("Unexpected JLPT CSV header");
  return rows.filter((row) => row[e]).map((row) => ({
    expression: row[e].trim(),
    reading: (row[r] || row[e]).trim(),
    meaning: row[m].trim(),
    tags: (row[t] ?? "").split(/\s+/).filter(Boolean),
    level
  }));
}

// jmdict-simplified entries -> sentences + links for entries known in `words`.
export function extractSentences(entry) {
  const out = [];
  for (const sense of entry.sense ?? []) {
    for (const example of sense.examples ?? []) {
      if (example.source?.type !== "tatoeba") continue;
      const ja = example.sentences?.find((s) => s.lang === "jpn")?.text?.trim();
      const en = example.sentences?.find((s) => s.lang === "eng")?.text?.trim();
      if (!ja || !en) continue;
      out.push({ sourceId: String(example.source.value), ja, en, matched: example.text ?? "" });
    }
  }
  return out;
}

export const TATOEBA_LICENSE = "CC BY 2.0 FR";
export const TATOEBA_ATTRIBUTION = "Tatoeba contributors (https://tatoeba.org), via JMdict examples by scriptin/EDRDG";

export const sentenceRow = (s) => ({
  id: `tatoeba:${s.sourceId}`, ja: s.ja, en: s.en, source: "tatoeba", sourceId: s.sourceId,
  license: TATOEBA_LICENSE, attribution: TATOEBA_ATTRIBUTION
});

// Index of words by every written form so a JLPT row (expression, reading) maps to a JMdict id.
export function buildWordIndex(rows) {
  const index = new Map();
  for (const row of rows) {
    const kanji = JSON.parse(row.kanji_forms).map((k) => k.text);
    const kana = JSON.parse(row.kana_forms).map((k) => k.text);
    for (const form of new Set([...kanji, ...kana])) {
      if (!index.has(form)) index.set(form, []);
      index.get(form).push({ id: row.id, kana, isCommon: row.is_common });
    }
  }
  return index;
}

export function matchWord(index, item) {
  const candidates = index.get(item.expression) ?? [];
  if (!candidates.length) return null;
  const sameReading = candidates.filter((c) => c.kana.includes(item.reading));
  const pool = sameReading.length ? sameReading : candidates;
  return [...pool].sort((a, b) => b.isCommon - a.isCommon || a.id - b.id)[0];
}

export function jlptFromTags(tags) {
  for (const tag of tags) {
    const m = /^JLPT_N([1-5])$/.exec(tag);
    if (m) return Number(m[1]);
  }
  return null;
}

export function vocabularyRow(wordRow, { jlpt, meaning, source, license, tags = [], word, reading }) {
  const senses = JSON.parse(wordRow.senses);
  const glosses = JSON.parse(wordRow.meanings);
  const pos = [...new Set(senses.flatMap((s) => s.partOfSpeech ?? []))];
  const misc = [...new Set(senses.flatMap((s) => s.misc ?? []))];
  return {
    word_id: wordRow.id,
    word: word || wordRow.word,
    reading: reading || wordRow.reading,
    meaning: meaning || glosses.slice(0, 3).join("; "),
    meanings: JSON.stringify(glosses),
    jlpt,
    parts_of_speech: JSON.stringify(pos),
    tags: JSON.stringify([...new Set([...tags, ...misc])]),
    is_common: wordRow.is_common,
    source,
    license
  };
}
