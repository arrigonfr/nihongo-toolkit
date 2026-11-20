export function catalogueGroupLabel(field, key, radicals = []) {
  if (field === "jlpt") return key === Infinity ? "No JLPT estimate" : `N${key}`;
  if (field === "radical") return key === Infinity ? "No dictionary radical" : `${key}. ${radicals[key - 1]}`;
  return `${key} ${key === 1 ? "stroke" : "strokes"}`;
}

export function compareCatalogueGroups(field, a, b) {
  return field === "jlpt" && Number.isFinite(a) && Number.isFinite(b) ? b - a : a - b;
}
