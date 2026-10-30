import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { createDatabase } from "../src/database.js";
import { insertWords, insertVocabulary } from "../scripts/import-data.js";
import { createHandler } from "../src/app.js";
import { DEFAULT_RULES, READING_ENDING_RULE, kana, morae, requiredStart, startOptions, startChoices, connection, connects, matchesCategory, eligibility, wordEndingError, validateWord, scoreWord, parseRules, assistAllowed } from "../src/shiritori-rules.js";
import { dictionaryForms, createWordFallback, shiritoriWords } from "../src/shiritori.js";

const word = (reading, extra = {}) => ({ id: reading, word: reading, reading, meaning: "word", partOfSpeech: "noun", level: 5, ...extra });
const rules = (extra = {}) => parseRules({ ...DEFAULT_RULES, ...extra });

test("kana equivalence, halfwidth normalization, morae and prohibited wo", () => {
  assert.equal(kana("ｺｰﾋｰ"), "こーひー");
  assert.equal(kana("リンゴ"), "りんご");
  for (const [text, count] of [["きゃく", 2], ["がっこう", 4], ["コーヒー", 4], ["ティー", 2], ["しゃしん", 3], ["きょ", 1], ["パン", 2]]) assert.equal(morae(text), count, text);
  assert.match(eligibility(word("ヲタク"), rules()), /cannot be used/);
  assert.match(eligibility(word("を"), rules()), /cannot be used/);
  assert.equal(connects(word("ゴリラ"), word("りんご"), rules()), true);
});
test("syllable overlaps: last syllables, kanji compounds, small kana and long vowels", () => {
  const ok = (answer, previous, extra = {}) => connects(word(answer, extra.spelling ? { word: extra.spelling } : {}), previous, rules(extra.rules));
  const keiko = word("けいこ");
  assert.equal(ok("こころ", keiko), true);
  assert.equal(ok("いこく", keiko), true);
  assert.equal(ok("けいこく", keiko), false, "cannot restart the complete previous word");
  assert.equal(ok("こ", keiko), false, "answer must be longer than the overlap");
  assert.equal(requiredStart(word("もみ"), rules()), "み");
  assert.deepEqual(startChoices(word("りんご"), rules()), ["ご", "んご"].filter((t) => !t.startsWith("ん")));
  assert.equal(requiredStart(word("しょ"), rules()), "しょ");
  assert.equal(ok("しょうぎ", word("きしょ")), true);
  assert.equal(ok("しあい", word("きしょ")), false, "small kana is not normalized");
  assert.equal(requiredStart(word("でんしゃ"), rules()), "しゃ");
  assert.equal(requiredStart(word("コーヒー"), rules()), "ひー");
  assert.equal(ok("ヒーロー", word("コーヒー")), true);
  assert.equal(ok("ひま", word("コーヒー")), false);
  assert.equal(ok("かめ", word("さが")), false);
  assert.equal(ok("かめ", word("さが"), { rules: { voicing: true } }), true);
  const school = word("がっこう", { word: "学校" });
  assert.equal(requiredStart(school, rules({ mode: "kanji" })), "校");
  assert.equal(connects(word("こうてい", { word: "校庭" }), school, rules({ mode: "kanji" })), true);
  assert.equal(connects(word("うみ", { word: "海" }), school, rules({ mode: "kanji" })), false);
  const compound = word("ことばあそび", { word: "言葉遊び" });
  assert.deepEqual(startChoices(compound, rules({ mode: "kanji" })), ["遊", "葉遊", "遊び", "葉遊び"]);
  assert.equal(connects(word("あそびば", { word: "遊び場" }), compound, rules({ mode: "kanji" })), true);
  assert.equal(connection(word("いこく"), keiko, rules()).size, 2);
  const vu = word("ゔ");
  assert.equal(connects(word("ヴィンテージ"), word("ぷろゔ"), rules()), true, "ヴ may start ヴィ words");
  assert.equal(connects(word("ヴィールス"), word("ぷろヴ"), rules()), true);
  assert.equal(connects(word("ウイスキー"), word("ぷろヴ"), rules({ voicing: true })), true, "ウ matches ヴ when voicing is lenient");
  assert.equal(connects(word("てぃあ"), word("かて"), rules()), false);
});
test("validation distinguishes connection, repeated entries, vocabulary and both n endings", () => {
  const apple = word("りんご");
  assert.equal(validateWord(word("ごりら"), apple, [apple], rules()).ok, true);
  assert.equal(validateWord(word("らっぱ"), apple, [apple], rules()).reason, "invalid connection");
  assert.equal(validateWord(apple, word("とり"), [apple], rules()).reason, "word already used");
  assert.equal(validateWord(word("リンゴ", { id: apple.id }), word("とり"), [apple], rules()).reason, "word already used");
  for (const ending of ["ぱん", "パン"]) {
    const result = validateWord(word(ending), word("らっぱ"), [], rules());
    assert.equal(result.ok, false);
    assert.match(result.message, /ん \/ ン/);
  }
  assert.match(validateWord(word("ながいなまえ"), null, [], rules({ mode: "beginner" })).message, /up to 4 morae/);
});
test("Kana entry rejects forbidden endings in either script and half-width katakana", () => {
  const kanaRules = rules({ entry: "kana" });
  for (const reading of ["ぱん", "パン", "ﾊﾟﾝ", "を", "ヲ", "ｦ", "こーひー", "コーヒー", "ｺｰﾋｰ"]) {
    assert.equal(wordEndingError(reading, kanaRules), READING_ENDING_RULE, reading);
    assert.equal(eligibility(word(reading), kanaRules), READING_ENDING_RULE, reading);
    assert.deepEqual(validateWord(word(reading), null, [], kanaRules),
      { ok: false, reason: "vocabulary rule", message: READING_ENDING_RULE });
  }
  for (const reading of ["ケーキ", "ｹｰｷ", "ゴール", "しんよう", "コーヒーカップ"]) {
    assert.equal(wordEndingError(reading, kanaRules), "", reading);
    assert.equal(eligibility(word(reading), kanaRules), "", "Only terminal characters trigger the ending rule");
  }
  assert.match(eligibility(word("ヲタク"), kanaRules), /cannot be used/, "Existing wo restrictions still apply within words");
});
test("Kanji entry and Kanji Shiritori validate the reading rather than the spelling", () => {
  for (const settings of [{ entry: "kanji" }, { mode: "kanji", entry: "both" }]) {
    const kanjiRules = rules(settings);
    for (const reading of ["かん", "カン", "ｶﾝ", "かを", "カヲ", "ｶｦ", "かー", "カー", "ｶｰ"]) {
      const item = word(reading, { word: "漢字" });
      assert.equal(eligibility(item, kanjiRules), READING_ENDING_RULE, reading);
      assert.deepEqual(validateWord(item, null, [], kanjiRules),
        { ok: false, reason: "vocabulary rule", message: READING_ENDING_RULE });
    }
    assert.equal(eligibility(word("コーヒー", { word: "珈琲" }), kanjiRules), READING_ENDING_RULE);
    assert.equal(eligibility(word("こうもん", { word: "校門" }), kanjiRules), READING_ENDING_RULE);
    assert.equal(validateWord(word("こうてい", { word: "校庭" }), word("がっこう", { word: "学校" }), [], kanjiRules).ok, true);
  }
});
test("the reading ending rule preserves ordinary Both and fixed Daily behavior", () => {
  const coffee = word("こーひー", { word: "珈琲" });
  assert.equal(eligibility(coffee, rules({ entry: "both" })), "");
  assert.match(eligibility(word("ほん", { word: "本" }), rules({ entry: "both" })), /ん \/ ン/);
  assert.equal(validateWord(word("ヒーロー"), word("コーヒー"), [], rules({ entry: "both" })).ok, true);
  const daily = rules({ entry: "kana", mode: "daily" });
  assert.equal(daily.entry, DEFAULT_RULES.entry);
  assert.equal(eligibility(word("コーヒー"), daily), "");
});
test("JLPT, category, proper nouns, part of speech and mora filters", () => {
  assert.equal(eligibility(word("ねこ", { meaning: "cat" }), rules({ level: "N5-N4", category: "animals" })), "");
  assert.match(eligibility(word("ねこ", { level: 1 }), rules({ level: "N5-N4" })), /Outside JLPT/);
  assert.match(eligibility(word("ねこ", { level: null }), rules({ level: "N5-N1" })), /unrated/);
  assert.equal(eligibility(word("ねこ", { level: null }), rules()), "");
  assert.equal(matchesCategory(word("ぎゅうにゅう", { meaning: "(cow's) milk" }), "animals"), false);
  assert.equal(matchesCategory(word("おぼえる", { meaning: "to bear in mind", partOfSpeech: "verb" }), "animals"), false);
  assert.equal(matchesCategory(word("りんご", { meaning: "apple (fruit)" }), "food"), true);
  assert.equal(matchesCategory(word("タクシー"), "katakana"), true);
  assert.equal(matchesCategory(word("たくしー"), "katakana"), false);
  assert.match(eligibility(word("とうきょう", { proper: true, nameAllowed: true }), rules()), /Proper nouns/);
  assert.equal(eligibility(word("とうきょう", { proper: true, nameAllowed: true }), rules({ proper: "names" })), "");
  assert.match(eligibility(word("あるく", { partOfSpeech: "Godan verb" }), rules({ wordType: "nouns" })), /part of speech/);
  assert.equal(eligibility(word("あるく", { partOfSpeech: "Godan verb" }), rules({ wordType: "verbs" })), "");
  assert.equal(eligibility(word("あかい", { partOfSpeech: "adjective" }), rules({ wordType: "adjectives" })), "");
});
test("scoring uses true level metadata, optional overlap, bonus kana and marathon points", () => {
  assert.equal(scoreWord(word("らっぱ"), null, rules()).base, 10);
  assert.equal(scoreWord(word("らっぱ", { level: 1 }), null, rules()).base, 50);
  assert.equal(scoreWord(word("らっぱ", { level: null }), null, rules()).base, 10);
  const answer = word("ここころ");
  const previous = word("こここ");
  assert.equal(validateWord(answer, previous, [], rules()).ok, true);
  const points = scoreWord(answer, previous, rules(), "ろ");
  assert.equal(points.overlapBonus, 5);
  assert.equal(points.kanaBonus, 15);
  assert.equal(points.total, 30);
  assert.equal(scoreWord(answer, previous, rules({ bonus: false }), "ろ").total, 10);
  assert.equal(scoreWord(word("からす"), null, rules({ mode: "marathon" })).total, 15);
});
test("presets and malformed rules are explicit rather than silently relaxed", () => {
  assert.equal(rules().voicing, false);
  assert.equal(rules({ mode: "relaxed", hints: "disabled" }).hints, "unlimited");
  assert.equal(rules({ mode: "katakana" }).category, "katakana");
  assert.throws(() => rules({ mode: "kanji", entry: "kana" }), /Kanji chains/);
  assert.equal(rules({ mode: "daily" }).hints, "disabled");
  for (const bad of [null, [], { level: "N6" }, { mode: "category" }, { voicing: "yes" }]) {
    assert.throws(() => parseRules(bad));
  }
});

test("reveal limit is validated, defaulted and enforced per player", () => {
  assert.equal(rules().revealLimit, 3);
  assert.equal(rules({ revealLimit: 0 }).revealLimit, 0);
  for (const bad of [-1, 31, 1.5, "2"]) assert.throws(() => parseRules({ revealLimit: bad }), /revealLimit/);
  const limited = rules({ revealLimit: 2 });
  assert.equal(assistAllowed(limited, { reveals: 1 }, "reveal"), true);
  assert.equal(assistAllowed(limited, { reveals: 2 }, "reveal"), false);
  assert.equal(assistAllowed(rules({ reveal: false }), { reveals: 0 }, "reveal"), false);
  assert.equal(assistAllowed(rules({ mode: "daily" }), { reveals: 0 }, "reveal"), false);
  assert.equal(assistAllowed(rules({ hintLimit: 1 }), { hints: 1 }, "hint"), false);
  assert.equal(assistAllowed(rules({ hints: "unlimited" }), { hints: 99 }, "hint"), true);
});

function fixture() {
  const db = createDatabase(":memory:");
  const words = [
    ["林檎", "りんご", "apple", "n"], ["ゴリラ", "ゴリラ", "gorilla", "n"], ["ラッパ", "ラッパ", "trumpet", "n"],
    ["パン", "パン", "bread", "n"], ["学校", "がっこう", "school", "n"], ["校庭", "こうてい", "schoolyard", "n"],
    ["猫", "ねこ", "cat", "n"], ["飲む", "のむ", "to drink", "v5m"], ["東京", "とうきょう", "Tokyo", "n-pr"],
    ["ライター", "ライター", "lighter", "n"], ["コーヒー", "コーヒー", "coffee", "n"],
    ["ケーキ", "ケーキ", "cake", "n"], ["を", "を", "object marker", "prt"],
    ["珈琲", "コーヒー", "coffee", "n"], ["校門", "こうもん", "school gate", "n"]
  ];
  insertWords(db, { tags: { n: "noun", v5m: "Godan verb", "n-pr": "proper noun" }, words: words.map(([spelling, reading, meaning, pos], i) => ({
    id: String(i + 1), kanji: [{ text: spelling, common: true, tags: [] }],
    kana: [{ text: reading, common: true, tags: [], appliesToKanji: ["*"] }],
    sense: [{ gloss: [{ lang: "eng", text: meaning }], partOfSpeech: [pos], misc: [], field: [], dialect: [], appliesToKanji: ["*"], appliesToKana: ["*"], related: [], antonym: [], info: [] }]
  })) });
  insertVocabulary(db, words.map(([spelling, reading, meaning], i) => ({
    id: `v${i}`, jmdict_id: i + 1, word: spelling, reading, romaji: "", meanings: [meaning], level: "N5", examples: []
  })));
  return db;
}
test("random opening pools span the dictionary, honor exclusions and leave Daily deterministic", async () => {
  const db = createDatabase(":memory:");
  insertWords(db, { tags: { n: "noun" }, words: Array.from({ length: 180 }, (_, i) => ({
    id: String(i + 1), kanji: [{ text: String.fromCodePoint(0x4e00 + i), common: true, tags: [] }],
    kana: [{ text: "かき", common: true, tags: [], appliesToKanji: ["*"] }],
    sense: [{ gloss: [{ lang: "eng", text: "test noun" }], partOfSpeech: ["n"], misc: [], field: [], dialect: [],
      appliesToKanji: ["*"], appliesToKana: ["*"], related: [], antonym: [], info: [] }]
  })) });
  insertVocabulary(db, Array.from({ length: 180 }, (_, i) => ({
    id: `v${i}`, jmdict_id: i + 1, word: String.fromCodePoint(0x4e00 + i), reading: "かき",
    romaji: "kaki", meanings: ["test noun"], level: "N5", examples: []
  })));
  try {
    const seen = new Set();
    const params = new URLSearchParams({ random: "1", used: '["jm-1"]' });
    for (let i = 0; i < 6; i++) {
      const { items } = await shiritoriWords(db, params, { n: "noun" }, async () => []);
      assert.equal(items.length, 60);
      assert.ok(items.every((item) => item.id !== "jm-1"));
      items.forEach((item) => seen.add(item.id));
    }
    assert.ok(seen.size > 100, `Expected a broad pool, got ${seen.size} distinct entries`);
    const daily = new URLSearchParams({ random: "1", rules: '{"mode":"daily"}' });
    const dailyPool = await shiritoriWords(db, daily, { n: "noun" }, async () => []);
    assert.equal(dailyPool.items.length, 60);
    assert.deepEqual(dailyPool,
      await shiritoriWords(db, daily, { n: "noun" }, async () => []));
  } finally { db.close(); }
});
test("candidate endpoint respects filters, exact matches, exclusions and fallback errors", async () => {
  const db = fixture();
  let called = 0;
  const server = createServer(createHandler({ database: db, wordFallback: async (query) => {
    called++;
    if (query === "えらー") throw new Error("Offline");
    return [word(query, { source: "test fallback" })];
  } }));
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const get = (params) => fetch(`http://127.0.0.1:${server.address().port}/api/shiritori/words?${new URLSearchParams(params)}`);
  try {
    const cats = await (await get({ rules: JSON.stringify({ category: "animals", level: "N5" }) })).json();
    assert.deepEqual(cats.items.map((w) => w.word), ["ゴリラ", "猫"]);
    assert.equal(cats.items[0].level, 5);
    const continuation = await (await get({ prev: JSON.stringify({ word: "林檎", reading: "りんご" }) })).json();
    assert.deepEqual(continuation.items.map((w) => w.word), ["ゴリラ"]);
    const excluded = await (await get({ prev: JSON.stringify({ word: "林檎", reading: "りんご" }), used: JSON.stringify([continuation.items[0].id]) })).json();
    assert.deepEqual(excluded.items, []);
    assert.deepEqual((await (await get({ prev: JSON.stringify({ word: "ラッパ", reading: "ラッパ" }) })).json()).items, [], "N-ending words are not bot/hint candidates");
    const pan = await (await get({ q: "ぱん" })).json();
    assert.equal(pan.items[0].word, "パン", "N-ending submissions remain inspectable");
    assert.equal(called, 0);
    const conjugated = await (await get({ q: "のみました" })).json();
    assert.equal(conjugated.fallback, false);
    assert.equal(conjugated.items[0].word, "のみました");
    assert.equal(conjugated.items[0].reading, "のみました");
    assert.equal(conjugated.items[0].id, "jm-8");
    assert.match(conjugated.items[0].meaning, /conjugated form of 飲む/);
    assert.equal((await (await get({ q: "りんご" })).json()).items[0].word, "林檎");
    assert.equal((await (await get({ q: "りん" })).json()).fallback, true, "Substring/deinflected matches cannot become valid exact words");
    assert.equal(called, 1);
    assert.equal((await get({ q: "えらー" })).status, 502);
    assert.equal((await get({ rules: "null" })).status, 400);
    assert.equal((await get({ rules: '{"level":"N0"}' })).status, 400);
    assert.equal((await get({ used: "[1]" })).status, 400);
    assert.equal((await get({ prev: JSON.stringify({ word: "%", reading: "%" }) })).status, 400);
    const kanji = await (await get({ prev: JSON.stringify({ word: "学校", reading: "がっこう" }), rules: JSON.stringify({ mode: "kanji", entry: "both" }) })).json();
    assert.deepEqual(kanji.items.map((w) => w.word), ["校庭"]);
  } finally { server.close(); await once(server, "close"); db.close(); }
});
test("ru continuations respect selected JLPT levels and used words", async () => {
  const db = createDatabase(":memory:");
  const entries = [["留守", "るす", "absence", "N4"], ["ルール", "ルール", "rule", "N1"]];
  insertWords(db, { tags: { n: "noun" }, words: entries.map(([spelling, reading, meaning], index) => ({
    id: String(100 + index), kanji: [{ text: spelling, common: true, tags: [] }],
    kana: [{ text: reading, common: true, tags: [], appliesToKanji: ["*"] }],
    sense: [{ gloss: [{ lang: "eng", text: meaning }], partOfSpeech: ["n"], misc: [], field: [], dialect: [], appliesToKanji: ["*"], appliesToKana: ["*"], related: [], antonym: [], info: [] }]
  })) });
  insertVocabulary(db, entries.map(([spelling, reading, meaning, level], index) => ({
    id: `ru${index}`, jmdict_id: 100 + index, word: spelling, reading, romaji: "", meanings: [meaning], level, examples: []
  })));
  try {
    const params = new URLSearchParams({ prev: JSON.stringify({ word: "猿", reading: "さる" }), rules: JSON.stringify({ level: "N5-N3" }) });
    const search = () => shiritoriWords(db, params, { n: "noun" }, async () => []);
    const candidates = (await search()).items;
    assert.deepEqual(candidates.map((item) => item.word), ["留守"]);
    params.set("used", JSON.stringify([candidates[0].id]));
    assert.deepEqual((await search()).items, []);
    params.set("rules", JSON.stringify({ level: "all" }));
    assert.deepEqual((await search()).items.map((item) => item.word), ["ルール"]);
  } finally { db.close(); }
});
test("Kana opening and continuation pools exclude every forbidden ending but exact lookups remain inspectable", async () => {
  const db = fixture(), kanaRules = rules({ entry: "kana" });
  const query = (params) => shiritoriWords(db, new URLSearchParams({
    rules: JSON.stringify(kanaRules), ...params
  }), { n: "noun", prt: "particle" }, async () => []);
  try {
    const opening = await query({});
    assert.ok(opening.items.length > 0);
    assert.ok(opening.items.every((item) => !/[んをー]$/.test(kana(item.reading))));
    assert.ok(opening.items.some((item) => item.word === "ケーキ"), "Internal long vowels remain playable");
    const previous = JSON.stringify({ word: "ゴリラ", reading: "ごりら" });
    assert.deepEqual((await query({ prev: previous })).items.map((item) => item.word), ["ラッパ"]);
    const both = await query({ prev: previous, rules: JSON.stringify(rules({ entry: "both" })) });
    assert.ok(both.items.some((item) => item.word === "ライター"), "Both entry keeps final long vowels");
    for (const q of ["パン", "を", "ｺｰﾋｰ"]) {
      const found = await query({ q });
      assert.ok(found.items.length > 0, "Exact lookups retain evidence for validation and explanations");
      assert.ok(found.items.every((item) => eligibility(item, kanaRules) === READING_ENDING_RULE));
    }
  } finally { db.close(); }
});
test("Kanji candidate pools filter pronunciation endings while exact kanji lookups explain rejection", async () => {
  const db = fixture();
  try {
    for (const settings of [{ entry: "kanji" }, { mode: "kanji", entry: "both" }]) {
      const kanjiRules = rules(settings);
      const query = (params) => shiritoriWords(db, new URLSearchParams({
        rules: JSON.stringify(kanjiRules), ...params
      }), { n: "noun" }, async () => []);
      const opening = await query({});
      assert.ok(opening.items.length > 0);
      assert.ok(opening.items.every((item) => !/[んをー]$/.test(kana(item.reading))));
      const continuation = await query({ prev: JSON.stringify({ word: "学校", reading: "がっこう" }) });
      assert.deepEqual(continuation.items.map((item) => item.word), ["校庭"], "校門 is excluded because its reading ends in ん");
      for (const q of ["珈琲", "校門"]) {
        const found = await query({ q });
        assert.ok(found.items.length > 0);
        assert.ok(found.items.every((item) => eligibility(item, kanjiRules) === READING_ENDING_RULE));
      }
    }
  } finally { db.close(); }
});
test("dictionary forms preserve reading restrictions and do not assign JLPT to unrelated forms", () => {
  const row = {
    id: 1, kanji_forms: JSON.stringify([{ text: "生" }, { text: "姓" }]),
    kana_forms: JSON.stringify([{ text: "せい", appliesToKanji: ["*"] }, { text: "なま", appliesToKanji: ["生"] }]),
    senses: JSON.stringify([
      { appliesToKanji: ["生"], appliesToKana: ["なま"], partOfSpeech: ["n"], misc: [], gloss: [{ lang: "eng", text: "raw" }] },
      { appliesToKanji: ["姓"], appliesToKana: ["せい"], partOfSpeech: ["n"], misc: [], gloss: [{ lang: "eng", text: "surname" }] }
    ])
  };
  const forms = dictionaryForms(row, { n: "noun" }, [{ word: "生", reading: "なま", jlpt: 5 }]);
  assert.equal(forms.find((w) => w.word === "生" && w.reading === "なま").level, 5);
  assert.equal(forms.find((w) => w.word === "姓").level, null);
  assert.equal(forms.find((w) => w.word === "姓").meaning, "surname");
  assert.ok(!forms.some((w) => w.word === "姓" && w.reading === "なま"));
});
test("rated kana spellings remain playable without rating unrelated homographs", async () => {
  const db = createDatabase(":memory:");
  const entries = [["為る", "to do"], ["刷る", "to print"]];
  insertWords(db, { tags: { v: "verb" }, words: entries.map(([spelling, meaning], index) => ({
    id: String(index + 1), kanji: [{ text: spelling, common: true, tags: [] }],
    kana: [{ text: "する", common: true, tags: [], appliesToKanji: ["*"] }],
    sense: [{ gloss: [{ lang: "eng", text: meaning }], partOfSpeech: ["v"], misc: [], field: [], dialect: [], appliesToKanji: [spelling], appliesToKana: ["*"] , related: [], antonym: [], info: [] }]
  })) });
  insertVocabulary(db, [
    { id: "suru", jmdict_id: 1, word: "する", reading: "する", romaji: "suru", meanings: ["to do"], level: "N5", examples: [] },
    { id: "suru-print", jmdict_id: 2, word: "刷る", reading: "する", romaji: "suru", meanings: ["to print"], level: "N2", examples: [] }
  ]);
  try {
    const lookup = await shiritoriWords(db, new URLSearchParams({ q: "する" }), { v: "verb" }, async () => []);
    const rated = lookup.items.find((item) => item.word === "する");
    assert.equal(rated.level, 5);
    assert.equal(rated.meaning, "to do");
    assert.equal(lookup.items.find((item) => item.word === "刷る").level, 2);
    assert.equal(lookup.items.find((item) => item.word === "為る").level, null);
    const params = new URLSearchParams({ prev: JSON.stringify({ word: "椅子", reading: "いす" }), rules: JSON.stringify({ level: "N5" }) });
    assert.deepEqual((await shiritoriWords(db, params, { v: "verb" }, async () => [])).items.map((item) => item.word), ["する"]);
  } finally { db.close(); }
});
test("fallback accepts only exact reading/spelling and surfaces malformed providers", async () => {
  let calls = 0;
  const fallback = createWordFallback({ fetchImpl: async () => {
    calls++;
    return { ok: true, json: async () => ({ data: [
      { slug: "cat", japanese: [{ word: "猫", reading: "ねこ" }], senses: [{ english_definitions: ["cat"], parts_of_speech: ["Noun"] }] },
      { slug: "kitten", japanese: [{ word: "子猫", reading: "こねこ" }], senses: [{ english_definitions: ["kitten"], parts_of_speech: ["Noun"] }] }
    ] }) };
  } });
  assert.equal((await fallback("ネコ")).length, 1);
  assert.equal((await fallback("ネコ"))[0].word, "猫");
  assert.equal(calls, 1);
  const second = createWordFallback({ fetchImpl: async (url) => String(url).includes("jisho")
    ? { ok: false, status: 403 }
    : { ok: true, json: async () => ({ words: [{ reading: { kana: "ヴァイオリン", kanji: null }, senses: [{ glosses: ["violin"], pos: [{ Noun: "Normal" }] }] }] }) } });
  const found = await second("ヴァイオリン");
  assert.equal(found[0].reading, "ヴァイオリン");
  assert.match(found[0].source, /Jotoba/);
  assert.deepEqual(await createWordFallback({ enabled: false })("ねこ"), []);
  await assert.rejects(createWordFallback({ fetchImpl: async () => ({ ok: false, status: 503 }) })("ねこ"), /503/);
  await assert.rejects(createWordFallback({ fetchImpl: async () => ({ ok: true, json: async () => ({}) }) })("ねこ"), /Invalid/);
});

test("kanji mode: the repeater 々 cannot end a word or start a chain link", () => {
  const kanjiRules = rules({ mode: "kanji" });
  assert.match(eligibility(word("人々", { reading: "ひとびと" }), kanjiRules), /repeater/);
  assert.deepEqual(startOptions(word("日々", { reading: "ひび" }), kanjiRules).kanji, []);
  assert.deepEqual(startOptions(word("食べ物", { reading: "たべもの" }), kanjiRules).kanji.map((o) => o.text), ["物"]);
  assert.deepEqual(startOptions(word("鳥", { reading: "とり" }), kanjiRules).kanji, []);
  assert.match(eligibility(word("鳥", { reading: "とり" }), kanjiRules), /two or more|need words/);
  assert.match(eligibility(word("食べ物", { reading: "たべもの" }), kanjiRules), /entirely in kanji/);
  assert.deepEqual(startOptions(word("国々", { reading: "くにぐに" }), kanjiRules).kanji, []);
});

test("kanji entry connects by spelling, not pronunciation", () => {
  const entryRules = rules({ entry: "kanji" });
  assert.equal(connects(word("桜", { reading: "さくら" }), word("原作", { reading: "げんさく" }), entryRules), false);
  assert.equal(connects(word("作家", { reading: "さっか" }), word("原作", { reading: "げんさく" }), entryRules), true);
});
