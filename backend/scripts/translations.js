import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { request as httpRequest } from "node:http";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { parseArgs } from "node:util";
import { databasePath } from "../src/database.js";
import {
  LANGUAGES, KINDS, ensureTranslationSchema, translationItem, translationItems, translationStatus,
  translationWriter, translateGemmaPrompt, pendingTranslationSync, syncTranslations, splitModelOutput, checkTranslation, parseTatoebaLinks, parseTatoebaSentences, pickTatoebaTranslation
} from "./translation-lib.js";

const usage = `Usage: npm run db:translations -- <command> [options]
  coverage                         Report Spanish/Portuguese coverage by content kind
  import-human                     Import KANJIDIC2 kanji meanings and direct Tatoeba sentence translations
  export --lang es --kind sense --out DIR [--chunk-size 500] [--limit N]
                                   Write untranslated or stale items as JSONL chunks for any translation provider
  apply --source "Provider model" FILE...
                                   Validate provider JSONL results (export rows plus "value": [...]) and store them
  translate --lang es --kind sense [--model translategemma:4b] [--concurrency 4] [--limit N]
                                   Machine-translate pending items one by one with a local Ollama model (free, resumable)
  sync-turso [--apply]             Upsert translations changed since the last sync into TURSO_DATABASE_URL (dry run by default)
Options: --db PATH (default DATABASE_PATH or backend/data/nihon.sqlite)`;

const { values: options, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    db: { type: "string", default: databasePath }, lang: { type: "string" }, kind: { type: "string" },
    out: { type: "string" }, "chunk-size": { type: "string", default: "500" }, limit: { type: "string" },
    source: { type: "string" }, model: { type: "string", default: "translategemma:4b" },
    concurrency: { type: "string", default: "4" }, ollama: { type: "string", default: "http://127.0.0.1:11434" }, help: { type: "boolean" }, apply: { type: "boolean" }
  }
});
const [command, ...files] = positionals;
if (options.help || !command) { console.log(usage); process.exit(command ? 0 : 1); }
if (!existsSync(options.db)) throw new Error(`Database not found: ${options.db}`);
const db = new DatabaseSync(options.db);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000");
ensureTranslationSchema(db);

function transaction(fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const result = fn(); db.exec("COMMIT"); return result; }
  catch (error) { db.exec("ROLLBACK"); throw error; }
}
const choice = (name, value, allowed) => {
  if (!allowed.includes(value)) throw new Error(`--${name} must be one of: ${allowed.join(", ")}`);
  return value;
};
const positiveInteger = (name, value) => {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(`--${name} must be a positive integer`);
  return number;
};

const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
const sources = [];
async function downloadBz2(url) {
  await mkdir(cache, { recursive: true });
  const path = `${cache}/${createHash("sha256").update(url).digest("hex")}.bz2`;
  if (!existsSync(path)) {
    console.log(`Downloading ${url}`);
    const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
    if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
    await writeFile(`${path}.partial`, Buffer.from(await response.arrayBuffer()));
    await rename(`${path}.partial`, path);
  }
  const bytes = await readFile(path);
  sources.push({ url, sha256: createHash("sha256").update(bytes).digest("hex"), retrieved_at: new Date().toISOString() });
  const result = spawnSync("bunzip2", ["-c", path], { maxBuffer: 1024 * 1024 * 1024, encoding: "utf8" });
  if (result.error || result.status !== 0) throw new Error(`Could not decompress ${url}: ${result.error?.message || result.stderr}`);
  return result.stdout;
}

async function importHuman() {
  const write = translationWriter(db);
  const tatoeba = {};
  for (const [lang, code] of [["es", "spa"], ["pt", "por"]]) {
    const base = "https://downloads.tatoeba.org/exports/per_language";
    tatoeba[lang] = {
      links: parseTatoebaLinks(await downloadBz2(`${base}/jpn/jpn-${code}_links.tsv.bz2`)),
      sentences: parseTatoebaSentences(await downloadBz2(`${base}/${code}/${code}_sentences_detailed.tsv.bz2`), code)
    };
  }
  const counts = Object.fromEntries(LANGUAGES.map((lang) => [lang, { kanji: 0, sentence: 0 }]));
  transaction(() => {
    for (const row of db.prepare("SELECT character, meanings_by_language FROM kanjis").all()) {
      const item = translationItem(db, "kanji", row.character);
      const localized = JSON.parse(row.meanings_by_language);
      for (const lang of LANGUAGES) {
        if (!item || !localized[lang]?.length) continue;
        counts[lang].kanji += write({ item, lang, value: localized[lang], method: "human", source: "KANJIDIC2",
          attribution: { source: "KANJIDIC2 via jmdict-simplified", url: "https://www.edrdg.org/wiki/index.php/KANJIDIC_Project" } });
      }
    }
    for (const item of Array.from(translationItems(db, "sentence"))) {
      if (!String(item.item_id).startsWith("tatoeba:")) continue;
      const row = { source_id: String(item.item_id).slice("tatoeba:".length) };
      for (const lang of LANGUAGES) {
        const translation = pickTatoebaTranslation(row.source_id, tatoeba[lang].links, tatoeba[lang].sentences);
        if (!translation) continue;
        counts[lang].sentence += write({ item, lang, value: [translation.text], method: "human", source: "Tatoeba",
          license: "CC BY 2.0 FR", attribution: {
            owner: item.attribution.owner ?? null, translationId: translation.id, translationOwner: translation.owner,
            sourceUrl: `https://tatoeba.org/sentences/show/${row.source_id}`
          } });
      }
    }
    db.prepare("INSERT INTO metadata VALUES ('translation_sources', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(sources));
  });
  console.log("Human translations written:", JSON.stringify(counts));
}

async function exportPending() {
  const lang = choice("lang", options.lang, LANGUAGES), kind = choice("kind", options.kind, KINDS);
  if (!options.out) throw new Error("--out is required");
  const size = positiveInteger("chunk-size", options["chunk-size"]);
  const limit = options.limit ? positiveInteger("limit", options.limit) : Infinity;
  const { pending } = translationStatus(db, kind, lang);
  const rows = pending.slice(0, limit).map(({ kind, item_id, source_hash, english, context }) =>
    JSON.stringify({ kind, item_id, lang, source_hash, english, context }));
  await mkdir(options.out, { recursive: true });
  for (let start = 0; start < rows.length; start += size) {
    const name = `${options.out}/${kind}-${lang}-${String(start / size + 1).padStart(5, "0")}.jsonl`;
    await writeFile(name, `${rows.slice(start, start + size).join("\n")}\n`);
  }
  console.log(`Exported ${rows.length} of ${pending.length} pending ${kind} items for ${lang} in ${Math.ceil(rows.length / size)} chunk(s).`);
}

async function applyResults() {
  if (!options.source?.trim()) throw new Error("--source is required, e.g. --source \"GitHub Copilot gpt-6-luna\"");
  if (!files.length) throw new Error("At least one result file is required");
  const write = translationWriter(db);
  let applied = 0, skipped = 0;
  const suspect = {};
  for (const file of files) {
    const lines = (await readFile(file, "utf8")).split("\n").filter((line) => line.trim());
    const rows = lines.map((line, index) => {
      try { return JSON.parse(line); }
      catch { throw new Error(`${file}:${index + 1}: invalid JSON`); }
    });
    // Validate the whole file before writing so a bad chunk is rejected atomically.
    const ready = rows.map((row, index) => {
      const where = `${file}:${index + 1}`;
      choice("lang", row.lang, LANGUAGES); choice("kind", row.kind, KINDS);
      const item = translationItem(db, row.kind, row.item_id);
      if (!item) throw new Error(`${where}: unknown ${row.kind} ${row.item_id}`);
      if (item.source_hash !== row.source_hash) return null;
      const { value, issue } = checkTranslation(item, row.value);
      return { item, lang: row.lang, value, issue };
    });
    transaction(() => {
      for (const row of ready) {
        if (!row) { skipped++; continue; }
        if (row.issue) { suspect[row.issue] = (suspect[row.issue] || 0) + 1; continue; }
        applied += write({ item: row.item, lang: row.lang, value: row.value, method: "machine", source: options.source.trim(), attribution: {
          translatedFrom: "en", provider: options.source.trim(),
          ...(row.item.attribution ? { sourceAttribution: row.item.attribution } : {})
        } });
      }
    });
  }
  console.log(`Applied ${applied} machine translation(s); skipped ${skipped} whose English source changed since export;`
    + ` left out as suspect: ${JSON.stringify(suspect)}.`);
}

// node:http avoids fetch's 300s header timeout while requests queue behind Ollama's parallel slots.
function ollamaGenerate(prompt) {
  const body = JSON.stringify({ model: options.model, prompt, stream: false, keep_alive: "30m",
    options: { temperature: 0, num_ctx: 2048, num_predict: 512 } });
  return new Promise((resolve, reject) => {
    const request = httpRequest(`${options.ollama}/api/generate`, { method: "POST", headers: { "content-type": "application/json" } },
      (response) => {
        let text = "";
        response.setEncoding("utf8").on("data", (chunk) => { text += chunk; }).on("end", () => {
          if (response.statusCode !== 200) return reject(new Error(`Ollama HTTP ${response.statusCode}: ${text}`));
          try { resolve(JSON.parse(text).response ?? ""); } catch (error) { reject(error); }
        });
      });
    request.on("error", reject).end(body);
  });
}

async function translateLocal() {
  const lang = choice("lang", options.lang, LANGUAGES), kind = choice("kind", options.kind, KINDS);
  const limit = options.limit ? positiveInteger("limit", options.limit) : Infinity;
  const tags = await fetch(`${options.ollama}/api/tags`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
  const model = tags.models?.find((entry) => entry.name === options.model);
  if (!model) throw new Error(`Ollama model ${options.model} is not installed; run: ollama pull ${options.model}`);
  const source = `ollama:${options.model}@${model.digest.slice(0, 12)}`;
  const write = translationWriter(db);
  const pending = translationStatus(db, kind, lang).pending.slice(0, limit);
  const started = Date.now(), issues = {};
  let next = 0, processed = 0, saved = 0;

  const attempt = async (item, english) => {
    try {
      const value = splitModelOutput(item, await ollamaGenerate(translateGemmaPrompt(item, lang, english)), english);
      return value ? value : { issue: "gloss count mismatch" };
    } catch (error) { return { issue: error.message.startsWith("Ollama") ? "request failed" : "invalid output" }; }
  };
  const checked = (item, value) => {
    if (!Array.isArray(value)) return value;
    try { return checkTranslation(item, value); } catch { return { issue: "invalid output" }; }
  };
  async function translateItem(item) {
    let result = item.kind === "sentence" || !item.english.some((gloss) => gloss.includes(";"))
      ? checked(item, await attempt(item, item.english)) : { issue: "gloss contains a semicolon" };
    if (result.issue && item.kind !== "sentence") {
      // One gloss per request keeps glosses aligned when the joined list comes back garbled.
      const parts = [];
      for (const gloss of item.english) {
        const part = await attempt(item, [gloss]);
        if (!Array.isArray(part)) { parts.length = 0; break; }
        parts.push(part[0]);
      }
      if (parts.length) result = checked(item, parts);
    }
    if (result.issue) { issues[result.issue] = (issues[result.issue] || 0) + 1; return; }
    saved += write({ item, lang, value: result.value, method: "machine", source,
      attribution: { translatedFrom: "en", provider: source, ...(item.attribution ? { sourceAttribution: item.attribution } : {}) } });
  }
  async function worker() {
    while (next < pending.length) {
      await translateItem(pending[next++]);
      if (++processed % 25 === 0 || processed === pending.length) {
        const rate = processed / ((Date.now() - started) / 1000);
        console.log(`${kind} ${lang}: ${processed}/${pending.length} · saved ${saved} · left pending ${JSON.stringify(issues)} · `
          + `${rate.toFixed(2)} items/s · ETA ${((pending.length - processed) / rate / 3600).toFixed(1)} h`);
      }
    }
  }
  await Promise.all(Array.from({ length: positiveInteger("concurrency", options.concurrency) }, worker));
}

async function syncTurso() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) throw new Error("TURSO_DATABASE_URL is required (backend/.env or the environment)");
  const destination = createHash("sha256").update(new URL(url.replace(/^libsql:/, "https:")).origin).digest("hex");
  if (!options.apply) {
    const rows = pendingTranslationSync(db, destination);
    const counts = {};
    for (const row of rows) counts[`${row.kind} ${row.lang}`] = (counts[`${row.kind} ${row.lang}`] ?? 0) + 1;
    console.log(`${rows.length} translations to upsert ${JSON.stringify(counts)}. Dry run; pass --apply to write to Turso.`);
    return;
  }
  if (!process.env.TURSO_AUTH_TOKEN) throw new Error("TURSO_AUTH_TOKEN is required");
  const { createClient } = await import("@libsql/client/web");
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
  try {
    const { synced, mismatches } = await syncTranslations(db, client, destination, {
      onBatch: (done, total) => { if (done === total || done % 5000 < 200) console.log(`${done}/${total} upserted`); } });
    console.log(`${synced} translations upserted.`);
    if (mismatches.length) {
      console.error(`Row counts differ from Turso for: ${mismatches.join(", ")}. Rerun; if it persists, delete this destination from translation_sync for a full resync.`);
      process.exitCode = 1;
    } else console.log("Turso row counts match the local database.");
  } finally { client.close(); }
}

function report() {
  for (const kind of KINDS) for (const lang of LANGUAGES) {
    const { counts } = translationStatus(db, kind, lang);
    const done = counts.human + counts.machine;
    console.log(`${kind.padEnd(8)} ${lang}: ${done}/${counts.total} (${(100 * done / (counts.total || 1)).toFixed(1)}%)`
      + ` · human ${counts.human} · machine ${counts.machine} · stale ${counts.stale} · missing ${counts.missing}`);
  }
}

try {
  if (command === "coverage") report();
  else if (command === "import-human") await importHuman();
  else if (command === "export") await exportPending();
  else if (command === "apply") await applyResults();
  else if (command === "translate") await translateLocal();
  else if (command === "sync-turso") await syncTurso();
  else { console.error(usage); process.exitCode = 1; }
} finally { db.close(); }
