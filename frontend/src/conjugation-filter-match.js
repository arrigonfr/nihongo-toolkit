export const FILTER_VALUES = {
  politeness: ["plain", "polite"],
  polarity: ["affirmative", "negative"],
  tense: ["non-past", "past"]
};

// A filter is "both" (everything) or a comma list of allowed values, e.g. "plain,polite".
export function filterValues(field, setting) {
  const all = FILTER_VALUES[field];
  if (!setting || setting === "both") return all;
  return String(setting).split(",").filter((value) => all.includes(value));
}

export function validFilter(field, setting) {
  if (setting === "both") return true;
  if (typeof setting !== "string") return false;
  const parts = setting.split(",");
  return parts.length > 0 && parts.every((value) => FILTER_VALUES[field].includes(value)) && new Set(parts).size === parts.length;
}

export function matchesFilters(row, settings) {
  return Object.keys(FILTER_VALUES).every((field) => {
    const allowed = filterValues(field, settings[field]);
    return allowed.includes(row[field]) || row[field] === "neutral";
  });
}
