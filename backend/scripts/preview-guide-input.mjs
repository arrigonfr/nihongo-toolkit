export const manifest = {
  edition: "editorial-1",
  dictionary: {
    release: "3.6.2+20261019180022",
    sha256: "1dca86908663dcddb8c3bcff9dc5e2bc73037bbdeed9c705c896a3845e7635a5",
    credit: "JMdict, EDRDG; JSON conversion by scriptin and contributors. CC BY-SA 4.0.",
    usage: "Local entry identifiers, forms, commonness, restrictions and sense evidence. No sentence text imported."
  },
  editorial: { source: "NihongoToolkit", rights: "Project-authored draft descriptions, examples, translations and contrasts; not reviewed." },
  acquisition: { source: "November 2026 discovery comparison", expected: 1158, keysImported: 0,
    disposition: "Blocked: no rights-cleared, individually verifiable baseline supplied. No upstream material ingested." }
};

const sound = "sound-imitation", motion = "non-audible-mimetic";
function draft(id, entry, fingerprint, form, scene, type, register, meaning, markup, translation) {
  return { id, entry, fingerprint, form, scene, type, register, meaning, markup, translation, status: "draft", source: "project-original" };
}
export const drafts = [
  draft("quiet-rain", "1005570", "2aac51b27a965b336a57", "しとしと", "Rain", motion, "Descriptive",
    "Rain falls lightly and steadily. The focus here is on how it falls, not on a loud noise.",
    "{庭|にわ}にしとしとと{雨|あめ}が{降|ふ}っている。", "A gentle rain is falling in the garden."),
  draft("driving-rain", "1058910", "88f194fa68b2ce3f4fb4", "ざあざあ", "Rain", sound, "Descriptive",
    "Rain pours down with a continuous rushing sound.",
    "{屋根|やね}の{上|うえ}で{雨|あめ}がざあざあと{音|おと}を{立|た}てている。", "Rain is making a rushing sound on the roof."),
  draft("springy-bite", "2403780", "3927280a287421c153a0", "もちもち", "Food texture", motion, "Descriptive",
    "Something soft gives under the teeth and springs back as you chew.",
    "このパンはもちもちしている。", "This bread has a springy chew."),
  draft("yielding-dough", "2772190", "873cc2a185b78bafb518", "もっちり", "Food texture", motion, "Descriptive",
    "A bite feels soft and elastic rather than brittle.",
    "この{麺|めん}はもっちりしている。", "These noodles have a soft, chewy texture."),
  draft("crisp-bite", "1005130", "e8d71ff38fc73a354d5f", "さくさく", "Food texture", motion, "Descriptive",
    "A light, crisp bite breaks apart easily under the teeth.",
    "{焼|や}きたてのパイはさくさくだ。", "The freshly baked pie has a light, crisp crust."),
  draft("snow-steps", "1005130", "67239d16c4316b6f3212", "さくさく", "Footsteps", sound, "Descriptive",
    "Successive steps make little crunching sounds underfoot.",
    "{雪|ゆき}を{踏|ふ}むとさくさくと{音|おと}がする。", "The snow crunches when I step on it."),
  draft("wind-whistle", "2059800", "983f4ea41457c86ef517", "ひゅうひゅう", "Wind", sound, "Descriptive",
    "Air streams through a gap with a whistling sound.",
    "{窓|まど}のすきまから{風|かぜ}がひゅうひゅう{鳴|な}る。", "The wind whistles through a gap in the window."),
  draft("whispered-voices", "1010520", "4a132db31582c19fe680", "ひそひそ", "Voices", sound, "Descriptive",
    "People speak in low whispers so others cannot easily hear.",
    "{後|うし}ろの{席|せき}で{二人|ふたり}がひそひそ{話|はな}している。", "Two people are whispering in the seats behind me."),
  draft("single-bang", "2142690", "e00fd252ed0b4fd1ffae", "どん", "Impacts", sound, "Sound effect",
    "One heavy impact lands with a short, low thud.",
    "{箱|はこ}がどんと{床|ゆか}に{落|お}ちた。", "The box hit the floor with a thud."),
  draft("unhurried-walk", "1011230", "dea0fb1d6c0825917b28", "ぶらぶら", "Movement", motion, "Descriptive",
    "Someone walks about without a particular destination or hurry.",
    "{川|かわ}に{沿|そ}ってぶらぶら{歩|ある}いた。", "I wandered along the river."),
  draft("points-of-light", "1003500", "53c95a6a7582be0ea874", "きらきら", "Appearance", motion, "Descriptive",
    "Little points of light catch the eye as they shine or flicker.",
    "{波|なみ}が{朝日|あさひ}できらきら{光|ひか}っている。", "The waves sparkle in the morning sunlight."),
  draft("pulsing-pain", "1006340", "be970ebfe3630b553409", "ずきずき", "Bodily sensations", motion, "Descriptive",
    "Pain comes in repeated pulses rather than a single sharp jab.",
    "{走|はし}ったあと、ひざがずきずき{痛|いた}んだ。", "My knee throbbed after the run."),
  draft("nervous-heart", "1009050", "bdac393a0152e8b2e0dc", "どきどき", "Emotions", motion, "Descriptive",
    "Someone feels their heart racing in anticipation.",
    "{名前|なまえ}を{呼|よ}ばれるのを{待|ま}つ{間|あいだ}、どきどきした。", "My heart raced as I waited for my name to be called.")
];
export const contrasts = [
  { ids: ["quiet-rain", "driving-rain"], note: "Picture the same roof in two showers. With しとしと, notice the steady, delicate fall. With ざあざあ, the rush of water is hard to ignore." },
  { ids: ["springy-bite", "crisp-bite"], note: "Both describe what happens as you bite. A もちもち texture gives and stretches; a さくさく texture breaks apart instead." },
  { ids: ["crisp-bite", "snow-steps"], note: "The spelling stays the same. In the pie example, notice the texture; in the snow example, listen for each footstep." }
];

// Negative controls belong to the editorial classifier, never to guide search.
export const controls = [
  ["rain-noun","1171900","2653daed23df5fd02a15","雨","あめ","Names the weather, not how the rain sounds or falls."],
  ["daily","1602120","1f9e9b962a02b1ee0362","日々","ひび","Refers to days; iteration is not evidence of imitation."],
  ["precisely","2142690","e6414d693a0e4481abcd","どん","どん","Expresses exactness rather than the sound of an impact."]
].map(([id,entry,fingerprint,form,reading,rationale]) => ({
  id,entry,fingerprint,form,reading,rationale,type:"ordinary",status:"draft",source:"project-original",aliases:[]
}));
