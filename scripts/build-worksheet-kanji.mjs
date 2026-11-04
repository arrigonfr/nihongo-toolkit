import { writeFileSync } from "node:fs";
import { openDatabase } from "../backend/src/database.js";

const db = openDatabase();
const levels = Object.fromEntries([1, 2, 3, 4, 5].map((level) => [level,
  db.prepare("SELECT character FROM kanjis WHERE jlpt = ? ORDER BY COALESCE(frequency, 99999), id").all(level).map((row) => row.character).join("")
]));
if (Object.values(levels).some((characters) => !characters.length)) throw new Error("Missing JLPT data");
writeFileSync(new URL("../frontend/src/worksheet-kanji.json", import.meta.url), JSON.stringify(levels) + "\n");
db.close();