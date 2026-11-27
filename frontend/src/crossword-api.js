import { fetchItems, fetchJSON } from "./api.js";
import { beginLoading } from "./request-loading.js";

export async function loadVocabularyPool(state, level) {
  const cacheKey = `${level}`;
  let existing = state.poolCache.get(cacheKey) || [];
  const recentIds = Array.isArray(state.stats.recentWordIds) ? state.stats.recentWordIds : [];

  // A single larger startup batch keeps the notebook enrichment on demand.
  const rounds = 1;
  for (let round = 0; round < rounds; round++) {
    const exclude = [...new Set([...recentIds.slice(-60), ...existing.slice(-50).map((item) => item.id)])]
      .filter((id) => typeof id === "string" && id.length <= 28)
      .slice(0, 95);
    try {
      const batch = await fetchItems("/api/words/batch", {
        level,
        limit: existing.length < 100 ? 200 : 100,
        projection: "practice",
        expand: 1,
        ...(exclude.length ? { exclude } : {})
      });
      const seen = new Set(existing.map((i) => i.id));
      const freshItems = [];
      for (const item of batch) {
        if (!seen.has(item.id)) {
          seen.add(item.id);
          freshItems.push(item);
          for (const kd of item.kanjiDetails || []) {
            if (kd?.kanji) state.kanjiCache.set(kd.kanji, kd);
          }
        }
      }
      // Prepend fresh items and cap total in-memory cache at 450 so new words rotate in continuously
      existing = [...freshItems, ...existing].slice(0, 450);
      if (batch.length < 60) break;
    } catch (err) {
      if (!existing.length) throw err;
      break;
    }
  }

  state.poolCache.set(cacheKey, existing);
  return existing;
}

export async function ensureKanjiDetail(state, char) {
  if (state.kanjiCache.has(char)) return state.kanjiCache.get(char);
  const doneLoading = beginLoading([], document.getElementById("studyInspector"));
  try {
    const data = await fetchJSON(`/api/kanji/${encodeURIComponent(char)}`);
    state.kanjiCache.set(char, data);
    return data;
  } catch {}
  finally { await doneLoading(); }
  return null;
}
