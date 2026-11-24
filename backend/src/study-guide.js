import { asyncDatabase } from "./async-database.js";

const pageSize = 8;
export async function studyGuide(source, url) {
  const db = asyncDatabase(source), p = url.searchParams;
  const val = key => (p.get(key) || "").slice(0,160);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(val("page"))) || 1));
  const info = await db.prepare("SELECT data FROM study_guide_info WHERE id=1").get();
  if (!info) throw Error("Guide edition unavailable.");
  const result = {...JSON.parse(info.data), cards:[], dictionary:[], contrasts:[], choices:[], page, more:false};
  if (p.has("collection") && val("collection") !== "draft") return {items:[result]};
  const where = ["json_extract(data,'$.status')='draft'"], args = [];
  const detail = ["sense","entry","compare"].some(k => p.has(k));
  if (p.has("sense")) {
    where.push("id=?"); args.push(val("sense"));
    result.choices = await db.prepare(`SELECT id,json_extract(data,'$.form') AS form,json_extract(data,'$.scene') AS scene
      FROM study_guide_cards WHERE id<>? AND json_extract(data,'$.status')='draft' ORDER BY rowid LIMIT 32`).all(val("sense"));
  } else if (p.has("compare")) {
    const ids = val("compare").split(",");
    where.push("id IN (?,?)"); args.push(ids[0],ids.length === 2 ? ids[1] : "");
  } else if (p.has("entry")) {
    where.push("entry=?"); args.push(val("entry"));
    const row = await db.prepare("SELECT data FROM study_guide_entries WHERE entry=?").get(val("entry"));
    if (row) result.dictionary.push(JSON.parse(row.data));
  } else {
    const q = val("q").normalize("NFKC").trim().toLowerCase().replace(/[ァ-ヶ]/g,c => String.fromCharCode(c.charCodeAt(0)-96));
    for (const term of q.split(/\s+/).filter(Boolean)) { where.push("instr(search,?)>0"); args.push(term); }
    for (const key of ["scene","type","register"]) if (val(key)) {
      where.push(`json_extract(data,'$.${key}')=?`); args.push(val(key));
    }
    if (val("frequency")) { where.push("CASE json_extract(data,'$.common') WHEN 1 THEN 'marked' ELSE 'unmarked' END=?"); args.push(val("frequency")); }
  }
  const limit = detail ? 32 : pageSize;
  const rows = await db.prepare(`SELECT data FROM study_guide_cards WHERE ${where.join(" AND ")} ORDER BY rowid LIMIT ? OFFSET ?`)
    .all(...args,limit+1,detail ? 0 : (page-1)*pageSize);
  result.more = !detail && rows.length > limit;
  result.cards = rows.slice(0,limit).map(r => JSON.parse(r.data));
  const ids = result.cards.map(c => c.id);
  if (ids.length > 1) {
    const slots = ids.map(()=>"?").join(",");
    const n = await db.prepare(`SELECT a,b,note FROM study_guide_pairs WHERE a IN (${slots}) AND b IN (${slots}) ORDER BY rowid LIMIT 1`).get(...ids,...ids);
    if (n) result.contrasts.push({ids:[n.a,n.b],note:n.note});
  }
  return {items:[result]};
}
