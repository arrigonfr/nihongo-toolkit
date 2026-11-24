export const draft = {
  source: "NihongoToolkit original preview content",
  license: "CC BY 4.0",
  reviewStatus: "Pending proficient Japanese review",
  contentVersion: "draft-1"
};

export function requireDeck(condition, message) {
  if (!condition) throw new Error(`Invalid preview deck: ${message}`);
}

export function distinct(values) {
  return new Set(values).size === values.length;
}
