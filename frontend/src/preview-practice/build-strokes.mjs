// Rebuild after running scripts/build-worksheet-strokes.mjs. Never write to public/.
import { readFileSync, writeFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { kanjiVgRevision } from "../../../backend/scripts/sources.js";
import { openDatabase } from "../../../backend/src/database.js";

const local = path => new URL(path,import.meta.url);
const source = JSON.parse(readFileSync(local("../worksheet-strokes.json")));
const levels = JSON.parse(readFileSync(local("../worksheet-kanji.json")));
const entries = Object.entries(source).filter(([c])=>/^\p{Script=Han}$/u.test(c) && /^\p{Ideographic}$/u.test(c));
const db = openDatabase();
const byGrade = new Map(db.prepare("SELECT character, grade FROM kanjis WHERE grade BETWEEN 1 AND 6").all().map(r=>[r.character,r.grade]));
db.close();
if (!byGrade.size) throw new Error("Import KANJIDIC2 school grades before building the preview.");
const blocks = [], sizes = [], ratings = [], grades=[];
for (const [c,[paths,labels]] of entries) {
  if (!paths.length || paths.length !== labels.length || labels.some((p,i)=>p[2] !== i+1) || paths.some(p=>!/^M/i.test(p))) {
    throw new Error(`Malformed stroke model: ${c}`);
  }
  const block = deflateRawSync(JSON.stringify([paths,labels]),{level:9});
  blocks.push(block); sizes.push(block.length);
  ratings.push(Object.keys(levels).find(k=>levels[k].includes(c)) || "0");
  grades.push(byGrade.get(c) || "0");
}
const manifest = { revision:kanjiVgRevision, characters:entries.map(([c])=>c).join(""), levels:ratings.join(""), grades:grades.join(""), sizes };
writeFileSync(local("stroke-index.json"),JSON.stringify(manifest));
writeFileSync(local("stroke-models.bin"),Buffer.concat(blocks));
console.log(`${entries.length} kanji indexed; excluded ${Object.keys(source).length-entries.length} non-kanji diagrams.`);
