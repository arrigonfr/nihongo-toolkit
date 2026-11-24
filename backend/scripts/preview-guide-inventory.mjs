import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { manifest, drafts, contrasts, controls } from "./preview-guide-input.mjs";
import { lookup, normalize } from "../../frontend/src/preview-guide/classification.js";

function canonical(v) {
  if (Array.isArray(v)) return v.map(canonical);
  return v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
}
const hash = v => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");
export const fingerprint = sense => hash(sense).slice(0, 20);
const unique = xs => [...new Set(xs)];
const ensure = (condition, reason) => { if (!condition) throw Error(reason); };
const catalogFile = new URL("../../frontend/src/preview-guide/catalog.json", import.meta.url);
const reportFile = new URL("./preview-guide-coverage.json", import.meta.url);

export function collect(db, notes = drafts, pairs = contrasts, negatives = controls) {
  db.exec("PRAGMA busy_timeout = 5000");
  const metadata = key => JSON.parse(db.prepare("SELECT value FROM metadata WHERE key=?").get(key)?.value ?? "null");
  const release = metadata("revisions")?.dictionaryRelease;
  ensure(release === manifest.dictionary.release && metadata("sources")?.some(s => s.sha256 === manifest.dictionary.sha256),
    "Dictionary not pinned in source manifest; verify provenance and rights before import.");
  ensure([...notes,...negatives].every(n => n.source === "project-original" && n.status === "draft"), "Only original, unreviewed draft inputs accepted.");
  const ids = new Set(notes.map(x => x.id));
  ensure(ids.size === notes.length && notes.every(n => /^[a-z]+(?:-[a-z]+)*$/.test(n.id) &&
    [n.form,n.meaning,n.markup,n.translation,n.scene,n.register].every(s => typeof s === "string" && s.trim()) &&
    ["sound-imitation","non-audible-mimetic"].includes(n.type)), "Invalid or duplicate draft.");
  ensure(pairs.every(p => p.ids.length === 2 && p.ids[0] !== p.ids[1] && p.ids.every(id => ids.has(id)) && p.note), "Broken comparison.");
  const entries = [], evidence = [], cards = [];
  const formQuery = db.prepare("SELECT form FROM word_forms WHERE word_id=? ORDER BY form");
  // Read every sense's misc array, not just a headword or the first meaning. Include
  // authored entry links even when untagged; never infer a negative classification.
  const candidates = db.prepare(`SELECT w.*,
    EXISTS(SELECT 1 FROM word_sentences ws WHERE ws.word_id=w.id) AS linked
    FROM words w WHERE (EXISTS(SELECT 1 FROM json_each(w.senses) s, json_each(s.value,'$.misc') m WHERE m.value='on-mim')
    OR w.jmdict_id IN (SELECT value FROM json_each(?)))
    AND NOT EXISTS(SELECT 1 FROM enrichment_word_sources e WHERE e.word_id=w.id)
    ORDER BY w.jmdict_id`);
  for (const w of candidates.iterate(JSON.stringify(unique([...notes,...negatives].map(n => n.entry))))) {
    const forms = unique(formQuery.all(w.id).map(f => f.form));
    const senses = JSON.parse(w.senses);
    entries.push({ entry: w.jmdict_id, word: w.word, reading: w.reading, forms,
      kana: JSON.parse(w.kana_forms), kanji: JSON.parse(w.kanji_forms),
      common: Boolean(w.is_common), linked: Boolean(w.linked), tagged: senses.some(s => s.misc.includes("on-mim")) });
    for (const sense of senses) {
      const key = fingerprint(sense), tagged = sense.misc.includes("on-mim");
      evidence.push({ entry: w.jmdict_id, fingerprint: key, tagged, sense });
      for (const n of notes.filter(n => n.entry === w.jmdict_id && n.fingerprint === key)) {
        ensure(forms.includes(n.form), `Draft ${n.id}: form is not in the linked entry`);
        ensure(["*", n.form, w.reading].some(f => sense.appliesToKana?.includes(f)), `Draft ${n.id}: incompatible kana restriction`);
        cards.push({ ...n, canonical: w.word, reading: w.reading, common: Boolean(w.is_common),
          aliases: forms.filter(f => f !== n.form && (sense.appliesToKana.includes("*") || sense.appliesToKana.includes(f)) &&
            JSON.parse(w.kana_forms).some(k => k.text === f)) });
      }
    }
  }
  ensure(cards.length === notes.length && notes.every(n => cards.filter(c => c.id === n.id).length === 1),
    `Changed, removed or ambiguous draft evidence: ${notes.filter(n => cards.filter(c => c.id === n.id).length !== 1).map(n => n.id).join(", ")}`);
  ensure(negatives.every(n => n.type === "ordinary" && n.rationale && !ids.has(n.id) &&
    entries.find(e => e.entry === n.entry)?.forms.includes(n.form) &&
    evidence.some(e => e.entry === n.entry && e.fingerprint === n.fingerprint)), "Ordinary candidate lacks local evidence.");
  cards.sort((a,b) => notes.findIndex(n => n.id === a.id) - notes.findIndex(n => n.id === b.id));
  const taggedEntries = entries.filter(e => e.tagged), taggedSenses = evidence.filter(e => e.tagged);
  const forms = unique(taggedEntries.flatMap(e => e.forms));
  const dictionary = entries.filter(e => notes.some(n => n.entry === e.entry)).map(e => ({
    entry: e.entry, form: e.word, reading: e.reading, forms: e.forms,
    senses: evidence.filter(s => s.entry === e.entry).map(s => ({
      fingerprint: s.fingerprint, meanings: s.sense.gloss.filter(g => g.lang === "eng").map(g => g.text),
      appliesToKana: s.sense.appliesToKana, appliesToKanji: s.sense.appliesToKanji, umbrellaTag: s.tagged
    }))
  }));
  const catalog = { manifest, cards, contrasts: pairs, dictionary, controls: negatives };
  const report = {
    manifest, sourcesUsed: 2, dictionaryEntriesWithTag: taggedEntries.length, taggedSenses: taggedSenses.length,
    distinctOriginalFormsOfTaggedEntries: forms.length, distinctNormalizedFormsOfTaggedEntries: unique(forms.map(normalize)).length,
    commonTaggedEntries: taggedEntries.filter(e => e.common).length, taggedEntriesWithSentenceLink: taggedEntries.filter(e => e.linked).length,
    commonTaggedEntriesWithSentenceLink: taggedEntries.filter(e => e.linked && e.common).length,
    editorialDraftSenses: cards.length, editorialMatchedAliasLinks: cards.reduce((n,c) => n+c.aliases.length,0),
    editorialOrdinaryProposals: negatives.length,
    editorialUntaggedGuideSenses: cards.filter(c => !taggedSenses.some(s => s.entry === c.entry && s.fingerprint === c.fingerprint)).length,
    editorialContrastNotes: pairs.length, unresolvedTaggedSenses: taggedSenses.length,
    taggedSensesWithoutReviewedExample: taggedSenses.length, publishedByScene: {}, publishedByType: {},
    publishedSenses: 0, reviewedOrdinary: 0, reviewedAliases: 0, documentedExclusions: 0, newUnlinkedSenses: 0,
    baselineKeysReconciled: 0, baselineRightsBlocked: manifest.acquisition.expected
  };
  return { version: hash({ entries, evidence, catalog }), entries, evidence, catalog, report };
}

export function install(store, batch) {
  store.exec("BEGIN IMMEDIATE");
  try {
    const oldTables = store.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    ensure(oldTables.every(t => t.name.startsWith("guide_")), "Refusing to write into a non-guide database.");
    store.exec(`CREATE TABLE IF NOT EXISTS guide_versions (version TEXT PRIMARY KEY, catalog TEXT NOT NULL, report TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS guide_active (singleton INTEGER PRIMARY KEY CHECK(singleton=1), version TEXT NOT NULL REFERENCES guide_versions);
      CREATE TABLE IF NOT EXISTS guide_entries (version TEXT, entry TEXT, data TEXT NOT NULL, PRIMARY KEY(version,entry));
      CREATE TABLE IF NOT EXISTS guide_forms (version TEXT,key TEXT,form TEXT,entry TEXT,PRIMARY KEY(version,key,form,entry));
      CREATE TABLE IF NOT EXISTS guide_senses (version TEXT,entry TEXT,fingerprint TEXT,tagged INTEGER,data TEXT NOT NULL,PRIMARY KEY(version,entry,fingerprint));`);
    const prev = store.prepare("SELECT version FROM guide_active").get()?.version ?? null;
    if (!store.prepare("SELECT 1 FROM guide_versions WHERE version=?").get(batch.version)) {
      store.prepare("INSERT INTO guide_versions VALUES(?,?,?)").run(batch.version, JSON.stringify(batch.catalog), JSON.stringify(batch.report));
      const addEntry = store.prepare("INSERT INTO guide_entries VALUES(?,?,?)");
      const addForm = store.prepare("INSERT INTO guide_forms VALUES(?,?,?,?)");
      const addSense = store.prepare("INSERT INTO guide_senses VALUES(?,?,?,?,?)");
      for (const e of batch.entries) {
        addEntry.run(batch.version,e.entry,JSON.stringify(e));
        for (const form of e.forms) addForm.run(batch.version,normalize(form),form,e.entry);
      }
      for (const e of batch.evidence) addSense.run(batch.version,e.entry,e.fingerprint,+e.tagged,JSON.stringify(e.sense));
    }
    const delta = (a,b) => store.prepare(`SELECT entry,fingerprint FROM guide_senses WHERE version=?
      EXCEPT SELECT entry,fingerprint FROM guide_senses WHERE version=? ORDER BY entry,fingerprint`).all(a,b);
    const changes = prev ? { removedOrChanged: delta(prev,batch.version), addedOrChanged: delta(batch.version,prev) } : {};
    store.prepare("INSERT OR REPLACE INTO guide_active VALUES(1,?)").run(batch.version);
    store.exec("COMMIT");
    return { active: batch.version, previous: prev, ...changes };
  } catch (e) { store.exec("ROLLBACK"); throw e; }
}

export function activate(store, version) {
  ensure(store.prepare("SELECT 1 FROM guide_versions WHERE version=?").get(version), "No such installed version.");
  store.prepare("UPDATE guide_active SET version=? WHERE singleton=1").run(version);
}

export function lookupInstalled(store, form, options = {}) {
  const row = store.prepare("SELECT version,catalog FROM guide_versions JOIN guide_active USING(version)").get();
  ensure(row,"No active edition installed.");
  const edition = JSON.parse(row.catalog), result = lookup(edition,form,options);
  if (!options.editorial) return result;
  const rows = store.prepare(`SELECT DISTINCT s.entry,s.fingerprint,s.tagged,s.data,e.data AS entry_data
    FROM guide_forms f JOIN guide_entries e USING(version,entry) JOIN guide_senses s USING(version,entry)
    WHERE f.version=? AND f.key=? ORDER BY s.entry,s.fingerprint`).all(row.version,normalize(form));
  for (const s of rows) {
    if (result.matches.some(m => m.entry === s.entry && m.fingerprint === s.fingerprint)) continue;
    const id = `jmdict:${s.entry}:${s.fingerprint}`;
    if (options.sense && options.sense !== id) continue;
    const sense = JSON.parse(s.data), entry = JSON.parse(s.entry_data);
    const spellings = entry.kanji.map(f => normalize(f.text)), originalKana = entry.kana.filter(k =>
      !spellings.includes(normalize(form)) || k.appliesToKanji.includes("*") || k.appliesToKanji.some(f => normalize(f) === normalize(form)));
    const applies = (restriction,value) => restriction.includes("*") || restriction.some(f => normalize(f) === normalize(value));
    if (spellings.includes(normalize(form)) && !applies(sense.appliesToKanji,form)) continue;
    if (!spellings.includes(normalize(form)) && !applies(sense.appliesToKana,form)) continue;
    if (options.reading && !originalKana.some(k => normalize(k.text) === normalize(options.reading) && applies(sense.appliesToKana,k.text))) continue;
    result.matches.push({sense:id,entry:s.entry,fingerprint:s.fingerprint,proposed:"unknown",evidence:s.tagged ? "on-mim" : "untagged",
      sourceVersion:edition.manifest.dictionary.release});
  }
  return result;
}

const json = value => JSON.stringify(value, null, 2) + "\n";
function run() {
  const { values, positionals: [cmd, version] } = parseArgs({ allowPositionals: true,
    options: { source: { type: "string" }, store: { type: "string" }, editorial: { type: "boolean" }, reading: { type: "string" }, sense: { type: "string" } } });
  ensure(["dry-run","import","coverage","export","validate","rollback","lookup"].includes(cmd),
    "Usage: node backend/scripts/preview-guide-inventory.mjs dry-run|coverage|validate|export|import|rollback VERSION|lookup FORM [--source DB] [--store GUIDE_DB] [--editorial] [--reading KANA] [--sense ID]");
  if (["rollback","import","lookup"].includes(cmd)) ensure(values.store, "--store must name a dedicated guide database.");
  if (cmd === "lookup") {
    ensure(version, "lookup needs a form.");
    const store = new DatabaseSync(values.store,{readOnly:true});
    try {
      console.log(json(lookupInstalled(store,version,values)));
    } finally {store.close();}
    return;
  }
  if (cmd === "rollback") {
    const store = new DatabaseSync(values.store);
    try { activate(store,version); console.log(json({active:version})); } finally {store.close();}
    return;
  }
  const db = new DatabaseSync(values.source ?? fileURLToPath(new URL("../data/nihon.sqlite", import.meta.url)), {readOnly:true});
  let batch;
  try { db.exec("BEGIN"); batch = collect(db); } finally {db.close();}
  if (cmd === "import") {
    const store = new DatabaseSync(values.store);
    try { console.log(json(install(store,batch))); } finally {store.close();}
  } else if (cmd === "export" || cmd === "validate") {
    for (const [url, data] of [[catalogFile,batch.catalog],[reportFile,{version:batch.version,...batch.report}]]) {
      if (cmd === "export") {
        const staged = fileURLToPath(url)+`.${process.pid}.pending`;
        writeFileSync(staged,json(data)); renameSync(staged,url);
      } else ensure(readFileSync(url,"utf8") === json(data), `Stale ${url.pathname}; inspect changes and re-export.`);
    }
  }
  console.log(json({version:batch.version,...batch.report}));
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode=1; }
}
