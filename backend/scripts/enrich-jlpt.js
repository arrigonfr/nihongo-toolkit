import { mkdir, readFile, writeFile, rename, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseJlptCsv } from "./vocabulary-seed-lib.js";
import { kezuruRevision } from "./sources.js";
import { hash, openJlptDatabase, planJlpt, applyJlpt, parseJlptArgs, parseKezuruVocabulary } from "./jlpt-enrichment-lib.js";

const values = parseJlptArgs(process.argv.slice(2));
if (values.help) {
  console.log(`Usage: npm run db:enrich-jlpt -- [--db PATH] [--estimates] [--report [FILE]] [--offline] [--apply]
Default: preview only; existing levels are never overwritten.
--estimates  Include clearly labeled low-confidence heuristic/supplementary estimates.
--report     Print the full JSON plan to stdout; optionally supply FILE to save it without overwriting.
             Use npm run --silent when redirecting stdout to a JSON file.
--offline    Use previously downloaded, revision-keyed source snapshots only.
--openjlpt-revision SHA / --anki-revision SHA  Use a different immutable 40-character commit.
--apply      Apply the current plan locally and journal only the changed JLPT rows.
All levels are community study assignments, not official JLPT classifications.`);
} else {
  for (const key of ["openjlpt-revision", "anki-revision"]) {
    if (!/^[a-f0-9]{40}$/.test(values[key])) throw new Error(`--${key} must be a full lowercase commit SHA`);
  }
  const cache = fileURLToPath(new URL("../.cache/jlpt/", import.meta.url));
  async function download(url) {
    const path = `${cache}${hash(url)}`;
    let bytes;
    try { bytes = await readFile(path); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (values.offline) throw new Error(`Source is not cached: ${url}. Run once without --offline.`);
      const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`JLPT source returned HTTP ${response.status}: ${url}`);
      bytes = Buffer.from(await response.arrayBuffer());
      await mkdir(cache, { recursive: true });
      const temporary = `${path}.${process.pid}.partial`;
      try { await writeFile(temporary, bytes, { flag: "wx" }); await rename(temporary, path); }
      finally { await rm(temporary, { force: true }); }
    }
    return { text: bytes.toString("utf8"), sha256: hash(bytes), url };
  }
  const db = openJlptDatabase(values.db, !values.apply);
  try {
    const records = [];
    for (let level = 5; level >= 1; level--) {
      for (const [kind, directory] of [["word", "vocab"], ["kanji", "kanji"]]) {
        const url = `https://raw.githubusercontent.com/evanclan/OpenJLPT/${values["openjlpt-revision"]}/data/json/${directory}/n${level}.json`;
        const snapshot = await download(url), rows = JSON.parse(snapshot.text);
        if (!Array.isArray(rows) || !rows.length) throw new Error(`Invalid OpenJLPT snapshot: ${url}`);
        const source = { name: "OpenJLPT / Jonathan Waller", url, sha256: snapshot.sha256, license: "CC BY-SA 4.0", revision: values["openjlpt-revision"] };
        for (const row of rows) {
          if (row.level !== `N${level}`) throw new Error(`Unexpected source level in ${url}`);
          records.push({ kind, word: kind === "kanji" ? row.character : row.word, reading: row.reading,
            jmdict_id: row.jmdict_id, level, estimated: row.supplementary === true, source });
        }
      }
      const url = `https://raw.githubusercontent.com/jamsinclair/open-anki-jlpt-decks/${values["anki-revision"]}/src/n${level}.csv`;
      const snapshot = await download(url);
      const rows = parseJlptCsv(snapshot.text, `N${level}`);
      if (!rows.length) throw new Error(`Empty JLPT snapshot: ${url}`);
      const source = { name: "open-anki-jlpt-decks / Jonathan Waller", url, sha256: snapshot.sha256,
        license: "CC BY (Jonathan Waller)", revision: values["anki-revision"] };
      for (const row of rows) records.push({ kind: "word", word: row.expression, reading: row.reading, level, source });
    }
    for (const level of [5, 4]) {
      const url = `https://raw.githubusercontent.com/julillermo/kezuru-jlpt-data/${kezuruRevision}/data/vocab_n${level}_combined.json`;
      const snapshot = await download(url);
      records.push(...parseKezuruVocabulary(snapshot.text, level, {
        name: "Kezuru / TulioG_Projects / Wikibooks JLPT Guide", url,
        sha256: snapshot.sha256, revision: kezuruRevision, license: "CC BY-SA 4.0",
        attribution: `https://github.com/julillermo/kezuru-jlpt-data/blob/${kezuruRevision}/ATTRIBUTION.md`
      }));
    }
    const plan = planJlpt(db, records, { estimates: values.estimates });
    const reportToStdout = values.report === "-";
    const log = reportToStdout ? console.error : console.log;
    log(JSON.stringify({ mode: values.apply ? "apply" : "dry-run", ...plan.coverage, ...plan.summary }, null, 2));
    if (values.report) {
      if (reportToStdout) console.log(JSON.stringify(plan, null, 2));
      else {
        await writeFile(values.report, JSON.stringify(plan, null, 2) + "\n", { flag: "wx" });
        log(`Report saved to ${values.report}`);
      }
    }
    if (values.apply) log(`Applied ${applyJlpt(db, plan.assignments)} JLPT assignments locally.`);
    else log("No database rows changed. Inspect a --report, then rerun with --apply. Add --estimates for low-confidence suggestions.");
    if (plan.conflicts.length) console.warn(`${plan.conflicts.length} conflicting source matches were left unchanged.`);
    if (plan.unmatched.length) console.warn(`${plan.unmatched.length} source rows had no unambiguous permitted dictionary match.`);
  } finally { db.close(); }
}
