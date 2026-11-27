import { escapeHTML as escape, setHTML } from "./html.js";
import { JAPANESE_FONTS } from "./japanese-fonts.js";
import { LISTS, MODES } from "./word-search-engine.js";

export const directionNames = {
  "0,1": "right →",
  "0,-1": "left ←",
  "1,0": "down ↓",
  "-1,0": "up ↑",
  "1,1": "down-right ↘",
  "1,-1": "down-left ↙",
  "-1,1": "up-right ↗",
  "-1,-1": "up-left ↖",
};

export const directionLabels = {
  forward: "Right → · Down ↓",
  vertical: "Right → · Down ↓ · Up ↑",
  all: "All eight directions",
  reverse: "Backward & diagonal",
};

// help === null leaves the label without a tooltip.
function selectSetting(key, label, options, help = "") {
  return `<label class="setting"${help === null ? "" : ` data-setting-description="${escape(help || `Choose ${label.toLowerCase()} for your next puzzle.`)}"`}><span>${label}</span><select id="setting-${key}" data-setting="${key}">${Object.entries(
    options,
  )
    .map(([value, text]) => `<option value="${escape(value)}">${escape(text)}</option>`)
    .join("")}</select></label>`;
}
function numberSetting(key, label, min, max) {
  return `<label class="setting"><span>${label}</span><input id="setting-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="1" required></label>`;
}
function checkSetting(key, label) {
  return `<label class="setting check"><input id="setting-${key}" data-setting="${key}" type="checkbox"><span>${label}</span></label>`;
}
// Tooltip-free controls: the visible name is not a <label>, so no help trigger is attached.
const plainName = (id, label) => `<span class="setting-name" id="name-${id}">${label}</span>`;
function plainSelect(key, label, options, attrs = `data-setting="${key}"`, id = `setting-${key}`) {
  return `<div class="setting">${plainName(id, label)}<select id="${id}" ${attrs} aria-labelledby="name-${id}">${Object.entries(
    options,
  )
    .map(([value, text]) => `<option value="${escape(value)}">${escape(text)}</option>`)
    .join("")}</select></div>`;
}
const plainNumber = (key, label, min, max) =>
  `<div class="setting">${plainName(`setting-${key}`, label)}<input id="setting-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="1" required aria-labelledby="name-setting-${key}"></div>`;
const plainCheck = (key, label) =>
  `<div class="setting check"><input id="setting-${key}" data-setting="${key}" type="checkbox" aria-labelledby="name-setting-${key}">${plainName(`setting-${key}`, label)}</div>`;

export function renderWordSearchShell(root, directions) {
  setHTML(
    root,
    `<div class="shell">
  <header><div class="brand"><span class="brand-mark" aria-hidden="true"><img src="/tool-icons/kotoba-sagashi.webp" alt=""></span><span class="brand-name">Kotoba Sagashi<span class="brand-note">NihongoToolkit</span></span></div><button id="themeButton" aria-label="Toggle theme" type="button">◐</button></header>
  <section class="intro"><span class="eyebrow"><span lang="ja">言葉探し</span> · <span>Word search</span></span>
        <h1>Find a word. <br><span>Make it yours.</span></h1><p>A quiet corner for your Japanese. Follow the characters, uncover familiar words, and discover a few new ones.</p></section>
  <details id="settingsPanel" class="card puzzle-settings" open><summary>Puzzle settings</summary><div class="settings-body"><p class="small">Valid settings save automatically and apply to your next puzzle. The top reading, audio and appearance controls stay live. Mode overrides are described below.</p><form id="settingsForm"></form></div></details>
  <div class="toolbar" data-i18n-scope><div><span class="tag" id="modeBadge">Classic</span></div><div class="actions"><button id="reviewButton" type="button">Notebook <span id="reviewCount">0</span></button></div></div>
  <p id="toolbarError" class="start-error" role="alert"></p>
  <div id="notice" role="status" aria-live="polite" data-i18n-scope></div>
  <div class="layout"><main>
    <section class="card"><div class="card-heading" data-i18n-scope><h2>Your discoveries</h2><span class="tag" id="wordCount">0 words</span></div><p class="small" id="listNote" data-i18n-scope>Find each word in the grid. Found words open your notebook.</p><ol id="wordList" class="word-list"></ol></section>
    <section class="card board-card" aria-label="Word search puzzle">
      <div class="board-heading" data-i18n-scope><div><span class="eyebrow">言葉探し · Word search</span><h2 id="puzzleTitle">Ready for a little discovery?</h2></div></div>
      <div class="board-scroll" tabindex="0" aria-label="Scrollable puzzle area"><div id="grid" role="grid" aria-label="Japanese word search" aria-describedby="selectionHelp"></div><div id="emptyBoard" data-i18n-scope><span lang="ja">見つけよう</span><p>Your next discovery starts here.</p><p id="startError" class="start-error"></p></div><button id="exportPuzzle" type="button" data-i18n-scope hidden>Export puzzle</button></div>
      <button id="startButton" class="primary" type="button">Create my puzzle →</button>
      <div class="selection-status" id="selectionStatus" aria-live="polite" data-i18n-scope>Choose your settings, then create a puzzle.</div>
      <div class="board-bottom" data-i18n-scope><select id="hintType" aria-label="Hint type"><option value="first">First character</option><option value="direction">Direction</option><option value="length">Word length</option><option value="meaning">Meaning clue</option><option value="area">General area</option></select><button id="hintButton" type="button" disabled>✧ Hint</button><button id="revealButton" type="button" disabled>Reveal word</button><button id="endButton" type="button" disabled>End round</button></div>
      <p id="selectionHelp" class="small instructions" data-i18n-scope>Drag a straight line, or tap the first and last characters.<br>Keyboard: arrows to move · Enter / Space to select · Esc to cancel.</p>
    </section>
    <section id="results" class="card results" tabindex="-1" hidden></section>
  </main><aside>
    <section class="card" aria-label="Puzzle statistics"><div class="card-heading" data-i18n-scope><h2>Stats</h2><div class="clock"><span class="small" id="timerLabel">Time</span><strong id="timer">—</strong></div></div><div class="progress-row" data-i18n-scope><span id="progressText">Create a puzzle to begin</span><span id="directionLabel">${directionLabels[directions]}</span></div><progress id="progress" max="8" value="0" aria-label="Words found"></progress></section>
    <section class="card notebook"><div class="card-heading" data-i18n-scope><h2>Word notebook</h2><span aria-hidden="true">✎</span></div><div id="wordDetails"><div class="notebook-empty" data-i18n-scope><span lang="ja">一語一会</span><p>Every word is a new encounter.</p><p class="small">Find a word to explore its reading, meaning, and examples here.</p></div></div></section>
  </aside></div>
  <p class="small source-note" data-i18n-scope>JLPT levels are study-list estimates.<br><a href="./data-sources.html" target="_blank" rel="noopener">Dictionary & sentence credits ↗</a></p>
  <footer><span>One word at a time.</span><span lang="ja">少しずつ、毎日。</span></footer>
  <dialog id="reviewDialog" aria-labelledby="reviewTitle"><div class="dialog-head" data-i18n-scope><h2 id="reviewTitle">Your review notebook</h2><button data-close type="button" aria-label="Close notebook">×</button></div><div class="dialog-body"><p class="small" data-i18n-scope>Missed, revealed, and saved words live here. Mixed Review also includes words you previously found.</p><div class="actions" data-i18n-scope><button id="exportReview" type="button">Export JSON</button><button id="importReview" type="button">Import JSON</button><button id="resetProgress" type="button">Reset progress</button></div><input id="reviewFile" type="file" accept=".json,application/json" hidden><p id="reviewNotice" role="status" data-i18n-scope></p><div id="reviewList"></div></div></dialog>
  <dialog id="kanjiDialog" aria-labelledby="kanjiTitle"><div class="dialog-head" data-i18n-scope><h2 id="kanjiTitle">Kanji close-up</h2><button data-close type="button" aria-label="Close kanji details">×</button></div><div class="dialog-body" id="kanjiContent"></div></dialog>
</div>`,
  );
}

export function renderWordSearchSettingsForm(form) {
  const levels = { all: "All · N5–N1", 5: "N5 · Beginner", 4: "N4", 3: "N3", 2: "N2", 1: "N1 · Advanced" };
  for (let from = 5; from >= 2; from--)
    for (let to = from - 1; to >= 1; to--) levels[`${from}-${to}`] = `N${from}–N${to}`;
  const availability = { limited: "Limited", unlimited: "Unlimited", disabled: "Disabled" };
  setHTML(
    form,
    `<fieldset><legend>Session</legend><div class="settings-grid">
  <div class="settings-wide">${selectSetting("mode", "Practice mode", MODES, null)}</div>
  </div></fieldset><fieldset><legend>Vocabulary</legend><div class="settings-grid vocabulary-grid">
  ${selectSetting("level", "JLPT study levels", levels, null)}
  ${selectSetting("script", "Japanese script", { kana: "Kana", kanji: "Kanji", both: "Both" }, "Choose Kana, Kanji (written forms with necessary okurigana), or both for the next puzzle.")}
  </div></fieldset><fieldset><legend>Grid & word placement</legend><div class="settings-grid">
  <div class="setting">${plainName("sizePreset", "Grid size")}<select id="sizePreset" aria-labelledby="name-sizePreset"><option value="8">Small · 8 × 8</option><option value="10">Medium · 10 × 10</option><option value="12">Large · 12 × 12</option><option value="15">Extra large · 15 × 15</option><option value="20">Jumbo · 20 × 20</option><option value="custom">Custom</option></select></div>
  ${numberSetting("size", "Custom grid side (5–20)", 5, 20)}
  ${checkSetting("overlap", "Allow shared characters")}
  </div></fieldset><fieldset><legend>Clue list</legend><div class="settings-grid clue-grid">
  ${selectSetting("list", "Clue-list display", LISTS, "Combine clue styles for the word list, or choose Hidden for no list. English clues use dictionary meanings. Japanese descriptions are unavailable: the dictionary has no Japanese definitions.")}
  ${plainCheck("meanings", "English beside Japanese clues")}
  </div></fieldset>
  <fieldset><legend>Hints & reveals</legend><div class="settings-grid">
  <div class="settings-section"><h3>Hints</h3>${plainSelect("hints", "Availability", availability)}${plainNumber("hintLimit", "Hint limit", 0, 100)}</div>
  <div class="settings-section"><h3>Reveals</h3>${plainSelect("reveals", "Availability", availability)}${plainNumber("revealLimit", "Reveal limit", 0, 20)}</div>
  </div></fieldset><fieldset><legend>Timer & special mode limits</legend><div class="settings-grid">
  <div class="settings-section"><h3>Countdown</h3>${checkSetting("timer", "Countdown timer (always on in Timed)")}
  ${numberSetting("seconds", "Time limit in seconds", 10, 3600)}
  </div><div class="settings-section"><h3>Challenge limits</h3>${plainNumber("mistakes", "Sudden Death mistake limit", 1, 20)}
  ${plainNumber("rounds", "Marathon rounds", 2, 10)}</div>
  </div></fieldset><fieldset><legend>Display & accessibility</legend><div class="settings-grid">
  ${selectSetting("font", "Japanese font", JAPANESE_FONTS, null)}
  ${plainNumber("fontSize", "Grid font size (px)", 20, 40)}
  ${plainCheck("contrast", "High contrast")}${plainCheck("animation", "Confirmation animation")}
  </div></fieldset><p id="settingsError" role="alert"></p>`,
  );
}
