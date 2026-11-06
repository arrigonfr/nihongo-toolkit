import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client/web";
import { createDatabase } from "../src/database.js";

const { values } = parseArgs({ options: { turso: { type: "boolean" } } });
if (values.turso) {
  if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
    throw new Error("TURSO_DATABASE_URL and a write-capable TURSO_AUTH_TOKEN are required");
  }
  const client = createClient({
    url: process.env.TURSO_DATABASE_URL, authToken: process.env.TURSO_AUTH_TOKEN
  });
  try {
    await client.executeMultiple(readFileSync(new URL("../src/word-search-index.sql", import.meta.url), "utf8"));
    console.log("Turso spelling/reading indexes are ready.");
  } finally { client.close(); }
} else {
  const db = createDatabase();
  db.close();
  console.log("Local spelling/reading indexes are ready.");
}
