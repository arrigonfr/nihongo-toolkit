import { toHiragana, toKana } from "wanakana";
import { conjugate } from "./conjugation.js";
import { wordCategories, formCatalog } from "./conjugation-practice-data.js";
import { isFontSetting } from "./japanese-fonts.js";
import { matchesFilters, validFilter } from "./conjugation-filter-match.js";

export const modes = {
  classic: "Classic Drill", quick: "Quick Practice", marathon: "Marathon",
  timed: "Timed Challenge", sudden: "Sudden Death",
  weak: "Weak Form Focus", mixed: "Mixed Review", comparison: "Form Comparison",
  reverse: "Reverse Mode", irregular: "Irregular Verbs Focus"
};
export const reverseTasks = ["base", "form", "polarity", "tense", "politeness"];
export const taskList = (value) => value === "all" ? [...reverseTasks] : String(value).split(",").filter((task) => reverseTasks.includes(task));
export const defaults = {
  mode: "classic", levels: [5], types: Object.keys(wordCategories),
  forms: ["basic", "te"],
  politeness: "both", polarity: "both", tense: "both", script: "furigana", input: "either",
  language: "both", prompt: "name", questions: 10, seconds: 120, mistakes: 3,
  hints: "unlimited", reveals: "unlimited", hintLimit: 3, revealLimit: 3,
  repeat: true, priority: "balanced", timer: true, examples: false, autoAdvance: false,
  meaning: true, type: true, fontSize: 40, font: "Noto Sans JP", reverseTask: "base"
};

export function cleanSettings(saved = {}) {
  if (!saved || typeof saved !== "object") throw new Error("Invalid practice settings.");
  const result = { ...defaults };
  const enums = {
    mode: Object.keys(modes), font: { includes: isFontSetting }, politeness: { includes: (value) => validFilter("politeness", value) },
    polarity: { includes: (value) => validFilter("polarity", value) }, tense: { includes: (value) => validFilter("tense", value) }, script: ["kanji", "kana", "furigana"],
    input: ["kana", "kanji", "both", "either"], language: ["ja", "en", "both"],
    prompt: ["name", "description", "mixed"], hints: ["unlimited", "limited", "disabled"],
    reveals: ["unlimited", "limited", "disabled"], priority: ["balanced", "new", "review"],
    reverseTask: { includes: (value) => typeof value === "string" && (value === "all" || value.split(",").every((task) => reverseTasks.includes(task))) }
  };
  for (const [key, value] of Object.entries(saved)) {
    if (enums[key]?.includes(value) || typeof defaults[key] === "boolean" && typeof value === "boolean") result[key] = value;
  }
  for (const [key, min, max] of [["questions", 1, 100], ["seconds", 10, 3600], ["mistakes", 0, 100], ["hintLimit", 1, 100], ["revealLimit", 1, 100], ["fontSize", 24, 64]]) {
    if (Number.isInteger(saved[key]) && saved[key] >= min && saved[key] <= max) result[key] = saved[key];
  }
  const legacyLimit = saved.assistanceLimit;
  if (Number.isInteger(legacyLimit) && legacyLimit >= 1 && legacyLimit <= 100) {
    for (const key of ["hintLimit", "revealLimit"]) if (saved[key] === undefined) result[key] = legacyLimit;
  }
  if (saved.font === "default") result.font = defaults.font;
  for (const [key, allowed] of [["levels", [5, 4, 3, 2, 1]], ["types", Object.keys(wordCategories)], ["forms", Object.keys(formCatalog)]]) {
    const values = key === "forms" && Array.isArray(saved[key])
      ? saved[key].map((item) => ["present", "negative", "past", "pastNegative", "ta", "nai", "formalNegative"].includes(item) ? "basic" : item)
      : saved[key];
    result[key] = Array.isArray(values) ? [...new Set(values.filter((item) => allowed.includes(item)))] : [...defaults[key]];
  }
  const legacyTraits = {
    present: ["affirmative", "non-past"], negative: ["negative", "non-past"],
    past: ["affirmative", "past"], pastNegative: ["negative", "past"],
    ta: ["affirmative", "past"], nai: ["negative", "non-past"]
  };
  if (Array.isArray(saved.forms) && saved.forms.some((form) => legacyTraits[form])
    && saved.forms.every((form) => legacyTraits[form] || form === "te")) {
    const finite = saved.forms.filter((form) => legacyTraits[form]);
    for (const [index, field] of ["polarity", "tense"].entries()) {
      const selected = [...new Set(finite.map((form) => legacyTraits[form][index]))];
      if (result[field] === "both" && selected.length === 1) result[field] = selected[0];
    }
    if (finite.every((form) => ["ta", "nai"].includes(form)) && result.politeness === "both") result.politeness = "plain";
  }
  return { ...result, input: "either", language: "both", priority: "balanced", repeat: true, examples: false };
}

export function familyOf(row) {
  const id = row.id;
  if (id.startsWith("basic-") || /^(present|negative|past|pastNegative)-(plain|polite)$/.test(id)) return "basic";
  if (["ta", "nai"].includes(id)) return null;
  if (["negative-te", "polite-te"].includes(id)) return "te";
  if (id === "negative-request") return "request";
  if (id === "prohibitive") return "imperative";
  if (id === "formal-copula") return "formalCopula";
  for (const family of ["potential", "passive", "causativePassive", "causative", "progressive", "desire", "volitional"]) {
    if (id.startsWith(family + "-")) return family;
  }
  if (id === "honor-0") return "respectful";
  if (id === "honor-1") return "humble";
  if (id === "contracted-causative-passive") return "contracted";
  if (id === "formal-negative" || id === "formal-past-negative") return "basic";
  if (/^(negative-|polite-)?(negative-)?(ba|tara)/.test(id) || id === "negativeBa" || id === "negativeTara") {
    return /tara/i.test(id) ? "tara" : "ba";
  }
  const simple = id.replace(/-(plain|polite)$/, "");
  return Object.hasOwn(formCatalog, simple) ? simple : null;
}

let bank = [];

export function loadPracticeEntries(entries) {
  if (!Array.isArray(entries)) throw new Error("Invalid dictionary practice response.");
  const seen = new Set();
  bank = entries.flatMap((value) => {
    if (!value.id || !value.tag || typeof value.word !== "string" || typeof value.reading !== "string"
      || !Array.isArray(value.meanings) || !value.meanings.length || ![1, 2, 3, 4, 5].includes(value.level)) return [];
    const reading = toHiragana(value.reading);
    const suffix = { ichidan: "る", suru: "する", kuru: "くる", zuru: "ずる", "i-adjective": "い" }[value.type];
    if (!/^[ぁ-ゖー]+$/.test(reading) || suffix && !reading.endsWith(suffix)) return [];
    if (value.type === "godan" && !/[うくぐすつぬぶむる]$/.test(reading)) return [];
    const category = ["kuru", "zuru"].includes(value.type) || value.type === "suru" && reading === "する" ? "irregular" : value.type;
    if (!Object.hasOwn(wordCategories, category)) return [];
    const entry = { ...value, reading, category, irregular: category === "irregular" || ["v1-s", "v5u-s", "v5k-s", "v5r-i", "v5aru", "vs-s"].includes(value.tag) };
    return conjugate(entry).flatMap((row) => {
      const family = familyOf(row);
      if (!family) return [];
      const key = `${entry.id}|${row.id}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ key, entry, row, family, level: Math.min(entry.level, formCatalog[family].level) }];
    });
  });
  return bank.length;
}

export function createPool(settings, progress = {}) {
  if (!settings.levels.length || !settings.types.length || !settings.forms.length) return [];
  return bank.filter(({ key, entry, row, family, level }) =>
    settings.levels.includes(level) && settings.types.includes(entry.category)
    && settings.forms.includes(family)
    && matchesFilters(row, settings)
    && (settings.mode !== "irregular" || entry.irregular)
    && (settings.mode !== "mixed" || progress[key]?.attempts > 0)
    && (settings.mode !== "weak" || progress[key]?.wrong > 0 || progress[key]?.review)
    && (settings.mode !== "comparison" || ["potential", "passive", "causative", "causativePassive"].includes(family)));
}

export function normalizeAnswer(text) {
  return toHiragana(toKana(String(text).normalize("NFKC").trim().toLowerCase().replace(/[\s。.!！?？]/g, "")));
}

function spellings(question) {
  const { entry, row } = question;
  const pairs = [[row.word, row.reading]];
  if ((entry.type === "i-adjective" || question.family === "desire") && row.politeness === "polite") {
    if (row.word.endsWith("くないです")) pairs.push([row.word.replace(/くないです$/, "くありません"), row.reading.replace(/くないです$/, "くありません")]);
    if (row.word.endsWith("くなかったです")) pairs.push([row.word.replace(/くなかったです$/, "くありませんでした"), row.reading.replace(/くなかったです$/, "くありませんでした")]);
  }
  if (["na-adjective", "copula"].includes(entry.type) && row.politeness === "polite") {
    if (row.word.endsWith("ではありません")) pairs.push([row.word.replace(/ではありません$/, "ではないです"), row.reading.replace(/ではありません$/, "ではないです")]);
    if (row.word.endsWith("ではありませんでした")) pairs.push([row.word.replace(/ではありませんでした$/, "ではなかったです"), row.reading.replace(/ではありませんでした$/, "ではなかったです")]);
  }
  if (!entry.type.endsWith("adjective") && entry.type !== "copula" && question.family !== "desire"
    && row.politeness === "polite" && row.polarity === "negative" && row.tense !== "neutral") {
    const plain = bank.find((candidate) => candidate.key === `${entry.id}|${row.id.replace(/-polite$/, "-plain")}`);
    if (plain && /ない$|なかった$/.test(plain.row.reading)) {
      pairs.push([plain.row.word + "です", plain.row.reading + "です"]);
    }
  }
  for (const [word, reading] of [...pairs]) {
    if (word.includes("では")) pairs.push([word.replace("では", "じゃ"), reading.replace("では", "じゃ")]);
  }
  if (question.family === "progressive" || entry.ongoing) {
    const contraction = /([てで])い(?=る$|ない(?:です)?$|なかった(?:です)?$|た$|ます$|ません$|ました$|ませんでした$)/;
    for (const [word, reading] of [...pairs]) pairs.push([word.replace(contraction, "$1"), reading.replace(contraction, "$1")]);
  }
  if (row.id === "imperative" && entry.type === "suru") pairs.push([row.word.replace(/しろ$/, "せよ"), row.reading.replace(/しろ$/, "せよ")]);
  if (row.id === "imperative" && entry.type === "ichidan" && entry.tag !== "v1-s") pairs.push([row.word.replace(/ろ$/, "よ"), row.reading.replace(/ろ$/, "よ")]);
  if (question.family === "causativePassive" && entry.type === "godan" && !entry.reading.endsWith("す")) {
    for (const [word, reading] of [...pairs]) pairs.push([word.replace("せられ", "され"), reading.replace("せられ", "され")]);
  }
  for (const [word, reading] of [...pairs]) {
    if (word.includes("でき")) pairs.push([word.replace("でき", "出来"), reading]);
    if (word === "いただく") pairs.push(["頂く", reading], ["戴く", reading]);
    if (entry.word === "いい" && word.startsWith("よ")) pairs.push(["良" + word.slice(1), reading]);
    if (entry.word === "いい" && word.startsWith("いい")) {
      pairs.push(["良い" + word.slice(2), "よい" + reading.slice(2)], ["よい" + word.slice(2), "よい" + reading.slice(2)]);
    }
  }
  return pairs;
}

function mixedPattern(word, reading) {
  const parts = word.match(/\p{Script=Han}+|[^\p{Script=Han}]+/gu) || [];
  const escapeRE = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = reading.match(new RegExp("^" + parts.map((part) => /\p{Script=Han}/u.test(part) ? "(.+?)" : escapeRE(part)).join("") + "$"));
  let index = 1;
  return new RegExp("^" + parts.map((part) => /\p{Script=Han}/u.test(part) && match
    ? `(?:${escapeRE(part)}|${escapeRE(match[index++])})` : escapeRE(part)).join("") + "$");
}

function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) {
    const next = [i + 1];
    for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, previous[j + 1] + 1, previous[j] + (a[i] === b[j] ? 0 : 1)));
    previous = next;
  }
  return previous[b.length];
}

export function evaluateAnswer(question, input, script = "either", reverseBase = false) {
  const answer = normalizeAnswer(input);
  const pairs = reverseBase ? [[question.entry.word, question.entry.reading]] : spellings(question);
  const valid = answer && pairs.some(([word, reading]) => {
    word = normalizeAnswer(word); reading = normalizeAnswer(reading);
    if (script === "kana") return answer === reading;
    if (script === "kanji") return answer === word;
    if (script === "both") {
      const supplied = String(input).split(/[/／]/).map(normalizeAnswer);
      return supplied.length === 2 && supplied[0] === word && supplied[1] === reading;
    }
    return answer === reading || mixedPattern(word, reading).test(answer);
  });
  if (valid) return "correct";
  const near = answer && pairs.some(([word, reading]) => distance(answer, normalizeAnswer(word)) === 1 || distance(answer, reading) === 1);
  return near ? "near" : "incorrect";
}

export function answerHint(question, input) {
  const alternate = bank.find((candidate) => candidate.entry.word === question.entry.word
    && evaluateAnswer(candidate, input) === "correct");
  if (alternate) {
    for (const [trait, label] of [["polarity", "polarity: affirmative or negative"], ["politeness", "politeness level"], ["tense", "tense: past or non-past"]]) {
      if (alternate.row[trait] !== question.row[trait]) return `Check the ${label}.`;
    }
    if (alternate.family !== question.family) return "Check the requested conjugation form.";
  }
  return "Check the word type and its ending.";
}

export function chooseQuestion(pool, progress, { priority = "balanced", mode = "classic" } = {}, previous, random = Math.random) {
  const candidates = pool.length > 1 ? pool.filter((q) => q.key !== previous) : pool;
  if (!candidates.length) return null;
  const errorsByForm = {};
  const seenWords = new Set();
  for (const [key, record] of Object.entries(progress)) {
    if (record.attempts > 0) seenWords.add(key.split("|")[0]);
    const form = key.split("|")[1];
    errorsByForm[form] = (errorsByForm[form] || 0) + record.wrong;
  }
  const weights = candidates.map((q) => {
    const record = progress[q.key];
    const errors = (record?.wrong || 0) + Number(Boolean(record?.review));
    const formErrors = errorsByForm[q.row.id] || 0;
    const weakness = Math.min(8, errors * 2 / Math.max(1, record?.correct || 0) + formErrors / 4);
    return 1 + weakness * (mode === "weak" ? 3 : 1)
      + (priority === "new" && !seenWords.has(q.entry.id) ? 6 : priority === "review" && seenWords.has(q.entry.id) ? 6 : 0);
  });
  let target = random() * weights.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < candidates.length; i++) {
    target -= weights[i];
    if (target < 0) return candidates[i];
  }

  return candidates.at(-1);
}

export function ruleFor(question) {
  return question.row.note;
}

export class PracticeSession {
  constructor(settings, progress = {}, now = Date.now(), random = Math.random, previousSessionWords = []) {
    this.settings = cleanSettings(settings);
    if (!bank.length) throw new Error("No dictionary-backed practice vocabulary is available. Load the dictionary and JLPT vocabulary database, then retry.");
    this.pool = createPool(this.settings, progress);
    if (!this.pool.length) throw new Error(this.settings.mode === "weak"
      ? "No missed word–form pairs match. Practice first or broaden your filters."
      : this.settings.mode === "mixed"
      ? "No previously practiced questions match. Try Classic Drill first or broaden your filters."
      : "No questions match. Broaden the level, word type or form selection. Comparison needs voice forms at N4–N1; honorifics need N2–N1.");
    if (!Array.isArray(previousSessionWords) || previousSessionWords.some((word) => typeof word !== "string")) {
      throw new Error("Invalid previous practice session words.");
    }
    this.progress = progress;
    this.started = now;
    this.random = random;
    const requestedLimit = this.settings.mode === "quick" ? 5
      : ["marathon", "timed", "sudden"].includes(this.settings.mode) ? Infinity : this.settings.questions;
    this.requestedLimit = requestedLimit;
    this.limit = Number.isFinite(requestedLimit) ? Math.min(requestedLimit, this.pool.length) : requestedLimit;
    this.recent = new Set();
    if (this.settings.priority === "balanced" && !["weak", "mixed"].includes(this.settings.mode)) {
      for (const word of previousSessionWords) this.recent.add(word);
      const recentQuestions = this.pool
        .filter(({ key }) => progress[key]?.attempts > 0)
        .sort((first, second) => (progress[second.key].last || 0) - (progress[first.key].last || 0))
        .slice(0, Math.min(Number.isFinite(this.limit) ? this.limit : 10, Math.floor(this.pool.length / 2)));
      for (const question of recentQuestions) this.recent.add(question.entry.word);
    }
    this.deadline = this.settings.mode === "timed" ? now + this.settings.seconds * 1000 : Infinity;
    this.results = [];
    this.seen = new Set();
    this.askedWords = new Set();
    this.questionCount = 0;
    this.repeats = [];
    this.repeatKeys = new Set();
    this.hints = 0;
    this.reveals = 0;
    this.ended = false;
    this.reason = "";
    this.next(now);
  }
  get completionReady() {
    return this.questionCount >= this.limit && this.repeats.length === 0;
  }
  end(reason, now = Date.now()) {
    if (this.ended) return;
    this.ended = true; this.reason = reason; this.finished ??= now;
  }
  expire(now = Date.now()) {
    if (now >= this.deadline) this.end("Time is up", this.deadline);
    return this.ended;
  }
  next(now = Date.now()) {
    if (this.expire(now)) return;
    if (this.current && !this.scored) return;
    if (this.pendingEnd) { this.end(this.pendingEnd, now); return; }
    if (this.completionReady) { this.end("Session complete", now); return; }
    const due = this.questionCount >= this.limit && this.repeats.length ? 0 : -1;
    if (due < 0 && this.questionCount >= this.limit) { this.end("Session complete", now); return; }
    const previous = this.current?.key;
    let remaining = this.pool.filter((question) => !this.seen.has(question.key));
    if (!remaining.length) { this.seen.clear(); remaining = this.pool; }
    const fresh = remaining.filter((question) => !this.recent.has(question.entry.word));
    if (fresh.length) remaining = fresh;
    this.currentIsRepeat = due >= 0;
    this.current = this.currentIsRepeat ? this.repeats.splice(due, 1)[0].question
      : chooseQuestion(remaining, this.progress, this.settings, previous, this.random);
    if (!this.currentIsRepeat) {
      this.questionCount++;
      this.askedWords.add(this.current.entry.word);
    }
    this.seen.add(this.current.key);
    this.prompt = this.settings.prompt === "mixed"
      ? ["name", "description"][Math.floor(this.random() * 2)] : this.settings.prompt;
    if (this.settings.mode === "reverse") {
      const tasks = taskList(this.settings.reverseTask);
      this.task = tasks.length > 1 ? tasks[Math.floor(this.random() * tasks.length)] : tasks[0] || "base";
    }
    this.scored = false; this.assisted = false; this.hintStep = 0; this.answer = ""; this.feedback = null;
  }
  canAnswer() {
    return !this.ended && !this.pendingEnd && !["correct", "revealed"].includes(this.feedback);
  }
  canAssist(kind) {
    const availability = this.settings[kind];
    return !this.ended && (kind === "reveals" || !this.pendingEnd) && !["correct", "revealed"].includes(this.feedback) && availability !== "disabled"
      && (availability === "unlimited" || this[kind] < this.settings[kind === "hints" ? "hintLimit" : "revealLimit"]);
  }
  hint(now = Date.now()) {
    if (this.expire(now) || !this.canAssist("hints")) return false;
    this.hints++; this.hintStep++; this.assisted = true;
    return true;
  }
  submit(answer, { reveal = false, choice = false } = {}, now = Date.now()) {
    if (this.expire(now) || !reveal && !this.canAnswer() || reveal && !this.canAssist("reveals")) return null;
    if (!reveal && !normalizeAnswer(answer)) return null;
    if (reveal) { this.reveals++; this.assisted = true; }
    const reverse = this.settings.mode === "reverse";
    const targets = this.settings.mode === "comparison" || reverse && this.task === "form"
      ? this.identifications().map((item) => item.family)
      : reverse ? this.identifications().map((item) => item.row[this.task]) : [];
    const grade = reveal ? "revealed" : choice
      ? targets.includes(answer) ? "correct" : "incorrect"
      : evaluateAnswer(this.current, answer, this.settings.input, reverse);
    if (!reveal) this.answer = answer;
    this.feedback = grade;
    if (!this.scored) {
      const correct = grade === "correct" && !this.assisted;
      const result = { key: this.current.key, word: this.current.entry.word, family: this.current.family,
        correct, assisted: this.assisted, grade, answer, repeat: this.currentIsRepeat, seconds: Math.max(0, (now - this.started) / 1000) };
      this.results.push(result);
      const record = this.progress[result.key] || { attempts: 0, correct: 0, wrong: 0 };
      this.progress[result.key] = { attempts: record.attempts + 1, correct: record.correct + Number(correct),
        wrong: record.wrong + Number(!correct), last: now };
      this.scored = true;
      if (!correct && this.settings.repeat && !this.repeatKeys.has(result.key)
        && this.settings.mode !== "sudden") {
        this.repeatKeys.add(result.key);
        this.repeats.push({ question: this.current, after: Math.min(this.questionCount + 1, this.limit) });
      }
      const wrong = this.results.filter((r) => !r.correct).length;
      if (!correct && this.settings.mode === "sudden") this.pendingEnd = "Sudden Death ended";
      if (this.settings.mode === "marathon" && this.settings.mistakes > 0 && wrong >= this.settings.mistakes) this.pendingEnd = "Mistake limit reached";
      if (this.pendingEnd || this.completionReady) this.finished = now;
    }
    return grade;
  }
  retry() {
    if (this.ended || this.pendingEnd || !this.feedback || this.feedback === "correct") return false;
    this.feedback = null; this.answer = "";
    return true;
  }
  identifications() {
    // Homographs (e.g. 食べられる: potential/passive) accept every valid analysis,
    // even when that analysis was excluded by the session's selection.
    return bank.filter((q) => q.entry.word === this.current.entry.word && q.row.word === this.current.row.word);
  }
  summary(now = Date.now()) {
    const questions = this.results.filter((result) => !result.repeat);
    const correct = questions.filter((r) => r.correct).length;
    return { total: questions.length, correct, incorrect: questions.length - correct,
      accuracy: questions.length ? Math.round(correct / questions.length * 100) : 0,
      seconds: Math.max(0, Math.round(((this.finished ?? now) - this.started) / 1000)),
      forms: [...new Set(questions.map((r) => r.family))],
      review: [...new Set(questions.filter((r) => !r.correct).map((r) => r.word))] };
  }
}

function shuffled(values, random) {
  const list = [...values];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
// Always keeps the correct values, fills the rest with a fresh random subset and shuffles the order.
export function sampleChoices(values, correct, size = 5, random = Math.random) {
  if (values.length <= size) return values;
  const targets = values.filter((value) => correct.includes(value)).slice(0, size);
  const pool = shuffled(values.filter((value) => !targets.includes(value)), random);
  return shuffled([...targets, ...pool].slice(0, size), random);
}
