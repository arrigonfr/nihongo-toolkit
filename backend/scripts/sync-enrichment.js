import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { createClient } from "@libsql/client/web";
import { openEnrichment, schema, sha256, syncChanges } from "./enrichment-lib.js";

const { values } = parseArgs({ options: { db: { type: "string" }, apply: { type: "boolean" } } });
const db = openEnrichment(values.db);
let client;
try {
  const url = process.env.TURSO_DATABASE_URL;
  const destination = url ? sha256(new URL(url.replace(/^libsql:/, "https:")).origin) : null;
  const last = destination ? db.prepare("SELECT last_seq FROM enrichment_sync WHERE destination=?").get(destination)?.last_seq ?? 0 : 0;
  const count = db.prepare("SELECT count(*) n FROM enrichment_changes WHERE seq>?").get(last).n;
  console.log(`${count} pending inserts. ${values.apply ? "Applying" : "Dry run; pass --apply to write to Turso"}.`);
  if (values.apply) {
    if (!url || !process.env.TURSO_AUTH_TOKEN) throw new Error("TURSO_DATABASE_URL and TURSO_AUTH_TOKEN are required");
    client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
    await client.executeMultiple(readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8") + schema);
    await syncChanges(db, client, destination);
  }
} finally {
  client?.close();
  db.close();
}
