import { asyncDatabase } from "./async-database.js";
import { localExamples, createSentenceFallback, shuffleExamples } from "./examples.js";
import { enrichRadicals, extractComponents } from "./radicals.js";
import { analyzeSentence, createSentenceTranslator, deinflectCandidates } from "./analyze.js";
import { sendBody } from "./transport.js";
import { selectCompounds } from "./compounds.js";
import { isPracticeKanji, practiceMeanings } from "./practice-kanji.js";
import { createWordFallback, shiritoriWords } from "./shiritori.js";
import { findConjugationEntries } from "./conjugator.js";
import { selectedLevels } from "../../frontend/src/jlpt-levels.js";

const parse = JSON.parse;
const unique = (items) => [...new Set(items)];

export function kanjiRecord(row, { svg, lookupKanji } = {}) {
  const parsed = Object.fromEntries([
    "on_readings", "kun_readings", "nanori", "meanings", "categories", "radicals", "radical_names"
  ].map((key) => [key, parse(row[key])]));
  return {
    id: row.id, unicode: row.unicode, stroke_count: row.stroke_count,
    jlpt: row.jlpt, grade: row.grade,
    kanji: row.character,
    freq_mainichi_shinbun: row.frequency,
    ...parsed,
    radicals: enrichRadicals(parsed.radicals),
    components: extractComponents(row.character, svg, lookupKanji),
    jlpt_estimated: row.jlpt !== null
  };
}

async function vocabularyRecord(row, { lookupKanji, tags = {}, sensesJson } = {}) {
  const examples = parse(row.examples);
  const meaningsList = parse(row.meanings);
  const posList = parse(row.parts_of_speech);
  let synonyms = [];
  let antonyms = [];
  let fields = [];
  let info = [];
  if (sensesJson) {
    for (const sense of parse(sensesJson)) {
      for (const rel of sense.related || []) synonyms.push(rel[0]);
      for (const ant of sense.antonym || []) antonyms.push(ant[0]);
      for (const fld of sense.field || []) fields.push(tags[fld] ?? fld);
      for (const note of sense.info || []) info.push(note);
    }
  }
  const kanjiDetails = lookupKanji
    ? (await Promise.all(unique([...row.word].filter((ch) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(ch)))
        .map((ch) => lookupKanji(ch)))).filter(Boolean)
    : undefined;
  return {
    id: row.id, word: row.word, furigana: row.reading, romaji: row.romaji,
    meaning: meaningsList.join("; "), meanings: meaningsList, level: row.jlpt,
    partOfSpeech: posList.map((tag) => tags[tag] ?? tag).join(", "),
    posTags: posList,
    example: examples[0]?.ja ?? "", exampleFurigana: examples[0]?.furigana ?? "",
    exampleMeaning: examples[0]?.en ?? "",
    exampleSourceId: examples[0]?.tatoeba_id ?? null, examples,
    synonyms: unique(synonyms).slice(0, 4),
    antonyms: unique(antonyms).slice(0, 4),
    fields: unique(fields).slice(0, 4),
    usageNotes: unique(info).slice(0, 2),
    ...(kanjiDetails ? { kanjiDetails } : {}),
    jlpt_estimated: true
  };
}

export function dictionaryRecord(row, tags, levels = []) {
  const kanji = parse(row.kanji_forms);
  const kana = parse(row.kana_forms);
  const japanese = [];
  for (const reading of kana) {
    const spellings = kanji.filter((form) =>
      reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(form.text));
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
    info: sense.info
  }));
  return {
    id: row.id, slug: row.word, japanese, senses, is_common: Boolean(row.is_common),
    jlpt: unique(levels).map((level) => `jlpt-n${level}`),
  };
}

async function exampleWords(db, row) {
  const words = await db.prepare(`SELECT w.* FROM words w JOIN kanji_words kw ON kw.word_id = w.id
    WHERE kw.kanji_id = ? ORDER BY w.is_common DESC, length(w.word), w.id LIMIT 6`).all(row.id);
  return words.flatMap((word) => {
    const form = parse(word.kanji_forms).find((form) => form.text.includes(row.character));
    if (!form) return [];
    const kana = parse(word.kana_forms).filter((reading) =>
      reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(form.text));
    if (!kana.length) return [];
    const reading = kana.find((item) => item.common) ?? kana[0];
    const meanings = unique(parse(word.senses).filter((sense) =>
      (sense.appliesToKanji.includes("*") || sense.appliesToKanji.includes(form.text))
      && (sense.appliesToKana.includes("*") || sense.appliesToKana.includes(reading.text)))
      .flatMap((sense) => sense.gloss.filter((g) => g.lang === "eng").map((g) => g.text))).slice(0, 3);
    return [{ word: form.text, reading: reading.text, meanings }];
  });
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function integer(value, fallback, min, max) {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new HttpError(400, `Expected an integer from ${min} to ${max}`);
  }
  return Number(value);
}
function levelFilter(params, prefix = "") {
  const col = prefix ? `${prefix}.jlpt` : "jlpt";
  const value = params.get("level");
  if (value === null || value === "all") return { sql: "", args: [] };
  if (value === "none") return { sql: " AND 0", args: [] };
  if (value.includes(",")) {
    let levels;
    try { levels = selectedLevels(value); } catch { throw new HttpError(400, "Choose valid JLPT levels."); }
    const numbers = levels.filter((n) => typeof n === "number");
    return { sql: ` AND (${numbers.length ? `${col} IN (${numbers.map(() => "?").join(",")})` : "0"}${levels.includes("unrated") ? ` OR ${col} IS NULL` : ""})`, args: numbers };
  }
  if (value === "unrated") return { sql: ` AND ${col} IS NULL`, args: [] };
  const rangeMatch = value.match(/^N?([1-5])[-–]N?([1-5])$/i);
  if (rangeMatch) {
    const a = Number(rangeMatch[1]);
    const b = Number(rangeMatch[2]);
    return { sql: ` AND ${col} BETWEEN ? AND ?`, args: [Math.min(a, b), Math.max(a, b)] };
  }
  const level = integer(value.replace(/^N/i, ""), null, 1, 5);
  return { sql: ` AND ${col} = ?`, args: [level] };
}
function characterValue(value) {
  if ([...value].length !== 1) throw new HttpError(400, "Expected one kanji character");
  return value;
}
function searchTerm(params) {
  const value = (params.get("keyword") ?? params.get("q") ?? "").trim();
  if (!value || value.length > 100) throw new HttpError(400, "Search must contain 1-100 characters");
  return value;
}

export function createHandler({
  database, openDatabase, origins, segment, sentenceFallback = createSentenceFallback(),
  translateSentence = createSentenceTranslator(),
  wordFallback = createWordFallback(),
  compression = process.env.API_COMPRESSION === "true"
    || (process.env.API_COMPRESSION !== "false" && process.env.NODE_ENV === "production")
} = {}) {
  let source = database;
  let tags;
  let practiceFilterRegistered = false;
  const allowedOrigins = origins ?? (process.env.ALLOWED_ORIGINS
    ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((s) => s.trim());
  return async function handler(req, res) {
    res.setHeader("Vary", "Origin, Accept-Encoding");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, data) => {
      res.statusCode = status;
      sendBody(req, res, JSON.stringify(data), "application/json; charset=utf-8", compression);
    };
    try {
      const origin = req.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) throw new HttpError(403, "Origin is not allowed");
      if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");
      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }
      if (req.method !== "GET") {
        res.setHeader("Allow", "GET, OPTIONS");
        throw new HttpError(405, "Method not allowed");
      }
      const url = new URL(req.url, "http://localhost");
      let path;
      try { path = decodeURIComponent(url.pathname); }
      catch { throw new HttpError(400, "Invalid URL encoding"); }
      const params = url.searchParams;
      if (!source) source = openDatabase();
      if (!practiceFilterRegistered && !source.batch) {
        source.function("is_practice_kanji", { deterministic: true }, (character, on, kun, meanings) =>
          Number(isPracticeKanji(character, parse(on), parse(kun), parse(meanings))));
        practiceFilterRegistered = true;
      }
      const db = asyncDatabase(source);
      tags ??= parse((await db.prepare("SELECT value FROM metadata WHERE key = 'jmdict_tags'").get())?.value ?? "{}");
      const toWord = async (row) => ({
        ...dictionaryRecord(row, tags,
          (await db.prepare("SELECT jlpt FROM vocabulary WHERE word_id = ?").all(row.id)).map((r) => r.jlpt)),
        examples: await localExamples(db, { wordId: row.id })
      });
      const lookupKanji = async (character) => {
        const found = await db.prepare("SELECT meanings, radical_names FROM kanjis WHERE character = ?").get(character);
        return found ? { meanings: parse(found.meanings), radical_names: parse(found.radical_names) } : null;
      };
      const toKanji = async (row) => {
        const stroke = await db.prepare("SELECT svg FROM strokes WHERE character = ?").get(row.character);
        const characters = unique([...stroke?.svg?.matchAll(/kvg:(?:element|original)="([^"]+)"/g) ?? []].map((m) => m[1]));
        const components = new Map(await Promise.all(characters.map(async (ch) => [ch, await lookupKanji(ch)])));
        return {
          ...kanjiRecord(row, { svg: stroke?.svg, lookupKanji: (ch) => components.get(ch) }),
          examples: await exampleWords(db, row),
          sentences: await localExamples(db, { query: row.character })
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
          examples: await exampleWords(db, found)
        };
      };
      if (path === "/api/health") {
        const counts = Object.fromEntries(await Promise.all(["kanjis", "words", "kanji_words", "vocabulary", "strokes"]
          .map(async (table) => [table, (await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n])));
        const ready = Object.values(counts).every((n) => n > 0);
        return send(ready ? 200 : 503, { ready, counts });
      }
      if (path === "/api/conjugator") {
        const random = params.get("random") === "true";
        const query = random ? "" : searchTerm(params);
        const exclude = params.getAll("exclude");
        if (exclude.length > 100 || exclude.some((word) => word.length > 100)) throw new HttpError(400, "Too many excluded words.");
        const level = params.get("level") ?? "all";
        const category = params.get("category") ?? "all";
        if (!/^(all|none|unrated|[1-5](?:,(?:[1-5]|unrated))*)$/.test(level)
          || !["all", "verb", "adjective"].includes(category)) throw new HttpError(400, "Invalid conjugator filter.");
        const items = await findConjugationEntries(db, { query, random, level, category, exclude });
        return send(200, { items: await Promise.all(items.map(async (entry) => ({
          ...entry,
          examples: await localExamples(db, { wordId: entry.wordId }),
          kanjiDetails: (await Promise.all(unique([...entry.word].filter((ch) => /\p{Script=Han}/u.test(ch)))
            .map(lookupKanjiDetail))).filter(Boolean)
        }))) });
      }
      if (path === "/api/shiritori/words") {
        try { return send(200, await shiritoriWords(db, params, tags, wordFallback, segment)); }
        catch (error) {
          if (error.status === 502) throw new HttpError(502, error.message);
          if (error instanceof SyntaxError || /Invalid|Minimum morae|Choose a category|Kanji chains/.test(error.message)) {
            throw new HttpError(400, error.message);
          }
          throw error;
        }
      }
      if (path === "/api/word-search/vocabulary") {
        const filter = levelFilter(params, "v");
        const rows = await db.prepare(`SELECT v.* FROM vocabulary v WHERE v.jlpt BETWEEN 1 AND 5${filter.sql} ORDER BY v.id`).all(...filter.args);
        return send(200, { items: rows.map((row) => ({
          id: row.id, word: row.word, reading: row.reading, level: row.jlpt,
          meaning: parse(row.meanings).join("; "),
          partOfSpeech: parse(row.parts_of_speech).map((tag) => tags[tag] ?? tag).join(", "),
          posTags: parse(row.parts_of_speech)
        })) });
      }
      if (path === "/api/kanji/batch" || path === "/api/words/batch") {
        const kanji = path === "/api/kanji/batch";
        const limit = integer(params.get("limit"), 40, 1, 100);
        const filter = levelFilter(params, kanji ? "" : "v");
        let sql = kanji
          ? `SELECT * FROM kanjis WHERE 1=1${filter.sql}`
          : `SELECT v.*, w.senses AS word_senses FROM vocabulary v LEFT JOIN words w ON v.word_id = w.id WHERE 1=1${filter.sql}`;
        const args = [...filter.args];
        if (kanji) {
          sql += db.d1 ? " AND id IN (SELECT kanji_id FROM practice_kanjis)"
            : " AND is_practice_kanji(character, on_readings, kun_readings, meanings) = 1";
          const mode = params.get("mode") ?? "meaning";
          if (!["meaning", "reading", "both"].includes(mode)) throw new HttpError(400, "Invalid kanji mode");
          if (mode !== "reading") sql += " AND json_array_length(meanings) > 0";
          if (mode !== "meaning") sql += " AND (json_array_length(on_readings) + json_array_length(kun_readings)) > 0";
        }
        const excluded = params.getAll("exclude");
        if (excluded.length > 100 || excluded.some((id) => id.length > 30)) throw new HttpError(400, "Too many excluded IDs");
        if (excluded.length) {
          sql += ` AND ${kanji ? "id" : "v.id"} NOT IN (SELECT value FROM json_each(?))`;
          args.push(JSON.stringify(excluded));
        }
        const enrichKanji = params.get("kanji") === "1" || params.get("kanji") === "true";
        const expandJMdict = !kanji && (params.get("expand") === "1" || params.get("expand") === "true");
        let items = await Promise.all((await db.prepare(`${sql} ORDER BY random() LIMIT ?`).all(...args, limit))
          .map(kanji ? async (row) => ({ ...await toKanji(row), meanings: practiceMeanings(parse(row.meanings)) }) : (row) => vocabularyRecord(row, {
            tags, sensesJson: row.word_senses,
            lookupKanji: enrichKanji ? lookupKanjiDetail : undefined
          })));
        if (expandJMdict) {
          const extraLimit = Math.max(15, Math.floor(limit * 0.35));
          const extraRows = await db.prepare(`SELECT * FROM words WHERE is_common = 1 AND length(word) BETWEEN 2 AND 8 ORDER BY random() LIMIT ?`).all(extraLimit);
          const seenWords = new Set(items.map((i) => i.word));
          await Promise.all(extraRows.map(async (wRow) => {
            if (seenWords.has(wRow.word)) return;
            seenWords.add(wRow.word);
            const senses = parse(wRow.senses);
            const meaningsList = parse(wRow.meanings);
            if (!meaningsList.length) return;
            const posList = unique(senses.flatMap((s) => s.partOfSpeech || []));
            const examples = await localExamples(db, { wordId: wRow.id });
            const kanjiChars = unique([...wRow.word].filter((ch) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(ch)));
            const kanjiDetails = enrichKanji ? (await Promise.all(kanjiChars.map((ch) => lookupKanjiDetail(ch)))).filter(Boolean) : undefined;
            const jlptEst = kanjiDetails?.length
              ? Math.min(...kanjiDetails.map((k) => k.jlpt || 3))
              : 3;
            items.push({
              id: `jm-${wRow.id}`,
              word: wRow.word,
              furigana: wRow.reading || wRow.word,
              romaji: "",
              meaning: meaningsList.slice(0, 4).join("; "),
              meanings: meaningsList,
              level: jlptEst,
              partOfSpeech: posList.map((tag) => tags[tag] ?? tag).join(", "),
              posTags: posList,
              example: examples[0]?.ja ?? "",
              exampleFurigana: examples[0]?.furigana ?? "",
              exampleMeaning: examples[0]?.en ?? "",
              examples,
              synonyms: unique(senses.flatMap((s) => (s.related || []).map((r) => r[0]))).slice(0, 4),
              antonyms: unique(senses.flatMap((s) => (s.antonym || []).map((a) => a[0]))).slice(0, 4),
              fields: unique(senses.flatMap((s) => (s.field || []).map((f) => tags[f] ?? f))).slice(0, 4),
              usageNotes: unique(senses.flatMap((s) => s.info || [])).slice(0, 2),
              ...(kanjiDetails ? { kanjiDetails } : {})
            });
          }));
        }
        if (!items.length) throw new HttpError(503, "No practice items are available for this selection right now.");
        return send(200, { items });
      }
      if (path === "/api/kanji/candidates") {
        const reading = params.get("reading") || "";
        if (!/^[ぁ-ゖー]{1,40}$/.test(reading)) throw new HttpError(400, "Enter a Japanese reading or romaji.");
        const kata = reading.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
        const rows = await db.prepare(`SELECT character FROM kanjis WHERE EXISTS (
          SELECT 1 FROM json_each(kanjis.on_readings) WHERE replace(replace(value, '.', ''), '-', '') IN (?, ?)
        ) OR EXISTS (
          SELECT 1 FROM json_each(kanjis.kun_readings) WHERE replace(replace(value, '.', ''), '-', '') IN (?, ?)
        ) ORDER BY frequency IS NULL, frequency, character LIMIT 80`).all(reading, kata, reading, kata);
        return send(200, { items: rows.map((row) => ({ kanji: row.character })) });
      }
      if (path === "/api/kanji") {
        const filter = levelFilter(params);
        const limit = integer(params.get("limit"), 100, 1, 3000);
        const offset = integer(params.get("offset"), 0, 0, 20000);
        const query = params.get("q");
        if (query !== null && (!query.trim() || query.length > 100)) throw new HttpError(400, "Invalid search term");
        const where = `WHERE 1=1${filter.sql}${query ? " AND instr(lower(meanings), lower(?)) > 0" : ""}`;
        const args = [...filter.args, ...(query ? [query.trim()] : [])];
        const total = (await db.prepare(`SELECT count(*) AS n FROM kanjis ${where}`).get(...args)).n;
        const items = (await db.prepare(`SELECT character, meanings, jlpt FROM kanjis ${where} ORDER BY codepoint LIMIT ? OFFSET ?`)
          .all(...args, limit, offset)).map((row) => ({ kanji: row.character, meanings: parse(row.meanings), jlpt: row.jlpt }));
        return send(200, { items, total, nextOffset: offset + items.length < total ? offset + items.length : null });
      }
      const kanjiMatch = path.match(/^\/api\/kanji\/([^/]+)(?:\/(words|strokes))?$/);
      if (kanjiMatch) {
        const character = characterValue(kanjiMatch[1]);
        const row = await db.prepare("SELECT * FROM kanjis WHERE character = ?").get(character);
        if (!row) throw new HttpError(404, "Kanji not found");
        if (kanjiMatch[2] === "words") {
          const limit = integer(params.get("limit"), 20, 1, 100);
          const candidates = await db.prepare(`SELECT w.id, w.kanji_forms, w.kana_forms FROM words w JOIN kanji_words kw ON kw.word_id = w.id
            WHERE kw.kanji_id = ? ORDER BY w.is_common DESC, length(w.word), w.id`).all(row.id);
          const wordById = db.prepare("SELECT * FROM words WHERE id = ?");
          const items = await Promise.all(selectCompounds(candidates, row, limit).map(async (candidate) => toWord(await wordById.get(candidate.id))));
          return send(200, { items });
        }
        if (kanjiMatch[2] === "strokes") {
          const stroke = await db.prepare("SELECT svg FROM strokes WHERE character = ?").get(character);
          if (!stroke) throw new HttpError(404, "No local stroke diagram for this character");
          res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
          res.setHeader("Cache-Control", "public, max-age=86400");
          res.statusCode = 200;
          sendBody(req, res, stroke.svg, "image/svg+xml; charset=utf-8", compression);
          return;
        }
        return send(200, await toKanji(row));
      }
      if (path === "/api/words") {
        const query = searchTerm(params);
        const limit = integer(params.get("limit"), 20, 1, 100);
        const candidates = deinflectCandidates(query);
        const exactRows = [];
        const seenIds = new Set();
        const exactStmt = db.prepare(`SELECT * FROM words WHERE word = ? OR reading = ?
          ORDER BY is_common DESC, (word = ? OR senses LIKE '%"uk"%') DESC, id LIMIT ?`);
        const candidateRows = await Promise.all(candidates.map((candidate) => exactStmt.all(candidate, candidate, candidate, limit)));
        for (const rows of candidateRows) {
          for (const row of rows) {
            if (!seenIds.has(row.id)) {
              seenIds.add(row.id);
              exactRows.push(row);
            }
          }
          if (exactRows.length >= limit) break;
        }
        if (exactRows.length < limit) {
          const substringRows = await db.prepare(`SELECT * FROM words WHERE
            instr(lower(kanji_forms), lower(?)) > 0 OR instr(lower(kana_forms), lower(?)) > 0 OR instr(lower(meanings), lower(?)) > 0
            OR id IN (SELECT word_id FROM vocabulary WHERE romaji = ?)
            ORDER BY (word = ? OR reading = ?) DESC, is_common DESC, id LIMIT ?`)
            .all(query, query, query, query, query, query, limit);
          for (const row of substringRows) {
            if (!seenIds.has(row.id)) {
              seenIds.add(row.id);
              exactRows.push(row);
            }
            if (exactRows.length >= limit) break;
          }
        }
        return send(200, { data: await Promise.all(exactRows.slice(0, limit).map(toWord)) });
      }
      if (path === "/api/analyze") {
        const text = (params.get("text") ?? params.get("q") ?? "").trim();
        if (!text || text.length > 500) throw new HttpError(400, "Text must contain 1-500 characters");
        const result = await analyzeSentence(db, text, { toWord, translateSentence, segment });
        return send(200, result);
      }
      if (path === "/api/sentences") {
        const query = searchTerm(params);
        const random = params.get("random") === "1";
        let excluded;
        try { excluded = JSON.parse(params.get("exclude") || "[]"); }
        catch { throw new HttpError(400, "Invalid sentence exclusions."); }
        if (!Array.isArray(excluded) || excluded.length > 10
            || excluded.some((text) => typeof text !== "string" || text.length > 1000)) {
          throw new HttpError(400, "Invalid sentence exclusions.");
        }
        let examples = await localExamples(db, { query, limit: 100, random: true });
        let warning = "";
        if (!examples.length || random) {
          try { examples.push(...await sentenceFallback(query)); }
          catch (error) {
            console.error("Sentence fallback failed:", error);
            if (!examples.length) throw new HttpError(502, "Example sentences could not be loaded. Please retry.");
            warning = "Online examples are unavailable right now. Showing saved examples; try again later.";
          }
        }
        const seen = new Set();
        examples = examples.filter((example) => {
          if (seen.has(example.japanese)) return false;
          seen.add(example.japanese);
          return true;
        });
        const fresh = examples.filter((example) => !excluded.includes(example.japanese));
        const data = shuffleExamples(fresh.length ? fresh : examples).slice(0, random ? 1 : 3).map((example) => ({
          id: example.id, text: example.japanese, furigana: example.furigana, license: example.license, owner: example.owner,
          translations: [{ id: example.translationId, lang: "eng", text: example.english, owner: example.translationOwner }]
        }));
        return send(200, { data, ...(warning ? { warning } : {}) });
      }
      throw new HttpError(404, "Endpoint not found");
    } catch (error) {
      if (!(error instanceof HttpError)) console.error("Backend request failed:", error);
      send(error instanceof HttpError ? error.status : 503,
        { error: error instanceof HttpError ? error.message : "The dictionary is temporarily unavailable. Please try again in a moment." });
    }
  };
}
