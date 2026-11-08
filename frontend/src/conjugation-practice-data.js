// Only grammatical metadata lives here; question vocabulary comes from JMdict.
export const wordCategories = {
  ichidan: "Ru-verbs", godan: "U-verbs", irregular: "Irregular verbs",
  suru: "Suru-verbs", "i-adjective": "I-adjectives", "na-adjective": "Na-adjectives"
};

// The level is the suggested introduction point, not an official JLPT syllabus.
export const formCatalog = {
  basic: { en: "Basic predicate", ja: "基本形", level: 5, use: "State an action or condition in the requested tense, polarity and politeness." },
  te: { en: "Te-form", ja: "て形", level: 5, use: "Connect clauses or build requests and ongoing forms." },
  naide: { en: "Without doing · ないで", ja: "ないで形", level: 5, use: "Describe doing something without another action." },
  tari: { en: "Representative actions · たり", ja: "たり形", level: 4, use: "List representative actions." },
  request: { en: "Request · ください", ja: "依頼形", level: 5, use: "Ask someone to do or not do something." },
  attributive: { en: "Before a noun · な", ja: "連体形", level: 5, use: "Modify a noun with a na-adjective." },
  too: { en: "Excessive · すぎる", ja: "すぎる形", level: 4, use: "Express an excessive degree." },
  formalCopula: { en: "Formal copula · ございます", ja: "ございます形", level: 3, use: "Use the formal copula." },
  desire: { en: "Want to · たい", ja: "たい形", level: 5, use: "Express your own desire, or ask about the listener’s." },
  progressive: { en: "Ongoing / resulting state · ている", ja: "ている形", level: 4, use: "An ongoing action or the state resulting from a change." },
  potential: { en: "Potential", ja: "可能形", level: 4, use: "Express ability or possibility, not permission." },
  passive: { en: "Passive", ja: "受身形", level: 3, use: "The subject receives or is affected by an action." },
  causative: { en: "Causative", ja: "使役形", level: 3, use: "Make or allow someone to do something." },
  causativePassive: { en: "Causative-passive", ja: "使役受身形", level: 2, use: "Be made to do something." },
  volitional: { en: "Volitional", ja: "意向形", level: 4, use: "Suggest doing something or express an intention." },
  imperative: { en: "Imperative", ja: "命令形", level: 3, use: "Give a strong direct command; use with care." },
  ba: { en: "Conditional · ば", ja: "条件形・ば", level: 4, use: "State a condition: if…" },
  tara: { en: "Conditional · たら", ja: "条件形・たら", level: 4, use: "State a condition or sequence: if / when…" },
  nara: { en: "Conditional · なら", ja: "条件形・なら", level: 3, use: "Respond to a premise: if that is the case…" },
  adverb: { en: "Adverbial", ja: "副詞形", level: 4, use: "Modify how an action happens." },
  respectful: { en: "Respectful alternative", ja: "尊敬語", level: 2, use: "Raise the status of the person doing the action; dictionary form." },
  humble: { en: "Humble alternative", ja: "謙譲語", level: 2, use: "Lower your own side in a respectful context; dictionary form." },
  formal: { en: "Formal connective", ja: "連用形・文語", level: 1, use: "Connect written clauses using the ます-stem." },
  contracted: { en: "Contracted causative-passive", ja: "使役受身・短縮形", level: 1, use: "A shorter causative-passive for u-verbs not ending in す." },
};
