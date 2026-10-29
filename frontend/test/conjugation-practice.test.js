import test from "node:test";
import assert from "node:assert/strict";
import { conjugate } from "../src/conjugation.js";
import { practiceWords, wordCategories, formCatalog } from "../src/conjugation-practice-data.js";
import {
  cleanSettings, defaults, createPool, evaluateAnswer, normalizeAnswer, PracticeSession,
  chooseQuestion, sampleChoices, exampleFor, ruleFor, localDate, dailyStreak
} from "../src/conjugation-practice-engine.js";

const all = { ...defaults, levels: [5, 4, 3, 2, 1], forms: Object.keys(formCatalog) };
const pool = createPool(all);
const question = (word, id) => {
  const found = pool.find((q) => q.entry.word === word && q.row.id === id);
  assert.ok(found, `${word}: ${id} exists`);
  return found;
};
function sessionFor(overrides = {}) { return new PracticeSession({ ...defaults, ...overrides }, {}, 0, () => 0); }
function answerCurrent(session, now = 100) { return session.submit(session.current.row.reading, {}, now); }

test("bank covers every category, level and selected form with valid generated answers and examples", () => {
  assert.ok(practiceWords.length >= 45);
  assert.ok(pool.length > 1000);
  assert.equal(new Set(pool.map((q) => q.key)).size, pool.length);
  assert.deepEqual(new Set(pool.map((q) => q.family)), new Set(Object.keys(formCatalog)));
  assert.deepEqual(new Set(pool.map((q) => q.entry.category)), new Set(Object.keys(wordCategories)));
  assert.deepEqual(new Set(pool.map((q) => q.level)), new Set([5, 4, 3, 2, 1]));
  for (const q of pool) {
    assert.equal(evaluateAnswer(q, q.row.reading), "correct", q.key);
    assert.equal(evaluateAnswer(q, q.row.word), "correct", q.key);
    assert.equal(evaluateAnswer(q, `${q.row.word} / ${q.row.reading}`, "both"), "correct", q.key);
    assert.ok(ruleFor(q));
    const example = exampleFor(q);
    assert.ok(example.japanese.includes(q.row.word), q.key);
    assert.ok(example.english.length > 5);
    assert.doesNotMatch(example.japanese + example.english, /undefined|NaN/);
  }
});

test("known irregular, adjective, voice and honorific answers are exact", () => {
  for (const [word, id, expected, reading] of [
    ["食べる", "basic-past-negative-plain", "食べなかった", "たべなかった"],
    ["書く", "te", "書いて", "かいて"], ["行く", "te", "行って", "いって"],
    ["来る", "basic-negative-plain", "来ない", "こない"], ["来る", "basic-polite", "来ます", "きます"],
    ["する", "potential-plain", "できる", "できる"], ["する", "causativePassive-plain", "させられる", "させられる"],
    ["ある", "basic-negative-plain", "ない", "ない"], ["いい", "past-plain", "よかった", "よかった"],
    ["高い", "pastNegative-polite", "高くなかったです", "たかくなかったです"],
    ["静か", "pastNegative-polite", "静かではありませんでした", "しずかではありませんでした"],
    ["書く", "causativePassive-past-negative-polite", "書かせられませんでした", "かかせられませんでした"],
    ["食べる", "honor-0", "召し上がる", "めしあがる"], ["食べる", "honor-1", "いただく", "いただく"],
    ["食べておく", "basic-past-plain", "食べておいた", "たべておいた"]
  ]) {
    const q = question(word, id);
    assert.equal(q.row.word, expected); assert.equal(q.row.reading, reading);
  }
});

test("script matching, romaji, mixed script and near misses never award typo credit", () => {
  const q = question("食べる", "basic-past-plain");
  for (const value of ["食べた", "たべた", "タベタ", "tabeta", " ＴＡＢＥＴＡ。 "]) assert.equal(evaluateAnswer(q, value), "correct");
  assert.equal(evaluateAnswer(q, "たべだ"), "near");
  assert.equal(evaluateAnswer(q, "たべる"), "near");
  assert.equal(evaluateAnswer(q, ""), "incorrect");
  assert.notEqual(evaluateAnswer(q, "食べた", "kana"), "correct");
  assert.notEqual(evaluateAnswer(q, "たべた", "kanji"), "correct");
  assert.notEqual(evaluateAnswer(q, "食べた", "both"), "correct");
  assert.equal(evaluateAnswer(q, "食べた / tabeta", "both"), "correct");
  assert.equal(normalizeAnswer("タベマシタ！"), "たべました");
  assert.equal(evaluateAnswer(question("食べる", "honor-0"), "めし上がる"), "correct");
});

test("standard alternatives and contractions are accepted but different grammar is not", () => {
  assert.equal(evaluateAnswer(question("静か", "negative-plain"), "静かじゃない"), "correct");
  assert.equal(evaluateAnswer(question("高い", "negative-polite"), "高くありません"), "correct");
  assert.equal(evaluateAnswer(question("高い", "pastNegative-polite"), "高くありませんでした"), "correct");
  assert.equal(evaluateAnswer(question("する", "imperative"), "せよ"), "correct");
  assert.equal(evaluateAnswer(question("食べる", "imperative"), "食べよ"), "correct");
  assert.equal(evaluateAnswer(question("書く", "causativePassive-polite"), "書かされます"), "correct");
  assert.equal(evaluateAnswer(question("勉強する", "potential-plain"), "勉強出来る"), "correct");
  assert.equal(evaluateAnswer(question("食べる", "honor-1"), "頂く"), "correct");
  assert.equal(evaluateAnswer(question("いい", "past-plain"), "良かった"), "correct");
  assert.equal(evaluateAnswer(question("いい", "present-polite"), "よいです"), "correct");
  assert.notEqual(evaluateAnswer(question("食べる", "potential-plain"), "食べれる"), "correct", "Standard られる is taught");
  assert.notEqual(evaluateAnswer(question("食べる", "passive-plain"), "食べさせる"), "correct");
});

test("equivalent polite negatives match in every input script without accepting different requested traits", () => {
  for (const [word, id, variants] of [
    ["静か", "negative-polite", ["静かではありません", "静かじゃありません", "静かではないです", "静かじゃないです"]],
    ["静か", "pastNegative-polite", ["静かではありませんでした", "静かじゃありませんでした", "静かではなかったです", "静かじゃなかったです"]],
    ["だ", "negative-polite", ["ではありません", "じゃありません", "ではないです", "じゃないです"]],
    ["だ", "pastNegative-polite", ["ではありませんでした", "じゃありませんでした", "ではなかったです", "じゃなかったです"]],
    ["食べる", "desire-negative-polite", ["食べたくないです", "食べたくありません"]],
    ["食べる", "desire-pastNegative-polite", ["食べたくなかったです", "食べたくありませんでした"]],
    ["食べる", "basic-negative-polite", ["食べません", "食べないです"]],
    ["食べる", "basic-past-negative-polite", ["食べませんでした", "食べなかったです"]]
  ]) {
    const q = question(word, id);
    for (const answer of variants) {
      const reading = answer.replace("静", "しず").replace("食", "た");
      assert.equal(evaluateAnswer(q, answer), "correct", answer);
      assert.equal(evaluateAnswer(q, answer, "kanji"), "correct", answer);
      assert.equal(evaluateAnswer(q, reading, "kana"), "correct", reading);
      assert.equal(evaluateAnswer(q, `${answer} / ${reading}`, "both"), "correct", answer);
    }
  }
  for (const wrong of ["静かじゃない", "静かじゃなかったです", "静かです"]) {
    assert.notEqual(evaluateAnswer(question("静か", "negative-polite"), wrong), "correct");
  }
  assert.notEqual(evaluateAnswer(question("静か", "negative-plain"), "静かじゃないです"), "correct");
  assert.notEqual(evaluateAnswer(question("高い", "formal-negative"), "高くないです"), "correct");
  assert.equal(evaluateAnswer(question("食べる", "progressive-past-negative-polite"), "食べてませんでした"), "correct");
  assert.equal(evaluateAnswer(question("食べる", "progressive-past-negative-polite"), "食べてなかったです"), "correct");
  assert.equal(evaluateAnswer(question("来る", "basic-negative-polite"), "こないです"), "correct");
  assert.equal(evaluateAnswer(question("書く", "potential-negative-polite"), "書けないです"), "correct");
  assert.equal(evaluateAnswer(question("書く", "causativePassive-negative-polite"), "書かされないです"), "correct");
  assert.notEqual(evaluateAnswer(question("書く", "potential-negative-polite"), "書かないです"), "correct");
  assert.notEqual(evaluateAnswer(question("食べる", "basic-polite"), "食べるです"), "correct");
  assert.equal(evaluateAnswer(question("読む", "progressive-plain"), "読んでる"), "correct");
  assert.equal(ruleFor(question("静か", "negative-polite")), question("静か", "negative-polite").row.note);
});

test("Mixed prompt presentation varies per question, not on retries, and respects Sentence mode", () => {
  assert.equal(cleanSettings({ prompt: "mixed" }).prompt, "mixed");
  assert.equal(cleanSettings({ prompt: "invalid" }).prompt, defaults.prompt);
  const random = [0, 0, 0, 0.5, 0, 0.99];
  const session = new PracticeSession({ ...defaults, prompt: "mixed", repeat: false, forms: ["te"], types: ["ichidan"] }, {}, 0, () => random.shift() ?? 0);
  assert.equal(session.prompt, "name");
  session.submit("まちがい", {}, 10);
  session.retry();
  session.hint(15);
  assert.equal(session.prompt, "name");
  answerCurrent(session);
  session.next(200);
  assert.equal(session.prompt, "description");
  answerCurrent(session, 250);
  session.next(300);
  assert.equal(session.prompt, "sentence");
  assert.equal(session.settings.prompt, "mixed");
  assert.equal(sessionFor({ mode: "sentence", prompt: "mixed" }).prompt, "sentence");
});

test("level and multi-select filters combine vocabulary and grammatical difficulty", () => {
  const n5 = createPool({ ...all, levels: [5] });
  assert.ok(n5.length);
  assert.ok(n5.every((q) => q.level === 5 && !["potential", "passive", "respectful", "formal"].includes(q.family)));
  for (const level of [5, 4, 3, 2, 1]) assert.ok(createPool({ ...all, levels: [level] }).length);
  const n2Honorific = createPool({ ...all, levels: [2], forms: ["respectful", "humble"] });
  assert.ok(n2Honorific.some((q) => q.entry.word === "食べる"));
  const selected = createPool({ ...all, levels: [5, 4], types: ["ichidan", "na-adjective"], forms: ["pastNegative"], politeness: "polite", polarity: "negative", tense: "past" });
  assert.ok(selected.length);
  assert.ok(selected.every((q) => ["ichidan", "na-adjective"].includes(q.entry.category) && q.row.politeness === "polite" && q.row.polarity === "negative" && q.row.tense === "past"));
  for (const field of ["levels", "types", "forms"]) assert.equal(createPool({ ...all, [field]: [] }).length, 0);
});

test("settings restoration validates enums, booleans, arrays and bounds", () => {
  const cleaned = cleanSettings({ questions: -1, seconds: Infinity, mode: "bogus", types: ["suru", "bogus", "suru"], levels: [5, "1"], repeat: "false" });
  assert.equal(cleaned.questions, defaults.questions);
  assert.equal(cleaned.seconds, defaults.seconds);
  assert.equal(cleaned.mode, defaults.mode);
  assert.equal(cleaned.repeat, true);
  assert.deepEqual(cleaned.types, ["suru"]);
  assert.deepEqual(cleaned.levels, [5]);
  assert.throws(() => cleanSettings(null));
});

test("removed display preferences migrate without affecting answer script or other settings", () => {
  const cleaned = cleanSettings({ script: "both", kanji: false, input: "both", fontSize: 48 });
  assert.equal(cleaned.script, "furigana");
  assert.equal(Object.hasOwn(cleaned, "kanji"), false);
  assert.equal(cleaned.input, "both");
  assert.equal(cleaned.fontSize, 48);
  for (const script of ["kana", "kanji", "furigana"]) assert.equal(cleanSettings({ script }).script, script);
});

test("classic and quick finish at exact question count; duplicate submission cannot add scores", () => {
  for (const [mode, limit] of [["classic", 3], ["quick", 5], ["daily", 5]]) {
    const session = sessionFor({ mode, questions: 3 });
    for (let i = 0; i < limit; i++) {
      assert.equal(answerCurrent(session), "correct");
      assert.equal(answerCurrent(session), null);
      session.next(200);
    }
    assert.equal(session.ended, true);
    assert.equal(session.summary(200).total, limit);
    assert.equal(session.summary(200).accuracy, 100);
  }
});

test("blank answers do not score and unscored questions cannot be skipped", () => {
  const session = sessionFor();
  const first = session.current;
  assert.equal(session.submit(" 。 ", {}, 100), null);
  session.next(100);
  assert.equal(session.current, first);
  assert.equal(session.results.length, 0);
});

test("retry learns without changing the first attempt or adding progress", () => {
  const session = sessionFor({ questions: 1 });
  session.submit("まちがい", {}, 100);
  assert.equal(session.results.length, 1);
  assert.equal(session.retry(), true);
  assert.equal(answerCurrent(session), "correct");
  assert.equal(session.results.length, 1);
  assert.equal(session.progress[session.current.key].attempts, 1);
  assert.equal(session.summary(200).correct, 0);
  session.next(200);
  assert.equal(session.ended, true);
});

test("wrong and near answers can be corrected directly without rescoring the question", () => {
  const session = sessionFor({ forms: ["te"], types: ["ichidan"], questions: 1 });
  assert.equal(session.submit("まちがい", {}, 100), "incorrect");
  assert.equal(session.canAnswer(), true);
  assert.equal(session.submit("たべで", {}, 150), "near");
  assert.equal(session.canAnswer(), true);
  assert.equal(session.answer, "たべで");
  assert.equal(session.submit("たべて", {}, 200), "correct");
  assert.equal(session.canAnswer(), false);
  assert.equal(session.submit("たべて", {}, 250), null);
  assert.equal(session.results.length, 1);
  assert.equal(session.results[0].answer, "まちがい");
  assert.equal(session.progress[session.current.key].attempts, 1);
  assert.equal(session.repeats.length, 1);
  assert.equal(session.summary(200).correct, 0);
});

test("missed questions repeat later, not immediately, within the chosen session length", () => {
  const session = sessionFor({ questions: 3 });
  const first = session.current.key;
  session.submit("まちがい", {}, 100); session.next(200);
  assert.notEqual(session.current.key, first);
  answerCurrent(session); session.next(300);
  assert.equal(session.current.key, first);
  const noRepeat = sessionFor({ repeat: false });
  noRepeat.submit("まちがい", {}, 100);
  assert.equal(noRepeat.repeats.length, 0);
});

test("hints and reveals obey independent session limits and count as assisted", () => {
  const session = sessionFor({ hints: "limited", reveals: "limited", hintLimit: 1, revealLimit: 1 });
  assert.equal(session.hint(50), true);
  assert.equal(session.hint(60), false);
  assert.equal(answerCurrent(session), "correct");
  assert.equal(session.summary().correct, 0);
  session.next(200);
  assert.equal(session.submit("", { reveal: true }, 250), "revealed");
  assert.equal(session.results.length, 2);
  assert.equal(session.summary().incorrect, 2);
  session.next(300);
  assert.equal(session.canAssist("reveals"), false);
  const disabled = sessionFor({ hints: "disabled", reveals: "disabled" });
  assert.equal(disabled.hint(50), false);
  assert.equal(disabled.submit("", { reveal: true }, 50), null);
  disabled.submit("まちがい", {}, 50);
  assert.equal(disabled.submit("", { reveal: true }, 60), null);
});

test("revealing a checked wrong answer retains the original answer and never double scores", () => {
  const session = sessionFor();
  session.submit("まちがい", {}, 100);
  assert.equal(session.submit("", { reveal: true }, 150), "revealed");
  assert.equal(session.canAnswer(), false);
  assert.equal(answerCurrent(session, 160), null);
  assert.equal(session.answer, "まちがい");
  assert.equal(session.results.length, 1);
  assert.equal(session.progress[session.current.key].attempts, 1);
});

test("deadline rejects late answers and assistance; elapsed time is capped at the deadline", () => {
  const session = sessionFor({ mode: "timed", seconds: 10 });
  assert.equal(answerCurrent(session, 9999), "correct");
  session.next(9999);
  assert.equal(answerCurrent(session, 10000), null);
  assert.equal(session.ended, true);
  assert.equal(session.summary(50000).seconds, 10);
  assert.equal(session.results.length, 1);
  const hint = sessionFor({ mode: "timed", seconds: 10 });
  assert.equal(hint.hint(10001), false);
  assert.equal(hint.ended, true);
});

test("sudden death and marathon limits end without letting retries undo mistakes", () => {
  for (const mode of ["sudden", "marathon"]) {
    const session = sessionFor({ mode, mistakes: 1 });
    session.submit("まちがい", {}, 100);
    assert.ok(session.pendingEnd);
    assert.equal(session.retry(), false);
    assert.equal(session.canAnswer(), false);
    assert.equal(answerCurrent(session, 150), null);
    session.next(200);
    assert.equal(session.ended, true);
    assert.equal(session.results.length, 1);
  }
  const endless = sessionFor({ mode: "marathon", mistakes: 0 });
  endless.submit("まちがい", {}, 100); endless.next(200);
  assert.equal(endless.ended, false);
  endless.end("Session ended", 1000);
  assert.equal(endless.summary().seconds, 1);
});

test("irregular focus, mixed review and empty selection have explicit behavior", () => {
  assert.ok(createPool({ ...all, mode: "irregular" }).every((q) => q.entry.irregular));
  assert.throws(() => sessionFor({ mode: "mixed" }), /previously practiced/);
  assert.throws(() => sessionFor({ types: [] }), /No questions/);
  const q = pool[0];
  const records = { [q.key]: { attempts: 1, correct: 0, wrong: 1, last: 0 } };
  assert.deepEqual(createPool({ ...all, mode: "mixed" }, records).map((r) => r.key), [q.key]);
});

test("weighted selection prioritizes weaknesses, new questions and prior questions", () => {
  const choices = [pool[0], pool.find((q) => q.entry.word !== pool[0].entry.word)];
  const records = { [choices[0].key]: { attempts: 5, correct: 0, wrong: 5 } };
  const weak = chooseQuestion(choices, records, { mode: "weak" }, undefined, () => 0.65);
  assert.equal(weak.key, choices[0].key);
  assert.equal(chooseQuestion(choices, {}, {}, choices[0].key, () => 0).key, choices[1].key);
  assert.equal(chooseQuestion(choices, records, { priority: "review" }, undefined, () => 0.5).key, choices[0].key);
  const learned = { [choices[0].key]: { attempts: 5, correct: 5, wrong: 0 } };
  assert.equal(chooseQuestion(choices, learned, { priority: "new" }, undefined, () => 0.5).key, choices[1].key);
  const otherForm = question("食べる", "te");
  assert.equal(chooseQuestion([otherForm, choices[1]], learned, { priority: "new" }, undefined, () => 0.3).key, choices[1].key,
    "A new form of a known word is not a new word");
});

test("comparison and reverse accept ambiguous analyses, even outside selected families", () => {
  const session = sessionFor({ mode: "comparison", levels: [4], types: ["ichidan"], forms: ["potential"] });
  session.current = question("食べる", "potential-plain");
  assert.equal(session.submit("passive", { choice: true }, 100), "correct");
  const reverse = sessionFor({ mode: "reverse", reverseTask: "form", forms: ["past"] });
  reverse.current = question("食べる", "basic-past-plain");
  assert.equal(reverse.submit("ta", { choice: true }, 100), "correct");
  const base = sessionFor({ mode: "reverse" });
  base.current = question("来る", "basic-polite");
  assert.equal(base.submit("くる", {}, 100), "correct");
});

test("daily streak is local-calendar based across months and preserves yesterday's streak", () => {
  const now = new Date(2026, 10, 1, 10);
  assert.equal(localDate(now), "2026-11-01");
  assert.equal(dailyStreak(["2026-10-30", "2026-10-31"], now), 2);
  assert.equal(dailyStreak(["2026-10-30", "2026-10-31", "2026-11-01"], now), 3);
  assert.equal(dailyStreak(["2026-10-29"], now), 0);
});

test("every bank word reuses the reference engine without modifying its forms", () => {
  for (const entry of practiceWords) {
    const expected = conjugate(entry);
    for (const q of pool.filter((q) => q.entry === entry)) assert.deepEqual(q.row, expected.find((r) => r.id === q.row.id));
  }
});

test("politeness, polarity and tense accept comma lists and reject invalid ones", () => {
  const cleaned = cleanSettings({ politeness: "plain,polite", polarity: "negative", tense: "bogus,past" });
  assert.equal(cleaned.politeness, "plain,polite");
  assert.equal(cleaned.polarity, "negative");
  assert.equal(cleaned.tense, "both");
  const some = createPool({ ...defaults, levels: [5, 4], forms: ["present", "past"], politeness: "plain", polarity: "affirmative,negative", tense: "past,non-past" });
  assert.ok(some.length && some.every((q) => q.row.politeness === "plain"));
});

test("answer choices are capped at five, keep the correct answer and vary between turns", () => {
  const values = Array.from({ length: 12 }, (_, i) => `v${i}`);
  const seen = new Set();
  for (let turn = 0; turn < 40; turn++) {
    const picked = sampleChoices(values, ["v3"]);
    assert.equal(picked.length, 5);
    assert.equal(new Set(picked).size, 5);
    assert.ok(picked.includes("v3"));
    picked.forEach((value) => seen.add(value));
  }
  assert.ok(seen.size > 9, "distractors rotate across turns");
  assert.deepEqual(sampleChoices(["a", "b", "c"], ["a"]), ["a", "b", "c"]);
});
