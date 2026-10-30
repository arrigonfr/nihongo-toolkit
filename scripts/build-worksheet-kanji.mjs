import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";

const directory = new URL("../backend/data/d1-export-cloudflare/", import.meta.url);
const schema = readFileSync(new URL("../backend/src/schema.sql", import.meta.url), "utf8");
const db = new DatabaseSync(":memory:");
db.exec(schema);
for (const name of readdirSync(directory).filter((file) => /^\d+-kanjis\.sql$/.test(file)).sort()) {
  db.exec(readFileSync(new URL(name, directory), "utf8"));
}
const levels = Object.fromEntries([1, 2, 3, 4, 5].map((level) => [level,
  db.prepare("SELECT character FROM kanjis WHERE jlpt = ? ORDER BY COALESCE(frequency, 99999), id").all(level).map((row) => row.character).join("")
]));
if (Object.values(levels).some((characters) => !characters.length)) throw new Error("Missing JLPT data");
writeFileSync(new URL("../frontend/src/worksheet-kanji.json", import.meta.url), JSON.stringify(levels) + "\n");
db.close();