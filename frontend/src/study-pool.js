// @ts-check

/** @param {string} key */
async function loadItems(key) {
  const { fetchItems } = await import("./api.js");
  return fetchItems(`/api/study/deck/${key}`, {});
}

/**
 * @template T
 * @param {string} key
 * @param {(item: T) => void} [validate]
 */
export function studyPool(key, validate) {
  return {
    /** @type {T[]} */
    items: [],
    /** @param {(key: string) => Promise<T[]>} [load] */
    async prepare(load = loadItems) {
      const items = await load(key);
      if (validate) items.forEach(validate);
      this.items = items;
    },
  };
}
