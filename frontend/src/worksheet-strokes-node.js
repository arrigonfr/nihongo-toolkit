// @ts-check
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const strokesDir = fileURLToPath(new URL("./worksheet-strokes", import.meta.url));

/** @returns {Record<string, [string[], Array<[number, number, number]>]>} */
export function loadAllWorksheetStrokes() {
  /** @type {Record<string, [string[], Array<[number, number, number]>]>} */
  const merged = {};
  for (const file of readdirSync(strokesDir)
    .filter((name) => name.endsWith(".json"))
    .sort()) {
    Object.assign(merged, JSON.parse(readFileSync(join(strokesDir, file), "utf8")));
  }
  return merged;
}
