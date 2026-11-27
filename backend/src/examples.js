import { hasTables } from "./async-database.js";

export function shuffleExamples(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * @param {any} db
 * @param {{ wordId?: number, query?: string, limit?: number, random?: boolean, prefetched?: any }} [options]
 */
export async function localExamples(
  db,
  { wordId = undefined, query = undefined, limit = 3, random = false, prefetched = undefined } = {},
) {
  const rows =
    prefetched?.vocabulary ??
    (wordId !== undefined
      ? await db.prepare("SELECT examples FROM vocabulary WHERE word_id = ?").all(wordId)
      : await db
          .prepare(`SELECT examples FROM vocabulary WHERE instr(word, ?) > 0
        OR reading = ? OR romaji = ? OR EXISTS
        (SELECT 1 FROM json_each(other_forms) WHERE value = ?)
        ORDER BY (word = ? OR reading = ?) DESC LIMIT 40`)
          .all(query, query, query, query, query, query));
  const seen = new Set();
  const examples = rows
    .flatMap((row) => JSON.parse(row.examples))
    .filter((example) => {
      if (!example.ja || !example.en || seen.has(example.ja)) return false;
      if (
        query &&
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query) &&
        !example.ja.includes(query) &&
        !(example.furigana || "").replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1").includes(query)
      )
        return false;
      seen.add(example.ja);
      return true;
    });
  const items = examples.map((example) => ({
    id: example.tatoeba_id,
    japanese: example.ja,
    furigana: example.furigana || "",
    english: example.en,
    license: "CC BY 2.0 FR",
    source: "Tatoeba",
  }));
  if (!random && items.length >= limit) return items.slice(0, limit);
  if (await hasTables(db, ["sentences", "word_sentences"])) {
    const stored =
      prefetched?.stored ??
      (await db
        .prepare(`SELECT DISTINCT s.* FROM sentences s
      JOIN word_sentences ws ON ws.sentence_id=s.id
      WHERE ${
        wordId !== undefined
          ? "ws.word_id=?"
          : `ws.word_id IN (
        SELECT word_id FROM word_forms WHERE kind=0 AND form=?
        UNION ALL SELECT word_id FROM word_forms WHERE kind=1 AND form=?)`
      }
      AND (s.source <> 'ai-generated' OR CASE WHEN json_valid(s.attribution)
        THEN json_extract(s.attribution,'$.reviewed') END = 1)
      ORDER BY (s.source='ai-generated'), s.id LIMIT 100`)
        .all(...(wordId !== undefined ? [wordId] : [query, query])));
    for (const row of stored) {
      if (seen.has(row.ja)) continue;
      seen.add(row.ja);
      const attribution = row.attribution.startsWith("{") ? JSON.parse(row.attribution) : {};
      items.push({
        id: row.source === "tatoeba" ? Number(row.source_id) : row.id,
        japanese: row.ja,
        english: row.en,
        furigana: "",
        license: row.license,
        source: row.source === "tatoeba" ? "Tatoeba" : row.source,
        generated: row.source === "ai-generated",
        reviewed: attribution.reviewed === true,
        attribution: row.attribution,
        owner: attribution.owner,
        translationOwner: attribution.translationOwner,
        translationId: attribution.translationId,
      });
    }
  }
  return (random ? shuffleExamples(items) : items).slice(0, limit);
}

// Request-scoped, set-based enrichment; keep the single-item ordering and provenance.
export async function localExamplesMany(db, ids, limit = 3) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const vocabulary = await db
    .prepare("SELECT word_id, examples FROM vocabulary WHERE word_id IN (SELECT value FROM json_each(?))")
    .all(JSON.stringify(unique));
  /** @type {Map<any, { vocabulary: any[], stored: any[] }>} */
  const groups = new Map(unique.map((id) => [id, { vocabulary: [], stored: [] }]));
  vocabulary.forEach((row) => groups.get(row.word_id)?.vocabulary.push(row));
  if (await hasTables(db, ["sentences", "word_sentences"])) {
    const needed = unique.filter((id) => {
      const seen = new Set(
        (groups.get(id)?.vocabulary ?? [])
          .flatMap((row) => JSON.parse(row.examples))
          .filter((item) => item.ja && item.en)
          .map((item) => item.ja),
      );
      return seen.size < limit;
    });
    if (needed.length) {
      const stored = await db
        .prepare(`WITH candidates AS (
        SELECT s.*, ws.word_id,
          row_number() OVER (PARTITION BY ws.word_id ORDER BY (s.source='ai-generated'), s.id) AS rank
        FROM word_sentences ws JOIN sentences s ON s.id = ws.sentence_id
        WHERE ws.word_id IN (SELECT value FROM json_each(?))
          AND (s.source <> 'ai-generated' OR CASE WHEN json_valid(s.attribution)
            THEN json_extract(s.attribution,'$.reviewed') END = 1)
      ), distinct_sentences AS (
        SELECT *, row_number() OVER (PARTITION BY word_id, ja ORDER BY rank) AS duplicate
        FROM candidates WHERE rank <= 100
      ), bounded AS (
        SELECT *, row_number() OVER (PARTITION BY word_id ORDER BY rank) AS selected
        FROM distinct_sentences WHERE duplicate = 1
      ) SELECT * FROM bounded WHERE selected <= ? ORDER BY word_id, rank`)
        .all(JSON.stringify(needed), limit * 2 - 1);
      stored.forEach((row) => groups.get(row.word_id)?.stored.push(row));
    }
  }
  return new Map(
    await Promise.all(
      unique.map(
        async (wordId) =>
          /** @type {[any, any]} */ ([
            wordId,
            await localExamples(db, { wordId, limit, prefetched: groups.get(wordId) }),
          ]),
      ),
    ),
  );
}

const PERSISTENT_SENTENCE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * @param {{ fetchImpl?: typeof fetch, enabled?: boolean, cache?: any, cooldownMs?: number, now?: () => number }} [options]
 */
export function createSentenceFallback({
  fetchImpl = fetch,
  enabled = process.env.SENTENCE_API_FALLBACK !== "false",
  cache = null,
  cooldownMs = 0,
  now = Date.now,
} = {}) {
  const memoryCache = new Map();
  const pending = new Map();
  let cooldownUntil = 0;

  return async function fallback(query) {
    if (!enabled) return [];
    const cached = memoryCache.get(query);
    if (cached && cached.expires > now()) return cached.items;
    if (pending.has(query)) return pending.get(query);

    const cacheKey = `tatoeba:${query}`;
    if (cache?.get) {
      const persisted = await cache.get(cacheKey);
      if (Array.isArray(persisted)) {
        if (memoryCache.size >= 200) memoryCache.delete(memoryCache.keys().next().value);
        memoryCache.set(query, { items: persisted, expires: now() + 3600000 });
        return persisted;
      }
    }

    if (cooldownUntil > now()) {
      throw new Error("Sentence provider is temporarily cooling down; try again shortly.");
    }
    if (pending.size >= 4) throw new Error("Sentence provider is busy; try again shortly.");

    const request = (async () => {
      const url = new URL("https://api.tatoeba.org/v1/sentences");
      url.search = new URLSearchParams({
        lang: "jpn",
        q: query,
        limit: "20",
        sort: "random",
        "trans:lang": "eng",
      }).toString();
      const response = await fetchImpl(url, {
        signal: AbortSignal.timeout(6000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        if (cooldownMs > 0 && (response.status === 429 || response.status >= 500)) {
          cooldownUntil = now() + cooldownMs;
        }
        throw new Error(`Sentence provider returned HTTP ${response.status}`);
      }
      const payload = await response.json();
      if (!Array.isArray(payload.data)) {
        if (cooldownMs > 0) cooldownUntil = now() + cooldownMs;
        throw new Error("Invalid sentence provider response");
      }
      const seen = new Set();
      const items = payload.data.flatMap((sentence) => {
        const translation = sentence.translations?.find(
          (item) => item.lang === "eng" && typeof item.text === "string" && !item.is_unapproved,
        );
        if (
          sentence.lang !== "jpn" ||
          sentence.is_unapproved ||
          typeof sentence.text !== "string" ||
          !sentence.text.includes(query) ||
          !translation ||
          !Number.isInteger(sentence.id) ||
          seen.has(sentence.text)
        )
          return [];
        seen.add(sentence.text);
        return [
          {
            id: sentence.id,
            japanese: sentence.text,
            english: translation.text,
            owner: sentence.owner,
            translationOwner: translation.owner,
            translationId: translation.id,
            translationLicense: translation.license,
            license: sentence.license,
            source: "Tatoeba",
          },
        ];
      });
      if (memoryCache.size >= 200) memoryCache.delete(memoryCache.keys().next().value);
      memoryCache.set(query, { items, expires: now() + (items.length ? 3600000 : 60000) });
      if (items.length && cache?.set) {
        await cache.set(cacheKey, items, PERSISTENT_SENTENCE_TTL_MS);
      }
      return items;
    })();
    pending.set(query, request);
    try {
      return await request;
    } finally {
      pending.delete(query);
    }
  };
}
