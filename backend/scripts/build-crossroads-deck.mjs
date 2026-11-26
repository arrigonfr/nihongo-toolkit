import { DatabaseSync } from "node:sqlite";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const dbPath = fileURLToPath(new URL("../data/nihon.sqlite", import.meta.url));
const cataloguePath = fileURLToPath(new URL("../../frontend/kanji/catalogue.jsonl", import.meta.url));
const outPath = fileURLToPath(new URL("./study-decks/crossroads-generated.json", import.meta.url));

const HAN = /^\p{Script=Han}$/u;
const HIRA = /^[ぁ-ゖー]+$/u;
const TARGET = 1200;

// Load JLPT metadata for themes/difficulty
const kanjiJlpt = new Map();
const [, ...catRows] = readFileSync(cataloguePath, "utf8").trimEnd().split("\n");
for (const line of catRows) {
  const entry = JSON.parse(line);
  if (entry.character && entry.jlpt) kanjiJlpt.set(entry.character, entry.jlpt);
}

const db = new DatabaseSync(dbPath, { readOnly: true });
try {
  // Build in-memory pattern -> Set<char> index from word_forms (kind = 0)
  // matching the exact SQLite LIKE '_' semantics used by preview-games.test.js.
  const patternIndex = new Map();
  const addPattern = (pat, ch) => {
    let set = patternIndex.get(pat);
    if (!set) { set = new Set(); patternIndex.set(pat, set); }
    set.add(ch);
  };
  for (const { form } of db.prepare("SELECT DISTINCT form FROM word_forms WHERE kind = 0").all()) {
    const chars = [...form];
    if (chars.length < 2 || chars.length > 3) continue;
    for (let i = 0; i < chars.length; i++) {
      const pat = chars.slice(0, i).join("") + "_" + chars.slice(i + 1).join("");
      addPattern(pat, chars[i]);
    }
  }

  // Load common 2- and 3-kanji words with pure hiragana readings and clean meanings
  const wordRows = db.prepare("SELECT word, reading, meanings FROM words WHERE is_common = 1").all();
  const byKanji = new Map();
  const seenSpelling = new Set();
  const allKanji = new Set();

  for (const row of wordRows) {
    const chars = [...row.word];
    if (chars.length < 2 || chars.length > 3) continue;
    if (!chars.every(c => HAN.test(c))) continue;
    if (!HIRA.test(row.reading)) continue;
    if (seenSpelling.has(row.word)) continue;
    const meanings = JSON.parse(row.meanings);
    const meaning = (meanings[0] || "").trim();
    if (!meaning || meaning.length > 60) continue;
    seenSpelling.add(row.word);

    for (let gap = 0; gap < chars.length; gap++) {
      const ch = chars[gap];
      // Require the shared kanji to appear only once in this compound
      if (chars.indexOf(ch) !== chars.lastIndexOf(ch)) continue;
      allKanji.add(ch);
      const pat = chars.slice(0, gap).join("") + "_" + chars.slice(gap + 1).join("");
      let list = byKanji.get(ch);
      if (!list) { list = []; byKanji.set(ch, list); }
      list.push({ spelling: row.word, reading: row.reading, meaning, gap, pat });
    }
  }

  // Deterministic PRNG for bank shuffling & distractor selection
  let seed = 20261126;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };

  // Sort kanji: JLPT N5 -> N4 -> N3 -> N2 -> N1 -> other, then by codepoint
  const jlptRank = ch => {
    const j = kanjiJlpt.get(ch);
    return j ? 6 - j : 99; // N5=1, N4=2, N3=3, N2=4, N1=5
  };
  const sortedKanji = [...byKanji.keys()].sort((a, b) => jlptRank(a) - jlptRank(b) || a.codePointAt(0) - b.codePointAt(0));
  const fallbackPool = sortedKanji.filter(c => jlptRank(c) <= 4);

  const generated = [];
  const usedTriples = new Set();

  function pickBank(target, sets, intersection) {
    const blocked = new Set(intersection);
    const plausible = new Set();
    for (const set of sets) {
      for (const ch of set) {
        if (!blocked.has(ch) && HAN.test(ch)) plausible.add(ch);
      }
    }
    const candidates = [...plausible];
    const bank = [target];
    while (bank.length < 4 && candidates.length) {
      const idx = Math.floor(rand() * candidates.length);
      const [pick] = candidates.splice(idx, 1);
      if (!bank.includes(pick)) bank.push(pick);
    }
    let guard = 0;
    while (bank.length < 4 && guard++ < 200) {
      const pick = fallbackPool[Math.floor(rand() * fallbackPool.length)];
      if (!blocked.has(pick) && !bank.includes(pick)) bank.push(pick);
    }
    // Deterministic shuffle of bank
    for (let i = bank.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [bank[i], bank[j]] = [bank[j], bank[i]];
    }
    return bank.join("");
  }

  const themeFor = ch => {
    const j = kanjiJlpt.get(ch);
    if (j === 5) return ["Everyday kanji · N5", "Everyday"];
    if (j === 4) return ["Everyday kanji · N4", "Everyday"];
    if (j === 3) return ["Intermediate kanji · N3", "Intermediate"];
    if (j === 2) return ["Intermediate kanji · N2", "Intermediate"];
    if (j === 1) return ["Advanced kanji · N1", "Advanced"];
    return ["Common kanji compounds", "Intermediate"];
  };

  // Multi-pass over kanji so we get broad kanji diversity before taking additional triples per kanji
  for (let pass = 0; pass < 6 && generated.length < TARGET; pass++) {
    for (const ch of sortedKanji) {
      if (generated.length >= TARGET) break;
      const list = byKanji.get(ch);
      if (!list || list.length < 3) continue;

      // Deterministic rotated slice so different passes pick different compound triples
      const offset = (pass * 3) % list.length;
      const rotated = [...list.slice(offset), ...list.slice(0, offset)];
      let picked = null;
      const maxScan = Math.min(rotated.length, 18);
      outer: for (let i = 0; i < maxScan; i++) {
        for (let j = i + 1; j < maxScan; j++) {
          if (rotated[i].pat === rotated[j].pat) continue;
          for (let k = j + 1; k < maxScan; k++) {
            const a = rotated[i], b = rotated[j], c = rotated[k];
            if (a.pat === c.pat || b.pat === c.pat) continue;
            const key = [a.spelling, b.spelling, c.spelling].sort().join("|");
            if (usedTriples.has(key)) continue;
            const sa = patternIndex.get(a.pat), sb = patternIndex.get(b.pat), sc = patternIndex.get(c.pat);
            if (!sa || !sb || !sc) continue;
            const inter = [...sa].filter(x => sb.has(x) && sc.has(x));
            if (!inter.includes(ch)) continue;
            if (inter.length > 2) continue;
            // Prefer strictly unique intersection ([ch]) on early passes
            if (pass < 4 && inter.length !== 1) continue;
            usedTriples.add(key);
            picked = { triple: [a, b, c], sets: [sa, sb, sc], inter };
            break outer;
          }
        }
      }
      if (!picked) continue;
      const [theme, difficulty] = themeFor(ch);
      const alts = picked.inter.filter(x => x !== ch);
      const bank = pickBank(ch, picked.sets, picked.inter);
      const id = `auto-${ch.codePointAt(0).toString(16)}-${pass + 1}`;
      generated.push([
        id,
        ch,
        theme,
        bank,
        picked.triple.map(t => [t.spelling, t.reading, t.meaning]),
        alts,
        difficulty
      ]);
    }
  }

  writeFileSync(outPath, JSON.stringify(generated));
  console.log(`Generated ${generated.length} verified Kanji Anaume puzzles -> ${outPath}`);
} finally {
  db.close();
}
