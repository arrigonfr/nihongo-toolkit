import "./word-search.css";
import { setSettingAvailability } from "./settings-panel.js";
import { pillSelect } from "./choice-controls.js";
import { confirmAction } from "./confirm-dialog.js";
import { japaneseDescriptions } from "./japanese-descriptions.js";
import { API_BASE, fetchItems } from "./api.js";
import { mountChips } from "./chips.js";
import { rememberControls } from "./settings-storage.js";
import { JAPANESE_FONTS, applyJapaneseFont } from "./japanese-fonts.js";
import { mountStudyControls, japaneseHTML, audioHTML, readingsHTML, speakJapanese } from "./study-controls.js";
import { mountSentenceExamples, escape } from "./examples.js";
import {
  CATEGORIES, MODES, LISTS, DEFAULTS, listStyles, validateSettings, effectiveSettings, generateWordSearch,
  straightPath, matchSelection, readingOf, wordKey, categoryOf, localDay, dailyStreak, reviewImport
} from "./word-search-engine.js";

const $ = (id) => document.getElementById(id);
const storageKey = "nihon:word-search-v1";
const directionDefaultsVersion = 1;
const emptyProgress = () => ({ known: [], review: [], recent: [], days: [], completed: 0, daily: null });
let settings = { ...DEFAULTS }, progress = emptyProgress(), restoreError = "", migratedDirections = false, customSize = false;
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (saved) {
    settings = validateSettings({ ...DEFAULTS, ...saved.settings });
    for (const key of ["known", "review"]) reviewImport({ version: 1, tool: "nihon-word-search", words: saved.progress[key] });
    if (!["recent", "days"].every((key) => Array.isArray(saved.progress[key]) && saved.progress[key].every((value) => typeof value === "string"))
      || !Number.isInteger(saved.progress.completed)) throw new Error("Invalid saved progress.");
    progress = { ...emptyProgress(), ...saved.progress };
    customSize = saved.customSize === true;
    if (saved.directionDefaultsVersion !== directionDefaultsVersion) {
      settings.directions = DEFAULTS.directions;
      migratedDirections = true;
    }
  }
} catch (error) {
  console.error("Could not restore Word Search data.", error);
  settings = { ...DEFAULTS };
  progress = emptyProgress();
  restoreError = "Saved data could not be restored. Check settings before starting.";
}
let game = null, busy = false, round = 1, timerHandle, anchor = null, preview = [], wrong = [];
let pointer = null, detailKey = null, detailRequest = 0, highlight = [], feedbackTimer;
const pools = new Map(), kanjiCache = new Map();
const categoryClues = {
  all: ["言", "ことば", "A Japanese vocabulary word"],
  food: ["🍵", "食べ物や飲み物に関係することば", "Something related to food or drink"],
  animals: ["🐾", "動物に関係することば", "Something related to animals"],
  nature: ["🌿", "自然や天気に関係することば", "Something related to nature or weather"],
  travel: ["🚆", "旅行や移動に関係することば", "Something related to travel or movement"],
  school: ["📖", "学校や勉強に関係することば", "Something related to school or study"],
  work: ["💼", "仕事に関係することば", "Something related to work"],
  daily: ["🏠", "毎日の生活に関係することば", "Something related to daily life"],
  emotions: ["♡", "気持ちに関係することば", "Something related to feelings"],
  technology: ["💻", "技術に関係することば", "Something related to technology"],
  verbs: ["↗", "動作などを表すことば", "A word describing an action or state"],
  adjectives: ["✧", "様子や性質を表すことば", "A word describing a quality"],
  katakana: ["ア", "カタカナで書くことば", "A word written in katakana"]
};
const directionNames = { "0,1": "right →", "0,-1": "left ←", "1,0": "down ↓", "-1,0": "up ↑",
  "1,1": "down-right ↘", "1,-1": "down-left ↙", "-1,1": "up-right ↗", "-1,-1": "up-left ↖" };
const directionLabels = { forward: "Right → · Down ↓", vertical: "Right → · Down ↓ · Up ↑", all: "All eight directions", reverse: "Backward & diagonal" };

$("wordSearchRoot").innerHTML = `<div class="shell">
  <header><div class="brand"><span class="brand-mark" lang="ja">探</span><span class="brand-name">Kotoba Sagashi<span class="brand-note">at NihongoToolkit</span></span></div><button id="themeButton" aria-label="Toggle theme" type="button">◐</button></header>
  <section class="intro"><span class="eyebrow">A little discovery, every day</span><h1>Find a word.<br><span>Make it yours.</span></h1><p>A quiet corner for your Japanese. Follow the characters, uncover familiar words, and discover a few new ones.</p></section>
  <details id="settingsPanel" class="card puzzle-settings" open><summary>Puzzle settings</summary><div class="settings-body"><p class="small">Valid settings save automatically and apply to your next puzzle. The top reading, audio and appearance controls stay live. Mode overrides are described below.</p><form id="settingsForm"></form></div></details>
  <div class="toolbar"><div><span class="tag" id="modeBadge">Classic</span> <span id="streak" class="small"></span></div><div class="actions"><button id="reviewButton" type="button">Notebook <span id="reviewCount">0</span></button><button id="newGame" class="primary" type="button">New puzzle ↗</button></div></div>
  <p id="toolbarError" class="start-error" role="alert"></p>
  <div id="notice" role="status" aria-live="polite"></div>
  <div class="layout"><main>
    <section class="card board-card" aria-label="Word search puzzle">
      <div class="board-heading"><div><span class="eyebrow">言葉探し · Word search</span><h2 id="puzzleTitle">Ready for a little discovery?</h2></div><div class="clock"><span class="small" id="timerLabel">Time</span><strong id="timer">—</strong></div></div>
      <div class="progress-row"><span id="progressText">Create a puzzle to begin</span><span id="directionLabel">${directionLabels[settings.directions]}</span></div>
      <progress id="progress" max="8" value="0" aria-label="Words found"></progress>
      <div class="board-scroll" tabindex="0" aria-label="Scrollable puzzle area"><div id="grid" role="grid" aria-label="Japanese word search" aria-describedby="selectionHelp"></div><div id="emptyBoard"><span lang="ja">見つけよう</span><p>Your next discovery starts here.</p><button id="startButton" class="primary" type="button">Create my first puzzle →</button><p id="startError" class="start-error"></p></div></div>
      <div class="selection-status" id="selectionStatus" aria-live="polite">Choose your settings, then create a puzzle.</div>
      <div class="board-bottom"><select id="hintType" aria-label="Hint type"><option value="first">First character</option><option value="direction">Direction</option><option value="length">Word length</option><option value="meaning">Meaning clue</option><option value="area">General area</option></select><button id="hintButton" type="button" disabled>✧ Hint</button><button id="revealButton" type="button" disabled>Reveal word</button><button id="endButton" type="button" disabled>End round</button></div>
      <p id="selectionHelp" class="small instructions">Drag a straight line, or tap the first and last characters.<br>Keyboard: arrows to move · Enter / Space to select · Esc to cancel.</p>
    </section>
    <section id="results" class="card results" tabindex="-1" hidden></section>
  </main><aside>
    <section class="card"><div class="card-heading"><h2>Your discoveries</h2><span class="tag" id="wordCount">0 words</span></div><p class="small" id="listNote">Find each word in the grid. Found words open your notebook.</p><ol id="wordList" class="word-list"></ol></section>
    <section class="card notebook"><div class="card-heading"><h2>Word notebook</h2><span aria-hidden="true">✎</span></div><div id="wordDetails"><div class="notebook-empty"><span lang="ja">一語一会</span><p>Every word is a new encounter.</p><p class="small">Find a word to explore its reading, meaning, and examples here.</p></div></div></section>
    <p class="small source-note">JLPT levels are study-list estimates. Category clues use approximate dictionary filters.<br><a href="./data-sources.html" target="_blank" rel="noopener">Dictionary & sentence credits ↗</a></p>
  </aside></div>
  <footer><span>One word at a time.</span><span lang="ja">少しずつ、毎日。</span></footer>
  <dialog id="reviewDialog" aria-labelledby="reviewTitle"><div class="dialog-head"><h2 id="reviewTitle">Your review notebook</h2><button data-close type="button" aria-label="Close notebook">×</button></div><div class="dialog-body"><p class="small">Missed, revealed, and saved words live here. Mixed Review also includes words you previously found.</p><div class="actions"><button id="exportReview" type="button">Export JSON</button><button id="importReview" type="button">Import JSON</button><button id="resetProgress" type="button">Reset progress</button></div><input id="reviewFile" type="file" accept=".json,application/json" hidden><p id="reviewNotice" role="status"></p><div id="reviewList"></div></div></dialog>
  <dialog id="kanjiDialog" aria-labelledby="kanjiTitle"><div class="dialog-head"><h2 id="kanjiTitle">Kanji close-up</h2><button data-close type="button" aria-label="Close kanji details">×</button></div><div class="dialog-body" id="kanjiContent"></div></dialog>
</div>`;

function showStartError(text) {
  $("toolbarError").textContent = $("startError").textContent = text;
}
function inform(message, error = false) {
  $("notice").textContent = message;
  $("notice").dataset.error = String(error);
}
function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({ settings, progress, directionDefaultsVersion, customSize })); return true; }
  catch (error) { console.error("Could not save Word Search data.", error); inform("Settings and progress could not be saved. Export your notebook before leaving.", true); return false; }
}
function compact(item) {
  return { word: item.word, reading: readingOf(item), meaning: item.meaning, partOfSpeech: item.partOfSpeech || "", level: item.level };
}
function addWord(list, item) {
  if (!list.some((word) => wordKey(word) === wordKey(item))) list.push(compact(item));
  if (list.length > 5000) list.shift();
}
// help === null leaves the label without a tooltip.
function selectSetting(key, label, options, help = "") {
  return `<label class="setting"${help === null ? "" : ` data-setting-description="${escape(help || `Choose ${label.toLowerCase()} for your next puzzle.`)}"`}><span>${label}</span><select id="setting-${key}" data-setting="${key}">${Object.entries(options).map(([value, text]) => `<option value="${escape(value)}">${escape(text)}</option>`).join("")}</select></label>`;
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
  return `<div class="setting">${plainName(id, label)}<select id="${id}" ${attrs} aria-labelledby="name-${id}">${Object.entries(options).map(([value, text]) => `<option value="${escape(value)}">${escape(text)}</option>`).join("")}</select></div>`;
}
const plainNumber = (key, label, min, max) => `<div class="setting">${plainName(`setting-${key}`, label)}<input id="setting-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="1" required aria-labelledby="name-setting-${key}"></div>`;
const plainCheck = (key, label) => `<div class="setting check"><input id="setting-${key}" data-setting="${key}" type="checkbox" aria-labelledby="name-setting-${key}">${plainName(`setting-${key}`, label)}</div>`;
const levels = { all: "All · N5–N1", 5: "N5 · Beginner", 4: "N4", 3: "N3", 2: "N2", 1: "N1 · Advanced" };
for (let from = 5; from >= 2; from--) for (let to = from - 1; to >= 1; to--) levels[`${from}-${to}`] = `N${from}–N${to}`;
const availability = { limited: "Limited", unlimited: "Unlimited", disabled: "Disabled" };
$("settingsForm").innerHTML = `<fieldset><legend>Puzzle & vocabulary</legend><div class="settings-grid">
  ${selectSetting("mode", "Practice mode", MODES, null)}
  ${selectSetting("level", "JLPT study levels", levels, null)}
  ${selectSetting("script", "Japanese script", { kana: "Kana", kanji: "Kanji", both: "Both" }, "Choose Kana, Kanji (written forms with necessary okurigana), or both for the next puzzle.")}
  ${plainSelect("category", "Vocabulary category", CATEGORIES)}
  </div></fieldset><fieldset><legend>Grid & word placement</legend><div class="settings-grid">
  <div class="setting">${plainName("sizePreset", "Grid size")}<select id="sizePreset" aria-labelledby="name-sizePreset"><option value="8">Small · 8 × 8</option><option value="10">Medium · 10 × 10</option><option value="12">Large · 12 × 12</option><option value="15">Extra large · 15 × 15</option><option value="20">Jumbo · 20 × 20</option><option value="custom">Custom</option></select></div>
  ${numberSetting("size", "Custom grid side (5–20)", 5, 20)}
  ${checkSetting("overlap", "Allow shared characters")}
  </div></fieldset><fieldset><legend>Clue list</legend><div class="settings-grid clue-grid">
  ${selectSetting("list", "Clue-list display", LISTS, "Combine clue styles for the word list, or choose Hidden for no list. English words use dictionary meanings. Japanese category clues and icons are broader hints, not definitions.")}
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
  </div></fieldset><p id="settingsError" role="alert"></p>`;
const listRegular = Object.keys(LISTS).filter((key) => key !== "hidden");
mountChips($("setting-script"), {
  multiple: true, allValue: "both", fieldClass: "wide",
  options: [{ value: "kana", label: "Kana" }, { value: "kanji", label: "Kanji" }]
});
mountChips($("setting-list"), {
  multiple: true, exclusive: "hidden", exclusiveLabel: "Hidden", fieldClass: "wide",
  options: [...listRegular.map((value) => ({ value, label: LISTS[value] })), { value: "hidden", label: "Hidden" }],
  decode: (value) => listStyles(value),
  encode: (values) => values.includes("hidden") ? "hidden" : listRegular.filter((value) => values.includes(value)).join(",")
});
const syncModePills = pillSelect($("setting-mode"), {
  classic: "Find words at your own pace.", timed: "Find all words before the countdown ends.",
  quick: "An 8 × 8 puzzle with five words.", daily: "A date-seeded N5 kana puzzle with fixed rules.",
  marathon: "Solve progressively larger puzzles.", sudden: "Stay within the selected mistake limit.",
  clue: "Search for Japanese words using English definitions.", kanji: "Find written words containing kanji.",
  kana: "Find words written in kana.", reverse: "Words run backward and diagonally.",
  memory: "Find the words without a visible list.", review: "Revisit found and missed words from your notebook."
});

function syncSettings() {
  for (const input of document.querySelectorAll("[data-setting]")) {
    const key = input.dataset.setting;
    const value = settings[key];
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
  }
  syncModePills();
  for (const id of ["setting-script", "setting-list"]) $(id).chipsApi.sync();
  $("sizePreset").value = !customSize && [8, 10, 12, 15, 20].includes(settings.size) ? String(settings.size) : "custom";
  $("setting-size").closest("label").hidden = $("sizePreset").value !== "custom";
  syncAvailability();
}
function syncAvailability() {
  const value = (key) => $("setting-" + key).value;
  const mode = value("mode"), daily = mode === "daily";
  const fixed = ["script", "level", "category", "size", "overlap", "timer", "list", "hints", "hintLimit", "reveals"];
  const styles = listStyles(mode === "clue" ? "english" : mode === "memory" ? "hidden" : daily ? "japanese" : value("list"));
  const reasons = {
    script: ["kana", "kanji"].includes(mode) ? "Set by the selected game mode." : "",
    size: mode === "quick" ? "Quick uses an 8 by 8 grid." : $("sizePreset").value !== "custom" ? "Choose a custom grid size." : "",
    list: ["clue", "memory"].includes(mode) ? "Set by the selected game mode." : "",
    meanings: !styles.includes("japanese") ? "Used with the Japanese clue style." : "",
    timer: mode === "timed" ? "Timed mode always uses a countdown." : "",
    seconds: daily || !(mode === "timed" || $("setting-timer").checked) ? "Enable the countdown timer." : "",
    mistakes: mode !== "sudden" ? "Used in Sudden Death." : "",
    rounds: mode !== "marathon" ? "Used in Marathon." : "",
    hintLimit: value("hints") !== "limited" ? "Choose limited hints." : "",
    revealLimit: daily || value("reveals") !== "limited" ? "Choose limited reveals." : ""
  };
  for (const input of document.querySelectorAll("[data-setting]")) {
    const key = input.dataset.setting;
    setSettingAvailability(input, daily && fixed.includes(key) ? "Daily uses fixed rules; your preference is kept for other modes." : reasons[key]);
  }
  setSettingAvailability($("sizePreset"), daily || mode === "quick" ? "Grid size is set by this mode." : "");
}
function updateDisplay() {
  const display = game?.rules || settings;
  applyJapaneseFont(display.font, game?.started ?? "settings");
  document.documentElement.style.setProperty("--cell-font", `${display.fontSize}px`);
  document.documentElement.dataset.contrast = String(display.contrast);
  document.documentElement.dataset.animate = String(display.animation);
}
mountStudyControls({ onChange: () => { renderList(); } });
// Chip titles are labels, which the shared help layer turns into tooltips: swap them for plain text.
for (const id of ["setting-mode", "setting-level", "setting-font"]) {
  let host = $(id).closest("label, .chips-field");
  if (!host) continue;
  if (host.matches("label")) {
    const div = document.createElement("div");
    div.className = host.className;
    div.append(...host.childNodes);
    host.replaceWith(div);
    host = div;
  }
  const title = host.querySelector(":scope > .chips-title, :scope > span:not(.setting-availability)");
  if (!title) continue;
  const plain = document.createElement("span");
  plain.className = title.className.replace("study-setting-name", "").trim() || "chips-title";
  plain.textContent = title.textContent;
  title.replaceWith(plain);
}
$("settingsForm").addEventListener("click", (event) => {
  const name = event.target.closest?.(".setting.check > .setting-name");
  if (name) name.previousElementSibling.click();
});
syncSettings();
updateDisplay();
rememberControls("nihon:word-search-controls-v1", ["hintType"], (message) => inform(message, true));
$("sizePreset").onchange = () => {
  const custom = $("sizePreset").value === "custom";
  customSize = custom;
  $("setting-size").closest("label").hidden = !custom;
  if (!custom) $("setting-size").value = $("sizePreset").value;
};
$("settingsForm").addEventListener("change", () => { saveSettings(); showStartError(""); });
$("settingsForm").addEventListener("input", (event) => {
  if (event.target.type === "number" && $("settingsForm").checkValidity()) saveSettings();
});
function saveSettings() {
  syncAvailability();
  if (!$("settingsForm").checkValidity()) {
    $("settingsError").textContent = "Enter valid values before these settings can be saved.";
    return;
  }
  const next = { ...settings };
  for (const input of document.querySelectorAll("[data-setting]")) {
    if (input.disabled && !(input.dataset.setting === "size" && !$("sizePreset").disabled && $("sizePreset").value !== "custom")) continue;
    const key = input.dataset.setting;
    if (!(key in DEFAULTS)) continue;
    next[key] = typeof DEFAULTS[key] === "boolean" ? input.checked : typeof DEFAULTS[key] === "number" ? Number(input.value) : input.value;
  }
  try {
    settings = validateSettings(next);
    updateDisplay();
    if (!persist()) return;
    $("settingsError").textContent = "";
    if (!game) $("directionLabel").textContent = directionLabels[settings.directions];
  } catch (error) { $("settingsError").textContent = error.message; }
}
$("settingsForm").onsubmit = (event) => {
  event.preventDefault();
  saveSettings();
};
document.querySelectorAll("[data-close]").forEach((button) => { button.onclick = () => button.closest("dialog").close(); });

function updateLifetime() {
  $("reviewCount").textContent = progress.review.length;
  const streak = dailyStreak(progress.days);
  $("streak").textContent = streak ? `${streak} day${streak === 1 ? "" : "s"} streak` : "A fresh start";
}
function snapshotDaily() {
  if (game?.rules.mode === "daily") {
    progress.daily = { day: game.day, puzzle: game.puzzle, found: game.found, paths: game.paths,
      revealed: game.revealed, hints: game.hints, attempts: game.attempts, correct: game.correct,
      elapsed: elapsed(), ended: game.ended, won: game.won, newWords: game.newWords };
  }
}
async function startGame(nextRound = false) {
  if (busy) return;
  if (game && !game.ended) {
    const choice = await confirmAction("End this round and create another puzzle?", { review: true });
    if (!choice) return;
    finish(false, "Round ended", choice === "save");
  }
  busy = true;
  $("newGame").disabled = true; $("startButton").disabled = true;
  if ($("nextRound")) $("nextRound").disabled = true;
  showStartError("");
  inform("Gathering words and making a little room for discovery…");
  const next = nextRound ? round + 1 : 1;
  try {
    const baseSettings = { ...(nextRound ? game.baseSettings : settings) };
    const rules = effectiveSettings(baseSettings, next);
    const day = localDay();
    let puzzle, saved = rules.mode === "daily" && progress.daily?.day === day ? progress.daily : null;
    if (saved) {
      puzzle = saved.puzzle;
      if (!Array.isArray(puzzle?.grid) || !Array.isArray(puzzle?.entries) || puzzle.grid.length !== puzzle.size ** 2
        || !puzzle.entries.every((entry) => entry.cells.every((cell, i) => puzzle.grid[cell] === [...entry.answer][i]))) {
        throw new Error("Today's saved puzzle is invalid. Export your notebook, then reset progress to recover.");
      }
    } else {
      let pool;
      if (rules.mode === "review") {
        pool = [...new Map([...progress.known, ...progress.review].map((item) => [wordKey(item), item])).values()];
        if (!pool.length) throw new Error("Your review pool is empty. Find some words or import a review notebook first.");
      } else {
        if (!pools.has(rules.level)) pools.set(rules.level, await fetchItems("/api/word-search/vocabulary", { level: rules.level }));
        pool = pools.get(rules.level);
      }
      puzzle = generateWordSearch(pool, rules, {
        seed: rules.mode === "daily" ? `word-search-v1:${day}` : `${Date.now()}:${Math.random()}`,
        recent: rules.mode === "daily" ? [] : progress.recent
      });
    }
    round = next;
    game = { puzzle, rules, baseSettings, day, started: Date.now() - (saved?.elapsed || 0) * 1000,
      found: saved?.found || [], paths: saved?.paths || [], revealed: saved?.revealed || [],
      hints: saved?.hints || 0, attempts: saved?.attempts || 0, correct: saved?.correct || 0,
      ended: saved?.ended || false, won: saved?.won || false, newWords: saved?.newWords || [],
      stopped: saved?.ended ? saved.elapsed : null };
    updateDisplay();
    progress.recent = [...progress.recent, ...puzzle.entries.map((entry) => entry.key)].slice(-160);
    clearInterval(timerHandle); clearTimeout(feedbackTimer);
    anchor = null; pointer = null; preview = []; wrong = []; highlight = []; detailKey = null; detailRequest++;
    $("wordDetails").innerHTML = `<p class="small">Find a word to explore its reading, meaning, example sentences, and kanji here.</p>`;
    $("results").hidden = true;
    $("settingsPanel").open = false;
    renderBoard(); renderList(); updateStats();
    snapshotDaily(); persist(); updateLifetime();
    if (game.ended) renderResults(game.won ? "Daily puzzle complete" : "Daily round ended");
    else timerHandle = setInterval(tick, 250);
    inform(saved ? "Today's puzzle restored. Daily progress cannot be rerolled." : "Your puzzle is ready. Find your first word.");
  } catch (error) { console.error("Word Search generation failed.", error); inform("", false); showStartError(error.message); }
  finally {
    busy = false; $("newGame").disabled = false; $("startButton").disabled = false;
    if ($("nextRound")) $("nextRound").disabled = false;
  }
}
function elapsed() { return game ? (game.stopped ?? Math.floor((Date.now() - game.started) / 1000)) : 0; }
const timeText = (seconds) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
function tick() {
  if (!game || game.ended) return;
  updateClock();
  if (game.rules.timer && elapsed() >= game.rules.seconds) finish(false, "Time is up");
}
function updateClock() {
  $("timerLabel").textContent = game.rules.timer ? "Time left" : "Time taken";
  $("timer").textContent = timeText(game.rules.timer ? Math.max(0, game.rules.seconds - elapsed()) : elapsed());
}
function active() {
  if (!game || game.ended || busy) return false;
  if (game.rules.timer && elapsed() >= game.rules.seconds) { finish(false, "Time is up"); return false; }
  return true;
}
function renderBoard() {
  const { puzzle, rules } = game;
  $("emptyBoard").hidden = true;
  $("grid").style.setProperty("--size", puzzle.size);
  $("grid").setAttribute("aria-rowcount", puzzle.size);
  $("grid").setAttribute("aria-colcount", puzzle.size);
  $("grid").innerHTML = Array.from({ length: puzzle.size }, (_, row) => `<div class="grid-row" role="row">${puzzle.grid.slice(row * puzzle.size, (row + 1) * puzzle.size).map((character, col) =>
    `<button type="button" role="gridcell" data-cell="${row * puzzle.size + col}" tabindex="${row === 0 && col === 0 ? 0 : -1}" aria-label="Row ${row + 1}, column ${col + 1}: ${escape(character)}" lang="ja">${escape(character)}</button>`).join("")}</div>`).join("");
  $("puzzleTitle").textContent = `${puzzle.size} × ${puzzle.size} · ${rules.level === "all" ? "All levels" : `N${rules.level.replace("-", "–N")}`} · ${rules.script === "both" ? "Mixed script" : rules.script === "kana" ? "Kana" : "Kanji"}`;
  $("modeBadge").textContent = `${MODES[rules.mode]}${rules.mode === "marathon" ? ` · Round ${round} / ${rules.rounds}` : ""}`;
  $("directionLabel").textContent = directionLabels[puzzle.directions];
  $("selectionStatus").textContent = "Select the first character, then follow the word.";
  paintGrid();
}
function paintGrid() {
  if (!game) return;
  const foundCells = new Set(game.paths.flat());
  const revealedCells = new Set(game.puzzle.entries.filter((entry) => game.revealed.includes(entry.key)).flatMap((entry) => entry.cells));
  for (const cell of $("grid").querySelectorAll("[data-cell]")) {
    const index = Number(cell.dataset.cell);
    cell.classList.toggle("found", foundCells.has(index));
    cell.classList.toggle("revealed", revealedCells.has(index));
    cell.classList.toggle("selecting", preview.includes(index));
    cell.classList.toggle("anchor", anchor === index);
    cell.classList.toggle("wrong", wrong.includes(index));
    cell.classList.toggle("hint-area", highlight.includes(index));
    cell.setAttribute("aria-selected", String(preview.includes(index)));
    cell.setAttribute("aria-disabled", String(game.ended));
  }
}
function renderList() {
  if (!game) return;
  const { rules, puzzle } = game;
  $("wordCount").textContent = `${puzzle.entries.length} words`;
  const styles = listStyles(rules.list), has = (style) => styles.includes(style);
  $("listNote").textContent = has("hidden") ? "Memory mode: use hints to discover words. Only found words appear below."
    : styles.every((style) => ["japaneseClue", "icon"].includes(style)) ? "Category clues are intentionally broad. Character counts narrow the search." : "Find each word. Select a found word to explore it.";
  $("wordList").innerHTML = puzzle.entries.map((entry, index) => {
    const found = game.found.includes(entry.key), revealed = game.revealed.includes(entry.key);
    if (has("hidden") && !found) return "";
    const category = rules.category === "all" ? categoryOf(entry) : rules.category;
    const [icon, japaneseClue] = categoryClues[category];
    const parts = [];
    if (found || has("japanese")) parts.push(japaneseHTML(entry.answer, readingOf(entry)));
    if (!found) {
      if (has("english")) parts.push(escape(entry.meaning));
      if (has("clue")) parts.push(`${escape(entry.partOfSpeech || "Word")}: ${escape(entry.meaning)}`);
      if (has("japaneseClue")) parts.push(`<span lang="ja">${japaneseDescriptions[entry.word] || japaneseClue} · ${[...entry.answer].length}文字</span>`);
      if (has("icon")) parts.push(`<span class="clue-icon" aria-hidden="true">${icon}</span><span>${CATEGORIES[category]} · ${[...entry.answer].length} characters</span>`);
      if (has("first") && !has("japanese")) parts.push(`<span lang="ja">${escape([...readingOf(entry)][0])}…</span>`);
    }
    const label = parts.length > 1 ? parts.map((part) => `<span class="word-clue">${part}</span>`).join("") : parts[0] || "";
    const english = (found || (rules.meanings && has("japanese") && !has("english") && !has("clue"))) ? `<span class="word-meaning">${escape(entry.meaning)}</span>` : "";
    return `<li class="${found ? "is-found" : ""} ${revealed ? "is-revealed" : ""}"><button type="button" data-word="${index}" ${!found ? "disabled" : ""} class="${has("japanese") ? "with-reading" : ""}"><span class="word-check" aria-hidden="true">${found ? revealed ? "↗" : "✓" : String(index + 1).padStart(2, "0")}</span><span class="word-label">${label}${english}${found ? `<span class="word-status">${revealed ? "Revealed · saved for review" : "Found · explore word"}</span>` : ""}</span></button></li>`;
  }).join("");
}
function available(type) {
  if (!game || game.ended) return false;
  const option = game.rules[type];
  const used = type === "hints" ? game.hints : game.revealed.length;
  return option === "unlimited" || (option === "limited" && used < game.rules[type === "hints" ? "hintLimit" : "revealLimit"]);
}
function updateStats() {
  if (!game) return;
  $("progressText").textContent = `${game.found.length} of ${game.puzzle.entries.length} words found${game.rules.mode === "sudden" ? ` · ${Math.max(0, game.rules.mistakes - (game.attempts - game.correct))} lives` : ""}`;
  $("progress").max = game.puzzle.entries.length;
  $("progress").value = game.found.length;
  $("hintButton").disabled = !available("hints");
  $("revealButton").disabled = !available("reveals");
  $("endButton").disabled = game.ended;
  $("hintButton").textContent = `✧ Hint${game.rules.hints === "limited" ? ` (${Math.max(0, game.rules.hintLimit - game.hints)})` : ""}`;
  $("revealButton").textContent = `Reveal word${game.rules.reveals === "limited" ? ` (${Math.max(0, game.rules.revealLimit - game.revealed.length)})` : ""}`;
  updateClock();
}
function markFound(entry, path, reveal = false) {
  game.found.push(entry.key); game.paths.push(path);
  if (reveal) { game.revealed.push(entry.key); addWord(progress.review, entry); }
  else {
    if (!progress.known.some((item) => wordKey(item) === entry.key)) game.newWords.push(entry.key);
    addWord(progress.known, entry);
  }
  anchor = null; preview = []; wrong = [];
  $("selectionStatus").textContent = `${reveal ? "Revealed" : "Found"}: ${entry.answer} · ${entry.meaning}`;
  renderList(); paintGrid(); updateStats(); inspectWord(entry);
  if (!reveal) speakJapanese(readingOf(entry));
  if (game.found.length === game.puzzle.entries.length) finish(true, "Every word, discovered.");
  snapshotDaily(); persist(); updateLifetime();
}
function submitSelection(start, end) {
  if (!active()) return;
  clearTimeout(feedbackTimer); wrong = []; highlight = [];
  const result = matchSelection(game.puzzle, start, end, game.found);
  anchor = null; preview = [];
  if (!result.duplicate) game.attempts++;
  if (result.entry) { game.correct++; markFound(result.entry, result.path); }
  else {
    $("selectionStatus").textContent = result.error;
    wrong = straightPath(start, end, game.puzzle.size);
    if (!wrong.length) wrong = [start, end];
    paintGrid();
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { wrong = []; paintGrid(); }, 750);
    if (game.rules.mode === "sudden" && game.attempts - game.correct >= game.rules.mistakes) finish(false, "No lives remaining");
    updateStats(); snapshotDaily(); persist();
  }
}
function focusCell(index) {
  const cell = $("grid").querySelector(`[data-cell="${index}"]`);
  if (!cell) return;
  $("grid").querySelectorAll('[tabindex="0"]').forEach((item) => { item.tabIndex = -1; });
  cell.tabIndex = 0;
  cell.focus({ preventScroll: true });
}
function cellAt(event) {
  const cell = document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-cell]");
  return cell && $("grid").contains(cell) ? Number(cell.dataset.cell) : null;
}
$("grid").addEventListener("pointerdown", (event) => {
  if (!active() || !event.isPrimary || event.button !== 0) return;
  const cell = event.target.closest("[data-cell]");
  if (!cell) return;
  event.preventDefault();
  const index = Number(cell.dataset.cell);
  pointer = { id: event.pointerId, start: index, last: index, hadAnchor: anchor !== null, moved: false };
  if (anchor === null) anchor = index;
  preview = straightPath(anchor, index, game.puzzle.size);
  focusCell(index); paintGrid();
  $("grid").setPointerCapture(event.pointerId);
});
$("grid").addEventListener("pointermove", (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const index = cellAt(event);
  if (index === null) return;
  pointer.last = index;
  pointer.moved ||= index !== pointer.start;
  preview = straightPath(anchor, index, game.puzzle.size);
  paintGrid();
});
$("grid").addEventListener("pointerup", (event) => {
  if (!pointer || pointer.id !== event.pointerId) return;
  const current = pointer, index = cellAt(event);
  pointer = null;
  if ($("grid").hasPointerCapture(event.pointerId)) $("grid").releasePointerCapture(event.pointerId);
  if (index === null) { anchor = null; preview = []; paintGrid(); return; }
  if (current.hadAnchor || current.moved || index !== current.start) submitSelection(anchor, index);
  else $("selectionStatus").textContent = `Start selected: ${game.puzzle.grid[anchor]}. Choose the last character; select this cell again for a one-character word.`;
});
$("grid").addEventListener("pointercancel", () => { pointer = null; anchor = null; preview = []; paintGrid(); });
$("grid").addEventListener("click", (event) => {
  const cell = event.target.closest("[data-cell]");
  if (event.detail !== 0 || !cell || !active()) return;
  const index = Number(cell.dataset.cell);
  if (anchor === null) { anchor = index; preview = [index]; paintGrid(); $("selectionStatus").textContent = "Start selected. Activate the last character."; }
  else submitSelection(anchor, index);
});
$("grid").addEventListener("keydown", (event) => {
  const cell = event.target.closest("[data-cell]");
  if (!cell || !active()) return;
  let index = Number(cell.dataset.cell);
  const size = game.puzzle.size;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    const row = Math.floor(index / size), col = index % size;
    if (event.key === "ArrowUp" && row > 0) index -= size;
    if (event.key === "ArrowDown" && row < size - 1) index += size;
    if (event.key === "ArrowLeft" && col > 0) index--;
    if (event.key === "ArrowRight" && col < size - 1) index++;
    if (event.key === "Home") index = row * size;
    if (event.key === "End") index = (row + 1) * size - 1;
    focusCell(index);
    if (anchor !== null) { preview = straightPath(anchor, index, size); paintGrid(); }
  } else if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    if (anchor === null) { anchor = index; preview = [index]; paintGrid(); $("selectionStatus").textContent = "Start selected. Move to the last character and press Enter or Space."; }
    else submitSelection(anchor, index);
  } else if (event.key === "Escape") {
    event.preventDefault(); anchor = null; preview = []; paintGrid(); $("selectionStatus").textContent = "Selection cancelled.";
  }
});
$("hintButton").onclick = () => {
  if (!active() || !available("hints")) return;
  clearTimeout(feedbackTimer); wrong = []; highlight = [];
  const entry = game.puzzle.entries.find((item) => !game.found.includes(item.key));
  if (!entry) return;
  game.hints++;
  const kind = $("hintType").value;
  const label = `Hint for word ${game.puzzle.entries.indexOf(entry) + 1}: `;
  const messages = { first: `starts with ${[...entry.answer][0]}`, direction: `runs ${directionNames[entry.direction.join(",")]}`,
    length: `${[...entry.answer].length} characters`, meaning: entry.meaning, area: "look in the outlined area" };
  $("selectionStatus").textContent = label + messages[kind];
  if (kind === "area") {
    const size = game.puzzle.size, cell = entry.cells[Math.floor(entry.cells.length / 2)];
    const row = Math.floor(cell / size), col = cell % size;
    highlight = game.puzzle.grid.flatMap((_, i) => Math.abs(Math.floor(i / size) - row) <= 2 && Math.abs(i % size - col) <= 2 ? [i] : []);
    paintGrid();
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => { highlight = []; paintGrid(); }, 2200);
  }
  paintGrid();
  snapshotDaily(); persist(); updateStats();
};
$("revealButton").onclick = () => {
  if (!active() || !available("reveals")) return;
  const entry = game.puzzle.entries.find((item) => !game.found.includes(item.key));
  if (entry) markFound(entry, entry.cells, true);
};
function finish(won, title, save = true) {
  if (!game || game.ended) return;
  game.stopped = elapsed(); game.ended = true; game.won = won;
  clearInterval(timerHandle);
  anchor = null; pointer = null; preview = [];
  game.discarded = !save;
  if (save) for (const entry of game.puzzle.entries) if (!game.found.includes(entry.key)) addWord(progress.review, entry);
  if (won) {
    progress.completed++;
    if (game.rules.mode === "daily" && !progress.days.includes(game.day)) progress.days.push(game.day);
  }
  snapshotDaily(); persist(); updateStats(); updateLifetime(); paintGrid();
  renderResults(title);
}
function renderResults(title) {
  const missed = game.puzzle.entries.filter((entry) => !game.found.includes(entry.key) || game.revealed.includes(entry.key));
  const fresh = game.puzzle.entries.filter((entry) => game.newWords.includes(entry.key));
  $("results").hidden = false;
  $("results").innerHTML = `<span class="eyebrow">${game.won ? "A little practice, a lasting discovery" : "Every attempt is practice"}</span><h2>${escape(title)}</h2>
    <div class="result-stats"><div><strong>${timeText(elapsed())}</strong><span>Time taken</span></div><div><strong>${game.hints}</strong><span>Hints used</span></div><div><strong>${game.revealed.length}</strong><span>Revealed</span></div><div><strong>${game.attempts ? Math.round(game.correct / game.attempts * 100) + "%" : "—"}</strong><span>Accuracy</span></div></div>
    <p class="small">Accuracy counts correct manual selections / all manual attempts. Reveals do not earn accuracy credit. Duplicate selections are ignored.</p>
    <p><strong>New discoveries:</strong> ${fresh.length ? fresh.map((entry) => escape(entry.answer)).join(" · ") : "No new words this round."}</p>
    <p><strong>${game.discarded ? "Unfinished items discarded" : "Saved for review"}:</strong> ${game.discarded ? "Previously saved history is unchanged." : missed.length ? missed.map((entry) => escape(entry.answer)).join(" · ") : "No missed or revealed words."}</p>
    ${game.rules.mode === "marathon" && game.won && round < game.rules.rounds ? '<button id="nextRound" type="button" class="primary">Next round →</button>' : ""}
    ${game.rules.mode === "marathon" && game.won && round === game.rules.rounds ? "<p>Marathon complete. Well done!</p>" : ""}`;
  if ($("nextRound")) $("nextRound").onclick = () => startGame(true);
  $("results").focus({ preventScroll: true });
}
$("endButton").onclick = async () => {
  if (!active()) return;
  const choice = await confirmAction("End this round?", { review: true });
  if (choice && active()) finish(false, "Round ended", choice === "save");
};
$("newGame").onclick = () => startGame();
$("startButton").onclick = () => startGame();
$("wordList").onclick = (event) => {
  const button = event.target.closest("[data-word]");
  if (button && !button.disabled) inspectWord(game.puzzle.entries[Number(button.dataset.word)]);
};
function inspectWord(entry) {
  detailKey = entry.key;
  const kanji = [...new Set([...entry.word].filter((character) => /\p{Script=Han}/u.test(character)))];
  $("wordDetails").innerHTML = `<div class="detail-word">${japaneseHTML(entry.word, readingOf(entry))}${audioHTML(readingOf(entry))}</div>
    <p lang="ja" class="detail-reading">${escape(readingOf(entry))}</p><p>${escape(entry.meaning)}</p><span class="tag">N${entry.level} · ${escape(entry.partOfSpeech || "Part of speech unavailable")}</span>
    <button id="saveWord" type="button">${progress.review.some((item) => wordKey(item) === entry.key) ? "✓ Saved for review" : "+ Save for review"}</button>
    ${kanji.length ? `<p class="small">Explore a kanji · hover, focus, or tap</p><div class="kanji-buttons">${kanji.map((character) => `<button type="button" lang="ja" data-kanji="${escape(character)}">${escape(character)}</button>`).join("")}</div><div id="kanjiPreview" class="small" aria-live="polite"></div>` : ""}
    <h3>In context</h3><div id="wordExamples"></div>`;
  $("saveWord").onclick = () => { addWord(progress.review, entry); persist(); updateLifetime(); $("saveWord").textContent = "✓ Saved for review"; };
  mountSentenceExamples($("wordExamples"), entry.word);
}
async function fetchKanji(character) {
  if (kanjiCache.has(character)) return kanjiCache.get(character);
  const response = await fetch(`${API_BASE}/api/kanji/${encodeURIComponent(character)}`, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Kanji details are unavailable. Tap the kanji to retry.");
  const result = await response.json();
  const wordsResponse = await fetch(`${API_BASE}/api/kanji/${encodeURIComponent(character)}/words?limit=4`, { signal: AbortSignal.timeout(10000) });
  if (!wordsResponse.ok) throw new Error("Kanji example words are unavailable. Tap the kanji to retry.");
  const words = await wordsResponse.json();
  const value = { ...result, examples: words.items || [] };
  kanjiCache.set(character, value);
  return value;
}
async function showKanji(character, modal) {
  const token = ++detailRequest, key = detailKey;
  if (modal) { $("kanjiContent").textContent = "Looking up this kanji…"; if (!$("kanjiDialog").open) $("kanjiDialog").showModal(); }
  else if ($("kanjiPreview")) $("kanjiPreview").textContent = "Looking up this kanji…";
  try {
    const result = await fetchKanji(character);
    if (token !== detailRequest || key !== detailKey) return;
    const markup = `<strong class="kanji-glyph" lang="ja">${escape(character)}</strong><p>${(result.meanings || []).map(escape).join("; ")}</p>
      <p><strong>On’yomi</strong> ${readingsHTML(result.on_readings || []) || "Not listed"}</p><p><strong>Kun’yomi</strong> ${readingsHTML(result.kun_readings || []) || "Not listed"}</p>
      <h3>Example words</h3>${result.examples.map((item) => { const spelling = item.japanese?.[0] || {}; return `<p>${japaneseHTML(spelling.word || spelling.reading || "", spelling.reading || "")} — ${escape(item.senses?.[0]?.english_definitions?.join("; ") || "")}</p>`; }).join("") || "<p>No example words available.</p>"}`;
    const target = modal ? $("kanjiContent") : $("kanjiPreview");
    if (target) target.innerHTML = markup;
  } catch (error) {
    console.error("Kanji lookup failed.", error);
    if (token === detailRequest) { const target = modal ? $("kanjiContent") : $("kanjiPreview"); if (target) target.textContent = error.message; }
  }
}
$("wordDetails").addEventListener("click", (event) => { const button = event.target.closest("[data-kanji]"); if (button) showKanji(button.dataset.kanji, true); });
$("wordDetails").addEventListener("pointerover", (event) => { const button = event.target.closest("[data-kanji]"); if (button && event.pointerType === "mouse" && !button.contains(event.relatedTarget)) showKanji(button.dataset.kanji, false); });
$("wordDetails").addEventListener("focusin", (event) => { const button = event.target.closest("[data-kanji]"); if (button) showKanji(button.dataset.kanji, false); });

function renderReview() {
  $("reviewList").innerHTML = progress.review.length ? progress.review.map((entry, index) =>
    `<div class="review-entry"><div>${japaneseHTML(entry.word, readingOf(entry))}<span class="word-meaning">${escape(entry.meaning)}</span></div><button type="button" data-remove="${index}" aria-label="Remove ${escape(entry.word)} from review">Remove</button></div>`).join("") : "<p>Your notebook is empty. Saved, missed, and revealed words will appear here.</p>";
}
$("reviewButton").onclick = () => { renderReview(); $("reviewNotice").textContent = ""; $("reviewDialog").showModal(); };
$("reviewList").onclick = (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  progress.review.splice(Number(button.dataset.remove), 1);
  persist(); renderReview(); updateLifetime();
};
$("exportReview").onclick = () => {
  const blob = new Blob([JSON.stringify({ version: 1, tool: "nihon-word-search", words: progress.review }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `nihon-word-search-review-${localDay()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("importReview").onclick = () => $("reviewFile").click();
$("reviewFile").onchange = async () => {
  const file = $("reviewFile").files[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Review files must be smaller than 5 MB.");
    const words = reviewImport(JSON.parse(await file.text()));
    const merged = new Map([...progress.review, ...words].map((item) => [wordKey(item), item]));
    if (merged.size > 5000) throw new Error("The combined notebook would exceed 5,000 words.");
    progress.review = [...merged.values()];
    persist(); renderReview(); updateLifetime();
    $("reviewNotice").textContent = `Imported ${words.length} words; duplicate words were merged.`;
  } catch (error) { $("reviewNotice").textContent = `Import failed: ${error.message}`; }
  finally { $("reviewFile").value = ""; }
};
$("resetProgress").onclick = async () => {
  if (game && !game.ended) { $("reviewNotice").textContent = "End the current round before resetting progress."; return; }
  if (!await confirmAction("Delete all Word Search discoveries, review words, and daily streaks on this browser?", { confirmLabel: "Delete progress" })) return;
  progress = emptyProgress(); game = null;
  persist(); updateLifetime(); renderReview();
  $("results").hidden = true; $("grid").innerHTML = ""; $("emptyBoard").hidden = false; $("wordList").innerHTML = "";
  $("wordDetails").textContent = "Find a word to start a new notebook.";
  $("progress").value = 0; $("progressText").textContent = "Create a puzzle to begin";
  $("wordCount").textContent = "0 words"; $("timer").textContent = "—";
  $("reviewNotice").textContent = "Progress reset.";
};
window.addEventListener("pagehide", () => { snapshotDaily(); persist(); clearInterval(timerHandle); });
document.addEventListener("visibilitychange", () => { if (game && !game.ended) { tick(); snapshotDaily(); persist(); } });
updateLifetime();
if (restoreError) inform(restoreError, true);
else if (migratedDirections) persist();
