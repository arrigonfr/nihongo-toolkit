import { findPracticeEntries } from "../conjugation-practice.js";
import { findConjugationEntries } from "../conjugator.js";
import { localExamples, localExamplesMany } from "../examples.js";
import { CACHE_DYNAMIC, CACHE_STATIC, HttpError, integer, levelFilter, searchTerm } from "../http.js";
import { isPracticeKanji, practiceMeanings } from "../practice-kanji.js";
import { practiceRecords, vocabularyExample, vocabularyRecord } from "../serializers.js";
import { shiritoriWords } from "../shiritori.js";

const parse = JSON.parse;
const unique = (items) => [...new Set(items)];

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function sampleIds(ids, count) {
  const n = Math.min(count, ids.length);
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(Math.random() * (ids.length - i));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, n);
}

function randomProbes(count) {
  return JSON.stringify(Array.from({ length: count }, () => Math.random()));
}

function filterPracticeKanji(rows, isRemote) {
  return isRemote
    ? rows.filter((row) =>
        isPracticeKanji(row.character, parse(row.on_readings), parse(row.kun_readings), parse(row.meanings)),
      )
    : rows;
}

export async function handlePracticeRoutes({
  path,
  params,
  db,
  tags,
  send,
  toKanji,
  lookupKanjiDetail,
  wordFallback,
  segment,
}) {
  if (path === "/api/health") {
    const counts = Object.fromEntries(
      await Promise.all(
        ["kanjis", "words", "kanji_words", "vocabulary", "strokes"].map(async (table) => [
          table,
          (await db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n,
        ]),
      ),
    );
    const ready = Object.values(counts).every((n) => n > 0);
    await send(ready ? 200 : 503, { ready, counts });
    return true;
  }
  if (path === "/api/conjugation-practice") {
    const level = params.get("level") ?? "all";
    if (!/^(all|none|unrated|[1-5](?:,(?:[1-5]|unrated))*)$/.test(level))
      throw new HttpError(400, "Invalid practice level.");
    await send(200, await findPracticeEntries(db, { level }), CACHE_STATIC);
    return true;
  }
  if (path === "/api/conjugator") {
    const random = params.get("random") === "true";
    const query = random ? "" : searchTerm(params);
    const exclude = params.getAll("exclude");
    if (exclude.length > 100 || exclude.some((word) => word.length > 100))
      throw new HttpError(400, "Too many excluded words.");
    const level = params.get("level") ?? "all";
    const category = params.get("category") ?? "all";
    if (
      !/^(all|none|unrated|[1-5](?:,(?:[1-5]|unrated))*)$/.test(level) ||
      !["all", "verb", "adjective"].includes(category)
    )
      throw new HttpError(400, "Invalid conjugator filter.");
    const items = await findConjugationEntries(db, { query, random, level, category, exclude });
    const examples = await localExamplesMany(
      db,
      items.map((entry) => entry.wordId),
    );
    await send(
      200,
      {
        items: await Promise.all(
          items.map(async (entry) => ({
            ...entry,
            examples: examples.get(entry.wordId) ?? [],
            kanjiDetails: (
              await Promise.all(
                unique([...entry.word].filter((ch) => /\p{Script=Han}/u.test(ch))).map(lookupKanjiDetail),
              )
            ).filter(Boolean),
          })),
        ),
      },
      random ? undefined : CACHE_STATIC,
    );
    return true;
  }
  if (path === "/api/shiritori/words") {
    try {
      const isRandom = params.get("random") === "1";
      await send(
        200,
        await shiritoriWords(db, params, tags, wordFallback, segment),
        isRandom ? undefined : CACHE_DYNAMIC,
      );
      return true;
    } catch (error) {
      if (error.status === 502) throw new HttpError(502, error.message);
      if (error instanceof SyntaxError || /Invalid|Minimum morae|Choose a category|Kanji chains/.test(error.message)) {
        throw new HttpError(400, error.message);
      }
      throw error;
    }
  }
  if (path === "/api/word-search/vocabulary") {
    const filter = levelFilter(params, "v");
    const rows = await db
      .prepare(
        `SELECT v.id, v.word, v.reading, v.jlpt, v.meanings, v.parts_of_speech FROM vocabulary v WHERE v.jlpt BETWEEN 1 AND 5${filter.sql} ORDER BY v.id`,
      )
      .all(...filter.args);
    await send(
      200,
      {
        items: rows.map((row) => ({
          id: row.id,
          word: row.word,
          reading: row.reading,
          level: row.jlpt,
          meaning: parse(row.meanings).join("; "),
          partOfSpeech: parse(row.parts_of_speech)
            .map((tag) => tags[tag] ?? tag)
            .join(", "),
          posTags: parse(row.parts_of_speech),
        })),
      },
      CACHE_STATIC,
    );
    return true;
  }
  if (path === "/api/kanji/batch" || path === "/api/words/batch") {
    const kanji = path === "/api/kanji/batch";
    const lightweight = params.get("projection") === "practice";
    const limit = integer(params.get("limit"), 40, 1, !kanji && lightweight ? 200 : 100);
    const filter = levelFilter(params, kanji ? "" : "v");
    let whereSql = filter.sql;
    /** @type {Array<string | number>} */
    const args = [...filter.args];
    if (kanji) {
      if (!db.remote) whereSql += " AND is_practice_kanji(character, on_readings, kun_readings, meanings) = 1";
      const mode = params.get("mode") ?? "meaning";
      if (!["meaning", "reading", "both"].includes(mode)) throw new HttpError(400, "Invalid kanji mode");
      if (mode !== "reading") whereSql += " AND json_array_length(meanings) > 0";
      if (mode !== "meaning") whereSql += " AND (json_array_length(on_readings) + json_array_length(kun_readings)) > 0";
      const reading = params.get("reading") ?? "both";
      if (!["on", "kun", "both"].includes(reading)) throw new HttpError(400, "Invalid reading type");
      if (reading !== "both") whereSql += ` AND json_array_length(${reading}_readings) > 0`;
    }
    const excluded = params.getAll("exclude");
    if (excluded.length > 100 || excluded.some((id) => id.length > 30))
      throw new HttpError(400, "Too many excluded IDs");
    if (excluded.length) {
      whereSql += ` AND ${kanji ? "id" : "v.id"} NOT IN (SELECT value FROM json_each(?))`;
      args.push(JSON.stringify(excluded));
    }
    const enrichKanji = !lightweight && (params.get("kanji") === "1" || params.get("kanji") === "true");
    const expandJMdict = !kanji && (params.get("expand") === "1" || params.get("expand") === "true");
    let rows;
    if (kanji) {
      if (!filter.sql) {
        const probeCount = Math.min(400, Math.max(limit * 3, 120));
        const smallPoolLimit = Math.max(limit * 3, 150);
        const probed = await db
          .prepare(`WITH bounds(lo, hi, total) AS (
            SELECT (SELECT min(id) FROM kanjis), (SELECT max(id) FROM kanjis), (SELECT count(*) FROM kanjis)
          ),
          probes(target) AS (
            SELECT CAST(bounds.lo + value * (bounds.hi - bounds.lo) AS INTEGER) FROM bounds, json_each(?)
          ),
          picked(id) AS (
            SELECT id FROM kanjis, bounds WHERE bounds.total <= ?${whereSql}
            UNION
            SELECT (
              SELECT id FROM kanjis WHERE 1=1${whereSql} AND id >= probes.target ORDER BY id LIMIT 1
            ) FROM probes, bounds WHERE bounds.total > ?
          )
          SELECT k.*, bounds.total AS _pool_total FROM kanjis k JOIN picked p ON k.id = p.id CROSS JOIN bounds`)
          .all(randomProbes(probeCount), smallPoolLimit, ...args, ...args, smallPoolLimit);
        const poolTotal = probed[0]?._pool_total ?? 0;
        rows = shuffle(filterPracticeKanji(probed, db.remote));
        if (rows.length < limit && poolTotal > smallPoolLimit) {
          const seenIds = new Set(probed.map((row) => row.id));
          const allIds = (await db.prepare(`SELECT id FROM kanjis WHERE 1=1${whereSql}`).all(...args))
            .map((row) => row.id)
            .filter((id) => !seenIds.has(id));
          shuffle(allIds);
          const chunkSize = db.remote ? Math.max(limit * 2, 100) : limit - rows.length;
          for (let offset = 0; rows.length < limit && offset < allIds.length; offset += chunkSize) {
            const batchIds = allIds.slice(offset, offset + chunkSize);
            const extra = await db
              .prepare("SELECT * FROM kanjis WHERE id IN (SELECT value FROM json_each(?))")
              .all(JSON.stringify(batchIds));
            rows.push(...shuffle(filterPracticeKanji(extra, db.remote)));
          }
        }
        rows = rows.slice(0, limit);
      } else {
        const allIds = (await db.prepare(`SELECT id FROM kanjis WHERE 1=1${whereSql}`).all(...args)).map(
          (row) => row.id,
        );
        shuffle(allIds);
        rows = [];
        const chunkSize = db.remote ? Math.max(limit * 2, 100) : limit;
        for (let offset = 0; rows.length < limit && offset < allIds.length; offset += chunkSize) {
          const batchIds = allIds.slice(offset, offset + chunkSize);
          const batchRows = await db
            .prepare("SELECT * FROM kanjis WHERE id IN (SELECT value FROM json_each(?))")
            .all(JSON.stringify(batchIds));
          rows.push(...shuffle(filterPracticeKanji(batchRows, db.remote)));
        }
        rows = rows.slice(0, limit);
      }
    } else if (!filter.sql) {
      const probeCount = Math.min(450, Math.ceil(limit * 1.6) + 20);
      rows = shuffle(
        await db
          .prepare(`WITH bounds(lo, hi) AS (
          SELECT (SELECT min(rowid) FROM vocabulary), (SELECT max(rowid) FROM vocabulary)
        ),
        probes(target) AS (
          SELECT CAST(bounds.lo + value * (bounds.hi - bounds.lo) AS INTEGER) FROM bounds, json_each(?)
        ),
        picked(rid) AS (
          SELECT DISTINCT (
            SELECT v.rowid FROM vocabulary v WHERE 1=1${whereSql} AND v.rowid >= probes.target ORDER BY v.rowid LIMIT 1
          ) FROM probes
        )
        SELECT v.*, w.senses AS word_senses, w.kanji_forms AS word_kanji_forms, w.kana_forms AS word_kana_forms
        FROM picked p
        JOIN vocabulary v ON v.rowid = p.rid
        LEFT JOIN words w ON v.word_id = w.id
        LIMIT ?`)
          .all(randomProbes(probeCount), ...args, limit),
      );
    } else {
      const allRowIds = (
        await db.prepare(`SELECT v.rowid AS rid FROM vocabulary v WHERE 1=1${whereSql}`).all(...args)
      ).map((row) => row.rid);
      const chosenRowIds = sampleIds(allRowIds, limit);
      rows = chosenRowIds.length
        ? shuffle(
            await db
              .prepare(`SELECT v.*, w.senses AS word_senses, w.kanji_forms AS word_kanji_forms, w.kana_forms AS word_kana_forms
          FROM vocabulary v LEFT JOIN words w ON v.word_id = w.id
          WHERE v.rowid IN (SELECT value FROM json_each(?))`)
              .all(JSON.stringify(chosenRowIds)),
          )
        : [];
    }
    const items =
      kanji && lightweight
        ? (await practiceRecords(db, rows)).map((item) => ({ ...item, meanings: practiceMeanings(item.meanings) }))
        : await Promise.all(
            rows.map(
              kanji
                ? async (row) => ({ ...(await toKanji(row)), meanings: practiceMeanings(parse(row.meanings)) })
                : (row) =>
                    vocabularyRecord(row, {
                      db: lightweight ? undefined : db,
                      tags,
                      sensesJson: row.word_senses,
                      lookupKanji: enrichKanji ? lookupKanjiDetail : undefined,
                    }),
            ),
          );
    if (expandJMdict) {
      const extraLimit = Math.max(15, Math.floor(limit * 0.35));
      const probeCount = Math.min(200, Math.ceil(extraLimit * 1.6) + 15);
      const extraRows = shuffle(
        await db
          .prepare(`WITH bounds(lo, hi) AS (
          SELECT
            (SELECT min(id) FROM words WHERE is_common = 1 AND length(word) BETWEEN 2 AND 8),
            (SELECT max(id) FROM words WHERE is_common = 1 AND length(word) BETWEEN 2 AND 8)
        ),
        probes(target) AS (
          SELECT CAST(bounds.lo + value * (bounds.hi - bounds.lo) AS INTEGER) FROM bounds, json_each(?)
        ),
        picked(id) AS (
          SELECT DISTINCT (
            SELECT id FROM words
            WHERE is_common = 1 AND length(word) BETWEEN 2 AND 8 AND id >= probes.target
            ORDER BY id LIMIT 1
          ) FROM probes
        )
        SELECT w.* FROM words w JOIN picked p ON w.id = p.id LIMIT ?`)
          .all(randomProbes(probeCount), extraLimit),
      );
      const levelCharacters = lightweight
        ? unique(extraRows.flatMap((row) => [...row.word].filter((ch) => /\p{Script=Han}/u.test(ch))))
        : [];
      const kanjiLevels = new Map(
        levelCharacters.length
          ? (
              await db
                .prepare("SELECT character, jlpt FROM kanjis WHERE character IN (SELECT value FROM json_each(?))")
                .all(JSON.stringify(levelCharacters))
            ).map((row) => [row.character, row.jlpt || 3])
          : [],
      );
      const seenWords = new Set(items.map((i) => i.word));
      await Promise.all(
        extraRows.map(async (wRow) => {
          if (seenWords.has(wRow.word)) return;
          seenWords.add(wRow.word);
          const senses = parse(wRow.senses);
          const meaningsList = parse(wRow.meanings);
          if (!meaningsList.length) return;
          const posList = unique(senses.flatMap((s) => s.partOfSpeech || []));
          const examples = lightweight ? [] : (await localExamples(db, { wordId: wRow.id })).map(vocabularyExample);
          const kanjiChars = unique(
            [...wRow.word].filter((ch) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(ch)),
          );
          const kanjiDetails = enrichKanji
            ? (await Promise.all(kanjiChars.map((ch) => lookupKanjiDetail(ch)))).filter(Boolean)
            : undefined;
          const levels = lightweight
            ? kanjiChars.filter((ch) => kanjiLevels.has(ch)).map((ch) => kanjiLevels.get(ch))
            : kanjiDetails?.map((k) => k.jlpt || 3);
          const jlptEst = levels?.length ? Math.min(...levels) : 3;
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
            ...(kanjiDetails ? { kanjiDetails } : {}),
          });
        }),
      );
    }
    if (!items.length) throw new HttpError(503, "No practice items are available for this selection right now.");
    await send(200, { items });
    return true;
  }
  return false;
}
