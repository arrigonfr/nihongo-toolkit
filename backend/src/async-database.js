// One adapter per request: concurrent lookups share Turso batch round-trips and
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
      const results = await source.batch(jobs.map(({ sql, args }) => ({ sql, args })), "read");
      if (results.length !== jobs.length) throw new Error("Incomplete Turso batch result");
      results.forEach((result, i) => {
        jobs[i].resolve(result.rows.map((row) => Object.fromEntries(
          result.columns.map((column) => [column, row[column]])
        )));
      });
    } catch (error) { jobs.forEach((job) => job.reject(error)); }
  }
  return {
    async: true,
    remote: Boolean(source.batch),
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

export async function exactWordCandidates(db, candidates, limit = 6) {
  const values = [...new Set(candidates)];
  if (!values.length) return new Map();
  const rows = await db.prepare(`SELECT * FROM (
    SELECT w.*, c.key AS candidate_order,
      row_number() OVER (PARTITION BY c.key ORDER BY w.is_common DESC,
        (w.word = c.value OR w.senses LIKE '%"uk"%') DESC, w.id) AS candidate_rank
    FROM json_each(?) c JOIN words w ON w.word = c.value OR w.reading = c.value
  ) WHERE candidate_rank <= ? ORDER BY candidate_order, candidate_rank`)
    .all(JSON.stringify(values), limit);
  const result = new Map(values.map((value) => [value, []]));
  for (const { candidate_order, candidate_rank, ...row } of rows) result.get(values[candidate_order]).push(row);
  return result;
}
