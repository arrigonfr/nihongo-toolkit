import { DatabaseSync } from "node:sqlite";
import { databasePath } from "../src/database.js";
import { openTursoDatabase } from "../src/turso.js";
import { items as crossroads } from "./study-decks/crossroads.js";
import { items as train } from "./study-decks/train.js";
import { items as karuta } from "./study-decks/karuta.js";
import { items as particle } from "./study-decks/particle.js";
import { items as counter } from "./study-decks/counter.js";

const decks = { crossroads, train, karuta, particle, counter };
const ddl = "CREATE TABLE IF NOT EXISTS study_decks (deck_key TEXT PRIMARY KEY, items TEXT NOT NULL)";
const upsert = "INSERT INTO study_decks(deck_key, items) VALUES (?, ?) ON CONFLICT(deck_key) DO UPDATE SET items = excluded.items";
const writes = Object.entries(decks).map(([key, items]) => ({ sql: upsert, args: [key, JSON.stringify(items)] }));

export function seedStudyDecks(db) {
  db.exec("BEGIN");
  try {
    db.exec(ddl);
    const insert = db.prepare(upsert);
    for (const { args } of writes) insert.run(...args);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === "--turso") {
    const db = openTursoDatabase(process.env);
    try { await db.batch([{ sql: ddl, args: [] }, ...writes], "write"); }
    finally { db.close(); }
  } else if (!args.length) {
    const db = new DatabaseSync(databasePath);
    try { seedStudyDecks(db); } finally { db.close(); }
  } else {
    throw new Error("Usage: seed-study-decks.js [--turso]");
  }
  console.log("Seeded study decks:", Object.keys(decks).join(", "));
}
