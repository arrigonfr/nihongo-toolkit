import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadAllWorksheetStrokes } from "../../frontend/src/worksheet-strokes-node.js";

const worksheet = name => JSON.parse(readFileSync(new URL(`../../frontend/src/worksheet-${name}.json`, import.meta.url)));

export function provision(db) {
  const diagrams = loadAllWorksheetStrokes(), levels = Object.entries(worksheet("kanji"));
  const grades = new Map(db.prepare("SELECT character, grade FROM kanjis WHERE grade BETWEEN 1 AND 6").all().map(r => [r.character,r.grade]));
  if (!grades.size) throw Error("Import KANJIDIC2 school grades before provisioning drawing practice.");
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(`CREATE TABLE IF NOT EXISTS study_drawing(character TEXT PRIMARY KEY, level TEXT NOT NULL, grade TEXT NOT NULL, model TEXT NOT NULL);
      DELETE FROM study_drawing`);
    const insert = db.prepare("INSERT INTO study_drawing VALUES(?,?,?,?)");
    for (const [c,[paths,labels]] of Object.entries(diagrams)) {
      if (!/^\p{Script=Han}$/u.test(c) || !/^\p{Ideographic}$/u.test(c)) continue;
      if (!paths.length || paths.length !== labels.length || labels.some((p,i)=>p[2] !== i+1) || paths.some(p=>!/^M/i.test(p))) throw Error(`Malformed stroke model: ${c}`);
      insert.run(c, levels.find(([,chars])=>chars.includes(c))?.[0] || "0", String(grades.get(c) || 0), JSON.stringify([paths,labels]));
    }
    db.exec("COMMIT");
  } catch (error) { db.exec("ROLLBACK"); throw error; }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const db = new DatabaseSync(process.argv[2] || "backend/data/nihon.sqlite");
  try { provision(db); } finally { db.close(); }
}
