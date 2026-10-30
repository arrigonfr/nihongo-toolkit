import { readFile } from "node:fs/promises";
import { resolve, join, basename, dirname } from "node:path";
import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { sha256, sqlValue } from "./export-d1.js";
import { parseWranglerResult } from "./wrangler-result.js";

const { values } = parseArgs({ options: {
  input: { type: "string" }, remote: { type: "boolean", default: false },
  budget: { type: "string", default: "90000" }, "persist-to": { type: "string" }
} });
if (!values.input) throw new Error("Usage: npm run db:import-d1 -- --input EXPORT_DIRECTORY [--remote] [--budget 90000]");
const budget = Number(values.budget);
if (!Number.isSafeInteger(budget) || budget < 1) throw new Error("Budget must be a positive integer");
if (values.remote && values["persist-to"]) throw new Error("--persist-to is local-only");
const directory = resolve(values.input);
const manifest = JSON.parse(await readFile(join(directory, "manifest.json"), "utf8"));
const snapshot = JSON.parse(await readFile(join(directory, "snapshot.json"), "utf8"));
if (sha256(JSON.stringify(manifest)) !== snapshot.id) throw new Error("Export manifest was changed");
for (const item of manifest) {
  if (basename(item.file) !== item.file || !Number.isSafeInteger(item.estimatedWrites) || item.estimatedWrites < 1
      || sha256(await readFile(join(directory, item.file))) !== item.sha256) throw new Error(`Invalid export chunk: ${item.file}`);
}
const require = createRequire(import.meta.url);
const wrangler = join(dirname(require.resolve("wrangler/package.json")), "bin/wrangler.js");
function execute(args) {
  const output = execFileSync(process.execPath, [wrangler, "d1", "execute", "DB",
    values.remote ? "--remote" : "--local", "--yes", "--json",
    ...(values["persist-to"] ? ["--persist-to", resolve(values["persist-to"])] : []), ...args],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  return parseWranglerResult(output);
}
const query = (sql) => execute(["--command", sql]);
const existing = query("SELECT snapshot FROM migration_snapshot WHERE singleton = 1")[0];
if (existing && existing.snapshot !== snapshot.id) {
  throw new Error("This D1 belongs to a different export. Use a NEW D1 database; numeric IDs are snapshot-specific.");
}
if (!existing) {
  const tables = ["kanjis", "words", "kanji_words", "vocabulary", "strokes", "metadata", "practice_kanjis",
    "vocabulary_words", "sentences", "word_sentences", "seed_runs", "migration_chunks"];
  const populated = query(`SELECT ${tables.map((table) => `EXISTS(SELECT 1 FROM ${table})`).join(" OR ")} AS populated`)[0];
  if (populated.populated) throw new Error("Refusing to mix an untracked populated D1 with this snapshot. Use a new database.");
  query(`INSERT INTO migration_snapshot SELECT 1, ${sqlValue(snapshot.id)} WHERE NOT EXISTS (SELECT 1 FROM migration_snapshot WHERE singleton = 1)`);
}
// Read back after the conditional write. Concurrent importers must not mix snapshots.
if (query("SELECT snapshot FROM migration_snapshot WHERE singleton = 1")[0]?.snapshot !== snapshot.id) {
  throw new Error("Another import claimed this database");
}
const done = new Map(query("SELECT * FROM migration_chunks").map((row) => [row.file, row]));
let today = new Date().toISOString().slice(0, 10);
let spent = [...done.values()].filter((row) => row.completed_on === today).reduce((sum, row) => sum + row.estimated_writes, 0);
for (const item of manifest) {
  const day = new Date().toISOString().slice(0, 10);
  if (day !== today) {
    today = day;
    spent = [...done.values()].filter((row) => row.completed_on === today).reduce((sum, row) => sum + row.estimated_writes, 0);
  }
  if (done.has(item.file)) {
    if (done.get(item.file).sha256 !== item.sha256) throw new Error(`Completed chunk differs: ${item.file}`);
    continue;
  }
  if (spent + item.estimatedWrites > budget) {
    console.log(`Stopped before ${item.file}: daily budget ${budget}, reserved ${spent}. Resume with the SAME export after UTC midnight.`);
    process.exitCode = 2;
    break;
  }
  console.log(`Importing ${item.file} (${item.rows} rows; estimated writes ${item.estimatedWrites})`);
  execute(["--file", join(directory, item.file)]);
  query(`INSERT INTO migration_chunks SELECT ${sqlValue(item.file)}, ${sqlValue(item.sha256)}, ${item.estimatedWrites}, ${sqlValue(today)}
    WHERE NOT EXISTS (SELECT 1 FROM migration_chunks WHERE file = ${sqlValue(item.file)})`);
  spent += item.estimatedWrites;
  done.set(item.file, { sha256: item.sha256, completed_on: today, estimated_writes: item.estimatedWrites });
}
if (!process.exitCode) {
  const violations = query("PRAGMA foreign_key_check");
  if (violations.length) throw new Error(`Foreign key violations: ${JSON.stringify(violations.slice(0, 10))}`);
  for (const table of new Set(manifest.map((item) => item.table))) {
    const expected = manifest.filter((item) => item.table === table).reduce((sum, item) => sum + item.rows, 0);
    const actual = query(`SELECT count(*) AS n FROM "${table}"`)[0].n;
    if (actual !== expected) throw new Error(`Count mismatch in ${table}: expected ${expected}, got ${actual}`);
  }
  console.log("Import complete. Counts and foreign keys verified. Re-running this same export skips completed chunks.");
}
