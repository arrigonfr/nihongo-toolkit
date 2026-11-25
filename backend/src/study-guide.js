import { asyncDatabase } from "./async-database.js";

const defaultPageSize = 24;
export async function studyGuide(source, url) {
  const db = asyncDatabase(source), p = url.searchParams;
  const val = key => (p.get(key) || "").slice(0, 160);
  const page = Math.max(1, Math.min(10000, Math.floor(Number(val("page"))) || 1));
  const pageSize = Math.max(1, Math.min(50, Math.floor(Number(val("limit"))) || defaultPageSize));
  const info = await db.prepare("SELECT data FROM study_guide_info WHERE id=1").get();
  if (!info) throw Error("Guide edition unavailable.");
  const result = {
    ...JSON.parse(info.data),
    cards: [],
    dictionary: [],
    contrasts: [],
    choices: [],
    page,
    pageSize,
    total: 0,
    more: false
  };
  const collection = val("collection") || "all";
  if (collection === "approved") return { items: [result] };

  const detail = ["sense", "entry", "compare"].some(k => p.has(k));
  const qNorm = !detail
    ? val("q").normalize("NFKC").trim().toLowerCase()
        .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96))
        .replace(/[āīūēō]/g, c => ({ ā: "aa", ī: "ii", ū: "uu", ē: "ee", ō: "oo" })[c])
    : "";
  const qTerms = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];
  const active = {
    collection,
    scene: !detail ? val("scene") : "",
    type: !detail ? val("type") : "",
    register: !detail ? val("register") : "",
    usage: !detail ? val("usage") : "",
    frequency: !detail ? val("frequency") : ""
  };

  function buildFilter(exclude = "") {
    const w = [], a = [];
    const col = exclude === "collection" ? "all" : active.collection;
    if (col === "draft") w.push("status='draft'");
    else if (col === "examples") w.push("status IN ('draft','dictionary') AND has_example=1");
    else w.push("status IN ('draft','dictionary')");

    for (const term of qTerms) { w.push("instr(search,?)>0"); a.push(term); }
    if (exclude !== "scene" && active.scene) { w.push("scene=?"); a.push(active.scene); }
    if (exclude !== "type" && active.type) { w.push("type=?"); a.push(active.type); }
    if (exclude !== "register" && active.register) { w.push("register=?"); a.push(active.register); }
    if (exclude !== "usage" && active.usage) { w.push("instr(usage,?)>0"); a.push(`,${active.usage},`); }
    if (exclude !== "frequency") {
      if (active.frequency === "marked") w.push("common=1");
      else if (active.frequency === "unmarked") w.push("common=0");
    }
    return { clause: w.join(" AND "), args: a };
  }

  let where, args;
  if (detail) {
    const base = buildFilter();
    where = [base.clause]; args = [...base.args];
    if (p.has("sense")) {
      const senseId = val("sense");
      where.push("id=?"); args.push(senseId);
      const target = await db.prepare("SELECT scene FROM study_guide_cards WHERE id=?").get(senseId);
      const targetScene = target?.scene || "";
      result.choices = await db.prepare(`
        SELECT id, json_extract(data,'$.form') AS form, scene
        FROM study_guide_cards
        WHERE id<>? AND status IN ('draft','dictionary')
        ORDER BY
          CASE WHEN ?<>'' AND scene=? THEN 0 WHEN status='draft' THEN 1 ELSE 2 END,
          sort_order
        LIMIT 60
      `).all(senseId, targetScene, targetScene);
    } else if (p.has("compare")) {
      const ids = val("compare").split(",");
      where.push("id IN (?,?)"); args.push(ids[0], ids.length === 2 ? ids[1] : "");
    } else if (p.has("entry")) {
      where.push("entry=?"); args.push(val("entry"));
      const row = await db.prepare("SELECT data FROM study_guide_entries WHERE entry=?").get(val("entry"));
      if (row) result.dictionary.push(JSON.parse(row.data));
    }
  } else {
    const f = buildFilter();
    where = [f.clause]; args = f.args;
  }

  const clause = where.join(" AND ");
  const limit = detail ? 32 : pageSize;
  const rows = await db.prepare(`SELECT data FROM study_guide_cards WHERE ${clause} ORDER BY sort_order LIMIT ? OFFSET ?`)
    .all(...args, limit + 1, detail ? 0 : (page - 1) * pageSize);
  result.more = !detail && rows.length > limit;
  result.cards = rows.slice(0, limit).map(r => JSON.parse(r.data));
  if (!detail) {
    const countRow = await db.prepare(`SELECT COUNT(*) AS n FROM study_guide_cards WHERE ${clause}`).get(...args);
    result.total = countRow?.n ?? result.cards.length;

    const sf = buildFilter("scene");
    const sceneRows = await db.prepare(`SELECT scene, COUNT(*) AS n FROM study_guide_cards WHERE ${sf.clause} GROUP BY scene`).all(...sf.args);
    const sceneCounts = Object.fromEntries((result.scene || []).map(s => [s, 0]));
    for (const r of sceneRows) if (r.scene) sceneCounts[r.scene] = r.n;
    result.sceneCounts = sceneCounts;

    const uf = buildFilter("usage");
    const uRow = await db.prepare(`
      SELECT
        SUM(CASE WHEN instr(usage,',adv,')>0 THEN 1 ELSE 0 END) AS adv,
        SUM(CASE WHEN instr(usage,',vs,')>0 THEN 1 ELSE 0 END) AS vs,
        SUM(CASE WHEN instr(usage,',adj,')>0 THEN 1 ELSE 0 END) AS adj,
        SUM(CASE WHEN instr(usage,',n,')>0 THEN 1 ELSE 0 END) AS n,
        SUM(CASE WHEN instr(usage,',int,')>0 THEN 1 ELSE 0 END) AS int_c
      FROM study_guide_cards WHERE ${uf.clause}
    `).get(...uf.args);
    result.usageCounts = {
      adv: uRow?.adv || 0,
      vs: uRow?.vs || 0,
      adj: uRow?.adj || 0,
      n: uRow?.n || 0,
      int: uRow?.int_c || 0
    };

    const ff = buildFilter("frequency");
    const fRow = await db.prepare(`
      SELECT
        SUM(CASE WHEN common=1 THEN 1 ELSE 0 END) AS marked,
        SUM(CASE WHEN common=0 THEN 1 ELSE 0 END) AS unmarked
      FROM study_guide_cards WHERE ${ff.clause}
    `).get(...ff.args);
    result.frequencyCounts = {
      marked: fRow?.marked || 0,
      unmarked: fRow?.unmarked || 0
    };

    const cf = buildFilter("collection");
    const cRow = await db.prepare(`
      SELECT
        COUNT(*) AS all_c,
        SUM(CASE WHEN status='draft' THEN 1 ELSE 0 END) AS draft_c,
        SUM(CASE WHEN has_example=1 THEN 1 ELSE 0 END) AS examples_c
      FROM study_guide_cards WHERE ${cf.clause}
    `).get(...cf.args);
    result.counts = {
      all: cRow?.all_c || 0,
      draft: cRow?.draft_c || 0,
      examples: cRow?.examples_c || 0
    };
  } else {
    result.total = result.cards.length;
  }
  const ids = result.cards.map(c => c.id);
  if (ids.length > 1) {
    const slots = ids.map(() => "?").join(",");
    const n = await db.prepare(`SELECT a,b,note FROM study_guide_pairs WHERE a IN (${slots}) AND b IN (${slots}) ORDER BY rowid LIMIT 1`).get(...ids, ...ids);
    if (n) result.contrasts.push({ ids: [n.a, n.b], note: n.note });
  }
  return { items: [result] };
}
