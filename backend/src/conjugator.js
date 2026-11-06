import { selectedLevels, matchesLevel } from "../../frontend/src/jlpt-levels.js";
import { rowsByWordIds } from "./async-database.js";

const parse = JSON.parse;
const supports = (values, value) => values.includes("*") || values.includes(value);
const hiragana = (text) => text.replace(/[ァ-ヶ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0x60));
const katakana = (text) => text.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
export function conjugatorSearch(query) {
  const variants = [...new Set([query, katakana(query)])];
  const exact = [...new Set(variants.flatMap((value) =>
    /(?:する|スル)$/.test(value) ? [value, value.slice(0, -2)] : [value]))];
  const clauses = [], args = [];
  for (const kind of [0, 1]) {
    clauses.push(`SELECT word_id FROM word_forms WHERE kind = ? AND form IN (SELECT value FROM json_each(?))`);
    args.push(kind, JSON.stringify(exact));
    for (const variant of variants) {
      const chars = [...variant];
      let last = chars.length - 1;
      while (last >= 0 && chars[last].codePointAt(0) === 0x10ffff) last--;
      const end = last < 0 ? null : chars.slice(0, last).join("") + String.fromCodePoint(chars[last].codePointAt(0) + 1);
      clauses.push(`SELECT word_id FROM word_forms WHERE kind = ? AND form >= ?${end === null ? "" : " AND form < ?"}`);
      args.push(kind, variant, ...(end === null ? [] : [end]));
    }
  }
  return {
    sql: `SELECT * FROM words WHERE id IN (${clauses.join(" UNION ALL ")})
      ORDER BY (word IN (SELECT value FROM json_each(?)) OR reading IN (SELECT value FROM json_each(?))) DESC,
      is_common DESC, id LIMIT 200`,
    args: [...args, JSON.stringify(exact), JSON.stringify(exact)]
  };
}
export function conjugationType(tag) {
  if (["v1", "v1-s"].includes(tag)) return "ichidan";
  if (["v5u", "v5u-s", "v5k", "v5k-s", "v5g", "v5s", "v5t", "v5n", "v5b", "v5m", "v5r", "v5r-i", "v5aru"].includes(tag)) return "godan";
  if (["vs", "vs-i", "vs-s"].includes(tag)) return "suru";
  if (tag === "vk") return "kuru";
  if (tag === "vz") return "zuru";
  if (["adj-i", "adj-ix"].includes(tag)) return "i-adjective";
  if (tag === "adj-na") return "na-adjective";
  return null;
}

export function conjugationEntries(row, levels = []) {
  const spellings = parse(row.kanji_forms);
  const readings = parse(row.kana_forms);
  let inherited = [];
  const senses = parse(row.senses).map((sense) => {
    if (sense.partOfSpeech.length) inherited = sense.partOfSpeech;
    return { ...sense, partOfSpeech: inherited };
  });
  const entries = [];
  for (const kana of readings) {
    const applicable = spellings.filter((kanji) => supports(kana.appliesToKanji, kanji.text));
    const words = applicable.length ? applicable.map((item) => item.text) : [kana.text];
    if (applicable.length && senses.some((sense) => sense.misc?.includes("uk"))) words.unshift(kana.text);
    for (const word of words) {
      const groups = new Map();
      for (const sense of senses) {
        if (!supports(sense.appliesToKanji, word) || !supports(sense.appliesToKana, kana.text)) continue;
        for (const tag of sense.partOfSpeech) {
          const type = conjugationType(tag);
          if (!type) continue;
          const key = `${type}:${tag}`;
          const entry = groups.get(key) || {
            id: `${row.id}:${word}:${kana.text}:${tag}`, word, reading: kana.text, type, tag,
            meanings: [], related: [], notes: [], level: levels.find((level) =>
              level.word === word && level.reading === kana.text)?.jlpt ?? null,
            wordId: row.id, common: Boolean(row.is_common),
            intransitive: sense.partOfSpeech.includes("vi")
          };
          entry.meanings.push(...sense.gloss.filter((gloss) => gloss.lang === "eng").map((gloss) => gloss.text));
          entry.related.push(...(sense.related || []).map((ref) => ref.join("・")));
          entry.notes.push(...(sense.info || []));
          groups.set(key, entry);
        }
      }
      for (const entry of groups.values()) {
        if (entry.type === "suru" && !entry.reading.endsWith("する")) {
          // vs-s stems need lexical sound changes; do not invent an attachment.
          if (entry.tag === "vs-s") continue;
          entry.word += "する";
          entry.reading += "する";
        }
        entry.meanings = [...new Set(entry.meanings)];
        entry.related = [...new Set(entry.related)];
        entry.notes = [...new Set(entry.notes)];
        entries.push(entry);
      }
    }
  }
  return entries;
}

export async function findConjugationEntries(db, { query, random = false, level = "all", category = "all", exclude = [] }) {
  const selected = selectedLevels(level);
  if (!selected.length) return [];
  if (!["all", "verb", "adjective"].includes(category)) throw new Error("Choose verbs, adjectives, or all words.");
  let rows;
  if (random) {
    const conditions = ["w.is_common = 1"];
    const args = [];
    if (!selected.includes("unrated")) {
      conditions.push(`EXISTS (SELECT 1 FROM vocabulary v WHERE v.word_id = w.id AND v.jlpt IN (${selected.map(() => "?").join(",")}))`);
      args.push(...selected);
    }
    rows = await db.prepare(`SELECT w.* FROM words w WHERE ${conditions.join(" AND ")} ORDER BY random() LIMIT 400`).all(...args);
  } else {
    const search = conjugatorSearch(query);
    rows = await db.prepare(search.sql).all(...search.args);
  }
  const levels = await rowsByWordIds(db, rows.map((row) => row.id));
  const entries = rows.flatMap((row) => conjugationEntries(row, levels.get(row.id) ?? []))
    .filter((entry) => matchesLevel(entry.level, level)
      && (category === "all" || (category === "adjective") === entry.type.endsWith("adjective")));
  if (random) {
    const regular = entries.filter((entry) => {
      const reading = hiragana(entry.reading);
      const suffix = { ichidan: "る", kuru: "くる", suru: "する", zuru: "ずる", "i-adjective": "い" }[entry.type];
      return /^[ぁ-ゖー・]+$/.test(reading) && (!suffix || reading.endsWith(suffix));
    });
    const fresh = regular.filter((entry) => !exclude.some((word) => hiragana(word) === hiragana(entry.reading)));
    return (fresh.length ? fresh : regular).slice(0, 1);
  }
  const exact = entries.filter((entry) => entry.word === query || hiragana(entry.reading) === hiragana(query));
  return exact.length ? exact : entries.filter((entry) =>
    entry.word.startsWith(query) || hiragana(entry.reading).startsWith(hiragana(query))).slice(0, 20);
}
