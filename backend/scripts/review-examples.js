import { parseArgs } from "node:util";
import { openEnrichment, reviewGenerated } from "./enrichment-lib.js";

const { values } = parseArgs({ options: {
  db: { type: "string" }, approve: { type: "string", multiple: true },
  reject: { type: "string", multiple: true }, limit: { type: "string", default: "20" }
} });
const limit = Number(values.limit);
if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
if (values.approve?.length && values.reject?.length) throw new Error("Use either --approve or --reject per invocation");
const db = openEnrichment(values.db);
try {
  if (values.approve?.length) reviewGenerated(db, values.approve, "approved");
  if (values.reject?.length) reviewGenerated(db, values.reject, "rejected");
  console.log(JSON.stringify(db.prepare(`SELECT g.id,w.word,w.reading,w.meanings,g.ja,g.en,g.attribution
    FROM enrichment_generated g JOIN words w ON w.id=g.word_id WHERE g.status='pending' ORDER BY g.rowid LIMIT ?`).all(limit), null, 2));
  console.log("Review the Japanese usage AND English translation before --approve ID. Pending/rejected examples are not served or synced.");
} finally { db.close(); }
