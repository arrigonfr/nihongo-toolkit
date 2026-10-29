export class BatchQueue {
  constructor(load, { lowWater = 10, batchSize = 40, onError = console.error } = {}) {
    this.load = load;
    this.lowWater = lowWater;
    this.batchSize = batchSize;
    this.onError = onError;
    this.queues = new Map();
  }

  bucket(key) {
    if (!this.queues.has(key)) this.queues.set(key, { items: [], pending: null, recent: [] });
    return this.queues.get(key);
  }

  refill(key, bucket) {
    if (!bucket.pending) {
      const exclude = [...bucket.recent, ...bucket.items.map((item) => String(item.id))].slice(-80);
      bucket.pending = Promise.resolve().then(() => this.load(key, this.batchSize, exclude))
        .then((items) => {
          if (!Array.isArray(items) || !items.length || items.some((item) => item?.id === undefined)) {
            throw new Error("Invalid practice batch");
          }
          const seen = new Set(bucket.items.map((item) => String(item.id)));
          for (const item of items) {
            if (!seen.has(String(item.id))) { bucket.items.push(item); seen.add(String(item.id)); }
          }
        })
        .finally(() => { bucket.pending = null; });
    }
    return bucket.pending;
  }

  async take(key) {
    const bucket = this.bucket(key);
    while (!bucket.items.length) await this.refill(key, bucket);
    const item = bucket.items.shift();
    bucket.recent.push(String(item.id));
    bucket.recent = bucket.recent.slice(-40);
    if (bucket.items.length <= this.lowWater) {
      this.refill(key, bucket).catch((error) => this.onError(error));
    }
    return item;
  }
}
