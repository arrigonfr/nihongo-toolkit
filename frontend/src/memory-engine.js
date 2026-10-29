import { romanizeKana } from "./romanize.js";
import { isFontSetting } from "./japanese-fonts.js";
import { selectedLevels, matchesLevel } from "./jlpt-levels.js";
import { createSeededRandom } from "./crossword-engine.js";
import { CATEGORIES, matchesCategory, localDay, dailyStreak } from "./word-search-engine.js";

export { CATEGORIES, localDay, dailyStreak };
export const WORD_PAIRS = {
  kh: "Kanji → Hiragana", kk: "Kanji → Katakana", ka: "Kanji → Any kana",
  kr: "Kanji → Romaji", hr: "Hiragana → Romaji", tr: "Katakana → Romaji",
  ar: "Any kana → Romaji", ht: "Hiragana → Katakana",
  "same-katakana": "Katakana → Katakana", "same-hiragana": "Hiragana → Hiragana",
  "same-kanji": "Kanji → Kanji", km: "Kanji → Meaning", vm: "Vocab (kanji or kana) → Meaning", mixed: "Mixed"
};
export const KANA_PAIRS = Object.fromEntries(["ht", "hr", "tr", "ar", "same-katakana", "same-hiragana", "mixed"].map((key) => [key, WORD_PAIRS[key]]));
export const MODES = {
  classic: "Classic Memory", timed: "Timed Challenge", moves: "Move Challenge",
  sudden: "Sudden Death", daily: "Daily Challenge", review: "Mistake Review",
  listening: "Listening Mode", meaning: "Meaning Mode", reverse: "Reverse Mode", marathon: "Marathon"
};
export const GROUPS = {
  hiragana: "Basic hiragana", katakana: "Basic katakana", voiced: "Dakuten & handakuten",
  yoon: "Yōon combinations", small: "Small kana", special: "Long vowels & special patterns", all: "All kana"
};
export const DISPLAYS = {
  text: "Japanese text", furigana: "Japanese with furigana", romaji: "Japanese with romaji",
  meaning: "Japanese with English", english: "English-only clue", audio: "Audio-only clue", picture: "Picture / emoji clue"
};
export const GRIDS = {
  "4x3": "Easy · 4 × 3", "4x4": "Easy · 4 × 4", "5x4": "Easy / Medium · 5 × 4",
  "6x5": "Medium · 6 × 5", "6x6": "Medium / Hard · 6 × 6", "7x6": "Hard · 7 × 6", "8x6": "Hard · 8 × 6", custom: "Custom pairs"
};
export const BACKS = {
  seigaiha: { label: "Seigaiha · waves", symbol: "合" }, sakura: { label: "Sakura · blossoms", symbol: "✿" },
  plain: { label: "Simple · diamond", symbol: "◇" }, ichimatsu: { label: "Ichimatsu · checks", symbol: "▣" },
  shippo: { label: "Shippō · seven treasures", symbol: "◎" }
};
export const SHUFFLE_MODES = { never: "Never", match: "After match", mismatch: "After mismatch", all: "All" };
export const DEFAULTS = {
  content: "words", pairing: "kh", mode: "classic", level: "5", category: "all",
  groups: ["hiragana"], grid: "4x3", count: 6, players: 1, back: "seigaiha",
  disappear: false, shuffle: "never", timer: "up", timeLimit: false, seconds: 180,
  moveLimit: false, flips: 60, mistakes: 3, rounds: 3,
  display: "text", hints: "limited", hintLimit: 3, reveals: "limited", revealLimit: 1,
  learning: true, correction: false, details: true, meanings: true, examples: true,
  fontSize: 30, font: "Noto Sans JP", contrast: false
};
export const toHiragana = (text) => [...text].map((char) => {
  const code = char.codePointAt(0);
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
}).join("");
export const toKatakana = (text) => [...text].map((char) => {
  const code = char.codePointAt(0);
  return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : char;
}).join("");
export const itemKey = (item) => `${item.kind}:${item.word}|${item.reading}`;
const hasKanji = (text) => /\p{Script=Han}/u.test(text);
const isLoan = (item) => /^[ァ-ヺー]+$/u.test(item.word);
const icons = { 猫: "🐈", 犬: "🐕", 鳥: "🐦", 魚: "🐟", 馬: "🐎", 牛: "🐄", 豚: "🐖", 花: "🌸", 木: "🌳",
  山: "⛰️", 月: "🌙", 星: "⭐", 雨: "🌧️", 雪: "❄️", 火: "🔥", 水: "💧", 卵: "🥚", パン: "🍞",
  コーヒー: "☕", りんご: "🍎", 林檎: "🍎", バナナ: "🍌", 電車: "🚃", 飛行機: "✈️", 自転車: "🚲", 本: "📖", 鍵: "🔑", 傘: "☂️" };

export function normalizeWord(item) {
  return { kind: "word", word: item.word, reading: toHiragana(item.furigana || item.reading || item.word),
    meaning: item.meaning || "", partOfSpeech: item.partOfSpeech || "", level: item.level };
}
function kanaItem(word, group, romaji = romanizeKana(word), note = "") {
  return { kind: "kana", word, reading: word, romaji, group,
    meaning: note || `Sound: ${romaji}`, partOfSpeech: "Kana / sound pattern", level: 0 };
}
export const KANA = [
  ...[..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん"].map((c) => kanaItem(c, "basic")),
  ...[..."がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ"].map((c) => kanaItem(c, "voiced")),
  ...[..."きしちにひみりぎじびぴ"].flatMap((c) => [..."ゃゅょ"].map((s) => kanaItem(c + s, "yoon"))),
  ...[..."ぁぃぅぇぉゃゅょゎ"].map((c) => kanaItem(c, "small", `small ${c === "ゎ" ? "wa" : romanizeKana(c)}`, `Small ${c === "ゎ" ? "wa" : romanizeKana(c)}; combines with surrounding kana`)),
  kanaItem("っ", "small", "small tsu", "Small tsu: doubles the following consonant; no standalone sound"),
  kanaItem("かあ", "special", "kaa", "Long a, as in かあ / カー"),
  kanaItem("きい", "special", "kii", "Long i, as in きい / キー"),
  kanaItem("くう", "special", "kuu", "Long u, as in くう / クー"),
  kanaItem("けえ", "special", "kee", "Long e, as in けえ / ケー"),
  kanaItem("こお", "special", "koo", "Long o, as in こお / コー"),
  kanaItem("きって", "special", "kitte", "Doubled consonant: small っ / ッ before te"),
  kanaItem("しんよう", "special", "shin'you", "Syllabic n before ya/yu/yo uses an apostrophe in romaji")
];
const specialKata = { かあ: "カー", きい: "キー", くう: "クー", けえ: "ケー", こお: "コー" };
export const katakanaOf = (item) => item.kind === "kana" && specialKata[item.word] || toKatakana(item.reading);
export const romajiOf = (item) => item.romaji || romanizeKana(item.reading);

export function validateSettings(value) {
  value = { ...value, shuffle: typeof value.shuffle === "boolean" ? value.shuffle ? "mismatch" : "never" : value.shuffle };
  const font = value.font ?? DEFAULTS.font;
  if (!isFontSetting(font)) throw new Error("Choose an available Japanese font.");
  const enums = { content: ["words", "kana"], pairing: Object.keys(WORD_PAIRS), mode: Object.keys(MODES),
    category: Object.keys(CATEGORIES), grid: Object.keys(GRIDS), back: Object.keys(BACKS),
    timer: ["off", "up", "down"], display: Object.keys(DISPLAYS), shuffle: Object.keys(SHUFFLE_MODES),
    hints: ["limited", "unlimited", "disabled"], reveals: ["limited", "unlimited", "disabled"] };
  for (const [key, options] of Object.entries(enums)) if (!options.includes(value[key])) throw new Error(`Invalid ${key} setting.`);
  if (value.content === "kana" && !(value.pairing in KANA_PAIRS)) throw new Error("Kanji pairings are only available for words.");
  if (value.content === "kana" && value.display === "picture") throw new Error("Picture clues are available for vocabulary words only.");
  selectedLevels(value.level);
  if (!Array.isArray(value.groups) || !value.groups.length || value.groups.some((g) => !(g in GROUPS))) throw new Error("Select at least one kana group.");
  for (const [key, min, max] of [["count", 1, 48], ["players", 1, 2], ["seconds", 10, 3600], ["flips", 2, 1000],
    ["mistakes", 1, 100], ["rounds", 2, 10], ["hintLimit", 0, 100], ["revealLimit", 0, 48], ["fontSize", 22, 48]]) {
    if (!Number.isInteger(value[key]) || value[key] < min || value[key] > max) throw new Error(`${key} must be a whole number from ${min} to ${max}.`);
  }
  for (const key of Object.keys(DEFAULTS).filter((key) => typeof DEFAULTS[key] === "boolean")) {
    if (typeof value[key] !== "boolean") throw new Error(`Invalid ${key} setting.`);
  }
  return { ...value, font };
}
export function effectiveSettings(settings, round = 1) {
  const rules = { ...validateSettings(settings), groups: [...settings.groups] };
  if (rules.grid !== "custom") rules.count = rules.grid.split("x").map(Number).reduce((a, b) => a * b) / 2;
  if (rules.mode === "daily") Object.assign(rules, {
    content: "kana", pairing: "ht", groups: ["hiragana"], count: 8, grid: "4x4",
    display: "text", players: 1, timer: "up", timeLimit: false, moveLimit: false,
    hints: "limited", hintLimit: 3, reveals: "disabled", shuffle: "never", correction: false
  });
  if (rules.mode === "timed") Object.assign(rules, { timeLimit: true, timer: "down" });
  if (rules.mode === "moves") rules.moveLimit = true;
  if (rules.timer === "down") rules.timeLimit = true;
  if (rules.mode === "listening") rules.display = "audio";
  if (rules.mode === "meaning") rules.display = "english";
  if (rules.mode === "reverse") {
    rules.pairing = "ar";
    rules.display = rules.display === "english" ? "english" : "text";
  }
  if (rules.mode === "marathon") {
    rules.count = Math.min(48, rules.count + (round - 1) * 2);
    rules.grid = "custom";
  }
  return rules;
}
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
function form(type, text) { return { type, text }; }
function pairOptions(item, rules, random) {
  const h = form("hiragana", item.reading), t = form("katakana", katakanaOf(item));
  const k = hasKanji(item.word) ? form("kanji", item.word) : null, r = form("romaji", romajiOf(item));
  const natural = isLoan(item) ? t : h;
  const any = item.kind === "word" ? natural
    : rules.groups.includes("katakana") && !rules.groups.includes("hiragana") && !rules.groups.includes("all") ? t
      : rules.groups.includes("hiragana") && !rules.groups.includes("katakana") && !rules.groups.includes("all") ? h : random() < .5 ? h : t;
  const written = item.kind === "kana" ? any : k || natural;
  if (rules.display === "audio") return item.group === "small" ? [] : [[form("audio", item.reading), written]];
  if (rules.display === "english") return item.meaning ? [[form("english", item.meaning), written]] : [];
  if (rules.display === "picture") return icons[item.word] ? [[form("picture", icons[item.word]), written]] : [];
  const pairs = { kh: k && [k, h], kk: k && [k, t], ka: k && [k, natural], kr: k && [k, r],
    hr: !isLoan(item) && [h, r], tr: [t, r], ar: [any, r], ht: !isLoan(item) && [h, t],
    "same-katakana": [t, t], "same-hiragana": !isLoan(item) && [h, h], "same-kanji": k && [k, k],
    km: item.kind === "word" && k && item.meaning && [k, form("english", item.meaning)],
    vm: item.kind === "word" && item.meaning && [written, form("english", item.meaning)] };
  if (rules.mode === "reverse") return [[r, written]];
  return (rules.pairing === "mixed" ? shuffle(Object.entries(pairs).filter(([key, pair]) => pair && !["km", "vm"].includes(key)).map(([, pair]) => pair), random) : [pairs[rules.pairing]]).filter(Boolean);
}
export function generateDeck(pool, rules, { seed = `${Date.now()}:${Math.random()}`, recent = [] } = {}) {
  const random = createSeededRandom(seed), seen = new Set(), keys = new Set(), pairs = [];
  let candidates;
  if (rules.content === "kana") {
    candidates = rules.mode === "review" ? pool.filter((item) => item.kind === "kana") : KANA;
    candidates = candidates.filter((item) => rules.groups.includes("all") || rules.groups.includes(item.group)
      || item.group === "basic" && rules.groups.some((g) => ["hiragana", "katakana"].includes(g)));
  } else {
    candidates = pool.filter((item) => item.kind !== "kana").map(normalizeWord).filter((item) =>
      matchesLevel(item.level, rules.level) && matchesCategory(item, rules.category)
      && /^[ぁ-ゖー]+$/u.test(item.reading) && /^[\p{Script=Han}ぁ-ゖァ-ヺー々]+$/u.test(item.word));
  }
  const old = new Set(recent);
  const ordered = shuffle(candidates, random).sort((a, b) => Number(old.has(itemKey(a))) - Number(old.has(itemKey(b))));
  for (const item of ordered) {
    if (keys.has(itemKey(item))) continue;
    for (const faces of pairOptions(item, rules, random)) {
      // Identical script cards may share a clue within their pair, never across pairs.
      const signatures = faces.map((face) => face.type === "audio"
        ? `audio:${romajiOf(item).replaceAll("wo", "o").replaceAll("ou", "oo").replaceAll("ei", "ee")}` : face.text);
      const sameScript = faces[0].type === faces[1].type && ["hiragana", "katakana", "kanji"].includes(faces[0].type);
      if (signatures[0] === signatures[1] && !sameScript || signatures.some((text) => seen.has(text))) continue;
      signatures.forEach((text) => seen.add(text));
      keys.add(itemKey(item));
      pairs.push({ key: itemKey(item), item, faces });
      break;
    }
    if (pairs.length === rules.count) break;
  }
  if (pairs.length !== rules.count) throw new Error(`Only ${pairs.length} unambiguous pairs fit these settings. Choose fewer pairs, broader filters, or a different card display. Filters have not been widened.`);
  const cards = shuffle(pairs.flatMap((pair, index) => pair.faces.map((face, side) => ({
    id: index * 2 + side, key: pair.key, side, ...face
  }))), random);
  return { pairs, cards, seed };
}
export function createRound(deck, rules, now = Date.now()) {
  return { deck, rules, started: now, stopped: null, open: [], matched: [], revealed: [], assisted: [],
    moves: 0, flips: 0, mismatches: 0, correct: 0, hints: 0, scores: [0, 0], player: 0,
    resolvingAt: null, ended: false, won: false, reason: "" };
}
export const elapsed = (game, now = Date.now()) => Math.max(0, ((game.stopped ?? now) - game.started) / 1000);
export const accuracy = (game) => game.moves ? Math.round(game.correct / game.moves * 100) : 0;
export function finishRound(game, reason, now = Date.now()) {
  if (game.ended) return;
  game.ended = true;
  game.won = game.matched.length === game.deck.pairs.length;
  game.reason = reason;
  game.stopped = now;
  game.open = [];
  game.resolvingAt = null;
}
export function checkEnd(game, now = Date.now()) {
  if (game.ended) return true;
  if (game.matched.length === game.deck.pairs.length) finishRound(game, "All pairs found", now);
  else if (game.rules.timeLimit && elapsed(game, now) >= game.rules.seconds) {
    finishRound(game, "Time is up", game.started + game.rules.seconds * 1000);
  } else if (game.rules.moveLimit && game.flips >= game.rules.flips) finishRound(game, "Flip limit reached", now);
  else if (game.rules.mode === "sudden" && game.mismatches >= game.rules.mistakes) finishRound(game, "Mismatch limit reached", now);
  return game.ended;
}
function shuffleRemaining(game, outcome, random) {
  if (game.ended || ![outcome, "all"].includes(game.rules.shuffle)) return;
  const remaining = shuffle(game.deck.cards.filter((card) => !game.matched.includes(card.key)), random);
  game.deck.cards = game.deck.cards.map((card) => game.matched.includes(card.key) ? card : remaining.shift());
}
export function settleMismatch(game, now = Date.now(), random = Math.random) {
  if (game.ended || game.resolvingAt === null || now < game.resolvingAt) return false;
  game.open = [];
  game.resolvingAt = null;
  if (game.rules.players === 2) game.player = 1 - game.player;
  shuffleRemaining(game, "mismatch", random);
  return true;
}
export function flipCard(game, id, now = Date.now(), random = Math.random) {
  if (checkEnd(game, now) || game.resolvingAt !== null) return { type: "ignored" };
  const card = game.deck.cards.find((card) => card.id === id);
  if (!card || game.matched.includes(card.key) || game.open.includes(id)) return { type: "ignored" };
  if (game.rules.mode === "reverse" && !game.open.length && card.side !== 0) return { type: "order" };
  game.open.push(id);
  game.flips++;
  if (game.open.length === 1) { checkEnd(game, now); return { type: "first", card }; }
  const first = game.deck.cards.find((item) => item.id === game.open[0]);
  game.moves++;
  if (first.key === card.key) {
    game.matched.push(card.key);
    if (!game.assisted.includes(card.key)) { game.correct++; game.scores[game.player]++; }
    game.open = [];
    checkEnd(game, now);
    shuffleRemaining(game, "match", random);
    return { type: "match", card };
  }
  game.mismatches++;
  game.resolvingAt = now + (game.rules.correction ? 2200 : 1000);
  checkEnd(game, now);
  return { type: "mismatch", cards: [first, card] };
}
export function canAssist(game, kind) {
  const count = kind === "hints" ? game.hints : game.revealed.length;
  return !game.ended && !game.open.length && game.resolvingAt === null
    && game.rules[kind] !== "disabled" && (game.rules[kind] === "unlimited" || count < game.rules[kind === "hints" ? "hintLimit" : "revealLimit"]);
}
export function assist(game, kind, now = Date.now()) {
  if (checkEnd(game, now) || !canAssist(game, kind)) return null;
  const pair = game.deck.pairs.find((pair) => !game.matched.includes(pair.key));
  if (!pair) return null;
  if (!game.assisted.includes(pair.key)) game.assisted.push(pair.key);
  if (kind === "hints") game.hints++;
  else {
    game.revealed.push(pair.key);
    game.matched.push(pair.key);
    checkEnd(game, now);
  }
  return pair;
}
export function reviewImport(data) {
  if (data?.version !== 1 || data?.tool !== "nihon-memory" || !Array.isArray(data.items) || data.items.length > 5000) {
    throw new Error("Choose a Memory review export with up to 5,000 items.");
  }
  return data.items.map((item) => {
    if (!item || !["word", "reading", "meaning", "partOfSpeech"].every((key) => typeof item[key] === "string" && item[key].length <= 2000)
      || !/^[\p{Script=Han}ぁ-ゖァ-ヺー々]+$/u.test(item.word) || !/^[ぁ-ゖー]+$/u.test(item.reading)) throw new Error("The review file contains an invalid item.");
    if (item.kind === "kana") {
      const known = KANA.find((kana) => kana.word === item.word);
      if (!known) throw new Error("The review file contains an unknown kana pattern.");
      return { ...known };
    }
    if (item.kind !== "word" || !Number.isInteger(item.level) || item.level < 1 || item.level > 5) throw new Error("Invalid vocabulary level in review file.");
    return normalizeWord(item);
  });
}

export function restoreDaily(saved, day) {
  if (!saved || saved.day !== day) return null;
  const game = saved.game;
  if (!game || game.rules?.mode !== "daily") throw new Error("Invalid saved daily round.");
  const rules = effectiveSettings(validateSettings(game.rules));
  const deck = generateDeck([], rules, { seed: `memory-v1:${day}` });
  if (JSON.stringify(game.deck) !== JSON.stringify(deck)) throw new Error("The saved daily board is invalid.");
  const keys = deck.pairs.map((pair) => pair.key);
  for (const name of ["matched", "revealed", "assisted"]) {
    if (!Array.isArray(game[name]) || new Set(game[name]).size !== game[name].length || game[name].some((key) => !keys.includes(key))) throw new Error("Invalid daily progress.");
  }
  for (const name of ["moves", "flips", "mismatches", "correct", "hints"]) {
    if (!Number.isInteger(game[name]) || game[name] < 0) throw new Error("Invalid daily statistics.");
  }
  if (!Array.isArray(game.open) || game.open.length > 2 || new Set(game.open).size !== game.open.length
    || game.open.some((id) => !deck.cards.some((card) => card.id === id && !game.matched.includes(card.key)))
    || !Array.isArray(game.scores) || game.scores.length !== 2 || game.scores.some((n) => !Number.isInteger(n) || n < 0)
    || game.player !== 0 || !Number.isFinite(game.started) || game.started < 0
    || !(game.stopped === null || Number.isFinite(game.stopped) && game.stopped >= game.started)
    || !(game.resolvingAt === null || Number.isFinite(game.resolvingAt))
    || typeof game.ended !== "boolean" || typeof game.won !== "boolean" || typeof game.reason !== "string"
    || game.ended !== (game.stopped !== null) || game.won !== (game.matched.length === deck.pairs.length && game.ended)
    || (game.open.length === 2) !== (game.resolvingAt !== null)) throw new Error("Invalid daily round state.");
  return { ...game, rules, deck };
}
