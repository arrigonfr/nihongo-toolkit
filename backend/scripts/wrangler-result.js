import { stripVTControlCharacters } from "node:util";

export function parseWranglerResult(output) {
  // Remote file imports print spinner progress even when --json is enabled.
  const text = stripVTControlCharacters(output).trim();
  let result;
  for (let start = text.indexOf("["); start !== -1; start = text.indexOf("[", start + 1)) {
    try {
      result = JSON.parse(text.slice(start));
      break;
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
    }
  }
  if (!Array.isArray(result) || !result.length || result.some((item) =>
    !item || typeof item.success !== "boolean" || !Array.isArray(item.results))) {
    throw new Error("Wrangler did not return a valid D1 JSON result. No import checkpoint was recorded; retry the same export.");
  }
  if (result.some((item) => !item.success)) {
    throw new Error("D1 execution failed. No import checkpoint was recorded; retry the same export.");
  }
  return result.flatMap((item) => item.results);
}
