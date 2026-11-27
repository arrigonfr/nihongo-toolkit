// @ts-check

/**
 * @template {{ id: string | number }} T
 */
export class BatchQueue {
  /**
   * @param {(key: string, batchSize: number, exclude: string[]) => Promise<T[]>} load
   * @param {{ lowWater?: number, batchSize?: number, onError?: (error: unknown) => void }} [options]
   */
  constructor(load, { lowWater = 10, batchSize = 40, onError = console.error } = {}) {
    this.load = load;
    this.lowWater = lowWater;
    this.batchSize = batchSize;
    this.onError = onError;
    /** @type {Map<string, { items: T[], pending: Promise<void> | null, recent: string[] }>} */
    this.queues = new Map();
  }

  /** @param {string} key */
  bucket(key) {
    let entry = this.queues.get(key);
    if (!entry) {
      entry = { items: [], pending: null, recent: [] };
      this.queues.set(key, entry);
    }
    return entry;
  }

  /**
   * @param {string} key
   * @param {{ items: T[], pending: Promise<void> | null, recent: string[] }} bucket
   */
  refill(key, bucket) {
    if (!bucket.pending) {
      const exclude = [...bucket.recent, ...bucket.items.map((item) => String(item.id))].slice(-80);
      bucket.pending = Promise.resolve()
        .then(() => this.load(key, this.batchSize, exclude))
        .then((items) => {
          if (!Array.isArray(items) || !items.length || items.some((item) => item?.id === undefined)) {
            throw new Error("Invalid practice batch");
          }
          const seen = new Set(bucket.items.map((item) => String(item.id)));
          for (const item of items) {
            if (!seen.has(String(item.id))) {
              bucket.items.push(item);
              seen.add(String(item.id));
            }
          }
        })
        .finally(() => {
          bucket.pending = null;
        });
    }
    return bucket.pending;
  }

  /** @param {string} key @returns {Promise<T>} */
  async take(key) {
    const bucket = this.bucket(key);
    while (!bucket.items.length) await this.refill(key, bucket);
    const item = /** @type {T} */ (bucket.items.shift());
    bucket.recent.push(String(item.id));
    bucket.recent = bucket.recent.slice(-40);
    if (bucket.items.length <= this.lowWater) {
      this.refill(key, bucket).catch((error) => this.onError(error));
    }
    return item;
  }
}
