import { asyncDatabase } from "./async-database.js";

export async function studyDrawing(source, url) {
  const db = asyncDatabase(source);
  if (!url.searchParams.has("character")) {
    return { items: await db.prepare("SELECT character,level,grade FROM study_drawing ORDER BY rowid").all() };
  }
  const character = url.searchParams.get("character");
  if ([...character].length !== 1) return { items: [] };
  const row = await db.prepare("SELECT model FROM study_drawing WHERE character=?").get(character);
  if (!row) return { items: [] };
  /** @type {any} */
  let meta = null;
  try {
    const info = await db
      .prepare("SELECT meanings, on_readings, kun_readings FROM kanjis WHERE character=?")
      .get(character);
    if (info) {
      const parse = (value) => {
        try {
          const parsed = JSON.parse(value || "[]");
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      };
      meta = {
        meanings: parse(info.meanings),
        on_readings: parse(info.on_readings),
        kun_readings: parse(info.kun_readings),
      };
    }
  } catch {
    /* Minimal test databases may omit full kanji metadata columns. */
  }
  return meta ? { items: [JSON.parse(row.model)], meta } : { items: [JSON.parse(row.model)] };
}
