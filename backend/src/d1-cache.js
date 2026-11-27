// @ts-check

/**
 * @typedef {{
 *   prepare(sql: string): {
 *     bind(...args: unknown[]): {
 *       first(): Promise<Record<string, unknown> | null>;
 *       run(): Promise<unknown>;
 *     };
 *   };
 * }} D1LikeDatabase
 */

/**
 * @param {D1LikeDatabase | null | undefined} db
 * @param {{ waitUntil?: ((promise: Promise<unknown>) => boolean | void), now?: () => number }} [options]
 */
export function createD1Cache(db, { waitUntil, now = Date.now } = {}) {
  if (!db?.prepare) return null;
  return {
    /** @param {string} key */
    async get(key) {
      try {
        const row = await db.prepare("SELECT value, expires_at FROM api_cache WHERE cache_key = ?").bind(key).first();
        if (!row || Number(row.expires_at) <= now()) return null;
        return JSON.parse(String(row.value));
      } catch {
        return null;
      }
    },
    /**
     * @param {string} key
     * @param {unknown} value
     * @param {number} ttlMs
     */
    async set(key, value, ttlMs) {
      const expiresAt = now() + ttlMs;
      try {
        const serialized = JSON.stringify(value);
        const write = db
          .prepare("INSERT OR REPLACE INTO api_cache (cache_key, value, expires_at) VALUES (?, ?, ?)")
          .bind(key, serialized, expiresAt)
          .run()
          .catch(() => {});
        if (waitUntil) {
          if (waitUntil(write) === false) await write;
        } else {
          await write;
        }
      } catch {
        // Ignore missing table or transient D1 errors
      }
    },
    async prune() {
      try {
        await db.prepare("DELETE FROM api_cache WHERE expires_at <= ?").bind(now()).run();
      } catch {
        // Ignore missing table or transient D1 errors during scheduled cleanup
      }
    },
  };
}
