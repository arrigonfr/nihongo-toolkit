// Public-facing metadata only. Draft decks must never be imported here.
export const editorialTools = {
  "kanji-anaume": ["Kanji Anaume", "Games", "Find the shared kanji", "Complete three compounds with the same missing character. Each meaning you reveal costs a point.", "□", "crossroads"],
  "shuden": ["Shūden", "Games", "Follow railway directions", "Follow a Japanese instruction from the marked station. Count from the next stop, not the one you are standing at.", "駅", "train"],
  "kikitori-karuta": ["Kikitori Karuta", "Games", "Match a spoken clue", "Listen to a Japanese description and choose its picture. Replay freely or switch to a text clue.", "耳", "karuta"],
  "joshi-renshuu": ["Joshi Renshū", "Practice", "Choose a particle in context", "Read the intended meaning before filling the gap. Compare the completed sentence with a nearby alternative.", "に・へ", "particle"],
  "josushi-renshuu": ["Josūshi Renshū", "Practice", "Count objects in Japanese", "Match a quantity and object to their counter, or type the full kana reading. Compare nearby quantities after answering.", "三本", "counter"],
  "kanji-kaki": ["Kanji Kaki", "Practice", "Practice writing a known kanji", "Study the target and its stroke order, then draw or use the keyboard-accessible self-study option.", "日", "draw"],
  "onomatope-jiten": ["Onomatope Jiten", "Reference", "Compare expressions by scene", "Find a sound or sensation by its scene, then compare two expressions and listen to their examples.", "しとしと", "guide"]
};
export const editorialPage = (file) => Object.hasOwn(editorialTools, file.replace(/\.html$/, ""));

// The previous slug remains the storage namespace for existing preview preferences.
export const editorialIdentity = {
  "kanji-anaume": ["漢字穴埋め", "kanji-crossroads"],
  "shuden": ["終電", "last-train"],
  "kikitori-karuta": ["聞き取りかるた", "listening-karuta"],
  "joshi-renshuu": ["助詞練習", "particle-lab"],
  "josushi-renshuu": ["助数詞練習", "counter-practice"],
  "kanji-kaki": ["漢字書き", "kanji-draw"],
  "onomatope-jiten": ["オノマトペ辞典", "sound-sensation"]
};
