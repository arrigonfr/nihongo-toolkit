import { selectCompounds } from "../compounds.js";
import { contentTranslations } from "../content-translations.js";
import {
  CACHE_STATIC,
  characterValue,
  ftsShortTermQuery,
  ftsTrigramQuery,
  HttpError,
  integer,
  levelFilter,
} from "../http.js";
import { practiceRecords } from "../serializers.js";
import { sendBody } from "../transport.js";

const parse = JSON.parse;
const unique = (items) => [...new Set(items)];

export async function handleKanjiRoutes({
  req,
  res,
  path,
  params,
  db,
  send,
  toWords,
  toKanji,
  kanjiCounts,
  compression,
}) {
  if (path === "/api/kanji/bulk") {
    const characters = unique(params.getAll("character"));
    if (!characters.length || characters.length > 100) throw new HttpError(400, "Choose 1-100 kanji.");
    characters.forEach(characterValue);
    const rows = await db
      .prepare("SELECT * FROM kanjis WHERE character IN (SELECT value FROM json_each(?))")
      .all(JSON.stringify(characters));
    const byCharacter = new Map(rows.map((row) => [row.character, row]));
    await send(
      200,
      { items: await practiceRecords(db, characters.map((ch) => byCharacter.get(ch)).filter(Boolean)) },
      CACHE_STATIC,
    );
    return true;
  }
  if (path === "/api/kanji/candidates") {
    const reading = params.get("reading") || "";
    if (!/^[ぁ-ゖー]{1,40}$/.test(reading)) throw new HttpError(400, "Enter a Japanese reading or romaji.");
    const kata = reading.replace(/[ぁ-ゖ]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));
    const rows = await db
      .prepare(`SELECT DISTINCT k.character FROM kanji_readings kr
      JOIN kanjis k ON k.id = kr.kanji_id
      WHERE kr.reading IN (?, ?)
      ORDER BY k.frequency IS NULL, k.frequency, k.character LIMIT 80`)
      .all(reading, kata);
    await send(200, { items: rows.map((row) => ({ kanji: row.character })) }, CACHE_STATIC);
    return true;
  }
  if (path === "/api/kanji") {
    const filter = levelFilter(params);
    const limit = integer(params.get("limit"), 100, 1, 3000);
    const offset = integer(params.get("offset"), 0, 0, 20000);
    const query = params.get("q");
    if (query !== null && (!query.trim() || query.length > 100)) throw new HttpError(400, "Invalid search term");
    const trimmedQuery = query ? query.trim() : null;
    const ftsQuery = trimmedQuery ? ftsTrigramQuery(trimmedQuery) : null;
    const shortQuery = trimmedQuery && !ftsQuery ? ftsShortTermQuery(trimmedQuery) : null;
    const queryClause = trimmedQuery
      ? ftsQuery
        ? " AND id IN (SELECT rowid FROM kanji_meanings_fts WHERE kanji_meanings_fts MATCH ?) AND instr(lower(meanings), lower(?)) > 0"
        : shortQuery
          ? " AND id IN (SELECT rowid FROM kanji_meanings_terms_fts WHERE kanji_meanings_terms_fts MATCH ?)"
          : " AND instr(lower(meanings), lower(?)) > 0"
      : "";
    const where = `WHERE 1=1${filter.sql}${queryClause}`;
    const args = [
      ...filter.args,
      ...(trimmedQuery ? (ftsQuery ? [ftsQuery, trimmedQuery] : [shortQuery ? shortQuery.prefix : trimmedQuery]) : []),
    ];
    const countKey = JSON.stringify([where, args]);
    let cachedCount = kanjiCounts.get(countKey);
    if (!cachedCount || cachedCount.expires <= Date.now()) {
      if (kanjiCounts.size >= 128) kanjiCounts.delete(kanjiCounts.keys().next().value);
      cachedCount = {
        expires: Date.now() + 60000,
        value: db
          .prepare(`SELECT count(*) AS n FROM kanjis ${where}`)
          .get(...args)
          .then((row) => row.n),
      };
      kanjiCounts.set(countKey, cachedCount);
    }
    let total;
    try {
      total = await cachedCount.value;
    } catch (error) {
      if (kanjiCounts.get(countKey) === cachedCount) kanjiCounts.delete(countKey);
      throw error;
    }
    const items = (
      await db
        .prepare(`SELECT character, meanings, jlpt FROM kanjis ${where} ORDER BY codepoint LIMIT ? OFFSET ?`)
        .all(...args, limit, offset)
    ).map((row) => ({ kanji: row.character, meanings: parse(row.meanings), jlpt: row.jlpt }));
    await send(
      200,
      { items, total, nextOffset: offset + items.length < total ? offset + items.length : null },
      CACHE_STATIC,
    );
    return true;
  }
  const kanjiMatch = path.match(/^\/api\/kanji\/([^/]+)(?:\/(words|strokes))?$/);
  if (kanjiMatch) {
    const character = characterValue(kanjiMatch[1]);
    const row = await db.prepare("SELECT * FROM kanjis WHERE character = ?").get(character);
    if (!row) throw new HttpError(404, "Kanji not found");
    if (kanjiMatch[2] === "words") {
      const limit = integer(params.get("limit"), 20, 1, 100);
      const candidates = await db
        .prepare(`SELECT w.id, w.kanji_forms, w.kana_forms FROM words w JOIN kanji_words kw ON kw.word_id = w.id
        WHERE kw.kanji_id = ? ORDER BY w.is_common DESC, length(w.word), w.id`)
        .all(row.id);
      const ids = selectCompounds(candidates, row, limit).map((candidate) => candidate.id);
      const selected = await db
        .prepare("SELECT * FROM words WHERE id IN (SELECT value FROM json_each(?))")
        .all(JSON.stringify(ids));
      const byId = new Map(selected.map((word) => [word.id, word]));
      const items = await toWords(ids.map((id) => byId.get(id)));
      await send(200, { items }, CACHE_STATIC);
      return true;
    }
    if (kanjiMatch[2] === "strokes") {
      const stroke = await db.prepare("SELECT svg FROM strokes WHERE character = ?").get(character);
      if (!stroke) throw new HttpError(404, "No local stroke diagram for this character");
      res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
      res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400");
      res.statusCode = 200;
      await sendBody(req, res, stroke.svg, "image/svg+xml; charset=utf-8", compression);
      return true;
    }
    const meanings = parse(row.meanings_by_language ?? "{}");
    const meaningsByLanguage = Object.fromEntries(
      ["es", "pt"].filter((language) => meanings[language]?.length).map((language) => [language, meanings[language]]),
    );
    const translated =
      (await contentTranslations(db, "kanji", [{ id: row.character, english: parse(row.meanings) }])).get(
        row.character,
      ) ?? {};
    const machineTranslated = [];
    for (const [language, { text, machine }] of Object.entries(translated)) {
      if (meaningsByLanguage[language]) continue;
      meaningsByLanguage[language] = text;
      if (machine) machineTranslated.push(language);
    }
    await send(
      200,
      {
        ...(await toKanji(row)),
        meanings_by_language: meaningsByLanguage,
        machine_translated_languages: machineTranslated,
      },
      CACHE_STATIC,
    );
    return true;
  }
  return false;
}
