export function requireDeck(condition, message) {
  if (!condition) throw new Error(`Invalid preview deck: ${message}`);
}

export function distinct(values) {
  return new Set(values).size === values.length;
}
