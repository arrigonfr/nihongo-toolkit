import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, BACKS, WORD_PAIRS, KANA_PAIRS, KANA, GRIDS, MODES, SHUFFLE_MODES, effectiveSettings, validateSettings,
  generateDeck, createRound, flipCard, settleMismatch, checkEnd, elapsed, accuracy, assist,
  canAssist, finishRound, reviewImport, restoreDaily, toHiragana, toKatakana, katakanaOf,
  romajiOf, dailyStreak
} from "../src/memory-engine.js";

const words = [
  ["猫", "ねこ", "cat", 5], ["犬", "いぬ", "dog", 5], ["山", "やま", "mountain", 5],
  ["水", "みず", "water", 5], ["鳥", "とり", "bird", 4], ["本", "ほん", "book", 3],
  ["機会", "きかい", "opportunity", 2], ["機械", "きかい", "machine", 2],
  ["概念", "がいねん", "concept", 1], ["コーヒー", "コーヒー", "coffee", 5],
  ["パン", "パン", "bread", 5]
].map(([word, reading, meaning, level]) => ({ word, reading, meaning, level, partOfSpeech: "noun" }));
const rules = (overrides = {}) => effectiveSettings({ ...DEFAULTS, content: "kana", pairing: "ht", grid: "custom", count: 3, ...overrides });
const round = (overrides = {}) => {
  const r = rules(overrides);
  return createRound(generateDeck(words, r, { seed: "test" }), r, 1000);
};
const cardsFor = (game, index = 0) => game.deck.cards.filter((card) => card.key === game.deck.pairs[index].key);
function match(game, index, now = 2000) {
  for (const card of cardsFor(game, index)) flipCard(game, card.id, now);
}
function assertUnambiguous(deck) {
  const clues = new Map();
  for (const card of deck.cards) {
    if (clues.has(card.text)) assert.equal(clues.get(card.text), card.key, "A visible clue belongs to only one pair");
    clues.set(card.text, card.key);
  }
}

test("all word and kana matching modes produce exact, unambiguous pairs", () => {
  for (const pairing of Object.keys(WORD_PAIRS)) {
    const r = rules({ content: "words", pairing, level: "all", count: 4 });
    const deck = generateDeck(words, r, { seed: pairing });
    assert.equal(deck.pairs.length, 4);
    assertUnambiguous(deck);
    for (const pair of deck.pairs) assert.equal(deck.cards.filter((card) => card.key === pair.key).length, 2);
  }
  for (const pairing of Object.keys(KANA_PAIRS)) {
    const deck = generateDeck([], rules({ pairing, groups: ["all"], count: 24 }), { seed: pairing });
    assert.equal(deck.cards.length, 48);
    assert.ok(deck.cards.every((card) => card.type !== "kanji"));
    assertUnambiguous(deck);
  }
});
test("loanwords keep natural forms and never acquire invented kanji", () => {
  const pool = words.filter((item) => ["パン", "コーヒー"].includes(item.word));
  for (const pairing of ["kh", "kk", "ka", "kr", "hr", "ht", "same-kanji", "same-hiragana"]) {
    assert.throws(() => generateDeck(pool, rules({ content: "words", pairing, count: 1 })), /Only 0/);
  }
  for (const pairing of ["tr", "ar", "same-katakana", "mixed"]) {
    const deck = generateDeck(pool, rules({ content: "words", pairing, count: 2 }));
    assert.ok(deck.cards.every((card) => ["katakana", "romaji"].includes(card.type)));
  }
});
test("same-script modes create two identical cards per unique pair and can be completed", () => {
  for (const [pairing, type] of [["same-hiragana", "hiragana"], ["same-katakana", "katakana"], ["same-kanji", "kanji"]]) {
    for (const content of type === "kanji" ? ["words"] : ["words", "kana"]) {
      const game = round({ content, pairing });
      assert.equal(game.deck.cards.length, 6);
      assert.equal(new Set(game.deck.cards.map((card) => card.text)).size, 3);
      for (let index = 0; index < game.deck.pairs.length; index++) {
        const cards = cardsFor(game, index);
        assert.equal(cards[0].text, cards[1].text);
        assert.notEqual(cards[0].id, cards[1].id);
        assert.ok(cards.every((card) => card.type === type));
        match(game, index);
      }
      assert.equal(game.won, true);
      assert.equal(game.correct, 3);
    }
  }
  assert.throws(() => rules({ pairing: "same-kanji" }), /Kanji/);
  const homophones = words.filter((item) => item.reading === "きかい");
  for (const pairing of ["same-hiragana", "same-katakana"]) {
    assert.throws(() => generateDeck(homophones, rules({ content: "words", pairing, level: "2", count: 2 })), /Only 1/);
  }
});
test("JLPT ranges, categories and review pools never silently expand", () => {
  const deck = generateDeck(words, rules({ content: "words", pairing: "kh", level: "5-4", count: 2, category: "animals" }));
  assert.ok(deck.pairs.every(({ item }) => ["猫", "犬", "鳥"].includes(item.word)));
  assert.throws(() => generateDeck(words, rules({ content: "words", pairing: "kh", level: "1", count: 2 })), /Only 1/);
  assert.throws(() => generateDeck([], rules({ mode: "review" })), /Only 0/);
  const review = generateDeck([KANA[0]], rules({ mode: "review", count: 1 }));
  assert.equal(review.pairs[0].item.word, "あ");
  assert.throws(() => generateDeck([KANA[0]], rules({ mode: "review", groups: ["voiced"], count: 1 })), /Only 0/);
});
test("homophones cannot produce ambiguous cards in one board", () => {
  const homophones = words.filter((item) => item.reading === "きかい");
  assert.throws(() => generateDeck(homophones, rules({ content: "words", pairing: "kr", level: "2", count: 2 })), /Only 1/);
  const voiced = generateDeck([], rules({ pairing: "hr", groups: ["voiced"], count: 20 }));
  assert.equal(new Set(voiced.cards.map((card) => card.text)).size, 40);
});
test("kana groups include small kana, yoon, and correctly marked special patterns", () => {
  for (const group of ["voiced", "yoon", "small", "special"]) {
    const deck = generateDeck([], rules({ groups: [group], count: 3 }));
    assert.ok(deck.pairs.every(({ item }) => item.group === group));
  }
  const long = KANA.find((item) => item.word === "かあ");
  assert.equal(katakanaOf(long), "カー");
  assert.equal(romajiOf(KANA.find((item) => item.word === "っ")), "small tsu");
  assert.equal(romajiOf(KANA.find((item) => item.word === "ゎ")), "small wa");
  assert.equal(romajiOf(KANA.find((item) => item.word === "しんよう")), "shin'you");
  assert.equal(toHiragana("キャット"), "きゃっと");
  assert.equal(toKatakana("きゃっと"), "キャット");
  assert.throws(() => generateDeck([], rules({ groups: ["small"], display: "audio", count: 1 })), /Only 0/);
});
test("English, audio and picture clues use natural written partners", () => {
  for (const display of ["english", "audio", "picture"]) {
    const deck = generateDeck(words, rules({ content: "words", display, count: 3 }));
    assert.ok(deck.pairs.every(({ faces }) => faces[0].type === display));
    assert.ok(deck.pairs.every(({ item, faces }) => faces[1].text === item.word));
  }
  const kana = generateDeck([], rules({ display: "english" }));
  assert.ok(kana.pairs.every(({ faces }) => faces[0].text.startsWith("Sound:")));
  const listening = generateDeck([], rules({ mode: "listening" }));
  assert.ok(listening.pairs.every(({ faces }) => faces[0].type === "audio" && faces[1].type === "hiragana"));
  assert.equal(listening.cards.length, 6);
  const kataListening = generateDeck([], rules({ mode: "listening", groups: ["katakana"] }));
  assert.ok(kataListening.pairs.every(({ faces }) => faces[1].type === "katakana"));
  const voicedAudio = generateDeck([], rules({ mode: "listening", groups: ["voiced"], count: 20 }));
  assert.equal(new Set(voicedAudio.pairs.map(({ item }) => romajiOf(item))).size, 20);
});
test("settings validate all limits and modes, and preset dimensions have exact counts", () => {
  for (const [key, value] of [["count", 0], ["players", 3], ["seconds", NaN], ["flips", 1], ["groups", []], ["mode", "invalid"], ["disappear", "true"]]) {
    assert.throws(() => validateSettings({ ...DEFAULTS, [key]: value }));
  }
  assert.throws(() => validateSettings({ ...DEFAULTS, content: "kana", pairing: "kh" }), /Kanji/);
  assert.throws(() => rules({ display: "picture" }), /Picture/);
  for (const grid of Object.keys(GRIDS).filter((g) => g !== "custom")) {
    const r = rules({ grid });
    assert.equal(generateDeck([], r).cards.length, grid.split("x").map(Number).reduce((a, b) => a * b));
  }
  for (const mode of Object.keys(MODES)) assert.equal(rules({ mode }).mode, mode);
  assert.equal(rules({ mode: "timed" }).timeLimit, true);
  assert.equal(rules({ mode: "moves" }).moveLimit, true);
  assert.equal(rules({ timer: "down" }).timeLimit, true);
  assert.equal(rules({ mode: "listening" }).display, "audio");
  assert.equal(rules({ mode: "meaning" }).display, "english");
  assert.equal(effectiveSettings({ ...DEFAULTS, mode: "marathon" }, 3).count, 10);
});
test("deck generation is deterministic and prioritizes fresh items", () => {
  const r = rules(), first = generateDeck([], r, { seed: "one" });
  assert.deepEqual(first, generateDeck([], r, { seed: "one" }));
  const old = first.pairs.map((pair) => pair.key);
  const next = generateDeck([], r, { seed: "two", recent: old });
  assert.ok(next.pairs.every((pair) => !old.includes(pair.key)));
});
test("shuffle choices validate, migrate legacy preferences, and respect Daily rules", () => {
  assert.equal(DEFAULTS.shuffle, "never");
  for (const shuffle of Object.keys(SHUFFLE_MODES)) assert.equal(rules({ shuffle }).shuffle, shuffle);
  for (const [legacy, expected] of [[false, "never"], [true, "mismatch"]]) {
    const settings = { ...DEFAULTS, shuffle: legacy };
    assert.equal(validateSettings(settings).shuffle, expected);
    assert.equal(settings.shuffle, legacy, "Validation does not mutate saved settings");
  }
  for (const shuffle of ["invalid", "true", "", null, 0, []]) {
    assert.throws(() => rules({ shuffle }), /shuffle/);
  }
  const settings = { ...DEFAULTS, mode: "daily", shuffle: "all" };
  assert.equal(effectiveSettings(settings).shuffle, "never");
  assert.equal(settings.shuffle, "all", "Daily does not overwrite the chosen preference");
});
test("turns ignore duplicates and third flips; mismatch settles then passes the turn", () => {
  const game = round({ players: 2 });
  const a = cardsFor(game, 0), b = cardsFor(game, 1);
  assert.equal(flipCard(game, a[0].id, 2000).type, "first");
  assert.equal(flipCard(game, a[0].id, 2000).type, "ignored");
  assert.equal(flipCard(game, b[0].id, 2000).type, "mismatch");
  assert.equal(flipCard(game, a[1].id, 2200).type, "ignored");
  assert.equal(game.moves, 1); assert.equal(game.flips, 2);
  assert.equal(settleMismatch(game, 2999), false);
  assert.equal(settleMismatch(game, 3000), true);
  assert.equal(game.player, 1);
  match(game, 0, 4000);
  assert.deepEqual(game.scores, [0, 1]);
  assert.equal(game.player, 1);
  assert.equal(accuracy(game), 50);
  assert.equal(flipCard(game, a[0].id, 4500).type, "ignored");
});
test("each shuffle mode handles matches and settled mismatches without moving matched cards", () => {
  for (const shuffle of Object.keys(SHUFFLE_MODES)) {
    const game = round({ shuffle, players: 2, correction: true });
    const order = () => game.deck.cards.map((card) => card.id);
    const before = order(), pair = cardsFor(game);
    assert.equal(flipCard(game, pair[0].id, 2000, () => 0).type, "first");
    assert.deepEqual(order(), before, "A first flip never shuffles");
    assert.equal(flipCard(game, pair[0].id, 2000, () => 0).type, "ignored");
    assert.deepEqual(order(), before, "A duplicate flip never shuffles");
    assert.equal(flipCard(game, pair[1].id, 2000, () => 0).type, "match");
    const afterMatch = order();
    if (["match", "all"].includes(shuffle)) assert.notDeepEqual(afterMatch, before, `${shuffle}: shuffle after a match`);
    else assert.deepEqual(afterMatch, before, `${shuffle}: do not shuffle after a match`);
    assert.deepEqual(game.scores, [1, 0]);
    assert.equal(game.player, 0);
    for (const i of [1, 2]) flipCard(game, cardsFor(game, i)[0].id, 3000, () => 0);
    assert.deepEqual(order(), afterMatch, "Do not shuffle while showing a mismatch");
    assert.equal(settleMismatch(game, 5199, () => 0), false);
    assert.deepEqual(order(), afterMatch, "Keep correction previews in place until they end");
    assert.equal(settleMismatch(game, 5200, () => 0), true);
    if (["mismatch", "all"].includes(shuffle)) assert.notDeepEqual(order(), afterMatch, `${shuffle}: shuffle after a mismatch`);
    else assert.deepEqual(order(), afterMatch, `${shuffle}: do not shuffle after a mismatch`);
    assert.deepEqual([...order()].sort(), [...before].sort(), "Shuffling preserves every card");
    game.deck.cards.forEach((card, index) => { if (game.matched.includes(card.key)) assert.equal(card.id, before[index]); });
    assert.equal(game.open.length, 0);
    assert.equal(game.player, 1);
    assert.equal(game.flips, 4);
    assert.equal(game.moves, 2);
  }
});
test("shuffle does not move cards after the round ends", () => {
  const game = round({ shuffle: "all", moveLimit: true, flips: 2 });
  const before = [...game.deck.cards], pair = cardsFor(game);
  for (const card of pair) flipCard(game, card.id, 2000, () => 0);
  assert.equal(game.ended, true);
  assert.deepEqual(game.deck.cards, before);
  assert.equal(settleMismatch(game, 4000, () => 0), false);
});
test("last-pair success beats flip exhaustion; limits and elapsed time stop immediately", () => {
  const game = round({ count: 1, moveLimit: true, flips: 2 });
  match(game, 0);
  assert.equal(game.won, true); assert.equal(game.reason, "All pairs found");
  const timed = round({ timeLimit: true, seconds: 10 });
  assert.equal(flipCard(timed, cardsFor(timed)[0].id, 11000).type, "ignored");
  assert.equal(timed.reason, "Time is up"); assert.equal(elapsed(timed, 99999), 10);
  const odd = round({ moveLimit: true, flips: 3 });
  match(odd, 0);
  flipCard(odd, cardsFor(odd, 1)[0].id, 3000);
  assert.equal(odd.reason, "Flip limit reached");
  const sudden = round({ mode: "sudden", mistakes: 1 });
  for (const i of [0, 1]) flipCard(sudden, cardsFor(sudden, i)[0].id, 2000);
  assert.equal(sudden.reason, "Mismatch limit reached");
  assert.equal(sudden.resolvingAt, null);
});
test("hints and reveals obey budgets, block mid-turn, and never award unassisted credit", () => {
  const game = round({ hintLimit: 1, revealLimit: 1 });
  const hinted = assist(game, "hints", 2000);
  assert.ok(hinted);
  assert.equal(canAssist(game, "hints"), false);
  match(game, 0, 3000);
  assert.equal(game.correct, 0); assert.equal(game.scores[0], 0);
  const revealed = assist(game, "reveals", 4000);
  assert.ok(game.matched.includes(revealed.key));
  assert.equal(canAssist(game, "reveals"), false);
  const active = round({ hints: "unlimited", reveals: "disabled" });
  flipCard(active, cardsFor(active)[0].id, 2000);
  assert.equal(assist(active, "hints", 2000), null);
  assert.equal(assist(active, "reveals", 2000), null);
  const expired = round({ timeLimit: true, seconds: 10 });
  assert.equal(assist(expired, "reveals", 12000), null);
});
test("reverse starts with a recall clue and requires the Japanese partner", () => {
  const game = round({ mode: "reverse" }), cards = cardsFor(game).sort((a, b) => a.side - b.side);
  assert.equal(cards[0].type, "romaji");
  assert.equal(flipCard(game, cards[1].id, 2000).type, "order");
  assert.equal(game.flips, 0);
  assert.equal(flipCard(game, cards[0].id, 2000).type, "first");
  assert.equal(flipCard(game, cards[1].id, 2000).type, "match");
});
test("daily snapshot survives partial/mismatched/finished rounds and rejects tampering", () => {
  const day = "2026-10-24", r = rules({ mode: "daily" });
  const deck = generateDeck([], r, { seed: `memory-v1:${day}` });
  const game = createRound(deck, r, 1000);
  const restore = () => restoreDaily(JSON.parse(JSON.stringify({ day, game })), day);
  assert.deepEqual(restore(), game);
  flipCard(game, cardsFor(game)[0].id, 2000);
  assert.deepEqual(restore().open, game.open);
  flipCard(game, cardsFor(game, 1)[0].id, 2000);
  assert.equal(restore().resolvingAt, 3000);
  settleMismatch(game, 3000);
  for (let i = 0; i < 8; i++) match(game, i, 4000);
  assert.equal(restore().won, true);
  game.deck.cards[0].text = "tampered";
  assert.throws(restore, /board/);
  assert.equal(restoreDaily({ day, game }, "2026-10-25"), null);
  assert.equal(dailyStreak(["2026-10-23", "2026-10-24"], new Date(2026, 9, 24)), 2);
});
test("legacy boolean shuffle settings do not invalidate a saved daily board", () => {
  const day = "2026-10-24", r = rules({ mode: "daily" });
  const game = createRound(generateDeck([], r, { seed: `memory-v1:${day}` }), r, 1000);
  flipCard(game, cardsFor(game)[0].id, 2000);
  game.rules.shuffle = false;
  const restored = restoreDaily(JSON.parse(JSON.stringify({ day, game })), day);
  assert.equal(restored.rules.shuffle, "never");
  assert.deepEqual(restored.deck, game.deck);
  assert.deepEqual(restored.open, game.open);
  assert.equal(restored.flips, game.flips);
});
test("review import validates before merging and canonicalizes kana", () => {
  const payload = { tool: "nihon-memory", version: 1, items: [KANA[0], { ...words[0], kind: "word" }] };
  assert.equal(reviewImport(payload).length, 2);
  assert.throws(() => reviewImport({ ...payload, items: [{ ...words[0], word: "<img>", kind: "word" }] }), /invalid/);
  assert.throws(() => reviewImport({ ...payload, items: [{ ...words[0], level: 6, kind: "word" }] }), /level/);
  assert.throws(() => reviewImport({ ...payload, items: [{ ...KANA[0], word: "ねこ" }] }), /unknown/);
  assert.throws(() => reviewImport({ ...payload, version: 2 }), /export/);
});
test("ending freezes elapsed time and prevents further interaction", () => {
  const game = round();
  finishRound(game, "Round ended", 2500);
  assert.equal(elapsed(game, 50000), 1.5);
  assert.equal(flipCard(game, cardsFor(game)[0].id, 3000).type, "ignored");
  assert.equal(checkEnd(game, 4000), true);
  assert.equal(game.won, false);
});

test("card-back designs are validated", () => {
  assert.deepEqual(Object.keys(BACKS), ["seigaiha", "sakura", "plain", "ichimatsu", "shippo"]);
  for (const back of Object.keys(BACKS)) assert.equal(validateSettings({ ...DEFAULTS, back }).back, back);
  assert.throws(() => validateSettings({ ...DEFAULTS, back: "unknown" }));
});
