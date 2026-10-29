import { statSync } from "node:fs";
import { openDatabase, databasePath } from "../src/database.js";
const db = openDatabase();
try {
  for (const table of ["kanjis", "words", "kanji_words", "vocabulary", "strokes"]) {
    const { count } = db.prepare(`SELECT count(*) AS count FROM ${table}`).get();
    if (!count) throw new Error(`${table} is empty. Run npm run db:import before deployment.`);
    console.log(`${table}: ${count}`);
  }
  for (let level = 1; level <= 5; level++) {
    if (!db.prepare("SELECT 1 FROM vocabulary WHERE jlpt = ? LIMIT 1").get(level)) {
      throw new Error(`No N${level} vocabulary imported.`);
    }
  }
  if (db.prepare("PRAGMA quick_check").get().quick_check !== "ok"
      || db.prepare("PRAGMA foreign_key_check").all().length) {
    throw new Error("Database integrity check failed");
  }
  const size = statSync(databasePath).size / 1024 / 1024;
  if (size > 220) throw new Error(`Database is ${size.toFixed(1)} MiB; exceeds bundle safety budget.`);
  console.log(`Read-only deployment database ready (${size.toFixed(1)} MiB).`);
} finally { db.close(); }
