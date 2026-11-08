import { parseArgs } from "node:util";
import { createClient } from "@libsql/client/web";
import { openJlptDatabase, hash, pendingJlpt, syncJlpt } from "./jlpt-enrichment-lib.js";

const { values } = parseArgs({ options: {
  db: { type: "string" }, apply: { type: "boolean" }, "allow-estimates": { type: "boolean" }, help: { type: "boolean" }
} });
if (values.help) {
  console.log(`Usage: npm run db:sync-jlpt -- [--db PATH] [--apply] [--allow-estimates]
Preview pending JLPT-only changes; --apply writes them to Turso.
TURSO_DATABASE_URL identifies the destination; TURSO_AUTH_TOKEN is required to apply.
--allow-estimates explicitly permits syncing low-confidence estimates and their provenance.
Existing remote ratings are never overwritten. Missing dictionary parents or conflicting levels abort a batch.
Checkpointed transactions can be resumed safely by rerunning the same command.`);
} else {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required, including for a destination-specific preview");
  const parsed = new URL(url);
  if (!["libsql:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Use a libsql:// or https:// Turso URL without embedded credentials or query parameters");
  }
  const destination = hash(parsed.href.replace(/^libsql:/, "https:"));
  const db = openJlptDatabase(values.db, !values.apply);
  let client;
  try {
    const changes = pendingJlpt(db, destination);
    const estimates = changes.filter((change) => JSON.parse(change.assignment).method === "estimate").length;
    console.log(JSON.stringify({ pending: changes.length, dataset: changes.length - estimates, estimates,
      mode: values.apply ? "apply" : "dry-run" }, null, 2));
    if (values.apply) {
      if (!process.env.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN is required to sync");
      client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
      console.log(`Synced ${await syncJlpt(db, client, destination, { allowEstimates: values["allow-estimates"] })} JLPT assignments.`);
    } else console.log("No remote writes. Use --apply to sync; add --allow-estimates if the preview includes estimates.");
  } finally { client?.close(); db.close(); }
}
