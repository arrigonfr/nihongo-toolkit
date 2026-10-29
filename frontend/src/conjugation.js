import { matchesFilters } from "./conjugation-filter-match.js";

export const typeNames = {
  ichidan: "Ru-verb · ichidan", godan: "U-verb · godan", kuru: "Irregular verb · kuru",
  suru: "Suru-verb", zuru: "Irregular verb · zuru", "i-adjective": "I-adjective",
  "na-adjective": "Na-adjective", copula: "Auxiliary · copula"
};
export const groups = {
  basic: "Basic forms", te: "Te-form and related forms", voice: "Potential, passive and causative",
  conditional: "Conditional and volitional", advanced: "Advanced and honorific"
};
const godan = {
  "う": ["わ", "い", "え", "お", "って", "った"],
  "く": ["か", "き", "け", "こ", "いて", "いた"],
  "ぐ": ["が", "ぎ", "げ", "ご", "いで", "いだ"],
  "す": ["さ", "し", "せ", "そ", "して", "した"],
  "つ": ["た", "ち", "て", "と", "って", "った"],
  "ぬ": ["な", "に", "ね", "の", "んで", "んだ"],
  "ぶ": ["ば", "び", "べ", "ぼ", "んで", "んだ"],
  "む": ["ま", "み", "め", "も", "んで", "んだ"],
  "る": ["ら", "り", "れ", "ろ", "って", "った"]
};
const participles = {
  eat: "eaten", drink: "drunk", see: "seen", read: "read", write: "written", speak: "spoken",
  buy: "bought", sell: "sold", do: "done", make: "made", take: "taken", give: "given",
  hear: "heard", call: "called", use: "used", open: "opened", close: "closed", teach: "taught"
};
function verbGloss(id, meaning, fallback, negative, past) {
  if (id === "potential") return `${past ? (negative ? "could not" : "could") : (negative ? "cannot" : "can")} ${meaning}`;
  if (id === "passive" && participles[meaning]) return `${past ? "was" : "be"}${negative ? " not" : ""} ${participles[meaning]}`;
  if (id === "causative") return `${negative ? (past ? "did not " : "do not ") : ""}${past && !negative ? "made / let" : "make / let"} someone ${meaning}`;
  if (id === "causativePassive") return `${past ? "was" : "be"}${negative ? " not" : ""} made to ${meaning}`;
  return `${negative ? "not: " : ""}${fallback}${past ? " (past)" : ""}`;
}

function verbParts(text, entry, kana = false) {
  const stem = text.slice(0, -1);
  if (entry.type === "ichidan") return {
    base: text, stem, negative: stem + "ない", te: stem + "て", past: stem + "た",
    potential: stem + "られる", passive: stem + "られる", causative: stem + "させる",
    causativePassive: stem + "させられる", volitional: stem + "よう", imperative: entry.tag === "v1-s" ? stem : stem + "ろ",
    conditional: stem + "れば"
  };
  if (entry.type === "kuru") {
    const kanji = !kana && /[来來]る$/.test(text) ? text.at(-2) : "";
    const prefix = text.slice(0, -2);
    const form = (ending) => prefix + (kanji ? kanji + ending.slice(1) : ending);
    return {
      base: text, stem: form("き"), negative: form("こない"), te: form("きて"), past: form("きた"),
      potential: form("こられる"), passive: form("こられる"), causative: form("こさせる"),
      causativePassive: form("こさせられる"), volitional: form("こよう"), imperative: form("こい"),
      conditional: form("くれば")
    };
  }
  if (entry.type === "suru" || entry.type === "zuru") {
    const prefix = text.slice(0, -2);
    const zuru = entry.type === "zuru";
    const special = entry.tag === "vs-s";
    return {
      base: text, stem: prefix + (zuru ? "じ" : "し"), negative: prefix + (zuru ? "じない" : "しない"),
      te: prefix + (zuru ? "じて" : "して"), past: prefix + (zuru ? "じた" : "した"),
      potential: prefix + (zuru ? "じられる" : special ? "せる" : "できる"), passive: prefix + (zuru ? "じられる" : "される"),
      causative: prefix + (zuru ? "じさせる" : "させる"), causativePassive: prefix + (zuru ? "じさせられる" : "させられる"),
      volitional: prefix + (zuru ? "じよう" : special ? "そう" : "しよう"), imperative: prefix + (zuru ? "じろ" : "しろ"),
      conditional: prefix + (zuru ? "ずれば" : "すれば")
    };
  }
  const endings = godan[text.at(-1)];
  if (!endings) throw new Error("A u-verb must end in う・く・ぐ・す・つ・ぬ・ぶ・む・る.");
  const [a, i, e, o, te, past] = endings;
  const iku = entry.tag === "v5k-s" || ["いく", "ゆく"].includes(entry.reading);
  const aru = entry.tag === "v5r-i" || ["ある", "有る", "在る"].includes(entry.word);
  const specialU = entry.tag === "v5u-s";
  const specialAru = entry.tag === "v5aru";
  const sException = entry.tag === "vs-s" && entry.reading.endsWith("する");
  return {
    base: text, stem: stem + (specialAru ? "い" : i),
    negative: aru ? (["ある", "有る", "在る"].includes(text) ? "" : stem.slice(0, -1)) + "ない"
      : sException ? text.slice(0, -2) + "しない" : stem + a + "ない",
    te: stem + (iku ? "って" : specialU ? "うて" : te),
    past: stem + (iku ? "った" : specialU ? "うた" : past),
    potential: stem + e + "る", passive: stem + a + "れる", causative: stem + a + "せる",
    causativePassive: stem + a + "せられる", volitional: stem + o + "う",
    imperative: stem + (specialAru ? "い" : e), conditional: stem + e + "ば"
  };
}

function verbFormation(entry, readings, form) {
  const type = entry.type;
  const label = type === "suru" ? "Irregular する verb" : typeNames[type];
  if (form === "base") return `${label}: keep the dictionary form for the plain non-past affirmative.`;
  const aruNegative = form === "negative" && (entry.tag === "v5r-i" || ["ある", "有る", "在る"].includes(entry.word));
  const specialSuru = form === "negative" && entry.tag === "vs-s" && entry.reading.endsWith("する");
  const count = ["kuru", "suru", "zuru"].includes(type) || aruNegative || specialSuru ? 2 : 1;
  const ending = entry.reading.slice(-count);
  const suffix = readings[form].slice(entry.reading.length - count);
  const operation = !suffix ? `remove the final ${ending}`
    : type === "ichidan" ? `remove the final る and add ${suffix}`
      : `replace the final ${ending} with ${suffix}`;
  let exception = "";
  if (aruNegative) exception = "ある has the exceptional negative ない, not あらない.";
  else if (["te", "past"].includes(form) && (entry.tag === "v5k-s" || ["いく", "ゆく"].includes(entry.reading))) {
    exception = `行く is exceptional: use ${form === "te" ? "って, not いて" : "った, not いた"}.`;
  } else if (["te", "past"].includes(form) && entry.tag === "v5u-s") {
    exception = `This exceptional う-verb retains う before ${form === "te" ? "て" : "た"}.`;
  } else if (["stem", "imperative"].includes(form) && entry.tag === "v5aru") {
    exception = `This honorific る-verb uses い, not ${form === "stem" ? "り" : "れ"}, here.`;
  } else if (form === "imperative" && entry.tag === "v1-s") {
    exception = "くれる has the exceptional imperative くれ, without ろ.";
  } else if (["potential", "volitional"].includes(form) && entry.tag === "vs-s") {
    exception = `This special する verb uses ${suffix} rather than ${form === "potential" ? "できる" : "しよう"}.`;
  }
  return `${label}${type === "godan" ? ` ending in ${ending}` : ""}: ${operation}${form === "stem" ? " to make the ます-stem" : ""}. ${exception}`.trim();
}

function finiteVerbRule(entry, readings, { politeness, polarity, tense }) {
  const negative = polarity === "negative", past = tense === "past";
  if (politeness === "polite") {
    const ending = past ? negative ? "ませんでした" : "ました" : negative ? "ません" : "ます";
    return `${verbFormation(entry, readings, "stem")} Add ${ending} for the polite ${past ? "past" : "non-past"} ${polarity}.`;
  }
  if (negative) return `${verbFormation(entry, readings, "negative")}${past ? " Replace the negative ending ない with なかった for the plain past negative." : " This is the plain non-past negative."}`;
  return verbFormation(entry, readings, past ? "past" : "base");
}

function adjectiveFormation(entry, row) {
  if (entry.type === "copula") return `Use ${row.reading} after a noun or na-adjective; this is the copula alone.`;
  if (entry.type === "na-adjective") return `Na-adjective: keep ${entry.word} and add ${row.reading.slice(entry.reading.length)}.`;
  const unchanged = row.id.startsWith("present-") || row.id === "nara";
  if (unchanged) {
    const ending = row.reading.slice(entry.reading.length);
    return ending ? `I-adjective: keep the final い and add ${ending}.` : "I-adjective: keep the dictionary form, including the final い; do not add だ.";
  }
  const good = (entry.tag === "adj-ix" || entry.reading === "いい" || entry.reading.endsWith("かっこいい")) && entry.reading.endsWith("いい");
  const rootLength = entry.reading.length - 1;
  const stemRule = good ? "Irregular いい ending: use よい's stem, replacing the final いい with よ."
    : "I-adjective: remove the final い.";
  return `${stemRule} Add ${row.reading.slice(rootLength)}.`;
}

function validate(entry) {
  if (!entry || !typeNames[entry.type] || typeof entry.word !== "string"
    || typeof entry.reading !== "string" || !entry.word || !/^[ぁ-ゖー・]+$/.test(entry.reading)) {
    throw new Error("Choose a word type and supply its full hiragana reading before conjugating.");
  }
  const suffix = { ichidan: "る", kuru: "くる", suru: "する", zuru: "ずる", "i-adjective": "い" }[entry.type];
  if (suffix && !entry.reading.endsWith(suffix)) throw new Error(`This word type requires a reading ending in ${suffix}.`);
  if (entry.type === "godan" && !godan[entry.reading.at(-1)]) throw new Error("This reading does not have a u-verb dictionary ending.");
}

export function conjugate(entry) {
  validate(entry);
  const original = entry.word;
  const ending = { ichidan: /る$/, godan: /[うくぐすつぬぶむる]$/, kuru: /(?:[来來く]る)$/, suru: /する$/, zuru: /ずる$/, "i-adjective": /い$/ }[entry.type];
  if (ending && !ending.test(entry.word)) {
    entry = { ...entry, word: entry.reading };
  }
  const rows = [];
  const meaning = (entry.meanings?.[0] || "act").replace(/^to /, "");
  const adjective = entry.type.endsWith("adjective");
  const add = (id, label, group, word, reading, { politeness = "plain", polarity = "affirmative", tense = "non-past", gloss = label, note = "" } = {}) => {
    const row = { id, label, group, word, reading, politeness, polarity, tense, gloss };
    row.note = [
      adjective || entry.type === "copula" ? adjectiveFormation(entry, row) : "",
      typeof note === "function" ? note(row) : note,
      `${entry.word === word ? "Form: " : entry.word + " → "}${word}${word !== reading ? ` (${reading})` : ""}.`,
      original !== entry.word ? "This unusual spelling is conjugated in kana to avoid inventing written endings." : ""
    ].filter(Boolean).join(" ");
    rows.push(row);
  };
  const pair = (id, label, group, words, readings, options = {}) => {
    add(id + "-plain", label, group, words[0], readings[0], options);
    if (words[1]) add(id + "-polite", label, group, words[1], readings[1], { ...options, politeness: "polite" });
  };
  if (adjective || entry.type === "copula") {
    const iAdj = entry.type === "i-adjective";
    const copula = entry.type === "copula";
    const build = (text) => {
      const good = entry.tag === "adj-ix" || entry.reading === "いい" || entry.reading.endsWith("かっこいい");
      const root = iAdj ? (good && text.endsWith("いい") ? text.slice(0, -2) + "よ" : text.slice(0, -1))
        : copula ? "" : text;
      return iAdj ? {
        present: [text, text + "です"], negative: [root + "くない", root + "くないです"],
        past: [root + "かった", root + "かったです"], pastNegative: [root + "くなかった", root + "くなかったです"],
        formalNegative: root + "くありません", formalPastNegative: root + "くありませんでした",
        adverb: root + "く", te: root + "くて", ba: root + "ければ", tara: root + "かったら",
        negativeBa: root + "くなければ", negativeTara: root + "くなかったら", nara: text + "なら",
        too: root + "すぎる"
      } : {
        present: [root + "だ", root + "です"], negative: [root + "ではない", root + "ではありません"],
        past: [root + "だった", root + "でした"], pastNegative: [root + "ではなかった", root + "ではありませんでした"],
        adverb: root + "に", te: root + "で", ba: root + "であれば", tara: root + "だったら",
        negativeBa: root + "でなければ", negativeTara: root + "ではなかったら", nara: root + "なら",
        too: root + "すぎる"
      };
    };
    const w = build(entry.word), r = build(entry.reading);
    for (const [id, label, polarity, tense, gloss] of [
      ["present", "Non-past affirmative", "affirmative", "non-past", meaning],
      ["negative", "Non-past negative", "negative", "non-past", `not ${meaning}`],
      ["past", "Past affirmative", "affirmative", "past", `was ${meaning}`],
      ["pastNegative", "Past negative", "negative", "past", `was not ${meaning}`]
    ]) pair(id, label, "basic", w[id], r[id], { polarity, tense, gloss,
      note: (row) => `Use this ${row.politeness} ${tense} form to ${polarity === "negative" ? "negate" : "describe"} a ${tense === "past" ? "past" : "present or future"} state.` });
    const usage = {
      adverb: "Modifies how an action happens; it is not a complete predicate.",
      te: "Connects descriptions or gives a reason; the final predicate supplies politeness.",
      ba: "States a condition; the final predicate supplies politeness.",
      tara: "Means if / when. The past-shaped ending does not necessarily refer to past time; politeness comes from the final predicate.",
      nara: "Responds to a premise: if that is the case.",
      negativeBa: "States a negative condition: if it is not so.",
      negativeTara: "Means if it is not so; the past-shaped ending need not refer to past time.",
      too: "Expresses an excessive degree; the resulting すぎる conjugates as a ru-verb."
    };
    for (const [id, label, group, polarity, gloss] of [
      ["adverb", "Adverbial", "te", "affirmative", "Modifies a verb"],
      ["te", "Te-form", "te", "affirmative", `${meaning}, and…`],
      ["ba", "Conditional · ば", "conditional", "affirmative", `if ${meaning}`],
      ["tara", "Conditional · たら", "conditional", "affirmative", `if / when ${meaning}`],
      ["nara", "Conditional · なら", "conditional", "affirmative", `if it is ${meaning}`],
      ["negativeBa", "Negative conditional · ば", "conditional", "negative", `if not ${meaning}`],
      ["negativeTara", "Negative conditional · たら", "conditional", "negative", `if not ${meaning}`],
      ["too", "Excessive · すぎる", "advanced", "affirmative", `too ${meaning}`]
    ]) {
      if (copula && ["too", "adverb"].includes(id)) continue;
      add(id, label, group, w[id], r[id], { polarity, politeness: "neutral", tense: "neutral", gloss, note: usage[id] });
    }
    if (!iAdj) {
      pair("polite-tara", "Polite conditional · たら", "conditional",
        [w.past[1] + "ら", null], [r.past[1] + "ら", null], { politeness: "polite", tense: "neutral", gloss: `if / when ${meaning}`, note: "Polite past でした + ら; less common than the plain conditional in everyday conversation." });
      add("polite-negative-tara", "Polite negative conditional · たら", "conditional", w.pastNegative[1] + "ら", r.pastNegative[1] + "ら",
        { politeness: "polite", polarity: "negative", tense: "neutral", gloss: `if not ${meaning}`, note: "Polite negative past ではありませんでした + ら. The plain conditional is more common in everyday conversation." });
    }
    if (iAdj) {
      add("formal-negative", "Formal non-past negative", "advanced", w.formalNegative, r.formalNegative, { politeness: "polite", polarity: "negative", note: "A more formal polite negative than くないです." });
      add("formal-past-negative", "Formal past negative", "advanced", w.formalPastNegative, r.formalPastNegative, { politeness: "polite", polarity: "negative", tense: "past", note: "A more formal polite past negative than くなかったです." });
    } else if (!copula) {
      add("attributive", "Before a noun · な", "basic", entry.word + "な", entry.reading + "な", { politeness: "neutral", tense: "neutral", gloss: `${meaning} + noun`, note: "Use な, not だ, directly before a noun." });
    }
    if (!iAdj) {
      add("polite-te", "Polite connective · でして", "te", (copula ? "" : entry.word) + "でして", (copula ? "" : entry.reading) + "でして",
        { politeness: "polite", tense: "neutral", gloss: `${meaning}, and…`, note: "A polite connective for nouns and na-adjectives, often used in explanations." });
      add("formal-copula", "Formal polite · でございます", "advanced", (copula ? "" : entry.word) + "でございます", (copula ? "" : entry.reading) + "でございます",
        { politeness: "polite", gloss: meaning, note: "Formal polite alternative to です, common in service and formal introductions; not subject-honorific language." });
    }
    return rows;
  }
  const w = verbParts(entry.word, entry), r = verbParts(entry.reading, entry, true);
  const basic = (id, label, group, wp, rp, gloss, formation = "", usage = "") => {
    for (const [suffix, title, words, readings, polarity, tense] of [
      ["", "affirmative", [wp.base, wp.stem + "ます"], [rp.base, rp.stem + "ます"], "affirmative", "non-past"],
      ["-negative", "negative", [wp.negative, wp.stem + "ません"], [rp.negative, rp.stem + "ません"], "negative", "non-past"],
      ["-past", "past affirmative", [wp.past, wp.stem + "ました"], [rp.past, rp.stem + "ました"], "affirmative", "past"],
      ["-past-negative", "past negative", [wp.negative.slice(0, -1) + "かった", wp.stem + "ませんでした"], [rp.negative.slice(0, -1) + "かった", rp.stem + "ませんでした"], "negative", "past"]
    ]) pair(id + suffix, id === "basic" ? `${tense === "past" ? "Past" : "Non-past"} ${polarity}` : `${label} · ${title}`, group, words, readings, {
      polarity, tense, gloss: verbGloss(id, meaning, gloss, polarity === "negative", tense === "past"),
      note: (row) => [
        formation,
        id === "basic" ? finiteVerbRule(entry, rp, row)
          : row.politeness === "plain" && row.polarity === "affirmative" && row.tense === "non-past" ? ""
            : `Conjugate the resulting ${wp.base} as a ru-verb. ${finiteVerbRule({ type: "ichidan", word: wp.base, reading: rp.base }, rp, row)}`,
        usage
      ].filter(Boolean).join(" ")
    });
  };
  basic("basic", "Non-past / past", "basic", w, r, meaning);
  for (const [id, label, gloss, note] of [
    ["potential", "Potential", `can ${meaning}`, "Ability / possibility, not permission." + (entry.type === "ichidan" ? " The standard ichidan form is られる; colloquial ら抜き forms are not used here." : "")],
    ["passive", "Passive", `undergo the action: ${meaning}`, "The subject receives or is affected by the action. Intransitive passives can express an unwelcome effect, not a direct English passive."],
    ["causative", "Causative", `make / let someone ${meaning}`, "Can mean causing, requiring or allowing an action; context distinguishes them."],
    ["causativePassive", "Causative-passive", `be made to ${meaning}`, "The subject is made to perform the action. The full uncontracted form is shown."]
  ]) {
    if (entry.tag === "v5r-i" || ["ある", "有る", "在る"].includes(entry.word)) continue;
    if (id === "potential" && ["できる", "出来る", "出きる", "出來る"].includes(entry.word)) continue;
    basic(id, label, "voice", verbParts(w[id], { type: "ichidan" }), verbParts(r[id], { type: "ichidan" }), gloss, verbFormation(entry, r, id), note);
  }
  const neutral = { politeness: "neutral", tense: "neutral" };
  add("te", "Te-form", "te", w.te, r.te, { ...neutral, gloss: `${meaning}, and…`, note: `${verbFormation(entry, r, "te")} Connects clauses; politeness is supplied by the final predicate.` });
  add("ta", "Ta-form", "te", w.past, r.past, { tense: "past", gloss: `${meaning} (completed)`, note: `${verbFormation(entry, r, "past")} Identical to the plain past affirmative. Also used as a building block for たら・たり.` });
  add("nai", "Nai-form", "te", w.negative, r.negative, { polarity: "negative", gloss: `not ${meaning}`, note: verbFormation(entry, r, "negative") });
  add("negative-te", "Negative connective · なくて", "te", w.negative.slice(0, -1) + "くて", r.negative.slice(0, -1) + "くて", { ...neutral, polarity: "negative", gloss: "not doing; because not…", note: `${verbFormation(entry, r, "negative")} Then replace ない with なくて for a negative connection or reason; use ないで for 'without doing'.` });
  add("naide", "Without doing · ないで", "te", w.negative + "で", r.negative + "で", { ...neutral, polarity: "negative", gloss: `without ${englishIng(meaning)}`, note: `${verbFormation(entry, r, "negative")} Add で to mean 'without doing'; also used with ください in a negative request.` });
  add("tari", "Tari-form", "te", w.past + "り", r.past + "り", { ...neutral, gloss: `do things such as ${meaning}`, note: `${verbFormation(entry, r, "past")} Add り to the ta-form to list representative actions, usually ending in する. It does not itself mark past tense.` });
  basic("progressive", "Ongoing / resulting state · ている", "te",
    verbParts(w.te + "いる", { type: "ichidan" }), verbParts(r.te + "いる", { type: "ichidan" }),
    `ongoing action / resulting state: ${meaning}`, `${verbFormation(entry, r, "te")} Add いる to the te-form.`,
    "Depending on the verb, this indicates an ongoing action, a habitual action, or a resulting state; not always English '-ing'.");
  const desire = conjugate({ word: w.stem + "たい", reading: r.stem + "たい", type: "i-adjective", meanings: [`want to ${meaning}`] });
  for (const row of desire.filter((row) => row.group === "basic")) rows.push({
    ...row, id: "desire-" + row.id, label: "Desire · " + row.label, group: "te",
    gloss: `${row.tense === "past" ? row.polarity === "negative" ? "did not want" : "wanted" : row.polarity === "negative" ? "do not want" : "want"} to ${meaning}`,
    note: `${verbFormation(entry, r, "stem")} Add たい, then conjugate it as an i-adjective. ${row.note} Usually expresses the speaker's desire, or asks the listener's.`
  });
  pair("volitional", "Volitional", "conditional", [w.volitional, w.stem + "ましょう"], [r.volitional, r.stem + "ましょう"],
    { gloss: `let's ${meaning} / I will ${meaning}`, note: (row) => row.politeness === "polite"
      ? `${verbFormation(entry, r, "stem")} Add ましょう for a polite suggestion.`
      : `${verbFormation(entry, r, "volitional")} Expresses intention or an invitation.` });
  add("imperative", "Imperative", "conditional", w.imperative, r.imperative, { gloss: `${meaning}!`, note: `${verbFormation(entry, r, "imperative")} A strong direct command, not a polite request. Often inappropriate with strangers or superiors.` });
  add("prohibitive", "Prohibitive · な", "conditional", entry.word + "な", entry.reading + "な", { polarity: "negative", gloss: `don't ${meaning}!`, note: "Dictionary form + な is a strong prohibition." });
  add("request", "Polite request · てください", "conditional", w.te + "ください", r.te + "ください", { politeness: "polite", gloss: `please ${meaning}`, note: `${verbFormation(entry, r, "te")} Add ください. A request, not the grammatical imperative; context still affects how courteous it sounds.` });
  add("negative-request", "Negative request", "conditional", w.negative + "でください", r.negative + "でください", { politeness: "polite", polarity: "negative", gloss: `please don't ${meaning}`, note: `${verbFormation(entry, r, "negative")} Add でください to make a negative request.` });
  add("ba", "Conditional · ば", "conditional", w.conditional, r.conditional, { ...neutral, gloss: `if ${meaning}`, note: `${verbFormation(entry, r, "conditional")} States a condition. Restrictions on commands and intentions depend on the clause.` });
  add("negative-ba", "Negative conditional · ば", "conditional", w.negative.slice(0, -1) + "ければ", r.negative.slice(0, -1) + "ければ",
    { ...neutral, polarity: "negative", gloss: `if not: ${meaning}`, note: `${verbFormation(entry, r, "negative")} Replace ない with なければ to state a negative condition.` });
  pair("tara", "Conditional · たら", "conditional", [w.past + "ら", w.stem + "ましたら"], [r.past + "ら", r.stem + "ましたら"],
    { tense: "neutral", gloss: `if / when ${meaning}`, note: (row) => `${finiteVerbRule(entry, r, { ...row, tense: "past" })} Add ら to the past form. The past-shaped ending does not necessarily refer to past time.` });
  pair("negative-tara", "Negative conditional · たら", "conditional", [w.negative.slice(0, -1) + "かったら", w.stem + "ませんでしたら"], [r.negative.slice(0, -1) + "かったら", r.stem + "ませんでしたら"],
    { tense: "neutral", polarity: "negative", gloss: `if not: ${meaning}`, note: (row) => `${finiteVerbRule(entry, r, { ...row, tense: "past" })} Add ら to the negative past form to mean 'if not'.` });
  if (entry.type === "godan" && !entry.reading.endsWith("す") && entry.tag !== "v5r-i" && !["ある", "有る", "在る"].includes(entry.word)) {
    const contracted = w.causativePassive.replace(/せられる$/, "される");
    const reading = r.causativePassive.replace(/せられる$/, "される");
    add("contracted-causative-passive", "Contracted causative-passive", "advanced", contracted, reading, { gloss: `be made to ${meaning}`, note: `${verbFormation(entry, r, "causativePassive")} Contract せられる to される. This contraction applies to u-verbs other than those ending in す, not ichidan verbs.` });
  }

  function englishIng(meaning) {
    const [verb, ...rest] = meaning.split(" ");
    const irregular = { be: "being", lie: "lying", die: "dying", run: "running", swim: "swimming", sit: "sitting", get: "getting", put: "putting", begin: "beginning", stop: "stopping" };
    const ing = irregular[verb] || (/ie$/.test(verb) ? verb.slice(0, -2) + "ying"
      : /[^e]e$/.test(verb) ? verb.slice(0, -1) + "ing" : verb + "ing");
    return [ing, ...rest].join(" ");
  }
  const honorifics = {
    "食べる": [["召し上がる", "めしあがる"], ["いただく", "いただく"]],
    "飲む": [["召し上がる", "めしあがる"], ["いただく", "いただく"]],
    "見る": [["ご覧になる", "ごらんになる"], ["拝見する", "はいけんする"]],
    "言う": [["おっしゃる", "おっしゃる"], ["申す", "もうす"]],
    "する": [["なさる", "なさる"], ["いたす", "いたす"]],
    "来る": [["いらっしゃる", "いらっしゃる"], ["参る", "まいる"]],
    "行く": [["いらっしゃる", "いらっしゃる"], ["参る", "まいる"]],
    "いる": [["いらっしゃる", "いらっしゃる"], ["おる", "おる"]],
    "知る": [["ご存じだ", "ごぞんじだ"], ["存じる", "ぞんじる"]]
  };
  const honors = honorifics[entry.word];
  if (honors) for (const [index, label] of ["Honorific alternative", "Humble alternative"].entries()) {
    add("honor-" + index, label, "advanced", ...honors[index], { gloss: `${meaning} (${index ? "humble" : "respectful"})`,
      note: "A lexical alternative, not an interchangeable ending. Honorific language raises the subject; humble language lowers the speaker's side. These are dictionary forms and may still require ます / です." });
  }
  add("formal", "Formal connective · ます-stem", "advanced", w.stem, r.stem, { ...neutral, gloss: `${meaning}, and… (written)`, note: `${verbFormation(entry, r, "stem")} Use this stem without ます to link clauses in formal writing. It is not a complete polite sentence by itself.` });
  return rows;
}

export function filterForms(rows, settings) {
  return rows.filter((row) =>
    matchesFilters(row, settings) && (!settings.groups || settings.groups.includes(row.group)));
}

export function copyTable(rows, { script = "both", romaji = false, compact = false } = {}, romanize = (text) => text) {
  const headings = ["Form", "Register", script === "kana" ? "Kana" : "Japanese"];
  if (!compact && script === "both") headings.push("Reading");
  if (!compact && romaji) headings.push("Romaji");
  if (!compact) headings.push("Meaning / function");
  return [headings, ...rows.map((row) => [
    row.label, row.politeness, script === "kana" ? row.reading : row.word,
    ...(!compact && script === "both" ? [row.reading] : []),
    ...(!compact && romaji ? [romanize(row.reading)] : []),
    ...(!compact ? [row.gloss] : [])
  ])].map((row) => row.map((text) => text.replace(/[\t\n\r]+/g, " ")).join("\t")).join("\n");
}
