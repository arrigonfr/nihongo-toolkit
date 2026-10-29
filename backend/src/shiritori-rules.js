import { matchesLevel } from "../../frontend/src/jlpt-levels.js";

export const DEFAULT_RULES = {
  entry: "both", mode: "classic", level: "all", category: "all",
  voicing: false, proper: "none", wordType: "all",
  hints: "limited", hintLimit: 3, reveal: true, revealLimit: 3, timer: 30, bonus: true
};

export const CATEGORIES = {
  all: "All words", nouns: "Nouns only", food: "Food and drink", animals: "Animals",
  nature: "Nature", travel: "Travel", school: "School", work: "Work",
  daily: "Daily life", emotions: "Emotions", technology: "Technology", katakana: "Katakana loanwords"
};
// JMdict has no complete thematic taxonomy; these are transparent gloss-based study filters.
const categoryPatterns = {
  food: /\b(food|drink|fruit|vegetable|meat|rice|tea|coffee|bread|cake|meal|soup|egg|milk|sugar|salt|wine|beer|restaurant|cooking|apple|banana)\b/i,
  animals: /\b(animal|bird|dog|cat|fish|insect|horse|cow|pig|sheep|monkey|bear|rabbit|fox|tiger|lion|elephant|giraffe|turtle|snake|frog|whale|dolphin|deer|mouse|butterfly)\b/i,
  nature: /\b(nature|tree|flower|grass|forest|mountain|river|sea|ocean|lake|sky|cloud|rain|snow|wind|sun|moon|star|earth|stone|island|valley|weather)\b/i,
  travel: /\b(travel|trip|journey|train|station|bus|car|airplane|airport|hotel|ticket|passport|map|road|ship|boat|bicycle|tour|sightseeing|luggage)\b/i,
  school: /\b(school|university|class|lesson|study|teacher|student|exam|homework|textbook|book|dictionary|notebook|pen|pencil|library|education|mathematics)\b/i,
  work: /\b(work|job|company|office|business|boss|manager|colleague|meeting|salary|bank|industry|factory|trade|contract|report|career|employment)\b/i,
  daily: /\b(morning|evening|night|sleep|bed|wash|bath|shower|clothes|shirt|shoes|room|house|home|door|window|chair|table|desk|clock|key|umbrella|bag|cleaning|shopping)\b/i,
  emotions: /\b(feeling|emotion|happiness|happy|joy|sad|sorrow|anger|fear|worry|anxiety|calm|peace|relief|surprise|loneliness|love|hate|envy|pride|shame|regret|hope|mood)\b/i,
  technology: /\b(technology|computer|machine|device|electricity|electric|electronic|internet|network|website|data|system|program|software|hardware|phone|camera|television|radio|video|screen|engine|digital|robot)\b/i
};
export const isKanji = (text) => /^\p{Script=Han}$/u.test(text);
const REPEATER = "々";
// Kanji chains (Kanji Shiritori mode or Kanji word entry) connect by spelling only, never by pronunciation.
export const kanjiChain = (rules) => rules.mode === "kanji" || rules.entry === "kanji";
export const READING_ENDING_RULE = "The pronunciation must not end in ん / ン, を / ヲ, or ー, even when written in kanji.";
export function kana(text) {
  return String(text).normalize("NFKC").replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
export function wordEndingError(text, rules) {
  const reading = kana(text);
  if ((rules.entry === "kana" || kanjiChain(rules)) && /[んをー]$/.test(reading)) return READING_ENDING_RULE;
  if (reading.endsWith("ん")) return "Words ending in ん / ン are not accepted.";
  return "";
}
export function morae(text) {
  return [...kana(text)].filter((c, i) => i === 0 || !"ゃゅょぁぃぅぇぉゎ".includes(c)).length;
}
const unvoice = (text) => text.normalize("NFD").replace(/[\u3099\u309a]/g, "").normalize("NFC");
const SMALL = "ゃゅょぁぃぅぇぉゎ";
// A syllable is a kana with its small ゃゅょぁぃぅぇぉゎ and long-vowel ー attached (しょ, ひー).
export function syllables(text) {
  const units = [];
  for (const c of kana(text)) {
    if (units.length && (SMALL + "ー").includes(c)) units[units.length - 1] += c;
    else units.push(c);
  }
  return units;
}
// Every legal way to begin the next word: the last N syllables of the reading (N < length, so an answer never
// restarts the whole previous word) and the trailing kanji / kanji compound of the spelling.
export function startOptions(previous, rules = DEFAULT_RULES) {
  if (!previous) return { kana: [], kanji: [] };
  const reading = syllables(previous.reading);
  const options = { kana: [], kanji: [] };
  if (!kanjiChain(rules)) {
    for (let size = 1; size <= Math.max(1, reading.length - 1); size++) {
      const head = reading.slice(-size, -1).join("");
      const text = head + reading.at(-1);
      if (text && !/^[っんー]/.test(text) && !options.kana.some((o) => o.text === text)) options.kana.push({ text, size });
    }
  }
  const spelling = [...String(previous.word)];
  const last = spelling.findLastIndex((c) => isKanji(c) && c !== REPEATER);
  for (let i = 1; last >= 0 && i <= last; i++) {
    if (!isKanji(spelling[i]) || spelling[i] === REPEATER) continue;
    for (const end of [last + 1, spelling.length]) {
      const text = spelling.slice(i, end).join("");
      if (text.endsWith(REPEATER)) continue;
      if (!options.kanji.some((o) => o.text === text)) options.kanji.push({ text, size: end - i });
    }
  }
  options.kanji.sort((a, b) => a.size - b.size);
  return options;
}
export function requiredStart(word, rules = DEFAULT_RULES) {
  const { kana: k, kanji } = startOptions(word, rules);
  return (kanjiChain(rules) ? kanji[0] : k[0] || kanji[0])?.text || "";
}
export function startChoices(word, rules = DEFAULT_RULES) {
  const { kana: k, kanji } = startOptions(word, rules);
  return [...k, ...kanji].map((o) => o.text);
}
// Returns the longest legal overlap between the previous word and this one, or null.
export function connection(word, previous, rules = DEFAULT_RULES) {
  if (!previous) return { kind: "none", text: "", size: 0 };
  const options = startOptions(previous, rules);
  const reading = kana(word.reading);
  const plain = rules.voicing ? unvoice : (text) => text;
  const count = syllables(reading).length;
  let best = null;
  for (const option of options.kana) {
    const start = plain(option.text);
    const next = [...plain(reading)][[...start].length];
    if (count > option.size && plain(reading).startsWith(start) && !(next && SMALL.includes(next) && !(option.text.endsWith("ゔ") && "ぁぃぅぇぉ".includes(next))) && (!best || option.size > best.size)) {
      best = { kind: "kana", ...option };
    }
  }
  const spelling = String(word.word);
  for (const option of options.kanji) {
    if ([...spelling].length > option.size && spelling.startsWith(option.text) && (!best || option.size > best.size)) {
      best = { kind: "kanji", ...option };
    }
  }
  return best;
}
export const connects = (word, previous, rules) => Boolean(connection(word, previous, rules));
export function matchesCategory(word, category) {
  if (category === "all") return true;
  if (category === "nouns") return /\bnoun\b/i.test(word.partOfSpeech);
  if (category === "katakana") return /^[ァ-ヶー]+$/.test(word.word) || /^[ァ-ヶー]+$/.test(word.reading);
  const gloss = word.meaning.replace(/\([^)]*\)/g, "").trim();
  if (category === "animals") {
    return /\bnoun\b/i.test(word.partOfSpeech) && gloss.split(";").some((sense) =>
      /^(?:(?:domestic|wild|Japanese|African|Asian|polar|brown|black|red|white|giant|sea) )?(?:animal|bird|dog|cat|fish|insect|horse|cow|pig|sheep|monkey|bear|rabbit|fox|tiger|lion|elephant|giraffe|turtle|snake|frog|whale|dolphin|deer|mouse|butterfly|gorilla|llama|panda|boar|wolf|duck|chicken|penguin|octopus|squid|crab|shrimp|ant|bee|beetle|cicada)s?$/i.test(sense.trim()));
  }
  return Boolean(categoryPatterns[category]?.test(gloss));
}
export function eligibility(word, rules) {
  if (!word || !word.meaning || !/^[ぁ-ゖー]+$/.test(kana(word.reading))) return "Not in the accepted vocabulary.";
  const endingError = wordEndingError(word.reading, rules);
  if (endingError) return endingError;
  if (/[をヲ]/.test(kana(word.reading)) || /[をヲ]/.test(word.word)) return "を / ヲ cannot be used.";
  if (kanjiChain(rules) && ![...word.word].every(isKanji)) return "Kanji chains only accepts words written entirely in kanji.";
  if (kanjiChain(rules) && [...word.word].length < 2) return "Kanji chains need words of two or more characters.";
  if (kanjiChain(rules) && [...word.word].at(-1) === REPEATER) return "In kanji chains a word cannot end with the repeater 々.";
  if (rules.level !== "all") {
    if (!matchesLevel(word.level, rules.level)) {
      return `Outside JLPT selection ${rules.level}.${word.level == null ? " Select Non-JLPT to include unrated words." : ""}`;
    }
  }
  if (!matchesCategory(word, rules.category)) return `Outside the ${CATEGORIES[rules.category]} vocabulary category.`;
  const pos = word.partOfSpeech || "";
  if (rules.proper === "none" && word.proper) return "Proper nouns are disabled.";
  if (rules.proper === "names" && word.proper && !word.nameAllowed) return "Only place and person names are allowed as proper nouns.";
  if (rules.wordType !== "all") {
    const patterns = { nouns: /\bnoun\b/i, verbs: /\b(noun|verb)\b/i, adjectives: /\b(noun|adjective)\b/i };
    if (!patterns[rules.wordType].test(pos)) return `This part of speech is not allowed (${rules.wordType}).`;
  }
  const count = morae(word.reading);
  if (rules.mode === "beginner" && count > 4) return `Beginner mode allows up to 4 morae; this word has ${count}.`;
  return "";
}
export function validateWord(word, previous, used, rules) {
  const error = eligibility(word, rules);
  if (error) return { ok: false, reason: "vocabulary rule", message: error };
  if (!connects(word, previous, rules)) {
    const [first, ...more] = startChoices(previous, rules);
    return { ok: false, reason: "invalid connection", message: `Start with ${first}${more.length ? ` (or a longer overlap: ${more.join(" / ")})` : ""}. The word must be longer than the part it shares with the previous word.` };
  }
  if (used.some((item) => item.id === word.id || kana(item.reading) === kana(word.reading) && kana(item.word) === kana(word.word))) {
    return { ok: false, reason: "word already used", message: "This word has already been used in this round (including alternate spellings)." };
  }
  return { ok: true };
}
export function scoreWord(word, previous, rules, bonusKana = "") {
  const base = word.level ? (6 - word.level) * 10 : 10;
  const overlap = connection(word, previous, rules)?.size || 0;
  const overlapBonus = rules.bonus ? Math.max(0, overlap - 1) * 5 : 0;
  const kanaBonus = rules.bonus && bonusKana && kana(word.reading).includes(bonusKana) ? 15 : 0;
  const marathonBonus = rules.mode === "marathon" ? 5 : 0;
  return { base, overlapBonus, kanaBonus, marathonBonus, total: base + overlapBonus + kanaBonus + marathonBonus };
}

export function parseRules(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Invalid Shiritori settings.");
  const rules = { ...DEFAULT_RULES };
  const enums = {
    entry: ["kana", "kanji", "both"],
    mode: ["classic", "relaxed", "timed", "sudden", "daily", "category", "kanji", "katakana", "beginner", "marathon"],
    category: Object.keys(CATEGORIES),
    proper: ["none", "names"], wordType: ["all", "nouns", "verbs", "adjectives"],
    hints: ["unlimited", "limited", "disabled"]
  };
  for (const key of Object.keys(DEFAULT_RULES)) {
    if (!(key in input)) continue;
    const value = input[key];
    if (enums[key] ? !enums[key].includes(value)
      : key === "level" ? !/^(all|none|unrated|N[1-5]-N[1-5]|N?[1-5](?:,(?:N?[1-5]|unrated))*)$/.test(value)
      : typeof rules[key] === "boolean" ? typeof value !== "boolean"
      : !Number.isInteger(value) || value < (key === "hintLimit" || key === "revealLimit" ? 0 : 1) || value > (key === "timer" ? 120 : 30)) {
      throw new Error(`Invalid Shiritori setting: ${key}`);
    }
    rules[key] = value;
  }
  if (rules.mode === "relaxed") rules.hints = "unlimited";
  if (rules.mode === "katakana") rules.category = "katakana";
  if (rules.mode === "beginner") rules.hints = "unlimited";
  if (rules.mode === "category" && rules.category === "all") throw new Error("Choose a category for Category Shiritori.");
  if (rules.mode === "daily") return { ...DEFAULT_RULES, mode: "daily", hints: "disabled", reveal: false };
  if (rules.mode === "kanji" && rules.entry === "kana") throw new Error("Kanji chains need Kanji or Both entry mode.");
  return rules;
}

// `used` is the player's { hints, reveals } counters for the current round.
export function assistAllowed(rules, used, kind) {
  if (kind === "reveal") return Boolean(rules.reveal) && (used.reveals || 0) < rules.revealLimit;
  return rules.hints === "unlimited" || rules.hints === "limited" && (used.hints || 0) < rules.hintLimit;
}
