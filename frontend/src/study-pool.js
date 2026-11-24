async function loadItems(key) {
  const { fetchItems } = await import("./api.js");
  return fetchItems(`/api/study/deck/${key}`, {});
}

export function studyPool(key, validate) {
  return {
    items: [],
    async prepare(load = loadItems) {
      const items = await load(key);
      if (validate) items.forEach(validate);
      this.items = items;
    }
  };
}
