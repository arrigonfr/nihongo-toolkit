import { deinflectCandidates } from "../analyze.js";
import { exactWordCandidates } from "../async-database.js";
import {
  CACHE_STATIC,
  ftsShortTermQuery,
  ftsTrigramQuery,
  integer,
  JAPANESE_SCRIPT,
  prefixUpperBound,
  searchTerm,
} from "../http.js";

export async function handleWordsRoutes({ path, params, db, send, toWords }) {
  if (path !== "/api/words") return false;
  const query = searchTerm(params);
  const limit = integer(params.get("limit"), 20, 1, 100);
  const candidates = deinflectCandidates(query);
  const exactRows = [];
  const seenIds = new Set();
  const candidateRows = [...(await exactWordCandidates(db, candidates, limit)).values()].flat();
  for (const row of candidateRows) {
    if (!seenIds.has(row.id)) {
      seenIds.add(row.id);
      exactRows.push(row);
    }
    if (exactRows.length >= limit) break;
  }
  if (exactRows.length < limit) {
    let fallbackRows = [];
    if (JAPANESE_SCRIPT.test(query)) {
      const upper = prefixUpperBound(query);
      fallbackRows = await db
        .prepare(`SELECT DISTINCT w.* FROM word_forms wf
        JOIN words w ON w.id = wf.word_id
        WHERE wf.kind IN (0, 1) AND wf.form >= ? AND wf.form < ?
        ORDER BY w.is_common DESC, length(w.word), w.id LIMIT ?`)
        .all(query, upper, limit);
    } else {
      const ftsQuery = ftsTrigramQuery(query);
      const shortQuery = ftsQuery ? null : ftsShortTermQuery(query);
      if (ftsQuery) {
        fallbackRows = await db
          .prepare(`WITH matched(id) AS (
          SELECT rowid FROM (SELECT rowid FROM words_meanings_fts WHERE words_meanings_fts MATCH ? LIMIT 400)
          UNION
          SELECT word_id FROM vocabulary WHERE romaji = ? AND word_id IS NOT NULL
        )
        SELECT words.* FROM words JOIN matched ON words.id = matched.id
        CROSS JOIN (SELECT lower(?) AS q) AS search
        ORDER BY COALESCE((SELECT MIN(CASE
          WHEN lower(value) = search.q THEN 0
          WHEN substr(lower(value), 1, length(search.q) + 2) = search.q || ' (' THEN 1
          WHEN substr(lower(value), 1, length(search.q) + 1) = search.q || ' ' THEN 2
          WHEN instr(' ' || replace(replace(replace(replace(lower(value), '(', ' '), ')', ' '), ',', ' '), '-', ' ') || ' ', ' ' || search.q || ' ') > 0 THEN 3
          ELSE 4 END) FROM json_each(words.meanings)), 4),
          is_common DESC, length(word), words.id LIMIT ?`)
          .all(ftsQuery, query.toLowerCase(), query, limit);
      } else if (shortQuery) {
        fallbackRows = await db
          .prepare(`WITH matched(id) AS (
          SELECT rowid FROM (SELECT rowid FROM words_meanings_terms_fts WHERE words_meanings_terms_fts MATCH ? LIMIT 400)
          UNION
          SELECT rowid FROM (SELECT rowid FROM words_meanings_terms_fts WHERE words_meanings_terms_fts MATCH ? LIMIT 200)
          UNION
          SELECT word_id FROM vocabulary WHERE romaji = ? AND word_id IS NOT NULL
        )
        SELECT words.* FROM words JOIN matched ON words.id = matched.id
        CROSS JOIN (SELECT lower(?) AS q) AS search
        ORDER BY COALESCE((SELECT MIN(CASE
          WHEN lower(value) = search.q THEN 0
          WHEN substr(lower(value), 1, length(search.q) + 2) = search.q || ' (' THEN 1
          WHEN substr(lower(value), 1, length(search.q) + 1) = search.q || ' ' THEN 2
          WHEN instr(' ' || replace(replace(replace(replace(lower(value), '(', ' '), ')', ' '), ',', ' '), '-', ' ') || ' ', ' ' || search.q || ' ') > 0 THEN 3
          ELSE 4 END) FROM json_each(words.meanings)), 4),
          is_common DESC, length(word), words.id LIMIT ?`)
          .all(shortQuery.exact, shortQuery.prefix, query.toLowerCase(), query, limit);
      } else {
        fallbackRows = await db
          .prepare(`SELECT words.* FROM words CROSS JOIN (SELECT lower(?) AS q) AS search WHERE
          instr(lower(meanings), lower(?)) > 0
          OR id IN (SELECT word_id FROM vocabulary WHERE romaji = ?)
          ORDER BY COALESCE((SELECT MIN(CASE
            WHEN lower(value) = search.q THEN 0
            WHEN substr(lower(value), 1, length(search.q) + 2) = search.q || ' (' THEN 1
            WHEN substr(lower(value), 1, length(search.q) + 1) = search.q || ' ' THEN 2
            WHEN instr(' ' || replace(replace(replace(replace(lower(value), '(', ' '), ')', ' '), ',', ' '), '-', ' ') || ' ', ' ' || search.q || ' ') > 0 THEN 3
            ELSE 4 END) FROM json_each(words.meanings)), 4),
            is_common DESC, length(word), id LIMIT ?`)
          .all(query, query, query.toLowerCase(), limit);
      }
    }
    for (const row of fallbackRows) {
      if (!seenIds.has(row.id)) {
        seenIds.add(row.id);
        exactRows.push(row);
      }
      if (exactRows.length >= limit) break;
    }
  }
  await send(200, { data: await toWords(exactRows.slice(0, limit)) }, CACHE_STATIC);
  return true;
}
