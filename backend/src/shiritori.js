import { kana, connects, eligibility, parseRules, startOptions } from "./shiritori-rules.js";
import { localExamples } from "./examples.js";
import { findConjugationEntries } from "./conjugator.js";
import { segmentText } from "./tokenizer.js";
import { isPlaceName } from "./proper-nouns.js";
import { rowsByWordIds } from "./async-database.js";
import { selectedLevels } from "../../frontend/src/jlpt-levels.js";

const unique = (values) => [...new Set(values)];
export function dictionaryForms(row, tags, levels = []) {
  const spellings = JSON.parse(row.kanji_forms);
  return JSON.parse(row.kana_forms).flatMap((reading) => {
    const forms = spellings.filter((form) => reading.appliesToKanji.includes("*") || reading.appliesToKanji.includes(form.text));
    const kanaForms = levels.filter((level) => /^[ぁ-ゖァ-ヶー]+$/.test(level.word)
      && kana(level.word) === kana(reading.text) && kana(level.reading) === kana(reading.text))
      .map((level) => ({ text: level.word, kanaOnly: true }));
    const candidates = forms.length ? [...forms] : [{ text: reading.text }];
    candidates.push(...kanaForms.filter((form) => !candidates.some((item) => item.text === form.text)));
    return candidates.map((form) => {
      const senses = JSON.parse(row.senses).filter((sense) =>
        (sense.appliesToKanji.includes("*") || sense.appliesToKanji.includes(form.text)
          || form.kanaOnly && forms.some((spelling) => sense.appliesToKanji.includes(spelling.text)))
        && (sense.appliesToKana.includes("*") || sense.appliesToKana.includes(reading.text)));
      const pos = unique(senses.flatMap((s) => s.partOfSpeech));
      const misc = senses.flatMap((s) => s.misc || []);
      const place = isPlaceName(form.text, senses.flatMap((s) => s.gloss.filter((g) => g.lang === "eng").map((g) => g.text)));
      const named = misc.some((p) => ["place", "person", "given", "surname"].includes(p));
      return {
        id: `jm-${row.id}`, word: form.text, reading: reading.text,
        meaning: unique(senses.flatMap((s) => s.gloss.filter((g) => g.lang === "eng").map((g) => g.text))).join("; "),
        partOfSpeech: pos.map((p) => tags[p] || p).join(", "),
        level: levels.find((v) => v.word === form.text && kana(v.reading) === kana(reading.text))?.jlpt ?? null,
        proper: pos.includes("n-pr") || named || place, nameAllowed: pos.includes("n-pr") || named || place,
        source: "JMdict"
      };
    });
  });
}

const USER_AGENT = "nihon-shiritori/1.0 (language-learning app)";
const sameWord = (query, ...forms) => forms.some((form) => form && (form === query || kana(form) === kana(query)));

async function jishoLookup(fetchImpl, query) {
  const url = new URL("https://jisho.org/api/v1/search/words");
  url.searchParams.set("keyword", query);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(6000), headers: { Accept: "application/json", "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Word provider returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("Invalid word provider response");
  return payload.data.flatMap((entry) => (entry.japanese || []).flatMap((form) => {
    if (!form.reading || !sameWord(query, form.word, form.reading)) return [];
    const senses = (entry.senses || []).filter((s) => !s.restrictions?.length || s.restrictions.includes(form.word) || s.restrictions.includes(form.reading));
    const pos = unique(senses.flatMap((s) => s.parts_of_speech || [])).join(", ");
    return [{
      id: `jisho-${entry.slug}`, word: form.word || form.reading, reading: form.reading,
      meaning: unique(senses.flatMap((s) => s.english_definitions || [])).join("; "),
      partOfSpeech: pos, level: null, source: "Jisho · unrated spelling",
      proper: /proper noun|place|name/i.test(pos) || isPlaceName(form.word || form.reading, senses.flatMap((s) => s.english_definitions || [])),
      nameAllowed: /place|person|given name|surname/i.test(pos) || isPlaceName(form.word || form.reading, senses.flatMap((s) => s.english_definitions || [])), examples: []
    }];
  }));
}

async function jotobaLookup(fetchImpl, query) {
  const response = await fetchImpl("https://jotoba.de/api/search/words", {
    method: "POST", signal: AbortSignal.timeout(6000),
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": USER_AGENT },
    body: JSON.stringify({ query, language: "English", no_english: false })
  });
  if (!response.ok) throw new Error(`Word provider returned HTTP ${response.status}`);
  const payload = await response.json();
  if (!Array.isArray(payload.words)) throw new Error("Invalid word provider response");
  return payload.words.flatMap((entry, index) => {
    const { kana: reading, kanji } = entry.reading || {};
    if (!reading || !sameWord(query, kanji, reading)) return [];
    const senses = entry.senses || [];
    const pos = unique(senses.flatMap((s) => (s.pos || []).map((p) => typeof p === "string" ? p : Object.keys(p)[0]))).join(", ");
    return [{
      id: `jotoba-${kanji || reading}-${reading}-${index}`, word: kanji || reading, reading,
      meaning: unique(senses.flatMap((s) => s.glosses || [])).join("; "),
      partOfSpeech: pos, level: null, source: "Jotoba · unrated spelling",
      proper: /proper|name/i.test(pos) || isPlaceName(kanji || reading, senses.flatMap((s) => s.glosses || [])),
      nameAllowed: /place|person|given|surname/i.test(pos) || isPlaceName(kanji || reading, senses.flatMap((s) => s.glosses || [])), examples: []
    }];
  });
}

// Providers are tried in order; a provider error is only reported when no other provider found the word.
export function createWordFallback({ fetchImpl = fetch, enabled = process.env.WORD_API_FALLBACK !== "false" } = {}) {
  const cache = new Map();
  const pending = new Map();
  const failures = new Map();
  return async (query) => {
    if (!enabled) return [];
    const failed = failures.get(query);
    if (failed && failed.until > Date.now()) throw failed.error;
    if (cache.has(query)) return cache.get(query);
    if (pending.has(query)) return pending.get(query);
    if (pending.size >= 4) throw new Error("Word lookup is busy; please retry.");
    const work = (async () => {
      let items = [];
      let failure;
      for (const lookup of [jishoLookup, jotobaLookup]) {
        try { items = await lookup(fetchImpl, query); }
        catch (error) { failure ??= error; console.error("Shiritori word provider failed:", error.message); }
        if (items.length) break;
      }
      if (!items.length && failure) { failures.set(query, { error: failure, until: Date.now() + 30000 }); throw failure; }
      failures.delete(query);
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(query, items);
      return items;
    })();
    pending.set(query, work);
    try { return await work; } finally { pending.delete(query); }
  };
}

const katakanaOf = (text) => text.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
const wordPattern = /^[\p{Script=Han}ぁ-ゖァ-ヶー]+$/u;

// Conjugated verbs and adjectives are not dictionary headwords: analyse the surface form and look up its base.
async function inflectedForms(db, tags, query, segment = segmentText) {
  let tokens;
  try { tokens = (await segment(query)).filter((token) => token.type !== "space"); }
  catch (error) { console.error("Shiritori inflection analysis failed:", error); return []; }
  if (!tokens.length || tokens.length > 2 || tokens.some((token) => token.type !== "word" || !token.reading)) return [];
  const base = tokens.length === 1 ? tokens[0].base : tokens[1].base === "する" ? `${tokens[0].text}する` : "";
  if (!base || base === query) return [];
  const reading = tokens.map((token) => token.reading).join("");
  const byEntry = new Map();
  for (const entry of await findConjugationEntries(db, { query: base })) {
    if (entry.word !== base && kana(entry.reading) !== kana(base)) continue;
    if (!byEntry.has(entry.wordId)) byEntry.set(entry.wordId, {
      id: `jm-${entry.wordId}`, word: query, reading,
      meaning: `${entry.meanings.join("; ")} (conjugated form of ${entry.word})`,
      partOfSpeech: `${tags[entry.tag] || entry.tag}, conjugated form`,
      level: entry.level,
      proper: false, nameAllowed: false, source: "JMdict · conjugated form"
    });
  }
  return [...byEntry.values()];
}

export async function shiritoriWords(db, params, tags, fallback, segment = segmentText) {
  const rules = parseRules(JSON.parse(params.get("rules") || "{}"));
  const query = (params.get("q") || "").trim().normalize("NFKC");
  const previous = params.get("prev") ? JSON.parse(params.get("prev")) : null;
  const randomOpening = !query && !previous && params.get("random") === "1" && rules.mode !== "daily";
  const used = JSON.parse(params.get("used") || "[]");
  if (query.length > 60 || !Array.isArray(used) || used.length > 5000
      || used.some((id) => typeof id !== "string" || id.length > 100)
      || query && !wordPattern.test(query)
      || previous && (typeof previous !== "object" || [previous.word, previous.reading].some((v) => typeof v !== "string" || v.length > 60 || !wordPattern.test(v)))) throw new Error("Invalid word search.");
  const args = [];
  let where = "1=1";
  if (query) {
    const hira = kana(query);
    const kata = katakanaOf(hira);
    where = `(word = ? OR reading IN (?, ?) OR EXISTS (SELECT 1 FROM json_each(kanji_forms) WHERE json_extract(value, '$.text') = ?)
      OR EXISTS (SELECT 1 FROM json_each(kana_forms) WHERE json_extract(value, '$.text') IN (?, ?)))`;
    args.push(query, hira, kata, query, hira, kata);
  } else if (previous && !rules.voicing) {
    const options = startOptions(previous, rules);
    const clauses = [];
    if (options.kana.length) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(kana_forms) f, json_each(?) p WHERE instr(json_extract(f.value, '$.text'), p.value) = 1)");
      args.push(JSON.stringify(unique(options.kana.flatMap(({ text }) => [kana(text), katakanaOf(kana(text))]))));
    }
    if (options.kanji.length) {
      clauses.push("EXISTS (SELECT 1 FROM json_each(kanji_forms) f, json_each(?) p WHERE instr(json_extract(f.value, '$.text'), p.value) = 1)");
      args.push(JSON.stringify(options.kanji.map(({ text }) => text)));
    }
    where = clauses.length ? `(${clauses.join(" OR ")})` : "0=1";
  }
  if (!query) {
    const selected = selectedLevels(rules.level);
    if (!selected.includes("unrated")) {
      where += " AND id IN (SELECT word_id FROM vocabulary WHERE jlpt IN (SELECT value FROM json_each(?)))";
      args.push(JSON.stringify(selected));
    }
  }
  const items = [];
  const excluded = new Set(used);
  const seen = new Set();
  const seed = Math.floor(Math.random() * 2147483647);
  const order = randomOpening ? `is_common DESC, ((id * 1103515245 + ${seed}) & 2147483647), id` : "is_common DESC, id";
  pages: for (let page = 0; ; page++) {
    if (db.d1 && page >= 12) {
      if (items.length) break;
      const error = new Error("This selection is too broad to search right now. Try a different starting word.");
      error.status = 502;
      throw error;
    }
    const rows = await db.prepare(`SELECT * FROM words WHERE ${where} ORDER BY ${order} LIMIT 500 OFFSET ?`).all(...args, page * 500);
    if (!rows.length) break;
    const levels = await rowsByWordIds(db, rows.map((row) => row.id));
    for (const row of rows) {
    if (!query && excluded.has(`jm-${row.id}`)) continue;
    for (const word of dictionaryForms(row, tags, levels.get(row.id) ?? [])) {
      const key = `${word.word}:${word.reading}`;
      if (seen.has(key)) continue;
      if (query) {
        if (word.word !== query && kana(word.reading) !== kana(query)) continue;
      } else if (eligibility(word, rules) || !connects(word, previous, rules) || kana(word.reading).endsWith("ん")) continue;
      seen.add(key);
      items.push(word);
    }
    if (items.length >= (query ? 40 : 60)) break pages;
    }
    if (rows.length < 500) break;
  }
  if (query && !items.length) {
    items.push(...await inflectedForms(db, tags, query, segment));
    if (items.length) {
      await Promise.all(items.map(async (item) => { item.examples = await localExamples(db, { wordId: Number(item.id.slice(3)) }); }));
      return { items, fallback: false };
    }
  }
  if (query && !items.length) {
    try { return { items: await fallback(query), fallback: true }; }
    catch (error) {
      console.error("Shiritori word fallback failed:", error);
      const failure = new Error("The fallback dictionary could not be reached. Please retry; your word has not been rejected.");
      failure.status = 502;
      throw failure;
    }
  }
  if (query) await Promise.all(items.map(async (item) => { item.examples = await localExamples(db, { wordId: Number(item.id.slice(3)) }); }));
  return { items, fallback: false };
}
