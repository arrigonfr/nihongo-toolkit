import { existsSync, readFileSync } from "node:fs";
import { createDatabase, databasePath, openDatabase } from "../../src/database.js";
import { insertKanjis, insertWords, insertVocabulary } from "../../scripts/import-data.js";

// 105+ distinct CJK characters used to build a deterministic in-memory database
// when the local imported SQLite database is absent (e.g. in CI).
const FIXTURE_KANJI = [
  { ch: "日", on: ["ニチ", "ジツ"], kun: ["ひ", "か"], meanings: ["day", "sun", "Japan"], jlpt: 5 },
  { ch: "本", on: ["ホン"], kun: ["もと"], meanings: ["book", "origin"], jlpt: 5 },
  { ch: "読", on: ["ドク"], kun: ["よ.む"], meanings: ["read"], jlpt: 5 },
  { ch: "食", on: ["ショク"], kun: ["た.べる"], meanings: ["eat", "food"], jlpt: 5 },
  { ch: "猫", on: ["ビョウ"], kun: ["ねこ"], meanings: ["cat"], jlpt: 5 },
  { ch: "学", on: ["ガク"], kun: ["まな.ぶ"], meanings: ["study", "learning"], jlpt: 5 },
  { ch: "校", on: ["コウ"], kun: ["かせ"], meanings: ["school"], jlpt: 5 },
  { ch: "語", on: ["ゴ"], kun: ["かた.る"], meanings: ["language", "word"], jlpt: 5 },
  { ch: "言", on: ["ゲン", "ゴン"], kun: ["い.う"], meanings: ["say", "word"], jlpt: 4 },
  { ch: "私", on: ["シ"], kun: ["わたし"], meanings: ["private", "I"], jlpt: 4 },
  { ch: "行", on: ["コウ"], kun: ["い.く"], meanings: ["go"], jlpt: 5 },
  { ch: "高", on: ["コウ"], kun: ["たか.い"], meanings: ["tall", "high"], jlpt: 5 },
  { ch: "元", on: ["ゲン"], kun: ["もと"], meanings: ["origin", "beginning"], jlpt: 4 },
  { ch: "気", on: ["キ"], kun: ["いき"], meanings: ["spirit", "mind"], jlpt: 5 },
  { ch: "木", on: ["モク"], kun: ["き"], meanings: ["tree", "wood"], jlpt: 5 }
];

const EXTRA_CHARS =
  "一二三四五六七八九十百千万上下左右中大小月火水金土山川田人男女子供父母兄姉妹友先生時分年半今昨日週年見聞書話買売飲作使待持知思帰来出入社店駅電道車花草鳥魚犬虫雨雪風雲空海森林村町都市国世界東西南北春夏秋冬朝昼夜白黒赤青黄緑茶色新古長短広狭遠近早遅強弱明暗重軽多";

export function createFixtureDatabase() {
  const db = createDatabase(":memory:");
  const seen = new Set(FIXTURE_KANJI.map((item) => item.ch));
  const extra = [...new Set(EXTRA_CHARS)].filter((ch) => !seen.has(ch)).slice(0, 95);
  const jlptCycle = [1, 2, 3, 4, 5, null];

  const entries = [
    ...FIXTURE_KANJI,
    ...extra.map((ch, index) => ({
      ch,
      on: ["オン"],
      kun: ["くん"],
      meanings: [`meaning ${index + 1}`],
      jlpt: jlptCycle[index % jlptCycle.length]
    })),
    // Ineligible entries to exercise practice-kanji filtering
    { ch: "禾", on: ["カ"], kun: [], meanings: ["two-branch tree radical (no. 115)"], jlpt: 1 },
    { ch: "漢", on: [], kun: [], meanings: ["Han"], jlpt: 2 }
  ];

  const jlptMap = new Map();
  const characters = entries.map((entry, index) => {
    if (entry.jlpt != null) jlptMap.set(entry.ch, { level: entry.jlpt });
    return {
      literal: entry.ch,
      codepoints: [{ type: "ucs", value: entry.ch.codePointAt(0).toString(16) }],
      radicals: [{ type: "classical", value: 1 }],
      dictionaryReferences: [],
      queryCodes: [],
      misc: {
        grade: 1,
        strokeCounts: [4],
        jlptLevel: entry.jlpt ? Math.min(entry.jlpt, 4) : null,
        frequency: index + 1,
        radicalNames: [],
        variants: []
      },
      readingMeaning: {
        nanori: [],
        groups: [{
          readings: [
            ...entry.on.map((value) => ({ type: "ja_on", value })),
            ...entry.kun.map((value) => ({ type: "ja_kun", value }))
          ],
          meanings: entry.meanings.map((value) => ({ lang: "en", value }))
        }]
      }
    };
  });

  insertKanjis(db, { characters }, jlptMap);

  const wordDefs = [
    { id: "1", word: "日本", reading: "にほん", meanings: ["Japan"], pos: ["n"] },
    { id: "2", word: "学校", reading: "がっこう", meanings: ["school"], pos: ["n"] },
    { id: "3", word: "食べる", reading: "たべる", meanings: ["to eat"], pos: ["v1"] },
    { id: "4", word: "読む", reading: "よむ", meanings: ["to read"], pos: ["v5m"] },
    { id: "5", word: "猫", reading: "ねこ", meanings: ["cat"], pos: ["n"] },
    { id: "6", word: "高い", reading: "たかい", meanings: ["high", "tall"], pos: ["adj-i"] }
  ];

  insertWords(db, {
    tags: { n: "noun", v1: "Ichidan verb", v5m: "Godan verb with 'mu' ending", "adj-i": "adjective (keiyoushi)" },
    words: wordDefs.map((w) => ({
      id: w.id,
      kanji: [{ text: w.word, common: true, tags: [] }],
      kana: [{ text: w.reading, common: true, tags: [], appliesToKanji: [w.word] }],
      sense: [{
        gloss: w.meanings.map((text) => ({ lang: "eng", text })),
        partOfSpeech: w.pos,
        misc: [], field: [], dialect: [],
        appliesToKanji: [w.word],
        appliesToKana: [w.reading],
        related: [], antonym: [], info: []
      }]
    }))
  });

  insertVocabulary(db, [
    {
      id: "study-1", jmdict_id: 1, word: "日本", reading: "にほん", romaji: "nihon",
      meanings: ["Japan"], level: "N5",
      examples: [{ ja: "日本です。", en: "It is Japan.", tatoeba_id: 101 }]
    },
    {
      id: "study-2", jmdict_id: 2, word: "学校", reading: "がっこう", romaji: "gakkou",
      meanings: ["school"], level: "N5",
      examples: [{ ja: "学校に行きます。", en: "I go to school.", tatoeba_id: 102 }]
    },
    {
      id: "study-3", jmdict_id: 3, word: "食べる", reading: "たべる", romaji: "taberu",
      meanings: ["to eat"], level: "N5",
      examples: [{ ja: "寿司を食べる。", en: "I eat sushi.", tatoeba_id: 103 }]
    },
    {
      id: "study-4", jmdict_id: 4, word: "読む", reading: "よむ", romaji: "yomu",
      meanings: ["to read"], level: "N5",
      examples: [{ ja: "本を読む。", en: "I read a book.", tatoeba_id: 104 }]
    },
    {
      id: "study-5", jmdict_id: 5, word: "猫", reading: "ねこ", romaji: "neko",
      meanings: ["cat"], level: "N5",
      examples: [{ ja: "猫がいます。", en: "There is a cat.", tatoeba_id: 105 }]
    }
  ]);

  db.exec(readFileSync(new URL("../../src/vocabulary-seed.sql", import.meta.url), "utf8"));
  db.prepare("INSERT INTO sentences (id, ja, en, source, source_id, license, attribution) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run("sent-1", "猫がいます。", "There is a cat.", "tatoeba", "105", "CC-BY 2.0 FR", "Tatoeba");
  db.prepare("INSERT INTO word_sentences (word_id, sentence_id, matched_text) VALUES ((SELECT id FROM words WHERE word = ?), ?, ?)")
    .run("猫", "sent-1", "猫");

  db.prepare("INSERT INTO strokes VALUES (?, ?)").run("日", '<svg xmlns="http://www.w3.org/2000/svg"/>');
  return db;
}

export function openTestDatabase() {
  if (process.env.USE_TEST_FIXTURE !== "1" && existsSync(databasePath)) {
    return openDatabase();
  }
  return createFixtureDatabase();
}
