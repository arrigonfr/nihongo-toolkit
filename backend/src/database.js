import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

export const databasePath = process.env.DATABASE_PATH
  || fileURLToPath(new URL("../data/nihon.sqlite", import.meta.url));

export function createDatabase(path = databasePath) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(readFileSync(new URL("./schema.sql", import.meta.url), "utf8"));
  return db;
}

export function openDatabase(path = databasePath) {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec("PRAGMA foreign_keys = ON; PRAGMA query_only = ON");
  return db;
}
