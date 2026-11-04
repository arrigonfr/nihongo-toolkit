import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { insertWords } from "./import-data.js";
import { extractSentences, sentenceRow } from "./vocabulary-seed-lib.js";
import { tokenizer } from "../src/tokenizer-node.js";
import { createSentenceFallback } from "../src/examples.js";
import { openEnrichment, transaction, sha256, recordSource, coverage, missingWords,
  sentenceWriter, lexicalIndex, sentenceMatches, parseParallel } from "./enrichment-lib.js";

const { values } = parseArgs({ options: {
  db: { type: "string" }, "api-limit": { type: "string", default: "100" },
  report: { type: "boolean" }, "skip-bulk": { type: "boolean" }
} });
const apiLimit = Number(values["api-limit"]);
if (!Number.isSafeInteger(apiLimit) || apiLimit < 0) throw new Error("--api-limit must be a nonnegative integer");
const db = openEnrichment(values.db);
const cache = fileURLToPath(new URL("../.cache/enrichment/", import.meta.url));
mkdirSync(cache, { recursive: true });
async function download(url) {
  const path = cache + sha256(url);
  if (!existsSync(path)) {
    const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Download failed (${response.status}): ${url}`);
    writeFileSync(path + ".part", Buffer.from(await response.arrayBuffer()));
    renameSync(path + ".part", path);
  }
  return { path, hash: sha256(readFileSync(path)) };
}
try {
  console.log("Before:", coverage(db));
  if (values.report) process.exitCode = 0;
  else {
    const save = sentenceWriter(db);
    if (!values["skip-bulk"]) {
      const response = await fetch("https://api.github.com/repos/scriptin/jmdict-simplified/releases/latest",
        { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw new Error(`Dictionary release API: HTTP ${response.status}`);
      const release = await response.json();
      const asset = release.assets.find((asset) => /^jmdict-examples-eng-[\d.+]+\.json\.tgz$/.test(asset.name));
      if (!asset) throw new Error("English JMdict examples asset missing from latest release");
      const { path, hash } = await download(asset.browser_download_url);
      const dictionary = JSON.parse(execFileSync("tar", ["xzOf", path], { maxBuffer: 1024 ** 3 }).toString());
      let words = 0, sentences = 0;
      transaction(db, () => {
        const source = recordSource(db, { url: asset.browser_download_url, hash, license: "CC BY-SA 4.0 (EDRDG); examples CC BY 2.0 FR (Tatoeba)" });
        insertWords(db, dictionary, { append: true, onInsert(id) {
          words++;
          db.prepare("INSERT OR IGNORE INTO enrichment_word_sources VALUES (?,?)").run(id, source);
        } });
        const ids = new Map(db.prepare("SELECT id,jmdict_id FROM words").all().map((row) => [row.jmdict_id, row.id]));
        for (const entry of dictionary.words) for (const example of extractSentences(entry)) {
          sentences += save(sentenceRow(example), [{ id: ids.get(String(entry.id)), matched: example.matched }]);
        }
      });
      console.log(`JMdict ${release.tag_name}: ${words} new words, ${sentences} new sentences`);
      const url = "https://www.manythings.org/anki/jpn-eng.zip";
      const parallel = await download(url);
      const sourceId = recordSource(db, { url, hash: parallel.hash, license: "CC BY 2.0 FR (Tatoeba contributors via ManyThings)" });
      const text = execFileSync("unzip", ["-p", parallel.path, "jpn.txt"], { maxBuffer: 256 * 1024 ** 2 }).toString();
      const index = lexicalIndex(db.prepare("SELECT id,kanji_forms,kana_forms FROM words").all());
      const segment = await tokenizer();
      const lines = text.trim().split(/\r?\n/);
      sentences = 0;
      const vocabularyVersion = db.prepare("SELECT count(*) n, max(id) id FROM words").get();
      const progressKey = `${sourceId}:${vocabularyVersion.n}:${vocabularyVersion.id}`;
      const start = db.prepare("SELECT next_offset FROM enrichment_progress WHERE source_id=?").get(progressKey)?.next_offset ?? 0;
      for (let offset = start; offset < lines.length; offset += 500) {
        transaction(db, () => {
          for (const line of lines.slice(offset, offset + 500)) {
            const sentence = parseParallel(line);
            sentences += save(sentence, sentenceMatches(sentence.ja, segment, index));
          }
          db.prepare("INSERT INTO enrichment_progress VALUES (?,?) ON CONFLICT(source_id) DO UPDATE SET next_offset=excluded.next_offset")
            .run(progressKey, Math.min(offset + 500, lines.length));
        });
        if (offset % 10000 === 0) console.log(`Parallel corpus: ${offset}/${lines.length}, ${sentences} new sentences`);
      }
      console.log(`Parallel corpus: ${lines.length} pairs processed, ${sentences} new sentences`);
    }
    const lookup = createSentenceFallback({ enabled: true });
    const apiIndex = apiLimit ? lexicalIndex(db.prepare("SELECT id,kanji_forms,kana_forms FROM words").all()) : null;
    const apiTokenizer = apiLimit ? await tokenizer() : null;
    const words = missingWords(db).filter((word) => !db.prepare(
      "SELECT 1 FROM enrichment_attempts WHERE word_id=? AND provider='tatoeba'").get(word.id)).slice(0, apiLimit);
    let added = 0;
    for (const word of words) {
      const items = await lookup(word.word);
      transaction(db, () => {
        for (const item of items) {
          if (!/CC.?BY|CC0/i.test(item.license ?? "") || !/CC.?BY|CC0/i.test(item.translationLicense ?? "")) continue;
          if (!sentenceMatches(item.japanese, apiTokenizer, apiIndex).some((match) => match.id === word.id)) continue;
          added += save({ id: `tatoeba:${item.id}`, ja: item.japanese, en: item.english, source: "tatoeba",
            sourceId: String(item.id), license: item.license,
            attribution: JSON.stringify({ owner: item.owner, translationId: item.translationId,
              translationOwner: item.translationOwner, translationLicense: item.translationLicense,
              sourceUrl: `https://tatoeba.org/sentences/show/${item.id}` })
          }, [{ id: word.id, matched: word.word }]);
        }
        db.prepare("INSERT OR REPLACE INTO enrichment_attempts VALUES (?, 'tatoeba', ?, 'done', ?)")
          .run(word.id, new Date().toISOString(), `${items.length} examples`);
      });
      await new Promise((resolve) => setTimeout(resolve, 1100));
    }
    console.log(`Tatoeba API: ${words.length} words searched, ${added} new sentences`);
    console.log("After:", coverage(db));
  }
} finally {
  db.close();
}
