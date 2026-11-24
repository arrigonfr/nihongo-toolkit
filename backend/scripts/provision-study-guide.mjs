import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { collect } from "./preview-guide-inventory.mjs";
import { normalize } from "../../frontend/src/preview-guide/classification.js";

// Only publish the editorial projection; inventory evidence stays offline.
export function provision(db, { cards, dictionary, contrasts, manifest }) {
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS study_guide_cards(id TEXT PRIMARY KEY, entry TEXT, search TEXT, data TEXT);
      CREATE TABLE IF NOT EXISTS study_guide_entries(entry TEXT PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS study_guide_info(id INTEGER PRIMARY KEY, data TEXT);
      CREATE TABLE IF NOT EXISTS study_guide_pairs(a TEXT,b TEXT,note TEXT,PRIMARY KEY(a,b));
      DELETE FROM study_guide_cards; DELETE FROM study_guide_entries;
      DELETE FROM study_guide_pairs; DELETE FROM study_guide_info;`);
    const card = db.prepare("INSERT INTO study_guide_cards VALUES(?,?,?,?)");
    for (const c of cards) card.run(c.id,c.entry,[c.form,c.reading,...c.aliases,c.scene,c.meaning,c.translation].map(normalize).join(" "),JSON.stringify(c));
    const entry = db.prepare("INSERT INTO study_guide_entries VALUES(?,?)");
    for (const e of dictionary) entry.run(e.entry,JSON.stringify(e));
    const pair = db.prepare("INSERT INTO study_guide_pairs VALUES(?,?,?)");
    for (const n of contrasts) pair.run(...n.ids,n.note);
    const values = key => [...new Set(cards.map(c => c[key]))];
    db.prepare("INSERT INTO study_guide_info VALUES(1,?)").run(JSON.stringify({manifest,scene:values("scene"),register:values("register")}));
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const db = new DatabaseSync(process.argv[2] || "backend/data/nihon.sqlite");
  try { provision(db,collect(db).catalog); } finally { db.close(); }
}
