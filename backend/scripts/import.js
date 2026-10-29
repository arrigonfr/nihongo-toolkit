import { mkdir, readFile, writeFile, rename, rm, open } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { t as readTar } from "tar";
import { createDatabase, databasePath } from "../src/database.js";
import { insertKanjis, insertWords, insertVocabulary } from "./import-data.js";
import { dictionaryUrl, dictionaryRelease, openJlptUrl, openJlptRevision, kanjiVgUrl, kanjiVgRevision } from "./sources.js";

const cache = fileURLToPath(new URL("../.cache/", import.meta.url));
const sources = [];
await mkdir(cache, { recursive: true });

async function download(url) {
  const path = `${cache}/${createHash("sha256").update(url).digest("hex")}`;
  let bytes;
  try { bytes = await readFile(path); }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`Downloading ${url}`);
        const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
        if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${url}`);
        bytes = Buffer.from(await response.arrayBuffer());
        await writeFile(`${path}.partial`, bytes);
        await rename(`${path}.partial`, path);
        break;
      } catch (error) {
        if (attempt === 3) throw error;
        console.warn(`Download attempt ${attempt} failed: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
      }
    }
  }
  sources.push({ url, sha256: createHash("sha256").update(bytes).digest("hex"), bytes: bytes.length });
  return { path, bytes };
}

async function visitArchive(path, accept, consume) {
  const pending = [];
  await readTar({
    file: path,
    onReadEntry(entry) {
      if (entry.type !== "File" || !accept(entry.path)) { entry.resume(); return; }
      pending.push(new Promise((resolve, reject) => {
        const chunks = [];
        entry.on("data", (chunk) => chunks.push(chunk));
        entry.on("error", reject);
        entry.on("end", () => {
          try { consume(entry.path, Buffer.concat(chunks).toString("utf8")); resolve(); }
          catch (error) { reject(error); }
        });
      }));
    }
  });
  await Promise.all(pending);
}

async function dictionary(name) {
  const { path } = await download(dictionaryUrl(name));
  let data;
  await visitArchive(path, (name) => name.endsWith(".json"), (_, text) => {
    if (data) throw new Error("Dictionary archive contains multiple JSON files");
    data = JSON.parse(text);
  });
  if (!data) throw new Error(`No JSON found in ${name}`);
  return data;
}

const lockPath = `${databasePath}.import-lock`;
await mkdir(dirname(databasePath), { recursive: true });
const lock = await open(lockPath, "wx");
const staging = `${databasePath}.building`;
let db;
try {
  // Only the staging file is replaced. A failed import leaves the live database intact.
  await rm(staging, { force: true });
  const levels = new Map();
  const vocabulary = [];
  for (let level = 5; level >= 1; level--) {
    const kanjis = JSON.parse((await download(openJlptUrl("kanji", level))).bytes);
    const words = JSON.parse((await download(openJlptUrl("vocab", level))).bytes);
    if (!Array.isArray(kanjis) || !kanjis.length || !Array.isArray(words) || !words.length) {
      throw new Error(`Invalid OpenJLPT N${level} dataset`);
    }
    for (const kanji of kanjis) {
      if (!levels.has(kanji.character)) levels.set(kanji.character, { level, supplementary: kanji.supplementary });
    }
    vocabulary.push(...words);
  }
  db = createDatabase(staging);
  db.exec("BEGIN");
  console.log("Importing KANJIDIC2...");
  insertKanjis(db, await dictionary("kanjidic2-all"), levels);
  console.log("Importing JMdict and kanji-word relationships...");
  insertWords(db, await dictionary("jmdict-eng"));
  insertVocabulary(db, vocabulary);
  console.log("Importing local KanjiVG stroke diagrams...");
  const { path } = await download(kanjiVgUrl);
  const characters = new Set(db.prepare("SELECT character FROM kanjis").all().map((r) => r.character));
  const insertSvg = db.prepare("INSERT INTO strokes VALUES (?, ?)");
  await visitArchive(path, (name) => /\/kanji\/[0-9a-f]{5}\.svg$/.test(name), (name, text) => {
    const code = name.match(/([0-9a-f]{5})\.svg$/)[1];
    const character = String.fromCodePoint(parseInt(code, 16));
    if (characters.has(character)) insertSvg.run(character, text);
  });
  const metadata = db.prepare("INSERT INTO metadata VALUES (?, ?)");
  metadata.run("sources", JSON.stringify(sources));
  metadata.run("imported_at", new Date().toISOString());
  metadata.run("revisions", JSON.stringify({ dictionaryRelease, openJlptRevision, kanjiVgRevision }));
  metadata.run("license", "Dictionary: CC BY-SA 4.0; KanjiVG: CC BY-SA 3.0; see DATA-LICENSES.md");
  for (const table of ["kanjis", "words", "kanji_words", "vocabulary", "strokes"]) {
    const { count } = db.prepare(`SELECT count(*) AS count FROM ${table}`).get();
    if (!count) throw new Error(`Import produced an empty ${table} table`);
    console.log(`${table}: ${count}`);
  }
  if (db.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Foreign key validation failed");
  db.exec("COMMIT; ANALYZE; VACUUM");
  if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Integrity check failed");
  db.close();
  db = null;
  await rename(staging, databasePath);
  console.log(`Imported database published atomically: ${databasePath}`);
} finally {
  db?.close();
  await rm(staging, { force: true });
  await lock.close();
  await rm(lockPath);
}
