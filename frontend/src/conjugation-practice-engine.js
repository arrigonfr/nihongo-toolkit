import { toHiragana, toKana } from "wanakana";
import { conjugate } from "./conjugation.js";
import { practiceWords, wordCategories, formCatalog } from "./conjugation-practice-data.js";
import { isFontSetting } from "./japanese-fonts.js";
import { matchesFilters, validFilter } from "./conjugation-filter-match.js";

export const modes = {
  classic: "Classic Drill", quick: "Quick Practice", marathon: "Marathon",
  timed: "Timed Challenge", sudden: "Sudden Death", daily: "Daily Practice",
  weak: "Weak Form Focus", mixed: "Mixed Review", comparison: "Form Comparison",
  sentence: "Sentence Mode", reverse: "Reverse Mode", irregular: "Irregular Verbs Focus"
};
export const reverseTasks = ["base", "form", "polarity", "tense", "politeness"];
export const taskList = (value) => value === "all" ? [...reverseTasks] : String(value).split(",").filter((task) => reverseTasks.includes(task));
export const defaults = {
  mode: "classic", levels: [5], types: Object.keys(wordCategories),
  forms: ["present", "negative", "past", "pastNegative", "te"],
  politeness: "both", polarity: "both", tense: "both", script: "furigana", input: "either",
  language: "ja", prompt: "name", questions: 10, seconds: 120, mistakes: 3,
  hints: "unlimited", reveals: "unlimited", hintLimit: 3, revealLimit: 3,
  repeat: true, priority: "balanced", timer: true, examples: true,
  meaning: true, type: true, fontSize: 40, font: "Noto Sans JP", reverseTask: "base"
};

export function cleanSettings(saved = {}) {
  if (!saved || typeof saved !== "object") throw new Error("Invalid practice settings.");
  const result = { ...defaults };
  const enums = {
    mode: Object.keys(modes), font: { includes: isFontSetting }, politeness: { includes: (value) => validFilter("politeness", value) },
    polarity: { includes: (value) => validFilter("polarity", value) }, tense: { includes: (value) => validFilter("tense", value) }, script: ["kanji", "kana", "furigana"],
    input: ["kana", "kanji", "both", "either"], language: ["ja", "en", "both"],
    prompt: ["name", "description", "sentence", "mixed"], hints: ["unlimited", "limited", "disabled"],
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
    result[key] = Array.isArray(saved[key]) ? [...new Set(saved[key].filter((item) => allowed.includes(item)))] : [...defaults[key]];
  }
  return result;
}

export function familyOf(row) {
  const id = row.id;
  if (id.startsWith("basic-")) {
    return id.includes("past-negative") ? "pastNegative" : id.includes("past") ? "past" : id.includes("negative") ? "negative" : "present";
  }
  for (const family of ["potential", "passive", "causativePassive", "causative", "progressive", "desire", "volitional"]) {
    if (id.startsWith(family + "-")) return family;
  }
  if (id === "honor-0") return "respectful";
  if (id === "honor-1") return "humble";
  if (id === "contracted-causative-passive") return "contracted";
  if (id === "formal-negative" || id === "formal-past-negative") return "formalNegative";
  if (/^(negative-|polite-)?(negative-)?(ba|tara)/.test(id) || id === "negativeBa" || id === "negativeTara") {
    return /tara/i.test(id) ? "tara" : "ba";
  }
  const simple = id.replace(/-(plain|polite)$/, "");
  return Object.hasOwn(formCatalog, simple) ? simple : null;
}

export function supportsExample(entry, family) {
  if (!family) return false;
  if (entry.existential) return ["present", "negative", "past", "pastNegative", "te", "ta", "nai", "ba", "tara"].includes(family);
  if (entry.category === "auxiliary") return ["present", "negative", "past", "pastNegative", "te", "ta", "nai", "ba", "tara"].includes(family);
  if (family === "passive" && (!entry.participle || !entry.object)) return false;
  if (entry.word === "申す") return ["present", "negative", "past", "pastNegative", "te", "ta", "nai", "formal"].includes(family);
  return true;
}

const bank = practiceWords.flatMap((entry) => conjugate(entry).flatMap((row) => {
  const family = familyOf(row);
  if (!supportsExample(entry, family)) return [];
  return [{ key: `${entry.word}|${row.id}`, entry, row, family, level: Math.min(entry.level, formCatalog[family].level) }];
}));

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
    const plain = bank.find((candidate) => candidate.key === `${entry.word}|${row.id.replace(/-polite$/, "-plain")}`);
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

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function dailyStreak(days, now = new Date()) {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (!days.includes(localDate(date))) date.setDate(date.getDate() - 1);
  let count = 0;
  while (days.includes(localDate(date))) { count++; date.setDate(date.getDate() - 1); }
  return count;
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
    return 1 + weakness * (["weak", "daily"].includes(mode) ? 3 : 1)
      + (priority === "new" && !seenWords.has(q.entry.word) ? 6 : priority === "review" && seenWords.has(q.entry.word) ? 6 : 0);
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
  constructor(settings, progress = {}, now = Date.now(), random = Math.random) {
    this.settings = cleanSettings(settings);
    this.pool = createPool(this.settings, progress);
    if (!this.pool.length) throw new Error(this.settings.mode === "weak"
      ? "No missed word–form pairs match. Practice first or broaden your filters."
      : this.settings.mode === "mixed"
      ? "No previously practiced questions match. Try Classic Drill first or broaden your filters."
      : "No questions match. Broaden the level, word type or form selection. Comparison needs voice forms at N4–N1; honorifics need N2–N1.");
    this.progress = progress;
    this.started = now;
    this.random = random;
    this.limit = ["quick", "daily"].includes(this.settings.mode) ? 5
      : ["marathon", "timed", "sudden"].includes(this.settings.mode) ? Infinity : this.settings.questions;
    this.deadline = this.settings.mode === "timed" ? now + this.settings.seconds * 1000 : Infinity;
    this.results = [];
    this.repeats = [];
    this.hints = 0;
    this.reveals = 0;
    this.ended = false;
    this.reason = "";
    this.next(now);
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
    if (this.results.length >= this.limit) { this.end("Session complete", now); return; }
    const due = this.repeats.findIndex((item) => item.after <= this.results.length);
    const previous = this.current?.key;
    this.current = due >= 0 ? this.repeats.splice(due, 1)[0].question
      : chooseQuestion(this.pool, this.progress, this.settings, previous, this.random);
    this.prompt = this.settings.mode === "sentence" ? "sentence" : this.settings.prompt === "mixed"
      ? ["name", "description", "sentence"][Math.floor(this.random() * 3)] : this.settings.prompt;
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
        correct, assisted: this.assisted, grade, answer, seconds: Math.max(0, (now - this.started) / 1000) };
      this.results.push(result);
      const record = this.progress[result.key] || { attempts: 0, correct: 0, wrong: 0 };
      this.progress[result.key] = { attempts: record.attempts + 1, correct: record.correct + Number(correct),
        wrong: record.wrong + Number(!correct), last: now };
      this.scored = true;
      if (!correct && this.settings.repeat && !["sudden", "comparison", "reverse"].includes(this.settings.mode)) {
        this.repeats.push({ question: this.current, after: this.results.length + 1 });
      }
      const wrong = this.results.filter((r) => !r.correct).length;
      if (!correct && this.settings.mode === "sudden") this.pendingEnd = "Sudden Death ended";
      if (this.settings.mode === "marathon" && this.settings.mistakes > 0 && wrong >= this.settings.mistakes) this.pendingEnd = "Mistake limit reached";
      if (this.pendingEnd || this.results.length >= this.limit) this.finished = now;
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
    const correct = this.results.filter((r) => r.correct).length;
    return { total: this.results.length, correct, incorrect: this.results.length - correct,
      accuracy: this.results.length ? Math.round(correct / this.results.length * 100) : 0,
      seconds: Math.max(0, Math.round(((this.finished ?? now) - this.started) / 1000)),
      forms: [...new Set(this.results.map((r) => r.family))],
      review: [...new Set(this.results.filter((r) => !r.correct).map((r) => r.word))] };
  }
}

export function exampleFor({ entry: e, row: r, family }) {
  const negative = r.polarity === "negative", past = r.tense === "past" || ["te", "formal"].includes(family);
  let before = "", after = "。", english;
  if (e.existential) {
    before = "時間が";
    english = past ? negative ? "There was no time." : "There was time." : negative ? "There is no time." : "There is time.";
  } else if (e.type.endsWith("adjective") || e.type === "copula") {
    before = e.noun + (e.desire || e.type === "copula" ? "" : "は");
    const predicate = e.predicate || e.meanings[0];
    english = e.desire ? `I ${past ? negative ? "did not want" : "wanted" : negative ? "do not want" : "want"} to eat rice.`
      : `${e.english} ${past ? "was" : "is"}${negative ? " not" : ""} ${predicate}.`;
    if (family === "adverb") {
      before = e.noun + "を"; after = "する。";
      english = `Make ${e.english.toLowerCase()} ${predicate}.`;
    }
  } else {
    const object = e.object ? " " + e.object : "";
    const action = e.verb + object;
    before = "私は" + e.context;
    english = e.ongoing
      ? `I ${past ? "was" : "am"}${negative ? " not" : ""} eating rice.`
      : `I ${negative ? (past ? "did not " : "do not ") + action : (past ? e.past : e.verb) + object}.`;
    if (family === "potential") english = `I ${past ? negative ? "could not" : "could" : negative ? "cannot" : "can"} ${action}.`;
    if (family === "passive") {
      before = `${e.context.replace(/を$/, "")}は`;
      english = `${e.object[0].toUpperCase() + e.object.slice(1)} ${past ? e.objectPlural ? "were" : "was" : e.objectPlural ? "are" : "is"}${negative ? " not" : ""} ${e.participle}.`;
    }
    if (family === "causative") {
      before = "先生は私に" + e.context;
      english = `The teacher ${negative ? past ? "did not make" : "does not make" : past ? "made" : "makes"} me ${action}.`;
    }
    if (family === "causativePassive" || family === "contracted") {
      before = "私は先生に" + e.context;
      english = `I ${past ? "was" : "am"}${negative ? " not" : ""} made to ${action}.`;
    }
    if (family === "desire") english = `I ${past ? negative ? "did not want" : "wanted" : negative ? "do not want" : "want"} to ${action}.`;
    if (family === "progressive") english = `I ${past ? "was" : "am"}${negative ? " not" : ""} ${e.ing}${object}. (An ongoing action or resulting state, depending on context.)`;
    if (family === "volitional") {
      before = e.context; english = `Let’s ${action}.`;
    }
    if (family === "imperative") {
      before = "「" + e.context; after = "」と言われた。"; english = `I was told, “${action[0].toUpperCase() + action.slice(1)}!”`;
    }
    if (family === "respectful") {
      before = "先生は" + e.context; english = `The teacher will ${action}. (Respectful.)`;
    }
    if (family === "humble") english = `I will ${action}. (Humble.)`;
  }
  if (family === "te" || family === "formal") {
    after = "、その後、休んだ。";
    english = `${english.replace(/\.$/, "")}, and afterward I rested.`;
    if (e.type.endsWith("adjective") || e.existential || e.type === "copula") {
      after = "、よかった。"; english = `${english.replace(/\.$/, "")}, which was good.`;
    }
  }
  if (["ba", "tara", "nara"].includes(family)) {
    after = "、教えてください。";
    english = `If ${english.replace(/\.$/, "").replace(/^I /, "I ").replace(/^(This|Tanaka|There)/, (s) => s.toLowerCase())}, please let me know.`;
  }
  return { before, after, japanese: before + r.word + after, english };
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
