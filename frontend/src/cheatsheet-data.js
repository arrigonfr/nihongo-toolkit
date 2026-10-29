// Cheatsheet content. A cell is { parts: [[text, highlighted?]...], sub? }.
// Highlighted parts are the endings that change; `sub` is a reading or alternative.

const cell = (base, ending = "", sub = "") => ({ parts: ending ? [[base, false], [ending, true]] : [[base, false]], sub });
const plain = (text, sub = "") => ({ parts: [[text, false]], sub });

export const cellText = (item) => item.parts.map(([text]) => text).join("");
export const cellLabel = (item) => (item.sub ? `${cellText(item)} (${item.sub})` : cellText(item));

const KANA_ROWS = [
  ["", "あ", "a", "い", "i", "う", "u", "え", "e", "お", "o"],
  ["k", "か", "ka", "き", "ki", "く", "ku", "け", "ke", "こ", "ko"],
  ["s", "さ", "sa", "し", "shi", "す", "su", "せ", "se", "そ", "so"],
  ["t", "た", "ta", "ち", "chi", "つ", "tsu", "て", "te", "と", "to"],
  ["n", "な", "na", "に", "ni", "ぬ", "nu", "ね", "ne", "の", "no"],
  ["h", "は", "ha", "ひ", "hi", "ふ", "fu", "へ", "he", "ほ", "ho"],
  ["m", "ま", "ma", "み", "mi", "む", "mu", "め", "me", "も", "mo"],
  ["y", "や", "ya", null, null, "ゆ", "yu", null, null, "よ", "yo"],
  ["r", "ら", "ra", "り", "ri", "る", "ru", "れ", "re", "ろ", "ro"],
  ["w", "わ", "wa", null, null, null, null, null, null, "を", "wo"],
  ["", "ん", "n", null, null, null, null, null, null, null, null]
];
const KANA_VOICED = [
  ["g", "が", "ga", "ぎ", "gi", "ぐ", "gu", "げ", "ge", "ご", "go"],
  ["z", "ざ", "za", "じ", "ji", "ず", "zu", "ぜ", "ze", "ぞ", "zo"],
  ["d", "だ", "da", "ぢ", "ji", "づ", "zu", "で", "de", "ど", "do"],
  ["b", "ば", "ba", "び", "bi", "ぶ", "bu", "べ", "be", "ぼ", "bo"],
  ["p", "ぱ", "pa", "ぴ", "pi", "ぷ", "pu", "ぺ", "pe", "ぽ", "po"]
];
const KANA_COMBO = [
  ["ky", "きゃ", "kya", "きゅ", "kyu", "きょ", "kyo"],
  ["sh", "しゃ", "sha", "しゅ", "shu", "しょ", "sho"],
  ["ch", "ちゃ", "cha", "ちゅ", "chu", "ちょ", "cho"],
  ["ny", "にゃ", "nya", "にゅ", "nyu", "にょ", "nyo"],
  ["hy", "ひゃ", "hya", "ひゅ", "hyu", "ひょ", "hyo"],
  ["my", "みゃ", "mya", "みゅ", "myu", "みょ", "myo"],
  ["ry", "りゃ", "rya", "りゅ", "ryu", "りょ", "ryo"],
  ["gy", "ぎゃ", "gya", "ぎゅ", "gyu", "ぎょ", "gyo"],
  ["j", "じゃ", "ja", "じゅ", "ju", "じょ", "jo"],
  ["by", "びゃ", "bya", "びゅ", "byu", "びょ", "byo"],
  ["py", "ぴゃ", "pya", "ぴゅ", "pyu", "ぴょ", "pyo"]
];

export const toKatakana = (text) => text.replace(/[\u3041-\u3096]/g, (char) => String.fromCharCode(char.charCodeAt(0) + 0x60));

function kanaTable(id, title, script, source, columns) {
  const convert = script === "katakana" ? toKatakana : (text) => text;
  return {
    id, title, columns, rowLabels: source.map((row) => (row[0] || "·")),
    rows: source.map((row) => {
      const cells = [];
      for (let i = 1; i < row.length; i += 2) cells.push(row[i] ? { parts: [[convert(row[i]), false]], sub: row[i + 1] } : null);
      while (cells.length < columns.length) cells.push(null);
      return cells;
    })
  };
}

const VOWELS = ["a", "i", "u", "e", "o"];
const COMBO_COLUMNS = ["ya", "yu", "yo"];

export function kanaScript(script) {
  const name = script === "katakana" ? "Katakana" : "Hiragana";
  return [
    kanaTable(`${script}-basic`, `${name} · ${script === "katakana" ? "カタカナ" : "ひらがな"} gojūon`, script, KANA_ROWS, VOWELS),
    kanaTable(`${script}-voiced`, `${name} dakuten ゛ and handakuten ゜`, script, KANA_VOICED, VOWELS),
    kanaTable(`${script}-combo`, `${name} combinations (yōon)`, script, KANA_COMBO, COMBO_COLUMNS)
  ];
}

export const kanaNotes = {
  hiragana: [
    "っ (small tsu) doubles the next consonant: きって kitte",
    "Long vowels: おう / おお → ō, えい → ē, ああ → ā",
    "Particles: は = wa, へ = e, を = o",
    "ぢ づ are rare; use じ ず"
  ],
  katakana: [
    "ー lengthens a vowel: コーヒー kōhī",
    "ッ (small tsu) doubles a consonant: ベッド beddo",
    "Foreign sounds: ファ fa · フィ fi · フェ fe · フォ fo",
    "ティ ti · ディ di · ウィ wi · シェ she · チェ che · ジェ je · ヴ vu"
  ]
};

export function kanaSheet() {
  return {
    id: "kana", title: "Hiragana & Katakana", jp: "ひらがな・カタカナ", subtitle: "Kana cheatsheet · gojūon, dakuten, handakuten and combinations",
    hue: 340, hue2: 215,
    tables: [...kanaScript("hiragana"), ...kanaScript("katakana")],
    notes: [
      { title: "Hiragana", lines: kanaNotes.hiragana },
      { title: "Katakana", lines: kanaNotes.katakana }
    ],
    footer: "Row labels show the consonant. し shi · ち chi · つ tsu · ふ fu are irregular. ん is the only lone consonant."
  };
}

const VERB_LABELS = [
  ["dict", "Dictionary", "辞書形", "base"],
  ["stem", "Masu-stem", "連用形", "godan い-row · ichidan drop る"],
  ["masu", "Polite", "ます", "stem + ます"],
  ["masen", "Polite negative", "ません", "stem + ません"],
  ["mashita", "Polite past", "ました", "stem + ました"],
  ["nai", "Plain negative", "ない", "あ-row + ない · drop る + ない"],
  ["nakatta", "Negative past", "なかった", "ない → なかった"],
  ["ta", "Plain past", "た", "like て: て → た, で → だ"],
  ["te", "Te-form", "て形", "く→いて ぐ→いで す→して · う つ る→って · ぬ ぶ む→んで"],
  ["tai", "Want to", "たい", "stem + たい"],
  ["potential", "Potential", "可能形", "え-row + る · られる"],
  ["passive", "Passive", "受身", "あ-row + れる · られる"],
  ["causative", "Causative", "使役", "あ-row + せる · させる"],
  ["causativePassive", "Causative-passive", "使役受身", "あ-row + される · させられる"],
  ["volitional", "Volitional", "意向形", "お-row + う · よう"],
  ["imperative", "Imperative", "命令形", "え-row · ろ"],
  ["prohibitive", "Prohibitive", "禁止", "dictionary + な"],
  ["ba", "Conditional ば", "仮定形", "え-row + ば · れば"],
  ["tara", "Conditional たら", "たら", "た + ら"]
];

const V = {
  godan: {
    dict: cell("書", "く"), stem: cell("書", "き"), masu: cell("書", "きます"), masen: cell("書", "きません"), mashita: cell("書", "きました"),
    nai: cell("書", "かない"), nakatta: cell("書", "かなかった"), ta: cell("書", "いた"), te: cell("書", "いて"), tai: cell("書", "きたい"),
    potential: cell("書", "ける"), passive: cell("書", "かれる"), causative: cell("書", "かせる"), causativePassive: cell("書", "かされる"),
    volitional: cell("書", "こう"), imperative: cell("書", "け"), prohibitive: cell("書", "くな"), ba: cell("書", "けば"), tara: cell("書", "いたら")
  },
  ichidan: {
    dict: cell("食べ", "る"), stem: cell("食べ"), masu: cell("食べ", "ます"), masen: cell("食べ", "ません"), mashita: cell("食べ", "ました"),
    nai: cell("食べ", "ない"), nakatta: cell("食べ", "なかった"), ta: cell("食べ", "た"), te: cell("食べ", "て"), tai: cell("食べ", "たい"),
    potential: cell("食べ", "られる"), passive: cell("食べ", "られる"), causative: cell("食べ", "させる"), causativePassive: cell("食べ", "させられる"),
    volitional: cell("食べ", "よう"), imperative: cell("食べ", "ろ"), prohibitive: cell("食べ", "るな"), ba: cell("食べ", "れば"), tara: cell("食べ", "たら")
  },
  suru: {
    dict: plain("する"), stem: plain("し"), masu: plain("します"), masen: plain("しません"), mashita: plain("しました"),
    nai: plain("しない"), nakatta: plain("しなかった"), ta: plain("した"), te: plain("して"), tai: plain("したい"),
    potential: plain("できる"), passive: plain("される"), causative: plain("させる"), causativePassive: plain("させられる"),
    volitional: plain("しよう"), imperative: plain("しろ", "せよ"), prohibitive: plain("するな"), ba: plain("すれば"), tara: plain("したら")
  },
  kuru: {
    dict: plain("来る", "くる"), stem: plain("来", "き"), masu: plain("来ます", "きます"), masen: plain("来ません", "きません"), mashita: plain("来ました", "きました"),
    nai: plain("来ない", "こない"), nakatta: plain("来なかった", "こなかった"), ta: plain("来た", "きた"), te: plain("来て", "きて"), tai: plain("来たい", "きたい"),
    potential: plain("来られる", "こられる"), passive: plain("来られる", "こられる"), causative: plain("来させる", "こさせる"), causativePassive: plain("来させられる", "こさせられる"),
    volitional: plain("来よう", "こよう"), imperative: plain("来い", "こい"), prohibitive: plain("来るな", "くるな"), ba: plain("来れば", "くれば"), tara: plain("来たら", "きたら")
  }
};

const GODAN_ENDINGS = [
  ["う", cell("買", "う"), cell("買", "います"), cell("買", "わない"), cell("買", "って"), cell("買", "った"), cell("買", "える"), cell("買", "おう")],
  ["く", cell("書", "く"), cell("書", "きます"), cell("書", "かない"), cell("書", "いて"), cell("書", "いた"), cell("書", "ける"), cell("書", "こう")],
  ["ぐ", cell("泳", "ぐ"), cell("泳", "ぎます"), cell("泳", "がない"), cell("泳", "いで"), cell("泳", "いだ"), cell("泳", "げる"), cell("泳", "ごう")],
  ["す", cell("話", "す"), cell("話", "します"), cell("話", "さない"), cell("話", "して"), cell("話", "した"), cell("話", "せる"), cell("話", "そう")],
  ["つ", cell("待", "つ"), cell("待", "ちます"), cell("待", "たない"), cell("待", "って"), cell("待", "った"), cell("待", "てる"), cell("待", "とう")],
  ["ぬ", cell("死", "ぬ"), cell("死", "にます"), cell("死", "なない"), cell("死", "んで"), cell("死", "んだ"), cell("死", "ねる"), cell("死", "のう")],
  ["ぶ", cell("遊", "ぶ"), cell("遊", "びます"), cell("遊", "ばない"), cell("遊", "んで"), cell("遊", "んだ"), cell("遊", "べる"), cell("遊", "ぼう")],
  ["む", cell("飲", "む"), cell("飲", "みます"), cell("飲", "まない"), cell("飲", "んで"), cell("飲", "んだ"), cell("飲", "める"), cell("飲", "もう")],
  ["る", cell("帰", "る"), cell("帰", "ります"), cell("帰", "らない"), cell("帰", "って"), cell("帰", "った"), cell("帰", "れる"), cell("帰", "ろう")]
];

export function verbSheet() {
  return {
    id: "verb", title: "Verb Conjugation", jp: "動詞の活用", subtitle: "Godan (五段) · ichidan (一段) · irregular する and 来る",
    hue: 150, hue2: 30,
    tables: [
      {
        id: "verb-forms", title: "Forms of the three verb groups",
        columns: ["Form", "Rule", "Godan 書く", "Ichidan 食べる", "する", "来る"],
        rows: VERB_LABELS.map(([key, name, jp, rule]) => [
          plain(name, jp), plain(rule), V.godan[key], V.ichidan[key], V.suru[key], V.kuru[key]
        ])
      },
      {
        id: "verb-godan", title: "Godan verbs by dictionary ending",
        columns: ["Ending", "Dictionary", "ます", "ない", "て", "た", "Potential", "Volitional"],
        rows: GODAN_ENDINGS.map(([ending, ...cells]) => [plain(ending), ...cells])
      }
    ],
    notes: [{
      title: "Watch out",
      lines: [
        "Ichidan ends in いる or える. Exceptions that are godan: 帰る 切る 走る 入る 知る 要る 減る 喋る",
        "行く is irregular: 行って · 行った (not 行いて). ある → ない (not あらない).",
        "Spoken potential 食べれる is common but 食べられる is the standard form.",
        "Polite requests: ～てください. する verbs: 勉強する → 勉強します, 勉強できる."
      ]
    }],
    footer: "Highlighted text is the part that changes. Polite forms use the ます stem; plain forms are for casual speech."
  };
}

const ADJ_LABELS = [
  ["pn", "Plain present", "現在", "dictionary form"],
  ["pneg", "Plain negative", "否定", "い → くない / ではない"],
  ["pp", "Plain past", "過去", "い → かった / だった"],
  ["ppn", "Plain past negative", "過去否定", "くなかった / ではなかった"],
  ["mp", "Polite present", "丁寧", "+ です"],
  ["mneg", "Polite negative", "丁寧否定", "くないです / ではありません"],
  ["mpp", "Polite past", "丁寧過去", "かったです / でした"],
  ["mppn", "Polite past negative", "丁寧過去否定", "くなかったです / ではありませんでした"],
  ["te", "Te-form", "て形", "い → くて / で"],
  ["adv", "Adverb", "副詞", "い → く / に"],
  ["noun", "Before a noun", "連体形", "い stays / な"],
  ["ba", "Conditional ば", "仮定形", "い → ければ / なら"],
  ["tara", "Conditional たら", "たら", "past + ら"],
  ["nara", "Conditional なら", "なら", "plain + なら"],
  ["sou", "Looks like そう", "様態", "drop い + そう"],
  ["sugiru", "Too much すぎる", "過ぎる", "drop い + すぎる"],
  ["sa", "Noun form さ", "名詞化", "drop い + さ"],
  ["deshou", "Probably でしょう", "推量", "plain + でしょう"]
];

const A = {
  i: {
    pn: cell("高", "い"), pneg: cell("高", "くない"), pp: cell("高", "かった"), ppn: cell("高", "くなかった"),
    mp: cell("高", "いです"), mneg: cell("高", "くないです", "高くありません"), mpp: cell("高", "かったです"),
    mppn: cell("高", "くなかったです", "高くありませんでした"), te: cell("高", "くて"), adv: cell("高", "く"), noun: plain("高い本"),
    ba: cell("高", "ければ"), tara: cell("高", "かったら"), nara: cell("高", "いなら"), sou: cell("高", "そう"), sugiru: cell("高", "すぎる"),
    sa: cell("高", "さ"), deshou: cell("高", "いでしょう")
  },
  na: {
    pn: cell("静か", "だ"), pneg: cell("静か", "ではない", "じゃない"), pp: cell("静か", "だった"), ppn: cell("静か", "ではなかった", "じゃなかった"),
    mp: cell("静か", "です"), mneg: cell("静か", "ではありません", "じゃないです"), mpp: cell("静か", "でした"),
    mppn: cell("静か", "ではありませんでした", "じゃなかったです"), te: cell("静か", "で"), adv: cell("静か", "に"), noun: { parts: [["静か", false], ["な", true], ["町", false]], sub: "" },
    ba: cell("静か", "なら(ば)"), tara: cell("静か", "だったら"), nara: cell("静か", "なら"), sou: cell("静か", "そう"), sugiru: cell("静か", "すぎる"),
    sa: cell("静か", "さ"), deshou: cell("静か", "でしょう")
  },
  ii: {
    pn: plain("いい", "良い"), pneg: cell("よ", "くない"), pp: cell("よ", "かった"), ppn: cell("よ", "くなかった"),
    mp: cell("いい", "です"), mneg: cell("よ", "くないです", "よくありません"), mpp: cell("よ", "かったです"),
    mppn: cell("よ", "くなかったです", "よくありませんでした"), te: cell("よ", "くて"), adv: cell("よ", "く"), noun: plain("いい天気"),
    ba: cell("よ", "ければ"), tara: cell("よ", "かったら"), nara: cell("いい", "なら"), sou: cell("よさ", "そう"), sugiru: cell("よ", "すぎる"),
    sa: cell("よ", "さ"), deshou: cell("いい", "でしょう")
  }
};

export function adjectiveSheet() {
  return {
    id: "adjective", title: "Adjective Conjugation", jp: "形容詞の活用", subtitle: "い-adjectives (形容詞) · な-adjectives (形容動詞) · irregular いい / 良い",
    hue: 205, hue2: 30,
    tables: [{
      id: "adjective-forms", title: "Forms of the three adjective types",
      columns: ["Form", "Rule", "い-adjective 高い", "な-adjective 静か", "Irregular いい"],
      rows: ADJ_LABELS.map(([key, name, jp, rule]) => [plain(name, jp), plain(rule), A.i[key], A.na[key], A.ii[key]])
    }],
    notes: [
      { title: "い-adjectives", lines: ["Drop い and add the ending: 高い → 高くない, 高かった.", "Polite: add です → 高いです, 高かったです."] },
      { title: "な-adjectives", lines: ["Use だ / です like a noun; add な before a noun.", "Some end in い but are な-adjectives: きれい, 嫌い, 有名."] },
      { title: "いい (良い)", lines: ["いい is used in the present (いい, いいです, いいなら). Other forms use the よ stem: よくない, よかった.", "Compounds follow it: 格好いい → 格好よくない. ない itself conjugates: なかった."] }
      ,{ title: "Examples", wide: true, lines: [
        "この山は高くなかった。 — That mountain was not tall.",
        "静かな部屋で勉強します。 — I study in a quiet room.",
        "天気がよくて、うれしい。 — The weather is nice, so I am happy.",
        "この店は安くて、おいしいです。 — This shop is cheap and tasty.",
        "あの人は親切ではありませんでした。 — That person was not kind."
      ] }
    ],
    footer: "Highlighted text is the part that changes. 〜です makes any form polite; the plain forms are for casual speech and writing."
  };
}

export const SHEETS = [
  { id: "kana", build: kanaSheet },
  { id: "verb", build: verbSheet },
  { id: "adjective", build: adjectiveSheet }
];

export function buildSheet(id) {
  const entry = SHEETS.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown cheatsheet: ${id}`);
  return entry.build();
}
