// Cheatsheet content. A cell is { parts: [[text, highlighted?]...], sub? }.
// Highlighted parts are the endings that change; `sub` is a reading or alternative.

import kanjiAliveRadicals from "./kanji-alive-radicals.json" with { type: "json" };

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
  ["w", "わ", "wa", "ゐ", "wi*", null, null, "ゑ", "we*", "を", "wo"],
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
    footer: "* Historical kana: ゐ/ヰ and ゑ/ヱ are not used in standard modern Japanese. し shi · ち chi · つ tsu · ふ fu have irregular pronunciations."
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
        "行く is godan: 行って · 行った · 行ったら (not 行いて / 行いた). Other forms follow く: 行きます · 行かない.",
        "ある → ない (not あらない). Spoken 食べれる is common; 食べられる is standard.",
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

const referenceTable = (id, title, rows) => ({
  id, title, columns: ["Form", "Use", "Example"],
  rows: rows.map((row) => row.map((value) => plain(value)))
});

export function particleSheet() {
  return {
    id: "particles", title: "Japanese Particles", jp: "助詞", subtitle: "Roles, connections and nuance · examples in context",
    hue: 175, hue2: 12,
    tables: [
      referenceTable("particles-roles", "Roles & relationships", [
        ["は (wa)", "Topic / contrast", "私は学生です。 As for me, I am a student."],
        ["が", "Subject / new focus", "猫がいます。 There is a cat."],
        ["を (o)", "Object / route", "本を読む。 Read a book.\n道を歩く。 Walk along a road."],
        ["に", "Time / destination", "駅に行く。 Go to the station."],
        ["に", "Recipient / existence", "友達に話す。 Talk to a friend.\n家にいる。 Be at home."],
        ["へ (e)", "Direction toward", "日本へ行く。 Go toward Japan."],
        ["で", "Place of action", "家で食べる。 Eat at home."],
        ["で", "Means / material", "電車で行く。 Go by train."],
        ["と", "With / complete list", "友達と行く。 Go with a friend."],
        ["と", "Quote / result", "「はい」と言う。 Say “yes”."],
        ["の", "Possession / modifier", "私の本。 My book."],
        ["も", "Also / even", "私も行く。 I will go too."],
        ["から", "From / because", "九時から働く。 Work from nine."],
        ["まで", "Until / as far as", "駅まで歩く。 Walk to the station."],
        ["より", "Comparison / from", "昨日より寒い。 Colder than yesterday."],
        ["や", "Partial list", "本やペン。 Books, pens, etc."],
        ["とか", "Casual examples", "映画とか音楽。 Films, music, etc."],
        ["か", "Or / question", "お茶か水。 Tea or water?"],
        ["にとって", "For / from viewpoint", "私にとって大切。 Important to me."],
        ["について", "About", "日本について学ぶ。 Learn about Japan."]
      ]),
      referenceTable("particles-nuance", "Limits, links & endings", [
        ["だけ", "Only", "一つだけ買う。 Buy only one."],
        ["しか〜ない", "Only (with negative)", "一つしかない。 There is only one."],
        ["ばかり", "Only / just did", "遊んでばかりいる。 Does nothing but play."],
        ["ほど", "Extent / comparison", "思うほど難しくない。 Not as hard as I think."],
        ["くらい / ぐらい", "Approximate extent", "一時間ぐらい待つ。 Wait about an hour."],
        ["など", "Etc. / such as", "本などを買う。 Buy books and such."],
        ["でも", "Even / or something", "お茶でも飲もう。 Let's have some tea."],
        ["さえ", "Even", "子供さえ知っている。 Even children know."],
        ["こそ", "Emphasis", "今こそ始めよう。 Now is the time to start."],
        ["ずつ", "Each / at a time", "二つずつ配る。 Hand out two each."],
        ["ながら", "While (same subject)", "音楽を聞きながら歩く。 Walk while listening to music."],
        ["ので", "Because (softer)", "雨なので帰る。 Go home because it is raining."],
        ["けど / が", "But / soft lead-in", "安いけど、おいしい。 Cheap but tasty."],
        ["のに", "Although / despite", "雨なのに行く。 Go despite the rain."],
        ["し", "Reasons / and", "安いし、おいしい。 Cheap and tasty."],
        ["ね", "Shared feeling / check", "寒いね。 Cold, isn't it?"],
        ["よ", "Inform / emphasis", "明日休みだよ。 Tomorrow is a day off."],
        ["かな", "Wonder / I wonder if", "明日晴れるかな。 I wonder if it will clear up."],
        ["な", "Feeling / prohibition", "きれいだな。 How beautiful.\n行くな。 Don't go."],
        ["って", "Casual topic / quote", "田中さんって誰？ Who is Tanaka?"]
      ])
    ],
    notes: [], footer: "Particles depend on context and verb patterns. は, へ and を are pronounced wa, e and o as particles."
  };
}

export function counterSheet() {
  const sheet = {
    id: "counters", title: "Japanese Counters", jp: "助数詞", subtitle: "Written form → pronunciation · choose the counter for the object",
    hue: 32, hue2: 190,
    tables: [
      referenceTable("counters-common", "People, things & animals", [
        ["つ", "General things (1–10)", "一つ (ひとつ) · 二つ (ふたつ) · 三つ (みっつ)"],
        ["つ", "General, continued", "四つ (よっつ) · 五つ (いつつ) · 六つ (むっつ)"],
        ["つ", "General, continued", "七つ (ななつ) · 八つ (やっつ) · 九つ (ここのつ) · 十 (とお)"],
        ["人 (にん)", "People", "一人 (ひとり) · 二人 (ふたり) · 三人 (さんにん) · 四人 (よにん)"],
        ["個 (こ)", "Small objects", "一個 (いっこ) · 三個 (さんこ) · 六個 (ろっこ) · 十個 (じゅっこ)"],
        ["本 (ほん)", "Long objects", "一本 (いっぽん) · 三本 (さんぼん) · 六本 (ろっぽん) · 八本 (はっぽん)"],
        ["枚 (まい)", "Flat objects", "一枚 (いちまい) · 二枚 (にまい) · 三枚 (さんまい)"],
        ["冊 (さつ)", "Books / volumes", "一冊 (いっさつ) · 八冊 (はっさつ) · 十冊 (じゅっさつ)"],
        ["匹 (ひき)", "Small animals", "一匹 (いっぴき) · 三匹 (さんびき) · 六匹 (ろっぴき)"],
        ["頭 (とう)", "Large animals", "一頭 (いっとう) · 二頭 (にとう) · 十頭 (じゅっとう)"],
        ["羽 (わ)", "Birds / rabbits", "一羽 (いちわ) · 三羽 (さんわ / さんば)"],
        ["台 (だい)", "Machines / vehicles", "一台 (いちだい) · 二台 (にだい)"],
        ["杯 (はい)", "Cups / glasses", "一杯 (いっぱい) · 三杯 (さんばい) · 六杯 (ろっぱい)"],
        ["皿 (さら)", "Plates / dishes", "一皿 (ひとさら) · 二皿 (ふたさら)"],
        ["足 (そく)", "Pairs of footwear", "一足 (いっそく) · 三足 (さんぞく) · 八足 (はっそく)"],
        ["着 (ちゃく)", "Clothing", "一着 (いっちゃく) · 二着 (にちゃく)"],
        ["軒 (けん)", "Houses / shops", "一軒 (いっけん) · 三軒 (さんげん)"],
        ["件 (けん)", "Cases / matters", "一件 (いっけん) · 二件 (にけん)"],
        ["本 (ほん)", "Films / episodes", "映画を一本 (いっぽん) 見る。 Watch one film."],
        ["曲 (きょく)", "Songs / pieces", "一曲 (いっきょく) · 二曲 (にきょく)"],
        ["通 (つう)", "Letters / emails", "一通 (いっつう) · 二通 (につう)"]
      ]),
      referenceTable("counters-time", "Time, order & examples", [
        ["回 (かい)", "Occurrences", "一回 (いっかい) · 三回 (さんかい) · 十回 (じゅっかい)"],
        ["階 (かい)", "Floors", "一階 (いっかい) · 三階 (さんがい / さんかい)"],
        ["番 (ばん)", "Order / number", "一番 (いちばん) · 二番 (にばん)"],
        ["歳 (さい)", "Age", "一歳 (いっさい) · 八歳 (はっさい) · 二十歳 (はたち)"],
        ["時 (じ)", "Clock hours", "四時 (よじ) · 七時 (しちじ) · 九時 (くじ)"],
        ["分 (ふん)", "Minutes", "一分 (いっぷん) · 三分 (さんぷん) · 六分 (ろっぷん) · 十分 (じゅっぷん)"],
        ["秒 (びょう)", "Seconds", "一秒 (いちびょう) · 二秒 (にびょう)"],
        ["時間 (じかん)", "Duration in hours", "一時間 (いちじかん) · 四時間 (よじかん)"],
        ["日 (にち)", "Dates / days", "一日 (ついたち: date / いちにち: duration)"],
        ["日 (にち)", "Irregular dates", "二日 (ふつか) · 三日 (みっか) · 四日 (よっか) · 十日 (とおか)"],
        ["日 (にち)", "More dates", "十四日 (じゅうよっか) · 二十日 (はつか) · 二十四日 (にじゅうよっか)"],
        ["週間 (しゅうかん)", "Weeks", "一週間 (いっしゅうかん) · 二週間 (にしゅうかん)"],
        ["か月 (かげつ)", "Months of duration", "一か月 (いっかげつ) · 六か月 (ろっかげつ)"],
        ["月 (がつ)", "Calendar months", "四月 (しがつ) · 七月 (しちがつ) · 九月 (くがつ)"],
        ["年 (ねん)", "Years", "一年 (いちねん) · 四年 (よねん)"],
        ["回 / 個", "Example sentences", "二回行った。 Went twice. / りんごを三個買った。 Bought three apples."],
        ["本 / 人", "Example sentences", "ペンを一本ください。 One pen, please. / 三人来た。 Three people came."],
        ["何", "Ask how many", "何人 (なんにん) · 何本 (なんぼん) · 何枚 (なんまい)"],
        ["泊 (はく)", "Nights of a stay", "一泊 (いっぱく) · 二泊 (にはく) · 三泊 (さんぱく)"],
        ["組 (くみ)", "Groups / sets", "一組 (ひとくみ) · 二組 (ふたくみ)"],
        ["種類 (しゅるい)", "Kinds / varieties", "一種類 (いっしゅるい) · 二種類 (にしゅるい)"]
      ])
    ],
    notes: [], footer: "Readings vary by number and sometimes by speaker. Counter placement: noun + を + number-counter + verb."
  };
  for (const table of sheet.tables) {
    table.columns[2] = "Example → Pronunciation";
    table.rows = table.rows.filter((row) => !cellText(row[1]).includes("Example sentences"));
    for (const row of table.rows) {
      let examples = cellText(row[2]);
      if (cellText(row[1]) === "Films / episodes") examples = "一本 (いっぽん)";
      if (cellText(row[1]) === "Dates / days") examples = "一日 (ついたち) · 一日 (いちにち)";
      examples = examples.replace(/([^ ·]+) \(([^)]+)\)/g, "$1 → $2").replaceAll(" · ", "\n");
      row[2] = plain(examples);
    }
  }
  const extra = referenceTable("counters-more", "More useful counters", [
    ["円 (えん)", "Yen", "五円 → ごえん"], ["か国 (かこく)", "Countries", "二か国 → にかこく"],
    ["か所 (かしょ)", "Places / points", "三か所 → さんかしょ"], ["缶 (かん)", "Cans", "二缶 → にかん"],
    ["巻 (かん)", "Volumes in a series", "四巻 → よんかん"], ["切れ (きれ)", "Slices", "二切れ → ふたきれ"],
    ["口 (くち)", "Bites / sips", "一口 → ひとくち"], ["語 (ご)", "Words", "五語 → ごご"],
    ["校 (こう)", "Schools", "二校 → にこう"], ["試合 (しあい)", "Matches", "三試合 → さんしあい"],
    ["品 (しな)", "Dishes / items", "一品 → ひとしな"], ["社 (しゃ)", "Companies", "二社 → にしゃ"],
    ["周 (しゅう)", "Laps", "一周 → いっしゅう"], ["色 (しょく)", "Colors", "二色 → にしょく"],
    ["席 (せき)", "Seats", "三席 → さんせき"], ["束 (たば)", "Bundles", "一束 → ひとたば"],
    ["玉 (たま)", "Balls / round produce", "二玉 → ふたたま"], ["段 (だん)", "Steps / levels", "三段 → さんだん"],
    ["粒 (つぶ)", "Small grains / pieces", "一粒 → ひとつぶ"], ["点 (てん)", "Points / items", "二点 → にてん"],
    ["度 (ど)", "Degrees / times", "三度 → さんど"], ["箱 (はこ)", "Boxes", "一箱 → ひとはこ"],
    ["便 (びん)", "Flights / services", "二便 → にびん"], ["袋 (ふくろ)", "Bags", "一袋 → ひとふくろ"],
    ["部屋 (へや)", "Rooms", "二部屋 → ふたへや"], ["歩 (ほ)", "Steps", "三歩 → さんぽ"],
    ["名 (めい)", "People (formal)", "二名 → にめい"], ["文字 (もじ)", "Characters", "三文字 → さんもじ"],
    ["問 (もん)", "Questions", "二問 → にもん"], ["話 (わ)", "Stories / episodes", "三話 → さんわ"],
    ["駅 (えき)", "Stations", "一駅 → ひとえき"],
    ["両 (りょう)", "Train cars", "二両 → にりょう"], ["輪 (りん)", "Flowers / wheels", "一輪 → いちりん"],
    ["ページ", "Pages", "三ページ → さんページ"], ["部 (ぶ)", "Copies", "二部 → にぶ"],
    ["棟 (とう)", "Buildings", "一棟 → いっとう"], ["艘 (そう)", "Boats", "二艘 → にそう"],
    ["通り (とおり)", "Ways / varieties", "一通り → ひととおり"], ["章 (しょう)", "Chapters", "二章 → にしょう"],
    ["球 (きゅう)", "Pitches / balls", "三球 → さんきゅう"], ["発 (はつ)", "Shots / launches", "一発 → いっぱつ"],
    ["行 (ぎょう)", "Lines of text", "二行 → にぎょう"]
  ]);
  extra.columns[2] = "Example → Pronunciation";
  sheet.tables.push(extra);
  return sheet;
}

export function radicalSheet() {
  return {
    id: "radicals", title: "Kanji Radicals", jp: "部首", subtitle: "Common forms and examples · 214 traditional radicals",
    hue: 195, hue2: 145,
    tables: [
      referenceTable("radicals-nature", "Nature & materials", [
        ["水 / 氵", "Water · みず / さんずい", "水 · 海 · 洗"], ["火 / 灬", "Fire · ひ / れっか", "火 · 焼 · 熱"],
        ["木", "Tree · き / きへん", "木 · 林 · 校"], ["日", "Sun · ひ / にちへん", "日 · 時 · 明"],
        ["月", "Moon · つき / つきへん", "月 · 期 · 朝"], ["土", "Earth · つち / つちへん", "土 · 地 · 場"],
        ["山", "Mountain · やま / やまへん", "山 · 岩 · 島"], ["川 / 巛", "River · かわ", "川 · 州 · 巡"],
        ["雨", "Rain · あめ / あめかんむり", "雨 · 雪 · 電"], ["石", "Stone · いし / いしへん", "石 · 砂 · 破"],
        ["金 / 釒", "Metal · かね / かねへん", "金 · 鉄 · 銀"], ["草 / 艹", "Grass · くさ / くさかんむり", "花 · 茶 · 草"]
      ]),
      referenceTable("radicals-people", "People & body", [
        ["人 / 亻", "Person · ひと / にんべん", "人 · 休 · 体"], ["心 / 忄", "Heart · こころ / りっしんべん", "心 · 情 · 怖"],
        ["手 / 扌", "Hand · て / てへん", "手 · 持 · 打"], ["目", "Eye · め / めへん", "目 · 眼 · 相"],
        ["口", "Mouth · くち / くちへん", "口 · 味 · 呼"], ["耳", "Ear · みみ / みみへん", "耳 · 聞 · 職"],
        ["足 / ⻊", "Foot · あし / あしへん", "足 · 路 · 踊"], ["女", "Woman · おんな / おんなへん", "女 · 好 · 姉"],
        ["子", "Child · こ / こへん", "子 · 字 · 孫"], ["力", "Power · ちから", "力 · 助 · 努"],
        ["身", "Body · み", "身 · 射 · 躾"], ["頁", "Head · おおがい", "頭 · 顔 · 題"]
      ]),
      referenceTable("radicals-objects", "Objects & actions", [
        ["言 / 訁", "Speech · ことば / ごんべん", "言 · 話 · 語"], ["食 / 飠", "Food · しょく / しょくへん", "食 · 飲 · 飯"],
        ["糸 / 糹", "Thread · いと / いとへん", "糸 · 紙 · 絵"], ["刀 / 刂", "Knife · かたな / りっとう", "刀 · 切 · 別"],
        ["貝", "Shell / money · かい / かいへん", "貝 · 買 · 貨"], ["車", "Vehicle · くるま / くるまへん", "車 · 転 · 軽"],
        ["門", "Gate · もん / もんがまえ", "門 · 間 · 開"], ["宀", "Roof · うかんむり", "家 · 安 · 室"],
        ["辶", "Movement · しんにょう", "道 · 近 · 送"], ["彳", "Step · ぎょうにんべん", "行 · 待 · 後"],
        ["阝", "Mound / village · こざとへん / おおざと", "院 · 降 · 都"], ["疒", "Illness · やまいだれ", "病 · 痛 · 疲"]
      ]),
      referenceTable("radicals-living", "Animals & everyday forms", [
        ["犬 / 犭", "Dog / animal · いぬ / けものへん", "犬 · 猫 · 独"], ["魚", "Fish · うお / うおへん", "魚 · 鮮 · 鯛"],
        ["鳥", "Bird · とり / とりへん", "鳥 · 鳴 · 鶏"], ["虫", "Insect · むし / むしへん", "虫 · 蛇 · 蝶"],
        ["馬", "Horse · うま / うまへん", "馬 · 駅 · 験"], ["牛 / 牜", "Cow · うし / うしへん", "牛 · 物 · 特"],
        ["竹 / ⺮", "Bamboo · たけ / たけかんむり", "竹 · 答 · 箱"], ["禾", "Grain · のぎ / のぎへん", "私 · 秋 · 種"],
        ["米", "Rice · こめ / こめへん", "米 · 粉 · 粒"], ["田", "Field · た / たへん", "田 · 男 · 畑"],
        ["衣 / 衤", "Clothing · ころも / ころもへん", "衣 · 初 · 裕"], ["示 / 礻", "Altar · しめす / しめすへん", "示 · 社 · 神"]
      ]),
      {
        ...referenceTable("radicals-traditional", "214 traditional radicals", kanjiAliveRadicals.map((radical) => [
          radical.character,
          `${radical.name} · ${radical.meaning}`,
          `${radical.strokes} ${radical.strokes === 1 ? "stroke" : "strokes"}${radical.variants.length ? ` · ${radical.variants.join(" / ")}` : ""}`
        ])),
        columns: ["Radical", "Name · Meaning", "Strokes · Variant names"]
      }
    ],
    notes: [], footer: "Radical meanings are clues, not guarantees. Traditional list adapted from Kanji alive · CC BY 4.0 · kanjialive.com/214-traditional-kanji-radicals/"
  };
}

function contrastSource() {
  return {
    id: "ambiguities", title: "Japanese Contrasts", jp: "使い分け", subtitle: "Similar English, different Japanese · meaning and examples",
    hue: 350, hue2: 205,
    tables: [
      referenceTable("contrasts-words", "Words & particles", [
        ["会う / 合う", "Meet / match", "友達に会う。 Meet a friend. / サイズが合う。 The size fits."],
        ["知る / 分かる", "Know a fact / understand", "住所を知っている。 Know the address. / 意味が分かる。 Understand the meaning."],
        ["着る / 履く", "Wear upper body / legs", "シャツを着る。 Wear a shirt. / 靴を履く。 Wear shoes."],
        ["かぶる / かける", "Wear on head / glasses", "帽子をかぶる。 Wear a hat. / 眼鏡をかける。 Wear glasses."],
        ["暑い / 熱い", "Hot weather / object", "今日は暑い。 It is hot today. / お茶が熱い。 The tea is hot."],
        ["寒い / 冷たい", "Cold weather / touch", "外は寒い。 It is cold outside. / 水が冷たい。 The water is cold."],
        ["暖かい / 温かい", "Warm air / object", "暖かい日。 A warm day. / 温かいスープ。 Warm soup."],
        ["に / へ / で", "Target / direction / means", "駅に着く。 Arrive at station. / 北へ行く。 Go north. / バスで行く。 Go by bus."],
        ["あげる", "Give outward", "私が友達に本をあげる。 I give a friend a book."],
        ["くれる", "Give to me / my group", "友達が私に本をくれる。 A friend gives me a book."],
        ["もらう", "Receive from", "私は友達に本をもらう。 I receive a book from a friend."],
        ["は / が", "Topic / focused subject", "私は学生。 As for me, a student. / 誰が来た？ Who came?"],
        ["土 / 士", "Earth / samurai", "土: longer bottom stroke. / 士: longer top stroke."],
        ["未 / 末", "Not yet / end", "未: longer lower bar. / 末: longer upper bar."],
        ["人 / 入", "Person / enter", "人: left stroke starts at the top. / 入: right stroke starts at the top."],
        ["日 / 目", "Day / eye", "日: one inner line. / 目: two inner lines."],
        ["口 / 囗", "Mouth / enclosure", "口: a character. / 囗: encloses elements, as in 国."],
        ["大 / 太 / 犬", "Big / fat / dog", "大: no dot. / 太: dot below. / 犬: dot at upper right."],
        ["待 / 持", "Wait / hold", "待: 彳 (step). / 持: 扌 (hand)."],
        ["晴 / 清", "Clear / pure", "晴: 日 (sun). / 清: 氵 (water)."]
      ]),
      referenceTable("contrasts-grammar", "Grammar & perspective", [
        ["と", "Whenever / natural result", "春になると暖かくなる。 When spring comes, it gets warm. No intention in result."],
        ["ば", "If: condition", "安ければ買う。 If it is cheap, I'll buy it. Result often follows from condition."],
        ["たら", "If / when, after", "着いたら電話して。 Call when you arrive. Works for one-off events."],
        ["なら", "If that is the case", "日本に行くなら京都へ。 If you're going to Japan, go to Kyoto."],
        ["から / ので", "Because: direct / softer", "雨だから帰る。 / 雨なので帰る。 I'm going home because it rains."],
        ["て / で", "Cause, often natural result", "熱があって休んだ。 I was off because I had a fever. Less suited to commands."],
        ["そうだ (looks)", "Appearance: stem + そう", "雨が降りそう。 It looks like it will rain."],
        ["そうだ (heard)", "Hearsay: plain + そうだ", "雨が降るそうだ。 I hear it will rain."],
        ["ようだ / みたい", "Inference from evidence", "雨のようだ。 / 雨みたい。 It seems to be raining; みたい is casual."],
        ["らしい", "Apparently / typical", "雨らしい。 Apparently rain. / 春らしい。 Spring-like."],
        ["なければならない", "Must / obligation", "行かなければならない。 I must go. Casual: 行かなきゃ。"],
        ["たほうがいい", "Should / advice", "休んだほうがいい。 You should rest. Negative: 行かないほうがいい。"],
        ["直接受身", "Direct passive", "私は先生に褒められた。 I was praised by my teacher."],
        ["迷惑の受身", "Indirect / affected passive", "雨に降られた。 I was caught in the rain. Often conveys trouble."],
        ["たらどう", "Why not? suggestion", "休んだらどう？ Why not rest? Often lighter, context matters."],
        ["たほうがいい", "Stronger recommendation", "医者に行ったほうがいい。 You should see a doctor."],
        ["にする / になる", "Choose / become", "お茶にする。 I'll choose tea. / 医者になる。 Become a doctor."],
        ["てくる / ていく", "Change toward / onward", "寒くなってきた。 It has grown cold. / 寒くなっていく。 It will grow colder."],
        ["つもり", "Established intention", "留学するつもりだ。 I intend to study abroad."],
        ["ようと思う", "Thinking of / deciding", "留学しようと思う。 I'm thinking of studying abroad. と思っている: ongoing plan."]
      ])
    ],
    notes: [], footer: "These are common tendencies, not absolute rules. Context, register and viewpoint can change the best choice."
  };
}

const CONTRAST_DETAILS = {
  "会う / 合う": ["会う = meet a person; 合う = fit or match. Both are あう.", "友達に会う。 Meet a friend. / 靴が足に合う。 The shoes fit my feet."],
  "知る / 分かる": ["知っている = know information; 分かる = understand or grasp it. 知らない = don't know.", "名前を知っている。 I know the name. / 意味が分かる。 I understand the meaning."],
  "着る / 履く": ["着る covers the torso; 履く covers feet or legs. The verb depends on the item, not the English 'wear'.", "シャツを着る。 Wear a shirt. / 靴を履く。 Wear shoes."],
  "かぶる / かける": ["かぶる puts something on the head; かける is used for glasses. 身につける is a general alternative.", "帽子をかぶる。 Wear a hat. / 眼鏡をかける。 Wear glasses."],
  "暑い / 熱い": ["暑い describes hot weather or surroundings; 熱い describes something hot to the touch or taste.", "今日は暑い。 The weather is hot. / お茶が熱い。 The tea is hot."],
  "寒い / 冷たい": ["寒い describes cold weather or how you feel in it; 冷たい describes something cold to touch or taste.", "外は寒い。 It is cold outside. / 水が冷たい。 The water is cold."],
  "暖かい / 温かい": ["Both are あたたかい: 暖かい for warm weather or spaces; 温かい for warm objects, food or feelings.", "暖かい日。 A warm day. / 温かいスープ。 Warm soup."],
  "に / へ / で": ["に marks a destination or target; へ emphasizes direction; で marks a means or place of action. に and へ often overlap with movement.", "駅に着く。 Arrive at the station. / 北へ行く。 Go north. / バスで行く。 Go by bus."],
  "あげる": ["Giver is the subject; the receiver is marked に. Typically giving away from the speaker's group.", "私は友達に本をあげた。 I gave my friend a book."],
  "くれる": ["Giver is the subject; the receiver is the speaker or someone in the speaker's group.", "友達が私に本をくれた。 My friend gave me a book."],
  "もらう": ["Receiver is the subject; the giver is marked に or から. The same gift, viewed from the receiver.", "私は友達に本をもらった。 I received a book from my friend."],
  "は / が": ["は sets the topic or contrast; が identifies or focuses the subject. Questions like 'who?' normally use が.", "私は学生です。 As for me, I am a student. / 誰が来た？ Who came?"],
  "と": ["Use for predictable, automatic results or habitual sequences. Avoid a command or the speaker's intention in the result clause.", "春になると暖かくなる。 When spring comes, it gets warm."],
  "ば": ["Use for a general 'if' condition. With action verbs, commands or intention in the result have restrictions, especially with the same subject.", "安ければ買う。 If it is cheap, I'll buy it."],
  "たら": ["Use for a hypothetical 'if' or a completed event followed by another. Commands and one-off plans are possible.", "着いたら電話して。 When you arrive, call me."],
  "なら": ["Use when taking up a premise or situation: 'if that's the case'. The result can happen before the stated event.", "日本に行くなら、切符を買って。 If you're going to Japan, buy a ticket."],
  "から / ので": ["から gives a direct reason; ので presents it more gently. After nouns and な-adjectives use だから / なので.", "雨だから帰る。 / 雨なので帰る。 I'm going home because it's raining."],
  "て / で": ["A cause linked to a natural outcome or feeling. Unlike から, generally avoid using it to justify a command or deliberate request.", "熱があって休んだ。 I was absent because I had a fever."],
  "そうだ (looks)": ["Appearance: verb masu-stem + そう; adjective stem + そう. Based on what you can see; not a report.", "雨が降りそう。 It looks like rain. / おいしそう。 It looks tasty."],
  "そうだ (heard)": ["Hearsay: plain form + そうだ. Reports what someone said; compare 降るそうだ with appearance 降りそうだ.", "雨が降るそうだ。 I hear it will rain."],
  "ようだ / みたい": ["Inference from evidence or resemblance. みたい is casual; nouns take の before ようだ, but not before みたい.", "雨のようだ。 / 雨みたい。 It seems to be raining."],
  "らしい": ["Often inference from information or hearsay; can also mean typical of something. Less direct evidence than appearance そう.", "雨らしい。 Apparently it will rain. / 春らしい。 Spring-like."],
  "なければならない": ["Obligation: negative stem + なければならない. The action is required, not just recommended.", "行かなければならない。 I must go. Casual: 行かなきゃ。"],
  "たほうがいい": ["Advice: past affirmative + ほうがいい; for negative advice use ない + ほうがいい. Usually stronger than a suggestion.", "休んだほうがいい。 You should rest. / 行かないほうがいい。 You shouldn't go."],
  "直接受身": ["The subject receives the action directly; the agent is usually marked に. It need not imply harm.", "私は先生に褒められた。 I was praised by my teacher."],
  "迷惑の受身": ["The subject is affected by someone else's action or an event, often adversely; it need not have a direct active equivalent.", "雨に降られた。 I was caught in the rain (and inconvenienced)."],
  "たらどう": ["Verb past + らどう: 'why not ...?' Offers a suggestion; tone and context can still make it sound blunt.", "少し休んだらどう？ Why not rest a little?"],
  "にする / になる": ["にする is an active choice or decision; になる is a resulting state or change, not necessarily intentional.", "お茶にする。 I'll choose tea. / 医者になる。 Become a doctor."],
  "てくる / ていく": ["てくる: change develops toward the present or speaker; ていく: change continues away from now or the speaker.", "寒くなってきた。 It has grown cold. / 寒くなっていく。 It will grow colder."],
  "つもり": ["Plain verb + つもり: an intention already held. Negative intention can be 行かないつもり or 行くつもりはない.", "留学するつもりだ。 I intend to study abroad."],
  "ようと思う": ["Volitional + と思う: a decision or thought to act; と思っている often describes an ongoing intention.", "留学しようと思う。 I'm thinking of studying abroad."]
};

const EXTRA_CONTRASTS = {
  ambiguities: [
    ["聞く / 聴く", "聞く: hear or ask; 聴く: listen attentively.", "音が聞こえる。 I can hear a sound. / 音楽を聴く。 Listen to music."],
    ["見る / 観る", "見る: see or look; 観る: watch a performance or spectacle.", "空を見る。 Look at the sky. / 映画を観る。 Watch a film."],
    ["開く / 開ける", "開く (あく): something opens. 開ける (あける): someone opens it.", "ドアが開く。 The door opens. / ドアを開ける。 Open the door."],
    ["いる / ある", "いる: animate beings. ある: inanimate things and events.", "猫がいる。 There is a cat. / 本がある。 There is a book."],
    ["上手 / 得意", "上手 describes skill; 得意 emphasizes a strong point. 自分は得意 is natural self-description.", "彼は歌が上手。 He sings well. / 数学が得意。 Math is my strong point."],
    ["好き / 欲しい", "好き: like in general. 欲しい: want a thing; verb stem + たい: want to do.", "猫が好き。 I like cats. / 猫が欲しい。 I want a cat."],
    ["早い / 速い", "早い: early in time. 速い: fast in speed. Both are はやい.", "早く起きる。 Get up early. / 足が速い。 Run fast."],
    ["多い / 大きい", "多い: numerous or much. 大きい: physically large.", "人が多い。 There are many people. / 家が大きい。 The house is big."]
  ],
  lookalikes: [
    ["木 / 本", "Tree / origin", "木: no extra mark. / 本: short line across the trunk."],
    ["千 / 干", "Thousand / dry", "千: first stroke slopes. / 干: first stroke is horizontal."],
    ["白 / 百", "White / hundred", "白: small stroke above. / 百: horizontal stroke above."],
    ["右 / 左", "Right / left", "右: contains 口. / 左: contains 工."],
    ["今 / 令", "Now / command", "今: lower part resembles フ. / 令: has a lower dot or stroke."],
    ["己 / 已 / 巳", "Self / already / snake", "己: open at top. / 已: almost closed. / 巳: closed at top."],
    ["休 / 体", "Rest / body", "休: person + 木. / 体: person + 本."],
    ["間 / 問", "Interval / question", "間: 日 inside the gate. / 問: 口 inside the gate."],
    ["目 / 自", "Eye / self", "目: no top stroke. / 自: extra stroke at top."],
    ["刀 / 力", "Sword / strength", "刀: no crossing stroke. / 力: diagonal stroke crosses the top."],
    ["王 / 玉", "King / jewel", "王: no dot. / 玉: dot at the lower right."],
    ["日 / 白", "Day / white", "日: no stroke above. / 白: small stroke above."]
  ],
  "grammar-contrasts": [
    ["時 / たら", "時 locates an event in time; たら makes the first event a condition or completed prerequisite.", "日本に行く時、買う。 Buy it when going to Japan. / 着いたら電話する。 Call after arrival."],
    ["ために / ように", "ために expresses a purpose with a controllable goal; ように often takes a potential or non-volitional result.", "留学するために貯金する。 Save to study abroad. / 聞こえるように話す。 Speak so you can be heard."],
    ["のに / けど", "のに signals an unexpected contrast, often with emotion; けど simply says 'but' or softens a statement.", "雨なのに行く。 Go despite rain. / 雨だけど行く。 It rains, but I'll go."],
    ["はず / かもしれない", "はず expresses an expectation based on a reason; かもしれない expresses possibility.", "もう着いたはず。 They should have arrived. / もう着いたかもしれない。 They may have arrived."]
  ],
  "grammar-contrasts-2": [
    ["ている / てある", "ている can describe an ongoing action or resulting state; てある describes a deliberately arranged state.", "ドアが開いている。 The door is open. / ドアが開けてある。 The door has been left open deliberately."],
    ["ておく / てしまう", "ておく: do in preparation or leave as is. てしまう: finish completely or express regret.", "予約しておく。 Book ahead. / 忘れてしまった。 I unfortunately forgot."],
    ["ことがある / たことがある", "Dictionary + ことがある: sometimes happens. Past + ことがある: have experienced it.", "遅れることがある。 Sometimes I am late. / 日本に行ったことがある。 I have been to Japan."],
    ["ようになる / ようにする", "ようになる: a change in ability or habit. ようにする: make an effort to do something.", "泳げるようになった。 I learned to swim. / 毎日歩くようにする。 I try to walk daily."]
  ]
};

function contrastSheet(id, title, jp, sourceIndex, start, end, hue) {
  const source = contrastSource().tables[sourceIndex].rows.slice(start, end).map((row) => {
    const form = cellText(row[0]);
    const detail = CONTRAST_DETAILS[form];
    return detail ? [plain(form), ...detail.map((value) => plain(value))] : row;
  });
  source.push(...(EXTRA_CONTRASTS[id] || []).map((row) => row.map((value) => plain(value))));
  const midpoint = Math.ceil(source.length / 2);
  return {
    id, title, jp, subtitle: "Choose by meaning, context and viewpoint",
    hue, hue2: 205,
    tables: [source.slice(0, midpoint), source.slice(midpoint)].map((rows, index) => ({
      id: `${id}-${index + 1}`, title: index ? "Continued" : "How to choose",
      columns: ["Form", "Distinction", id === "lookalikes" ? "What differs" : "Example"], rows
    })),
    notes: [], footer: "These are common tendencies, not absolute rules. Context and register can change the best choice."
  };
}

export const ambiguitySheet = () => contrastSheet("ambiguities", "Word Contrasts", "言葉の使い分け", 0, 0, 12, 350);
export const lookalikeSheet = () => contrastSheet("lookalikes", "Kanji Lookalikes", "似ている漢字", 0, 12, 20, 35);
export function grammarContrastSheet() {
  const rows = [...contrastSheet("grammar-contrasts", "", "", 1, 0, 10, 160).tables.flatMap((table) => table.rows),
    ...contrastSheet("grammar-contrasts-2", "", "", 1, 10, 20, 280).tables.flatMap((table) => table.rows)];
  const categories = [
    ["Conditionals", ["と", "ば", "たら", "なら", "時 / たら"]],
    ["Reasons, purpose & contrast", ["から / ので", "て / で", "ために / ように", "のに / けど"]],
    ["Looks like / seems", ["そうだ (looks)", "そうだ (heard)", "ようだ / みたい", "らしい", "はず / かもしれない"]],
    ["Have to / must / should", ["なければならない", "たほうがいい", "たらどう"]],
    ["Passive & perspective", ["直接受身", "迷惑の受身"]],
    ["Change, state & intention", ["にする / になる", "てくる / ていく", "つもり", "ようと思う", "ている / てある", "ておく / てしまう", "ことがある / たことがある", "ようになる / ようにする"]]
  ];
  return {
    id: "grammar-contrasts", title: "Grammar Contrasts", jp: "文法の使い分け", subtitle: "Choose by meaning, context and viewpoint", hue: 160, hue2: 205,
    tables: categories.map(([title, forms], index) => ({ id: `grammar-category-${index + 1}`, title, columns: ["Form", "Distinction", "Example"], rows: forms.map((form) => rows.find((row) => cellText(row[0]) === form)).filter(Boolean) })),
    notes: [], footer: "These are common tendencies, not absolute rules. Context and register can change the best choice."
  };
}

export const SHEETS = [
  { id: "kana", build: kanaSheet },
  { id: "verb", build: verbSheet },
  { id: "adjective", build: adjectiveSheet },
  { id: "particles", build: particleSheet },
  { id: "counters", build: counterSheet },
  { id: "radicals", build: radicalSheet },
  { id: "ambiguities", build: ambiguitySheet },
  { id: "lookalikes", build: lookalikeSheet },
  { id: "grammar-contrasts", build: grammarContrastSheet }
];

export function buildSheet(id) {
  const entry = SHEETS.find((item) => item.id === id);
  if (!entry) throw new Error(`Unknown cheatsheet: ${id}`);
  return entry.build();
}
