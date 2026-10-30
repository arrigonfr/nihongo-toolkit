import { DatabaseSync } from "node:sqlite";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { databasePath } from "../src/database.js";
import { createHash } from "node:crypto";
import { isPracticeKanji } from "../src/practice-kanji.js";

// Include secondary/unique indexes, plus headroom for SQLite/D1 bookkeeping.
const writeCosts = { kanjis: 6, words: 6, kanji_words: 3, vocabulary: 5, strokes: 3,
  metadata: 3, practice_kanjis: 2, vocabulary_words: 5, sentences: 4, word_sentences: 3, seed_runs: 3 };
export const sha256 = (text) => createHash("sha256").update(text).digest("hex");

const tables = [
  ["kanjis", ["id"]],
  ["words", ["id"]],
  ["kanji_words", ["kanji_id", "word_id"]],
  ["vocabulary", ["id"]],
  ["strokes", ["character"]],
  ["metadata", ["key"]],
  ["practice_kanjis", ["kanji_id"]],
  ["vocabulary_words", ["id"]],
  ["sentences", ["id"]],
  ["word_sentences", ["word_id", "sentence_id"]],
  ["seed_runs", ["id"]]
];

export function sqlValue(value) {
  if (value === null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "string" || value.includes("\0")) {
    throw new Error("Cannot export a BLOB, non-finite number, or text containing NUL");
  }
  return `'${value.replaceAll("'", "''")}'`;
}

const identifier = (name) => `"${name.replaceAll('"', '""')}"`;

export async function exportD1(db, directory, { batchSize = 500 } = {}) {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error("Invalid batch size");
  await mkdir(directory, { recursive: false });
  let number = 0;
  const manifest = [];
  for (const [table, keys] of tables) {
    const practice = table === "practice_kanjis";
    const exists = db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ?").get(table);
    if (!exists && !practice) {
      if (tables.findIndex(([name]) => name === table) < 6) throw new Error(`Missing required table ${table}`);
      continue;
    }
    const columns = practice ? ["kanji_id"] : db.prepare(`PRAGMA table_info(${identifier(table)})`).all().map((column) => column.name);
    if (keys.some((key) => !columns.includes(key))) throw new Error(`Missing key column in ${table}`);
    const columnSql = columns.map(identifier).join(", ");
    const insert = `INSERT INTO ${identifier(table)} (${columnSql})`;
    let batch = [];
    let count = 0;
    let bytes = 0;
    async function flush() {
      if (!batch.length) return;
      const file = `${String(++number).padStart(5, "0")}-${table}.sql`;
      const text = `${batch.join("\n")}\n`;
      await writeFile(join(directory, file), text, { flag: "wx" });
      manifest.push({ file, table, rows: batch.length, sha256: sha256(text),
        estimatedWrites: batch.length * writeCosts[table] + 4 });
      batch = [];
      bytes = 0;
    }
    const query = practice ? "SELECT * FROM kanjis ORDER BY id"
      : `SELECT ${columnSql} FROM ${identifier(table)} ORDER BY ${keys.map(identifier).join(", ")}`;
    for (let row of db.prepare(query).iterate()) {
      if (practice) {
        if (!isPracticeKanji(row.character, JSON.parse(row.on_readings), JSON.parse(row.kun_readings), JSON.parse(row.meanings))) continue;
        row = { kanji_id: row.id };
      }
      const values = columns.map((column) => sqlValue(row[column]));
      const where = keys.map((key) => `${identifier(key)} = ${sqlValue(row[key])}`).join(" AND ");
      const statement = `${insert} SELECT ${values.join(", ")} WHERE NOT EXISTS (SELECT 1 FROM ${identifier(table)} WHERE ${where});`;
      if (Buffer.byteLength(statement) > 100000) throw new Error(`Row in ${table} exceeds D1's SQL statement size limit`);
      if (bytes + Buffer.byteLength(statement) > 2 * 1024 * 1024) await flush();
      batch.push(statement);
      bytes += Buffer.byteLength(statement) + 1;
      count++;
      if (batch.length >= batchSize) await flush();
    }
    await flush();
    console.log(`${table}: ${count} rows`);
  }
  await writeFile(join(directory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  await writeFile(join(directory, "snapshot.json"), JSON.stringify({
    id: sha256(JSON.stringify(manifest)), rows: manifest.reduce((sum, item) => sum + item.rows, 0),
    estimatedWrites: manifest.reduce((sum, item) => sum + item.estimatedWrites, 0)
  }, null, 2), { flag: "wx" });
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: {
    db: { type: "string" },
    output: { type: "string" }
  } });
  if (!values.output) throw new Error("Usage: node scripts/export-d1.js --output NEW_DIRECTORY [--db SQLITE_PATH]");
  const db = new DatabaseSync(values.db ?? databasePath, { readOnly: true });
  try {
    db.exec("BEGIN");
    await exportD1(db, resolve(values.output));
    db.exec("COMMIT");
  }
  finally { db.close(); }
}
