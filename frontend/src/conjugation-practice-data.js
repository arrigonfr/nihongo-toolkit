// A deliberately bounded, offline study bank. JLPT labels are study estimates.
const verbs = [
  ["食べる", "たべる", "ichidan", 5, "eat", "ate", "eaten", "eating", "ご飯を", "rice"],
  ["見る", "みる", "ichidan", 5, "watch", "watched", "watched", "watching", "映画を", "a film"],
  ["起きる", "おきる", "ichidan", 5, "get up", "got up", "", "getting up", "", ""],
  ["寝る", "ねる", "ichidan", 5, "sleep", "slept", "", "sleeping", "", ""],
  ["書く", "かく", "godan", 5, "write", "wrote", "written", "writing", "手紙を", "a letter"],
  ["読む", "よむ", "godan", 5, "read", "read", "read", "reading", "本を", "a book"],
  ["飲む", "のむ", "godan", 5, "drink", "drank", "drunk", "drinking", "お茶を", "tea"],
  ["話す", "はなす", "godan", 5, "speak", "spoke", "spoken", "speaking", "日本語を", "Japanese"],
  ["買う", "かう", "godan", 5, "buy", "bought", "bought", "buying", "切符を", "a ticket"],
  ["待つ", "まつ", "godan", 5, "wait", "waited", "", "waiting", "", ""],
  ["行く", "いく", "godan", 5, "go", "went", "", "going", "学校に", "to school", "v5k-s"],
  ["帰る", "かえる", "godan", 5, "return", "returned", "", "returning", "家に", "home"],
  ["する", "する", "suru", 5, "do", "did", "done", "doing", "宿題を", "homework"],
  ["来る", "くる", "kuru", 5, "come", "came", "", "coming", "学校に", "to school"],
  ["勉強する", "べんきょうする", "suru", 5, "study", "studied", "", "studying", "", ""],
  ["泳ぐ", "およぐ", "godan", 4, "swim", "swam", "", "swimming", "", ""],
  ["遊ぶ", "あそぶ", "godan", 4, "play", "played", "", "playing", "", ""],
  ["教える", "おしえる", "ichidan", 4, "teach", "taught", "taught", "teaching", "日本語を", "Japanese"],
  ["覚える", "おぼえる", "ichidan", 4, "memorize", "memorized", "memorized", "memorizing", "言葉を", "words"],
  ["説明する", "せつめいする", "suru", 4, "explain", "explained", "explained", "explaining", "理由を", "the reason"],
  ["調べる", "しらべる", "ichidan", 3, "investigate", "investigated", "investigated", "investigating", "原因を", "the cause"],
  ["選ぶ", "えらぶ", "godan", 3, "choose", "chose", "chosen", "choosing", "方法を", "a method"],
  ["確認する", "かくにんする", "suru", 3, "check", "checked", "checked", "checking", "予定を", "the schedule"],
  ["述べる", "のべる", "ichidan", 2, "state", "stated", "stated", "stating", "意見を", "an opinion"],
  ["申す", "もうす", "godan", 2, "say (humble)", "said", "said", "saying", "", ""],
  ["検討する", "けんとうする", "suru", 2, "consider", "considered", "considered", "considering", "計画を", "the plan"],
  ["遂げる", "とげる", "ichidan", 1, "achieve", "achieved", "achieved", "achieving", "目的を", "the objective"],
  ["覆す", "くつがえす", "godan", 1, "overturn", "overturned", "overturned", "overturning", "予想を", "expectations"],
  ["吟味する", "ぎんみする", "suru", 1, "scrutinize", "scrutinized", "scrutinized", "scrutinizing", "内容を", "the content"]
];

export const practiceWords = verbs.map(([word, reading, type, level, verb, past, participle, ing, context, object, tag]) => ({
  word, reading, type, level, tag, meanings: [`to ${verb}`],
  category: word === "する" || type === "kuru" ? "irregular" : type,
  irregular: ["する", "来る", "行く", "帰る"].includes(word),
  verb, past, participle, ing, context, object, objectPlural: ["words", "expectations"].includes(object)
}));

for (const [word, reading, type, level, meaning, noun, english] of [
  ["高い", "たかい", "i-adjective", 5, "expensive", "この本", "This book"],
  ["安い", "やすい", "i-adjective", 5, "inexpensive", "この本", "This book"],
  ["いい", "いい", "i-adjective", 5, "good", "この方法", "This method"],
  ["新しい", "あたらしい", "i-adjective", 5, "new", "この車", "This car"],
  ["静か", "しずか", "na-adjective", 5, "quiet", "この部屋", "This room"],
  ["元気", "げんき", "na-adjective", 5, "well / energetic", "田中さん", "Tanaka"],
  ["楽しい", "たのしい", "i-adjective", 4, "enjoyable", "この授業", "This lesson"],
  ["便利", "べんり", "na-adjective", 4, "convenient", "この道具", "This tool"],
  ["詳しい", "くわしい", "i-adjective", 3, "detailed", "この説明", "This explanation"],
  ["複雑", "ふくざつ", "na-adjective", 3, "complicated", "この問題", "This problem"],
  ["鋭い", "するどい", "i-adjective", 2, "sharp", "この刃", "This blade"],
  ["曖昧", "あいまい", "na-adjective", 2, "ambiguous", "この説明", "This explanation"],
  ["著しい", "いちじるしい", "i-adjective", 1, "remarkable", "この変化", "This change"],
  ["巧妙", "こうみょう", "na-adjective", 1, "ingenious", "この方法", "This method"]
]) practiceWords.push({ word, reading, type, level, meanings: [meaning], category: type, noun, english, irregular: word === "いい" });

practiceWords.push(
  { word: "ある", reading: "ある", type: "godan", category: "godan", level: 5, tag: "v5r-i", irregular: true,
    meanings: ["exist; have (inanimate)"], existential: true },
  { word: "だ", reading: "だ", type: "copula", category: "auxiliary", level: 5, meanings: ["be (copula)"],
    noun: "これは本", english: "This", predicate: "a book" },
  { word: "食べたい", reading: "たべたい", type: "i-adjective", category: "auxiliary", level: 5,
    meanings: ["want to eat"], noun: "私はご飯を", english: "I", desire: true },
  { word: "食べている", reading: "たべている", type: "ichidan", category: "auxiliary", level: 4,
    meanings: ["be eating"], context: "ご飯を", object: "rice", verb: "be eating", past: "was eating", ing: "eating", ongoing: true },
  { word: "食べてしまう", reading: "たべてしまう", type: "godan", category: "auxiliary", level: 3,
    meanings: ["finish eating; eat regrettably"], context: "ご飯を", object: "rice", verb: "finish eating", past: "finished eating", ing: "finishing eating" },
  { word: "食べておく", reading: "たべておく", type: "godan", category: "auxiliary", level: 4,
    meanings: ["eat in preparation"], context: "ご飯を", object: "rice in advance", verb: "eat", past: "ate", ing: "eating" }
);

export const wordCategories = {
  ichidan: "Ru-verbs", godan: "U-verbs", irregular: "Irregular verbs · する / 来る",
  suru: "Suru-verbs", "i-adjective": "I-adjectives", "na-adjective": "Na-adjectives", auxiliary: "Auxiliary patterns"
};

// The level is the suggested introduction point, not an official JLPT syllabus.
export const formCatalog = {
  present: { en: "Non-past affirmative", ja: "現在・肯定", level: 5, use: "State a fact, habit or future action." },
  negative: { en: "Non-past negative", ja: "現在・否定", level: 5, use: "Say that something is not true or does not happen." },
  past: { en: "Past affirmative", ja: "過去・肯定", level: 5, use: "Describe a completed action or past state." },
  pastNegative: { en: "Past negative", ja: "過去・否定", level: 5, use: "Say something did not happen or was not true." },
  te: { en: "Te-form", ja: "て形", level: 5, use: "Connect clauses or build requests and ongoing forms." },
  ta: { en: "Ta-form", ja: "た形", level: 5, use: "Plain past; also a building block for たら and たり." },
  nai: { en: "Nai-form", ja: "ない形", level: 5, use: "The plain negative, also used before でください." },
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
  formalNegative: { en: "Formal adjective negative", ja: "丁寧な否定", level: 3, use: "Use くありません instead of conversational くないです." }
};
