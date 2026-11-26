export function selectedLevels(value) {
  if (value === "all" || value === "Random") return [5, 4, 3, 2, 1, "unrated"];
  if (value === "none") return [];
  if (typeof value !== "string") throw new Error("Choose JLPT levels.");
  if (/^N?[1-5][-–]N?[1-5]$/i.test(value)) {
    const [a, b] = value.match(/[1-5]/g).map(Number);
    return [5, 4, 3, 2, 1].filter((n) => n >= Math.min(a, b) && n <= Math.max(a, b));
  }
  if (!/^(?:N?[1-5]|unrated)(?:,(?:N?[1-5]|unrated))*$/i.test(value)) throw new Error("Choose JLPT levels.");
  return [...new Set(value.split(",").map((n) => n.toLowerCase() === "unrated" ? "unrated" : Number(n.replace(/^N/i, ""))))];
}

export function matchesLevel(level, selection) {
  return selectedLevels(selection).includes(level == null ? "unrated" : Number(level));
}
