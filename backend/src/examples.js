export function shuffleExamples(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export async function localExamples(db, { wordId, query, limit = 3, random = false }) {
  const rows = wordId !== undefined
    ? await db.prepare("SELECT examples FROM vocabulary WHERE word_id = ?").all(wordId)
    : await db.prepare(`SELECT examples FROM vocabulary WHERE instr(word, ?) > 0
        OR reading = ? OR romaji = ? OR EXISTS
        (SELECT 1 FROM json_each(other_forms) WHERE value = ?)
        ORDER BY (word = ? OR reading = ?) DESC LIMIT 40`)
      .all(query, query, query, query, query, query);
  const seen = new Set();
  const examples = rows.flatMap((row) => JSON.parse(row.examples)).filter((example) => {
    if (!example.ja || !example.en || seen.has(example.ja)) return false;
    if (query && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(query)
        && !example.ja.includes(query)
        && !(example.furigana || "").replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1").includes(query)) return false;
    seen.add(example.ja);
    return true;
  });
  return (random ? shuffleExamples(examples) : examples).slice(0, limit).map((example) => ({
    id: example.tatoeba_id, japanese: example.ja, furigana: example.furigana || "", english: example.en,
    license: "CC BY 2.0 FR", source: "Tatoeba"
  }));
}

export function createSentenceFallback({ fetchImpl = fetch, enabled = process.env.SENTENCE_API_FALLBACK !== "false" } = {}) {
  const cache = new Map();
  const pending = new Map();
  return async function fallback(query) {
    if (!enabled) return [];
    const cached = cache.get(query);
    if (cached && cached.expires > Date.now()) return cached.items;
    if (pending.has(query)) return pending.get(query);
    if (pending.size >= 4) throw new Error("Sentence provider is busy; try again shortly.");
    const request = (async () => {
      const url = new URL("https://api.tatoeba.org/unstable/sentences");
      url.search = new URLSearchParams({ lang: "jpn", q: query, limit: "20", sort: "random", "trans:lang": "eng" });
      const response = await fetchImpl(url, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`Sentence provider returned HTTP ${response.status}`);
      const payload = await response.json();
      if (!Array.isArray(payload.data)) throw new Error("Invalid sentence provider response");
      const seen = new Set();
      const items = payload.data.flatMap((sentence) => {
        const translation = sentence.translations?.find((item) =>
          item.lang === "eng" && typeof item.text === "string" && !item.is_unapproved);
        if (sentence.lang !== "jpn" || sentence.is_unapproved || typeof sentence.text !== "string"
            || !sentence.text.includes(query) || !translation || !Number.isInteger(sentence.id)
            || seen.has(sentence.text)) return [];
        seen.add(sentence.text);
        return [{
          id: sentence.id, japanese: sentence.text, english: translation.text,
          owner: sentence.owner, translationOwner: translation.owner,
          translationId: translation.id, license: sentence.license, source: "Tatoeba"
        }];
      });
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(query, { items, expires: Date.now() + (items.length ? 3600000 : 60000) });
      return items;
    })();
    pending.set(query, request);
    try { return await request; }
    finally { pending.delete(query); }
  };
}
