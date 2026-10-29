import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { databasePath } from "../src/database.js";
import {
  parseLevels, levelNumber, parseJlptCsv, extractSentences, sentenceRow, buildWordIndex,
  matchWord, jlptFromTags, vocabularyRow
} from "./vocabulary-seed-lib.js";

const cacheDir = fileURLToPath(new URL("../.cache/seed/", import.meta.url));
const EXAMPLES_URL = "https://github.com/scriptin/jmdict-simplified/releases/download/3.6.2%2B20261026175559/jmdict-examples-eng-3.6.2%2B20261026175559.json.tgz";
const jlptUrl = (level) => `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/main/src/${level.toLowerCase()}.csv`;
const JLPT_LICENSE = "CC BY (Jonathan Waller, tanos.co.uk, via open-anki-jlpt-decks)";
const JMDICT_LICENSE = "CC BY-SA 4.0 (EDRDG JMdict)";
const DELAY_MS = 1000;

const { values: opts } = parseArgs({ options: {
  "dry-run": { type: "boolean", default: false },
  limit: { type: "string" },
  levels: { type: "string" },
  db: { type: "string" },
  "no-common": { type: "boolean", default: false },
  "no-sentences": { type: "boolean", default: false },
  force: { type: "boolean", default: false },
  help: { type: "boolean", default: false }
} });

if (opts.help) {
  console.log(`Usage: npm run seed:vocab -- [--dry-run] [--limit N] [--levels N5,N4] [--db path]
  [--no-common] [--no-sentences] [--force]
  --dry-run   download/parse and report counts, write nothing
  --limit N   max rows per step (JLPT rows per level, sentence-bearing words, common words)
  --levels    JLPT levels to seed (default all)
  --db        SQLite file (default DATABASE_PATH or backend/data/nihon.sqlite)
  --force     re-run steps already recorded as done for the same source checksum`);
  process.exit(0);
}

const limit = opts.limit ? Number(opts.limit) : Infinity;
if (!(limit > 0)) throw new Error("--limit must be a positive number");
const levels = parseLevels(opts.levels);
const dbPath = opts.db ?? databasePath;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

async function download(name, url) {
  mkdirSync(cacheDir, { recursive: true });
  const file = cacheDir + name;
  if (existsSync(file)) return { buf: readFileSync(file), cached: true };
  await sleep(DELAY_MS);
  const res = await fetch(url, { headers: { "user-agent": "nihon-seed/1.0 (local study app)" } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(file + ".part", buf);
  renameSync(file + ".part", file);
  return { buf, cached: false };
}

if (!existsSync(dbPath)) throw new Error(`Database not found: ${dbPath}. Run npm run db:import first.`);
const db = new DatabaseSync(dbPath);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
if (!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'words'").get()) {
  throw new Error("Table `words` is missing; run the base import first.");
}
// Migration: every statement is IF NOT EXISTS, so repeating it is safe. Skipped in dry-run.
if (!opts["dry-run"]) db.exec(readFileSync(new URL("../src/vocabulary-seed.sql", import.meta.url), "utf8"));
const hasSeedTables = !!db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'seed_runs'").get();

const summary = [];
const alreadyDone = (step, hash) => !opts.force && !opts["dry-run"] && !Number.isFinite(limit)
  && !!db.prepare("SELECT 1 FROM seed_runs WHERE step = ? AND sha256 = ? AND status = 'done'").get(step, hash);

function record(step, url, hash, seen, inserted, started) {
  summary.push({ step, seen, inserted });
  if (opts["dry-run"]) return;
  db.prepare(`INSERT INTO seed_runs (step, source_url, sha256, status, rows_seen, rows_inserted, started_at, finished_at)
    VALUES (?, ?, ?, 'done', ?, ?, ?, ?)`).run(step, url, hash, seen, inserted, started, new Date().toISOString());
}

function inTransaction(fn) {
  if (opts["dry-run"]) return fn();
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; } catch (e) { db.exec("ROLLBACK"); throw e; }
}

const wordRows = db.prepare("SELECT id, word, reading, meanings, is_common, kanji_forms, kana_forms, senses FROM words").all();
const wordById = new Map(wordRows.map((r) => [r.id, r]));
const insertVocab = hasSeedTables || !opts["dry-run"] ? db.prepare(`INSERT OR IGNORE INTO vocabulary_words
  (word_id, word, reading, meaning, meanings, jlpt, parts_of_speech, tags, is_common, source, license)
  VALUES (:word_id, :word, :reading, :meaning, :meanings, :jlpt, :parts_of_speech, :tags, :is_common, :source, :license)`) : null;
const seededWordIds = () => hasSeedTables
  ? new Set(db.prepare("SELECT word_id FROM vocabulary_words").all().map((r) => r.word_id)) : new Set();

// Step 1: JLPT lists (open-anki-jlpt-decks, derived from Tanos/Waller)
const index = buildWordIndex(wordRows);
for (const level of levels) {
  const url = jlptUrl(level);
  const started = new Date().toISOString();
  const { buf, cached } = await download(`jlpt-${level}.csv`, url);
  const hash = sha256(buf);
  const step = `jlpt-${level}`;
  if (alreadyDone(step, hash)) { console.log(`${step}: unchanged, skipped (use --force)`); continue; }
  const items = parseJlptCsv(buf.toString("utf8"), level).slice(0, limit);
  let inserted = 0, unmatched = 0;
  inTransaction(() => {
    for (const item of items) {
      const hit = matchWord(index, item);
      if (!hit) { unmatched++; continue; }
      const row = vocabularyRow(wordById.get(hit.id), {
        jlpt: jlptFromTags(item.tags) ?? levelNumber(level), meaning: item.meaning,
        word: item.expression, reading: item.reading,
        source: "open-anki-jlpt-decks", license: JLPT_LICENSE, tags: [`JLPT_${level}`]
      });
      if (!opts["dry-run"]) inserted += Number(insertVocab.run(row).changes);
      else inserted++;
    }
  });
  console.log(`${step}: ${items.length} rows${cached ? " (cached)" : ""}, ${unmatched} unmatched in JMdict`);
  record(step, url, hash, items.length, inserted, started);
}

// Step 2: common JMdict words without a JLPT level, to widen the practice pool
if (!opts["no-common"]) {
  const started = new Date().toISOString();
  const have = seededWordIds();
  const candidates = wordRows.filter((r) => r.is_common && !have.has(r.id)).slice(0, limit);
  let inserted = 0;
  inTransaction(() => {
    for (const r of candidates) {
      if (opts["dry-run"]) { inserted++; continue; }
      inserted += Number(insertVocab.run(vocabularyRow(r, {
        jlpt: null, source: "jmdict-common", license: JMDICT_LICENSE, tags: ["common"] })).changes);
    }
  });
  console.log(`common: ${candidates.length} candidate JMdict words`);
  record("common", "local:words", null, candidates.length, inserted, started);
}

// Step 3: Tatoeba example sentences through jmdict-simplified examples
if (!opts["no-sentences"]) {
  const started = new Date().toISOString();
  const { buf, cached } = await download("jmdict-examples-eng.json.tgz", EXAMPLES_URL);
  const hash = sha256(buf);
  if (alreadyDone("sentences", hash)) console.log("sentences: unchanged, skipped (use --force)");
  else {
    const json = execFileSync("tar", ["xzOf", cacheDir + "jmdict-examples-eng.json.tgz"], { maxBuffer: 1 << 30 });
    const data = JSON.parse(json.toString("utf8"));
    const jmdictToId = new Map(db.prepare("SELECT id, jmdict_id FROM words").all().map((r) => [r.jmdict_id, r.id]));
    const insertSentence = opts["dry-run"] ? null : db.prepare(`INSERT OR IGNORE INTO sentences
      (id, ja, en, source, source_id, license, attribution)
      VALUES (:id, :ja, :en, :source, :sourceId, :license, :attribution)`);
    const insertLink = opts["dry-run"] ? null : db.prepare(
      "INSERT OR IGNORE INTO word_sentences (word_id, sentence_id, matched_text) VALUES (?, ?, ?)");
    let seen = 0, newSentences = 0, newLinks = 0, words = 0;
    const unique = new Set();
    inTransaction(() => {
      for (const entry of data.words) {
        const wordId = jmdictToId.get(String(entry.id));
        if (!wordId) continue;
        const found = extractSentences(entry);
        if (!found.length) continue;
        if (words++ >= limit) break;
        for (const s of found) {
          seen++;
          const row = sentenceRow(s);
          unique.add(row.id);
          if (opts["dry-run"]) continue;
          newSentences += Number(insertSentence.run(row).changes);
          newLinks += Number(insertLink.run(wordId, row.id, s.matched).changes);
        }
      }
    });
    console.log(`sentences: ${seen} links across ${words} words, ${unique.size} distinct sentences${cached ? " (cached)" : ""}`);
    record("sentences", EXAMPLES_URL, hash, seen, newSentences, started);
    summary.push({ step: "word_sentences links", seen, inserted: newLinks });
  }
}

const count = (t) => hasSeedTables || !opts["dry-run"]
  ? db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n : "n/a (dry-run)";
console.log(`\nSummary${opts["dry-run"] ? " (dry-run, nothing written)" : ""}:`);
for (const s of summary) console.log(`  ${s.step}: seen ${s.seen}, inserted ${s.inserted}`);
for (const t of ["vocabulary_words", "sentences", "word_sentences"]) console.log(`  table ${t}: ${count(t)} rows`);
if (hasSeedTables || !opts["dry-run"]) {
  console.log("  vocabulary_words by JLPT:", JSON.stringify(
    db.prepare("SELECT COALESCE(jlpt,0) AS j, COUNT(*) AS n FROM vocabulary_words GROUP BY j ORDER BY j").all()
      .map((r) => `${r.j ? "N" + r.j : "none"}=${r.n}`)));
}
db.close();
