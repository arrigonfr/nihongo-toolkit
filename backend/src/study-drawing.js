import { asyncDatabase } from "./async-database.js";

export async function studyDrawing(source, url) {
  const db = asyncDatabase(source);
  if (!url.searchParams.has("character")) {
    return {items:await db.prepare("SELECT character,level,grade FROM study_drawing ORDER BY rowid").all()};
  }
  const character = url.searchParams.get("character");
  if ([...character].length !== 1) return {items:[]};
  const row = await db.prepare("SELECT model FROM study_drawing WHERE character=?").get(character);
  return {items:row ? [JSON.parse(row.model)] : []};
}
