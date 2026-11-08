import { conjugationEntries } from "./conjugator.js";
import { rowsByWordIds } from "./async-database.js";
import { selectedLevels } from "../../frontend/src/jlpt-levels.js";

export async function findPracticeEntries(db, { level = "all" } = {}) {
  const levels = selectedLevels(level).filter(Number.isInteger);
  const rows = levels.length ? await db.prepare(`SELECT w.* FROM words w
    WHERE EXISTS (SELECT 1 FROM vocabulary v WHERE v.word_id = w.id
      AND v.jlpt IN (SELECT value FROM json_each(?)))
    ORDER BY w.id`).all(JSON.stringify(levels)) : [];
  const linked = await rowsByWordIds(db, rows.map((row) => row.id));
  const entries = rows.flatMap((row) => conjugationEntries(row, linked.get(row.id) || []))
    .filter((entry) => levels.includes(entry.level) && entry.meanings.length);
  return {
    entries, source: "JMdict with linked JLPT vocabulary levels"
  };
}
