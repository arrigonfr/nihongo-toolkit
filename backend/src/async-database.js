// One adapter per request: concurrent lookups share D1 batch round-trips and
// identical lookups share their promise. SQLite continues to execute locally.
export function asyncDatabase(source) {
  if (source.async) return source;
  const cache = new Map();
  let pending = [];
  function query(sql, args) {
    const key = JSON.stringify([sql, args]);
    if (cache.has(key)) return cache.get(key);
    const promise = source.batch
      ? new Promise((resolve, reject) => {
        pending.push({ sql, args, resolve, reject });
        if (pending.length === 1) queueMicrotask(flush);
      })
      : Promise.resolve().then(() => source.prepare(sql).all(...args));
    cache.set(key, promise);
    return promise;
  }
  async function flush() {
    const jobs = pending;
    pending = [];
    try {
      const results = await source.batch(jobs.map(({ sql, args }) => source.prepare(sql).bind(...args)));
      results.forEach((result, i) => {
        if (!result.success) jobs[i].reject(new Error(result.error || "D1 query failed"));
        else jobs[i].resolve(result.results);
      });
    } catch (error) { jobs.forEach((job) => job.reject(error)); }
  }
  return {
    async: true,
    d1: Boolean(source.batch),
    prepare(sql) {
      return {
        all: (...args) => query(sql, args),
        get: async (...args) => (await query(sql, args))[0]
      };
    }
  };
}

export async function rowsByWordIds(db, ids) {
  const unique = [...new Set(ids)];
  const groups = await Promise.all(Array.from({ length: Math.ceil(unique.length / 90) }, (_, i) => {
    const chunk = unique.slice(i * 90, (i + 1) * 90);
    return db.prepare(`SELECT word_id, word, reading, jlpt FROM vocabulary WHERE word_id IN (${chunk.map(() => "?").join(",")})`).all(...chunk);
  }));
  const result = new Map();
  for (const row of groups.flat()) {
    if (!result.has(row.word_id)) result.set(row.word_id, []);
    result.get(row.word_id).push(row);
  }
  return result;
}
