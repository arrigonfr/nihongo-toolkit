import "./memory.css";
import { confirmAction } from "./confirm-dialog.js";
import { setSettingAvailability } from "./settings-panel.js";
import { fetchItems } from "./api.js";
import { mountChips } from "./chips.js";
import { rememberControls } from "./settings-storage.js";
import { JAPANESE_FONTS, applyJapaneseFont } from "./japanese-fonts.js";
import { mountStudyControls, japaneseHTML, audioHTML, speakJapanese, study } from "./study-controls.js";
import { escape, mountSentenceExamples } from "./examples.js";
import {
  WORD_PAIRS, KANA_PAIRS, MODES, BACKS, GROUPS, DISPLAYS, GRIDS, SHUFFLE_MODES, DEFAULTS, CATEGORIES,
  validateSettings, effectiveSettings, generateDeck, createRound, flipCard, settleMismatch,
  checkEnd, finishRound, elapsed, accuracy, assist, canAssist, itemKey, katakanaOf, romajiOf,
  localDay, dailyStreak, reviewImport, restoreDaily
} from "./memory-engine.js";

const $ = (id) => document.getElementById(id);
const storageKey = "nihon:memory-v1";
const freshProgress = () => ({ review: [], recent: [], days: [], completed: 0, daily: null });
let settings = { ...DEFAULTS, groups: [...DEFAULTS.groups] }, progress = freshProgress(), restoreError = "";
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "null");
  if (saved) {
    settings = validateSettings({ ...DEFAULTS, ...saved.settings });
    const review = reviewImport({ tool: "nihon-memory", version: 1, items: saved.progress?.review });
    if (!["recent", "days"].every((key) => Array.isArray(saved.progress[key]) && saved.progress[key].length <= 5000
      && saved.progress[key].every((v) => typeof v === "string" && v.length <= 2000))
      || !Number.isInteger(saved.progress.completed) || saved.progress.completed < 0) throw new Error("Invalid saved progress.");
    restoreDaily(saved.progress.daily, localDay());
    progress = { ...freshProgress(), ...saved.progress, review };
  }
} catch (error) {
  console.error("Could not restore Memory data.", error);
  settings = { ...DEFAULTS, groups: [...DEFAULTS.groups] };
  progress = freshProgress();
  restoreError = "Saved Memory data could not be restored. Check settings before starting; the original storage has not been overwritten.";
}
let game = null, busy = false, round = 1, baseSettings = settings, gameDay = "", finalized = false;
let hint = null, focusedId = null, detailItem = null, interval;
const pools = new Map();
const options = (values) => Object.entries(values).map(([value, label]) => `<option value="${escape(value)}">${escape(label)}</option>`).join("");
// help === null leaves the control without a tooltip.
const select = (key, label, values, help = "") => `<label class="setting"${help === null ? "" : ` data-setting-description="${escape(help || `Choose ${label.toLowerCase()} for the next round.`)}"`}><span>${label}</span><select id="setting-${key}" data-setting="${key}">${options(values)}</select></label>`;
const number = (key, label, min, max) => `<label class="setting"><span>${label}</span><input type="number" id="setting-${key}" data-setting="${key}" min="${min}" max="${max}" step="1" required></label>`;
const check = (key, label) => `<label class="setting check"><input type="checkbox" id="setting-${key}" data-setting="${key}"><span>${label}</span></label>`;
// Tooltip-free controls: the visible name is not a <label>, so no help trigger is attached.
const plainName = (key, label) => `<span class="setting-name" id="name-${key}">${label}</span>`;
const plainSelect = (key, label, values) => `<div class="setting">${plainName(key, label)}<select id="setting-${key}" data-setting="${key}" aria-labelledby="name-${key}">${options(values)}</select></div>`;
const plainNumber = (key, label, min, max) => `<div class="setting">${plainName(key, label)}<input type="number" id="setting-${key}" data-setting="${key}" min="${min}" max="${max}" step="1" required aria-labelledby="name-${key}"></div>`;
const plainCheck = (key, label) => `<div class="setting check"><input type="checkbox" id="setting-${key}" data-setting="${key}" aria-labelledby="name-${key}">${plainName(key, label)}</div>`;
const levels = { 5: "N5 · Beginner", 4: "N4", 3: "N3", 2: "N2", 1: "N1 · Advanced", all: "All · N5–N1" };
for (let from = 5; from >= 2; from--) for (let to = from - 1; to >= 1; to--) levels[`${from}-${to}`] = `N${from}–N${to}`;
const availability = { limited: "Limited", unlimited: "Unlimited", disabled: "Disabled" };

$("memoryRoot").innerHTML = `<div class="shell">
  <header><div class="brand"><span class="brand-mark" lang="ja">合</span><span class="brand-name">Eawase<span class="brand-note">at NihongoToolkit</span></span></div><button id="themeButton" type="button" aria-label="Toggle theme">◐</button></header>
  <section class="intro"><span class="eyebrow">絵合わせ · Japanese Memory</span><h1>A little memory.<br><span>A lasting connection.</span></h1><p>Turn a card. Recognize a sound. Bring two pieces of Japanese together, one pair at a time.</p></section>
  <details id="settingsPanel" class="panel puzzle-settings" open><summary>Puzzle settings</summary><div class="settings-body">
    <p class="small">Valid settings save automatically and apply to your next puzzle. The top reading, audio and appearance controls stay live. Script conversions are recognition exercises, not alternative standard spellings.</p>
    <form id="settingsForm"></form>
  </div></details>
  <div class="toolbar"><div class="content-choice" role="group" aria-label="Content for next puzzle"><button id="chooseWords" type="button">言 Words</button><button id="chooseKana" type="button">あ Syllabaries</button></div>
    <div class="actions"><button id="reviewButton" type="button">Notebook <span id="reviewCount">0</span></button><button id="newGame" class="primary" type="button">New puzzle ↗</button></div></div>
  <p id="toolbarError" class="start-error" role="alert"></p>
  <div id="notice" role="status" aria-live="polite"></div>
  <div class="layout"><main>
    <section class="panel board-panel" aria-label="Memory game">
      <div class="board-heading"><div><span class="eyebrow" id="modeBadge">Classic Memory</span><h2 id="boardTitle">Find your next connection</h2></div><div class="clock"><span id="timerLabel">Time</span><strong id="timer">—</strong></div></div>
      <div class="progress-row"><span id="progressText">Choose words or syllabaries to begin</span><span id="turnText">Solo practice</span></div>
      <progress id="progress" max="6" value="0" aria-label="Pairs found"></progress>
      <div class="board-scroll"><div id="board" role="group" aria-label="Memory cards" aria-describedby="keyboardHelp"></div><div id="emptyBoard"><span aria-hidden="true">あ <span>↔</span> ア</span><h3>Two cards. One connection.</h3><p>Start with six pairs, or make the game your own.</p><button id="startButton" class="primary" type="button">Start matching →</button><p id="startError" class="start-error"></p></div></div>
      <p id="feedback" role="status" aria-live="polite">Choose your content above. Settings let you pick scripts, levels, and challenges.</p>
      <div class="board-actions"><select id="hintType" aria-label="Hint type"><option value="pair">Highlight a pair</option><option value="meaning">Meaning / category</option><option value="reading">Reading / romaji</option></select><button id="hintButton" type="button" disabled>✧ Hint</button><button id="revealButton" type="button" disabled>Reveal pair</button><button id="restartButton" type="button" disabled>Restart</button><button id="endButton" type="button" disabled>End round</button></div>
      <p class="small" id="keyboardHelp">Arrow keys to move · Enter / Space to flip. Match to keep your turn; a mismatch passes it to the other player.</p>
    </section>
    <section id="results" class="panel results" tabindex="-1" hidden></section>
  </main><aside class="sidebar">
    <section class="panel"><div class="panel-heading"><h2>This round</h2><span class="tag" id="roundLabel">Ready</span></div><div id="stats" class="stats"></div><p id="challengeInfo" class="small">No rush. Every connection counts.</p><p id="streak" class="small"></p></section>
    <section class="panel notebook"><div class="panel-heading"><h2>A closer look</h2><span aria-hidden="true">✎</span></div><div id="details"><p class="empty-detail" lang="ja">少しずつ。</p><p class="small">Matched pairs open their reading, meaning, and examples here.</p></div></section>
    <section class="panel"><h2>Your connections</h2><div id="matches" class="matches"><p class="small">Your matched pairs will collect here.</p></div></section>
    <p class="small credits">JLPT levels are study estimates; categories use approximate dictionary filters. Kana represent sounds, not English meanings.<br><a href="./data-sources.html" target="_blank" rel="noopener">Dictionary & sentence credits ↗</a></p>
  </aside></div>
  <footer><span>A little practice goes a long way.</span><span lang="ja">ひとつずつ、つながる。</span></footer>
  <dialog id="reviewDialog" aria-labelledby="reviewTitle"><div class="dialog-head"><h2 id="reviewTitle">Your review notebook</h2><button type="button" data-close aria-label="Close notebook">×</button></div><div class="dialog-body"><p class="small">Missed, assisted, unfinished, and saved items. Mistake Review uses this list, keeping your chosen filters. Imported vocabulary is personal study data, not dictionary verification.</p><div class="actions"><button id="exportReview" type="button">Export JSON</button><button id="importReview" type="button">Import JSON</button><button id="resetProgress" type="button">Reset progress</button></div><input id="reviewFile" type="file" accept=".json,application/json" hidden><p id="reviewNotice" role="status"></p><div id="reviewList"></div></div></dialog>
</div>`;

$("settingsForm").innerHTML = `
    <fieldset><legend>What would you like to practice?</legend><div class="settings-grid">
    ${select("content", "Content type", { words: "Japanese words", kana: "Japanese syllabaries" }, "Play with words or with japanese syllables")}
    ${select("pairing", "Matching mode", WORD_PAIRS, "How do you want to match your cards")}
    </div></fieldset><fieldset><legend>Game mode & card clues</legend><div class="settings-grid">
    ${select("mode", "Game mode", MODES, null)}
    ${select("display", "Card content", DISPLAYS, "English, audio and picture clues replace one side and use the natural written form on the other. Pictures use a small exact-word set. Other displays follow the shared reading toggles.")}
    </div></fieldset><fieldset><legend>Vocabulary & kana groups</legend><div class="settings-grid">
    <div data-words>${select("level", "JLPT study levels", levels, null)}</div>
    <div data-words>${plainSelect("category", "Vocabulary category", CATEGORIES)}</div>
    </div><div id="kanaGroups" hidden><label class="setting" data-setting-description="Choose one or more kana groups to practise. All kana includes every group."><span>Kana groups</span><select id="setting-groups">${options({ ...GROUPS })}</select></label></div></fieldset>
    <fieldset><legend>Board & players</legend><div class="settings-grid">
    ${select("grid", "Grid size", GRIDS, null)}${number("count", "Custom number of pairs", 1, 48)}
    ${select("back", "Card-back design", Object.fromEntries(Object.entries(BACKS).map(([key, back]) => [key, back.label])))}
    </div>
    <div class="settings-grid board-extras">
    ${select("players", "Players", { 1: "Solo", 2: "Two local players" })}
    ${select("shuffle", "Shuffle remaining cards", SHUFFLE_MODES, "Choose when to shuffle unmatched cards: never, after a match, after a mismatch, or after both (All). Matched cards stay in place.")}
    ${plainCheck("disappear", "Hide matched cards")}
    </div></fieldset>
    <fieldset><legend>Challenge</legend><div class="challenge-settings">
    <div class="challenge-setting-group"><h3>Time limit</h3>
    ${plainSelect("timer", "Timer display", { up: "Count up", down: "Count down (enforces time limit)", off: "Hidden (still tracked)" })}
    ${plainCheck("timeLimit", "Enable time limit")}${plainNumber("seconds", "Time limit (seconds)", 10, 3600)}
    </div><div class="challenge-setting-group"><h3>Flip limit</h3>
    ${plainCheck("moveLimit", "Enable flip limit")}${plainNumber("flips", "Maximum card flips", 2, 1000)}
    </div>
    </div></fieldset><fieldset><legend>Special mode limits</legend><div class="settings-grid">
    ${number("mistakes", "Sudden Death mismatches", 1, 100)}${number("rounds", "Marathon boards", 2, 10)}
    </div><ul class="mode-notes">
    <li><strong>Timed</strong> always counts down.</li>
    <li><strong>Move Challenge</strong> limits card flips (two flips normally make one move).</li>
    <li><strong>Marathon</strong> adds two pairs per board, up to 48.</li>
    <li><strong>Daily</strong> uses the same eight basic kana pairs for everyone that day: solo, three hints, and no reveals, shuffle, correction, or limits. It resumes instead of restarting.</li>
    </ul></fieldset>
    <fieldset><legend>Learning support</legend><div class="challenge-settings">
    <fieldset class="challenge-setting-group"><legend>Hints</legend>
    ${plainSelect("hints", "Hints", availability)}${plainNumber("hintLimit", "Hint limit", 0, 100)}
    </fieldset><fieldset class="challenge-setting-group"><legend>Reveal Pair</legend>
    ${plainSelect("reveals", "Reveal Pair", availability)}${plainNumber("revealLimit", "Reveal limit", 0, 48)}
    </fieldset>
    </div></fieldset><fieldset><legend>Feedback & word details</legend><div class="settings-grid">
    ${plainCheck("learning", "Explain mismatches")}${plainCheck("correction", "Briefly show correct partners after mismatches")}
    ${plainCheck("details", "Open word details after a match")}${plainCheck("meanings", "English meanings in word details")}
    ${plainCheck("examples", "Example sentences in word details")}
    </div><p class="small">Hints and reveals do not earn accuracy or player points. Missed, assisted, and unfinished pairs are saved to your notebook. Furigana and romaji hints can also be enabled using the shared top controls.</p></fieldset>
    <fieldset><legend>Display & accessibility</legend><div class="settings-grid">
    ${select("font", "Japanese font", JAPANESE_FONTS, null)}
    ${plainNumber("fontSize", "Japanese font size (px)", 22, 48)}${plainCheck("contrast", "High contrast")}
    </div></fieldset><p id="settingsError" role="alert"></p>`;

const MODE_HELP = {
  classic: "Find every pair at your own pace.", timed: "Match every pair before the countdown ends.", moves: "Finish within a limited number of card flips.",
  sudden: "A set number of mismatches ends the round.", daily: "One shared kana puzzle each day with fixed rules.", review: "Replay items saved in your notebook.",
  listening: "Match audio clues to their written forms (needs Audio On).", meaning: "Match Japanese with English meanings or sound descriptions.",
  reverse: "Recall the Japanese from a prompt card first.", marathon: "Clear several boards in a row; each adds two pairs."
};
const chipOptions = (values, help = {}) => Object.entries(values).map(([value, label]) => ({ value, label, ...(help[value] ? { description: help[value] } : {}) }));
const groupHelp = {
  hiragana: "Basic hiragana. Also sets the preferred script for Any kana.", katakana: "Basic katakana. Also sets the preferred script for Any kana.",
  voiced: "Add kana with dakuten, such as が / ガ (ga) and ば / バ (ba), and handakuten, such as ぱ / パ (pa).",
  yoon: "Combine an i-row kana with small ゃ, ゅ or ょ: きゃ / キャ (kya), しゅ / シュ (shu), and ちょ / チョ (cho).",
  small: "Small kana such as ぁ / ァ and っ / ッ.",
  special: "Practice long vowels such as かあ / カー (kaa), doubled consonants such as きって / キッテ (kitte), and syllabic n in しんよう / シンヨウ (shin'you).",
  all: "Include every kana group."
};
const chipApis = [];
const mount = (id, config) => chipApis.push(mountChips($(id), { fieldClass: "memory-chips wide", ...config }));
mount("setting-content", { options: chipOptions({ words: "Japanese words", kana: "Japanese syllabaries" }) });
mount("setting-pairing", { options: chipOptions(WORD_PAIRS) });
mount("setting-mode", { options: chipOptions(MODES, MODE_HELP) });
mount("setting-display", { options: chipOptions(DISPLAYS) });
mount("setting-grid", { options: chipOptions(GRIDS) });
mount("setting-back", { variant: "card", groupClass: "back-chips", options: Object.entries(BACKS).map(([value, back]) => ({ value, label: back.label, preview: `<span class="back-preview" data-back="${value}"><span>${back.symbol}</span></span>` })) });
mount("setting-groups", { multiple: true, exclusive: "all", exclusiveLabel: GROUPS.all, options: Object.entries(GROUPS).map(([value, label]) => ({ value, label, description: groupHelp[value] })), descriptions: undefined });
const groupsOf = (value) => value === "all" ? ["all"] : value.split(",").filter(Boolean);
const syncChips = () => chipApis.forEach((api) => api.sync());

function showStartError(text) {
  $("toolbarError").textContent = $("startError").textContent = text;
}
function notify(text, error = false) { $("notice").textContent = text; $("notice").dataset.error = String(error); }
function persist() {
  if (game?.rules.mode === "daily") progress.daily = { day: gameDay, game };
  try { localStorage.setItem(storageKey, JSON.stringify({ settings, progress })); return true; }
  catch (error) { console.error("Could not save Memory data.", error); notify("Settings and progress could not be saved. Export your notebook before leaving.", true); return false; }
}
function saveReview(item) {
  if (!progress.review.some((saved) => itemKey(saved) === itemKey(item))) progress.review.push(item);
  progress.review = progress.review.slice(-5000);
}
function itemFor(key) { return game.deck.pairs.find((pair) => pair.key === key).item; }
function updateLifetime() {
  $("reviewCount").textContent = progress.review.length;
  const streak = dailyStreak(progress.days);
  $("streak").textContent = `${progress.completed} boards completed · ${streak} day daily streak`;
}
function syncContent(content, pairing = $("setting-pairing").value) {
  const allowed = content === "words" ? WORD_PAIRS : KANA_PAIRS;
  $("setting-pairing").innerHTML = options(allowed);
  $("setting-pairing").value = pairing in allowed ? pairing : content === "words" ? "kh" : "ht";
  for (const chip of $("setting-pairing").chipsApi.group.querySelectorAll(".chip-option")) chip.hidden = !(chip.dataset.value in allowed);
  document.querySelectorAll("[data-words]").forEach((node) => { node.hidden = content !== "words"; });
  $("kanaGroups").hidden = content !== "kana";
  const picture = $("setting-display").querySelector('[value="picture"]');
  picture.disabled = content === "kana";
  if (content === "kana" && $("setting-display").value === "picture") $("setting-display").value = "text";
}
function syncSettings() {
  syncContent(settings.content, settings.pairing);
  for (const input of document.querySelectorAll("[data-setting]")) {
    const value = settings[input.dataset.setting];
    if (input.type === "checkbox") input.checked = value;
    else input.value = value;
  }
  $("setting-groups").value = settings.groups.includes("all") ? "all" : Object.keys(GROUPS).filter((key) => settings.groups.includes(key)).join(",");
  syncChips();
  $("setting-count").closest("label").hidden = settings.grid !== "custom";
  $("chooseWords").setAttribute("aria-pressed", String(settings.content === "words"));
  $("chooseKana").setAttribute("aria-pressed", String(settings.content === "kana"));
  syncAvailability();
}
function syncAvailability() {
  const value = (key) => $("setting-" + key).value;
  const checked = (key) => $("setting-" + key).checked;
  const mode = value("mode"), daily = mode === "daily";
  const display = mode === "listening" ? "audio" : mode === "meaning" ? "english" : value("display");
  const fixed = ["content", "pairing", "display", "grid", "count", "players", "timer", "timeLimit", "moveLimit", "hints", "hintLimit", "reveals", "shuffle", "correction"];
  const reasons = {
    level: value("content") !== "words" || daily ? "Used with word content." : "",
    category: value("content") !== "words" || daily ? "Used with word content." : "",
    pairing: mode === "reverse" || ["audio", "english", "picture"].includes(display) ? "The selected mode or card clues determine the pairing." : "",
    display: ["listening", "meaning"].includes(mode) ? "Set by the selected game mode." : "",
    count: value("grid") !== "custom" ? "Choose a custom grid to set the pair count." : "",
    timer: mode === "timed" ? "Timed mode always counts down." : "",
    timeLimit: mode === "timed" || value("timer") === "down" ? "Countdown always enforces the time limit." : "",
    seconds: daily || !(mode === "timed" || checked("timeLimit") || value("timer") === "down") ? "Enable a time limit or countdown." : "",
    moveLimit: mode === "moves" ? "Move Challenge always limits flips." : "",
    flips: daily || !(mode === "moves" || checked("moveLimit")) ? "Enable a flip limit." : "",
    mistakes: mode !== "sudden" ? "Used in Sudden Death." : "",
    rounds: mode !== "marathon" ? "Used in Marathon." : "",
    examples: daily || value("content") !== "words" ? "Sentence examples are available for words, not individual kana." : "",
    hintLimit: value("hints") !== "limited" ? "Choose limited hints." : "",
    revealLimit: daily || value("reveals") !== "limited" ? "Choose limited reveals." : ""
  };
  for (const input of document.querySelectorAll("[data-setting]")) {
    const key = input.dataset.setting;
    setSettingAvailability(input, daily && fixed.includes(key) ? "Daily uses fixed rules; your preference is kept for other modes." : reasons[key]);
  }
  setSettingAvailability($("setting-groups"), daily ? "Daily uses fixed kana groups." : value("content") !== "kana" ? "Used with syllabary content." : "");
  $("chooseWords").disabled = $("chooseKana").disabled = daily;
}
function displaySettings() {
  const display = game?.rules || settings;
  applyJapaneseFont(display.font, game?.started ?? "settings");
  document.documentElement.style.setProperty("--memory-font", `${display.fontSize}px`);
  document.documentElement.dataset.contrast = String(display.contrast);
}
const controls = mountStudyControls({ onChange: () => {
  renderBoard();
  if (game?.rules.display === "audio" && !study.audio && !game.ended) notify("Listening cards need Audio On. Enable the shared Audio control to hear them.", true);
} });
// Chip titles are labels, which the shared help layer turns into tooltips: swap them for plain text.
for (const id of ["setting-mode", "setting-grid", "setting-level", "setting-font"]) {
  const title = $(id).closest(".chips-field")?.querySelector(".chips-title");
  if (!title) continue;
  const plain = document.createElement("span");
  plain.className = title.className.replace("study-setting-name", "").trim();
  plain.textContent = title.textContent;
  title.replaceWith(plain);
}
syncSettings(); displaySettings(); updateLifetime();
rememberControls("nihon:memory-controls-v1", ["hintType"], (message) => notify(message, true));
$("setting-content").onchange = () => syncContent($("setting-content").value);
$("setting-grid").onchange = () => { $("setting-count").closest("label").hidden = $("setting-grid").value !== "custom"; };
$("settingsForm").onclick = (event) => {
  const name = event.target.closest?.(".setting.check > .setting-name");
  if (name) name.previousElementSibling.click();
};
$("settingsForm").onchange = () => { saveSettings(); showStartError(""); };
$("settingsForm").oninput = (event) => {
  if (event.target.type === "number" && $("settingsForm").checkValidity()) saveSettings();
};
function saveSettings() {
  syncAvailability();
  if (!$("settingsForm").checkValidity()) {
    $("settingsError").textContent = "Enter valid values before these settings can be saved.";
    return;
  }
  $("settingsError").textContent = "";
  const next = { ...settings };
  const contentChanged = $("setting-content").value !== settings.content;
  for (const input of document.querySelectorAll("[data-setting]")) {
    const key = input.dataset.setting;
    // Content changes normalize incompatible pairings and picture clues, even in modes that override them.
    if (input.disabled && !(contentChanged && ["pairing", "display"].includes(key))) continue;
    next[key] = typeof DEFAULTS[key] === "boolean" ? input.checked : typeof DEFAULTS[key] === "number" ? Number(input.value) : input.value;
  }
  next.groups = groupsOf($("setting-groups").value);
  try {
    settings = validateSettings(next);
    syncSettings(); displaySettings();
    persist();
  } catch (error) { $("settingsError").textContent = error.message; }
}
$("settingsForm").onsubmit = (event) => {
  event.preventDefault();
  saveSettings();
};
for (const [id, content] of [["chooseWords", "words"], ["chooseKana", "kana"]]) $(id).onclick = () => {
  settings.content = content;
  if (content === "kana" && !(settings.pairing in KANA_PAIRS)) settings.pairing = "ht";
  if (content === "kana" && settings.display === "picture") settings.display = "text";
  syncSettings(); persist();
  notify(`${content === "words" ? "Words" : "Syllabaries"} selected for the next puzzle. Open Puzzle settings to choose your matching mode.`);
};
document.querySelectorAll("[data-close]").forEach((button) => { button.onclick = () => button.closest("dialog").close(); });

async function startGame(nextRound = false) {
  if (busy) return;
  if (game?.rules.mode === "daily" && settings.mode === "daily" && gameDay === localDay()) {
    notify("Today's puzzle is already open. Daily progress is kept until the next day.");
    return;
  }
  const choice = game && !game.ended ? await confirmAction("Leave this round?", { review: true }) : "save";
  if (!choice) return;
  busy = true;
  $("newGame").disabled = true; $("startButton").disabled = true;
  if ($("nextRound")) $("nextRound").disabled = true;
  showStartError("");
  notify("Preparing your pairs…");
  try {
    const next = nextRound ? round + 1 : 1;
    const base = nextRound ? baseSettings : { ...settings, groups: [...settings.groups] };
    const rules = effectiveSettings(base, next);
    const day = localDay();
    if (rules.display === "audio" && (!study.audio || !window.speechSynthesis)) throw new Error("Listening requires Audio On and a browser with Japanese speech playback.");
    const saved = rules.mode === "daily" ? restoreDaily(progress.daily, day) : null;
    let deck;
    if (!saved) {
      let pool = [];
      if (rules.mode === "review") {
        pool = progress.review;
        if (!pool.length) throw new Error("Your review notebook is empty. Play a round or import a Memory review list first.");
      } else if (rules.content === "words") {
        if (!pools.has(rules.level)) pools.set(rules.level, await fetchItems("/api/word-search/vocabulary", { level: rules.level }));
        pool = pools.get(rules.level);
      }
      deck = generateDeck(pool, rules, { seed: rules.mode === "daily" ? `memory-v1:${day}` : `${Date.now()}:${Math.random()}`,
        recent: rules.mode === "daily" ? [] : progress.recent });
    }
    if (game && !game.ended) { finishRound(game, "Round ended"); finalize(choice === "save"); }
    game = saved || createRound(deck, rules);
    displaySettings();
    if (game.rules.display === "furigana") controls.setPreferences({ furigana: true });
    if (game.rules.display === "romaji") controls.setPreferences({ romaji: true });
    baseSettings = base; round = next; gameDay = day; finalized = Boolean(saved?.ended);
    hint = null; detailItem = null; focusedId = null;
    progress.recent = [...progress.recent, ...game.deck.pairs.map((pair) => pair.key)].slice(-160);
    $("details").innerHTML = `<p class="empty-detail" lang="ja">つながる。</p><p class="small">Match a pair to explore it here.</p>`;
    $("results").hidden = true;
    $("emptyBoard").hidden = true;
    $("board").dataset.back = game.rules.back;
    $("feedback").textContent = game.rules.mode === "reverse" ? "Turn a Recall card first, then find its Japanese match." : "Turn two cards to find a connection.";
    clearInterval(interval);
    if (!game.ended) interval = setInterval(tick, 150);
    settleMismatch(game); checkEnd(game); finalize();
    renderBoard(); renderMatches(); updateStats(); updateLifetime(); persist();
    $("settingsPanel").open = false;
    if (game.ended) renderResults();
    notify(saved ? "Today's puzzle restored." : `${game.deck.pairs.length} pairs, ready when you are.`);
  } catch (error) {
    console.error("Could not start Memory round.", error); notify("", false); showStartError(error.message);
  } finally {
    busy = false; $("newGame").disabled = false; $("startButton").disabled = false;
    if ($("nextRound")) $("nextRound").disabled = false;
    updateStats();
  }
}
async function restart() {
  if (!game || busy || game.rules.mode === "daily") return;
  const choice = await confirmAction("Restart these same pairs and reset this round's statistics?", { review: true });
  if (!choice) return;
  const old = game;
  if (!game.ended) { finishRound(game, "Restarted"); finalize(choice === "save"); }
  game = createRound(old.deck, old.rules);
  finalized = false; hint = null; focusedId = null; detailItem = null;
  $("results").hidden = true;
  $("details").innerHTML = `<p class="small">Match a pair to explore its details.</p>`;
  $("feedback").textContent = "A fresh attempt with the same pairs.";
  clearInterval(interval); interval = setInterval(tick, 150);
  renderBoard(); renderMatches(); updateStats(); persist();
}
$("newGame").onclick = () => startGame();
$("startButton").onclick = () => startGame();
$("restartButton").onclick = restart;
$("endButton").onclick = async () => {
  if (!game || game.ended || busy) return;
  const choice = await confirmAction("End this round?", { review: true });
  if (!choice || game.ended) return;
  finishRound(game, "Round ended"); finalize(choice === "save"); renderBoard(); updateStats(); persist();
};

function cardFace(card) {
  const item = itemFor(card.key);
  if (card.type === "audio") return `<span class="audio-face" aria-hidden="true">♫</span><span class="card-caption">Listen · tap to replay</span>`;
  if (card.type === "picture") return `<span class="picture-face" role="img" aria-label="${escape(item.meaning)}">${escape(card.text)}</span>`;
  if (card.type === "english" || card.type === "romaji") return `<span class="${card.type}-face">${escape(card.text)}</span><span class="card-caption">${card.type === "english" ? item.kind === "kana" ? "Sound clue" : "Meaning" : "Romaji"}</span>`;
  return `${japaneseHTML(card.text, item.reading)}<span class="card-caption">${card.type}</span>${game.rules.display === "meaning" ? `<span class="card-meaning">${escape(item.meaning)}</span>` : ""}`;
}
function renderBoard() {
  if (!game) return;
  const active = document.activeElement?.closest("[data-card]");
  if (active) focusedId = Number(active.dataset.card);
  const cards = game.deck.cards;
  const columns = game.rules.grid === "custom" ? (cards.length <= 16 ? 4 : cards.length <= 30 ? 5 : 6) : Number(game.rules.grid.split("x")[0]);
  $("board").style.setProperty("--columns", columns);
  $("board").dataset.columns = columns;
  const correction = game.rules.correction && game.resolvingAt !== null
    ? game.open.map((id) => cards.find((card) => card.id === id).key) : [];
  const remaining = cards.filter((card) => !game.matched.includes(card.key));
  if (!cards.some((card) => card.id === focusedId && !(game.rules.disappear && game.matched.includes(card.key)))) focusedId = (remaining[0] || cards[0]).id;
  $("board").innerHTML = cards.map((card, index) => {
    const matched = game.matched.includes(card.key), opened = game.open.includes(card.id);
    const hinted = hint?.key === card.key && hint.until > Date.now();
    const faceUp = matched || opened || correction.includes(card.key) || hinted && hint.type === "pair";
    const removed = matched && game.rules.disappear;
    const label = `Card ${index + 1}: ${faceUp ? card.type === "audio" ? "Audio. Tap to replay" : card.text : "face down"}${matched ? ", matched" : ""}`;
    return `<button type="button" data-card="${card.id}" class="memory-card ${faceUp ? "face-up" : "face-down"} ${matched ? "matched" : ""} ${opened ? "selected" : ""} ${game.resolvingAt !== null && opened ? "mismatch" : ""} ${hinted ? "hinted" : ""} ${removed ? "removed" : ""}"
      tabindex="${card.id === focusedId && !removed ? 0 : -1}" aria-label="${escape(label)}" aria-pressed="${faceUp}" ${removed ? 'disabled aria-hidden="true"' : ""}>
      ${faceUp ? cardFace(card) : `<span class="back-symbol" aria-hidden="true">${(BACKS[game.rules.back] || BACKS.seigaiha).symbol}</span><span class="card-caption">${game.rules.mode === "reverse" ? card.side === 0 ? "Recall" : "Japanese" : "NIHON"}</span>`}
      ${matched ? `<span class="match-mark" aria-hidden="true">${game.revealed.includes(card.key) ? "↗" : "✓"}</span>` : ""}
    </button>`;
  }).join("");
  if (active) {
    const target = $("board").querySelector(`[data-card="${focusedId}"]:not(:disabled)`);
    if (target) target.focus({ preventScroll: true });
    else $("endButton").focus({ preventScroll: true });
  }
}
$("board").onclick = (event) => {
  const button = event.target.closest("[data-card]");
  if (!button || !game || busy) return;
  const id = Number(button.dataset.card), card = game.deck.cards.find((card) => card.id === id);
  if (card.type === "audio" && button.classList.contains("face-up")) {
    speakJapanese(card.text);
    if (game.matched.includes(card.key)) showDetails(itemFor(card.key));
    return;
  }
  if (hint?.until > Date.now()) return;
  if (game.matched.includes(card.key)) { showDetails(itemFor(card.key)); return; }
  const result = flipCard(game, id);
  focusedId = id;
  if (card.type === "audio" && ["first", "match", "mismatch"].includes(result.type)) speakJapanese(card.text);
  if (result.type === "order") $("feedback").textContent = "Start with a Recall card, then choose its Japanese match.";
  if (result.type === "first") {
    $("feedback").textContent = "Now find its partner.";
  }
  if (result.type === "match") {
    const item = itemFor(card.key);
    $("feedback").textContent = `A connection made! ${item.word} · ${romajiOf(item)}`;
    if (game.rules.details) showDetails(item);
    if (card.type !== "audio") speakJapanese(item.reading);
    renderMatches();
  }
  if (result.type === "mismatch") {
    const items = result.cards.map((card) => itemFor(card.key));
    items.forEach(saveReview);
    if (game.rules.correction) result.cards.forEach((card) => { if (!game.assisted.includes(card.key)) game.assisted.push(card.key); });
    $("feedback").textContent = game.rules.learning
      ? `Different items: ${items.map((item) => `${item.word} (${romajiOf(item)})${game.rules.meanings ? ` — ${item.meaning}` : ""}`).join("; ")}. Try again.`
      : "Not a pair this time. Try again.";
  }
  finalize(); renderBoard(); updateStats(); updateLifetime(); persist();
};
$("board").onkeydown = (event) => {
  const button = event.target.closest("[data-card]");
  if (!button || !["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const buttons = [...$("board").querySelectorAll("[data-card]")], index = buttons.indexOf(button);
  const cols = getComputedStyle($("board")).gridTemplateColumns.split(" ").length;
  let target = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
    : index + ({ ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols })[event.key];
  const step = target >= index ? 1 : -1;
  while (target >= 0 && target < buttons.length && buttons[target].disabled) target += step;
  if (target < 0 || target >= buttons.length) return;
  buttons.forEach((node) => { node.tabIndex = -1; });
  buttons[target].tabIndex = 0; buttons[target].focus(); focusedId = Number(buttons[target].dataset.card);
};
function timeText(seconds) {
  const whole = Math.max(0, Math.floor(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
function updateStats() {
  const metrics = game ? [[game.moves, "Moves"], [game.flips, "Flips"], [game.matched.length, "Matches"],
    [game.mismatches, "Mismatches"], [`${accuracy(game)}%`, "Accuracy"], [game.hints, "Hints"], [game.revealed.length, "Reveals"]]
    : [[0, "Moves"], [0, "Flips"], [0, "Matches"], [0, "Mismatches"], ["—", "Accuracy"], [0, "Hints"], [0, "Reveals"]];
  $("stats").innerHTML = metrics.map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
  if (!game) return;
  const rules = game.rules;
  $("modeBadge").textContent = MODES[rules.mode];
  $("roundLabel").textContent = rules.mode === "marathon" ? `Board ${round} / ${rules.rounds}` : rules.content === "kana" ? "Syllabaries" : "Words";
  $("boardTitle").textContent = `${rules.content === "kana" ? "Kana" : `JLPT ${rules.level === "all" ? "N5–N1" : rules.level.split("-").map((n) => `N${n}`).join("–")}`} · ${["audio", "english", "picture"].includes(rules.display) ? DISPLAYS[rules.display] : WORD_PAIRS[rules.pairing]}`;
  $("progressText").textContent = `${game.matched.length} of ${game.deck.pairs.length} pairs found`;
  $("progress").max = game.deck.pairs.length; $("progress").value = game.matched.length;
  $("turnText").textContent = rules.players === 2 ? `Player ${game.player + 1}'s turn · P1 ${game.scores[0]} : ${game.scores[1]} P2` : "Solo practice";
  $("timerLabel").textContent = rules.timer === "down" ? "Remaining" : "Time";
  $("timer").textContent = rules.timer === "off" ? "—" : timeText(rules.timer === "down" ? Math.ceil(rules.seconds - elapsed(game)) : elapsed(game));
  $("challengeInfo").textContent = [rules.timeLimit ? `${Math.max(0, Math.ceil(rules.seconds - elapsed(game)))}s remaining` : "",
    rules.moveLimit ? `${Math.max(0, rules.flips - game.flips)} flips remaining` : "",
    rules.mode === "sudden" ? `${Math.max(0, rules.mistakes - game.mismatches)} mismatches left` : ""].filter(Boolean).join(" · ") || "No rush. Every connection counts.";
  $("hintButton").disabled = busy || !canAssist(game, "hints") || hint?.until > Date.now();
  $("revealButton").disabled = busy || !canAssist(game, "reveals") || hint?.until > Date.now();
  $("restartButton").disabled = busy || rules.mode === "daily";
  $("endButton").disabled = busy || game.ended;
}
function tick() {
  if (!game) return;
  if (game.ended) { clearInterval(interval); return; }
  const settled = settleMismatch(game), ended = checkEnd(game);
  const expired = hint && hint.until <= Date.now();
  if (expired) { hint = null; $("feedback").textContent = "Your turn. Find the connection."; }
  finalize();
  if (settled || expired || ended) renderBoard();
  if (settled || expired || ended) persist();
  updateStats();
}
function useAssistance(kind) {
  if (!game || busy || hint?.until > Date.now()) return;
  const pair = assist(game, kind);
  if (pair) {
    saveReview(pair.item);
    if (kind === "hints") {
      hint = { key: pair.key, type: $("hintType").value, until: Date.now() + 2500 };
      $("feedback").textContent = hint.type === "pair" ? "These two cards belong together. Take a moment to remember them."
        : hint.type === "meaning" ? `Outlined pair: ${pair.item.meaning}` : `Outlined pair: ${pair.item.reading} · ${romajiOf(pair.item)}`;
    } else {
      $("feedback").textContent = `Pair revealed: ${pair.item.word}. Saved for review; no points awarded.`;
      if (game.rules.details) showDetails(pair.item);
      renderMatches();
    }
  }
  finalize(); renderBoard(); updateStats(); updateLifetime(); persist();
}
$("hintButton").onclick = () => useAssistance("hints");
$("revealButton").onclick = () => useAssistance("reveals");
function finalize(save = true) {
  if (!game?.ended || finalized) return;
  finalized = true; hint = null; clearInterval(interval);
  if (save) game.deck.pairs.filter((pair) => !game.matched.includes(pair.key)).forEach((pair) => saveReview(pair.item));
  if (game.won) {
    progress.completed++;
    if (game.rules.mode === "daily" && !progress.days.includes(gameDay)) progress.days = [...progress.days, gameDay].slice(-5000);
  }
  renderResults(); updateLifetime(); persist();
}
function renderResults() {
  const players = game.rules.players === 2 ? `<p>${game.scores[0] === game.scores[1] ? "A draw!" : `Player ${game.scores[0] > game.scores[1] ? 1 : 2} wins!`} Player 1: ${game.scores[0]} · Player 2: ${game.scores[1]}</p>` : "";
  $("results").hidden = false;
  $("results").innerHTML = `<span class="eyebrow">${game.won ? "Well connected" : "Every attempt is practice"}</span><h2>${escape(game.reason)}</h2>
    <p>${game.matched.length} / ${game.deck.pairs.length} pairs · ${game.moves} moves · ${game.flips} flips · ${game.mismatches} mismatches</p>
    <p>${timeText(elapsed(game))} elapsed · ${accuracy(game)}% unassisted accuracy · ${game.hints} hints · ${game.revealed.length} reveals</p>${players}
    <p class="small">Accuracy counts unassisted correct moves only. Missed and assisted items are in your notebook.</p>
    ${game.won && game.rules.mode === "marathon" ? round < game.rules.rounds ? '<button id="nextRound" class="primary" type="button">Next board →</button>' : "<p>Marathon complete. Beautiful work!</p>" : ""}`;
  if ($("nextRound")) $("nextRound").onclick = () => startGame(true);
  $("results").focus({ preventScroll: true });
}
function renderMatches() {
  $("matches").innerHTML = game?.matched.length ? game.matched.map((key) => `<button type="button" data-detail="${escape(key)}">${escape(itemFor(key).word)} <span>${game.revealed.includes(key) ? "↗" : "✓"}</span></button>`).join("") : '<p class="small">Your matched pairs will collect here.</p>';
}
$("matches").onclick = (event) => {
  const button = event.target.closest("[data-detail]");
  if (button) showDetails(itemFor(button.dataset.detail));
};
function showDetails(item) {
  detailItem = item;
  const rules = game?.rules || settings;
  $("details").innerHTML = `<div class="detail-word">${japaneseHTML(item.word, item.reading)}${item.group === "small" ? "" : audioHTML(item.reading)}</div>
    <dl><dt>Kanji</dt><dd>${/\p{Script=Han}/u.test(item.word) ? escape(item.word) : "Not applicable"}</dd>
    <dt>Hiragana</dt><dd lang="ja">${escape(item.reading)}</dd><dt>Katakana</dt><dd lang="ja">${escape(katakanaOf(item))}</dd>
    <dt>Romaji</dt><dd>${escape(romajiOf(item))}</dd>${rules.meanings ? `<dt>${item.kind === "kana" ? "Sound / use" : "Meaning"}</dt><dd>${escape(item.meaning)}</dd>` : ""}
    <dt>Part of speech</dt><dd>${escape(item.partOfSpeech || "Not available")}</dd></dl>
    ${item.kind === "word" && item.word !== katakanaOf(item) ? '<p class="small">Katakana is shown for script practice; the complete word above uses its dictionary spelling.</p>' : ""}
    <button id="saveItem" type="button">Save for review</button>
    ${rules.examples && item.kind === "word" ? '<h3>In context</h3><div id="wordExamples"></div>' : rules.examples ? '<p class="small">Individual kana represent sounds. Sentence examples are available in Words Mode.</p>' : ""}`;
  $("saveItem").onclick = () => { saveReview(detailItem); updateLifetime(); persist(); $("saveItem").textContent = "Saved to notebook"; };
  if ($("wordExamples")) void mountSentenceExamples($("wordExamples"), item.word);
}
function renderReview() {
  $("reviewList").innerHTML = progress.review.length ? progress.review.map((item, index) => `<div class="review-entry"><div>${japaneseHTML(item.word, item.reading)}<span class="small">${escape(item.meaning)}</span></div><button type="button" data-remove="${index}" aria-label="Remove ${escape(item.word)} from review">Remove</button></div>`).join("") : '<p class="small">A fresh notebook. Missed and assisted pairs will appear here.</p>';
}
$("reviewButton").onclick = () => { renderReview(); $("reviewNotice").textContent = ""; $("reviewDialog").showModal(); };
$("reviewList").onclick = (event) => {
  const button = event.target.closest("[data-remove]");
  if (!button) return;
  progress.review.splice(Number(button.dataset.remove), 1); persist(); renderReview(); updateLifetime();
};
$("exportReview").onclick = () => {
  const blob = new Blob([JSON.stringify({ tool: "nihon-memory", version: 1, items: progress.review }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = `nihon-memory-review-${localDay()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("importReview").onclick = () => $("reviewFile").click();
$("reviewFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Choose a review file smaller than 5 MB.");
    const items = reviewImport(JSON.parse(await file.text()));
    items.forEach(saveReview); persist(); renderReview(); updateLifetime();
    $("reviewNotice").textContent = `${items.length} items merged into your notebook.`;
  } catch (error) { console.error("Memory review import failed.", error); $("reviewNotice").textContent = error.message; }
  event.target.value = "";
};
$("resetProgress").onclick = async () => {
  if (busy || !await confirmAction("Delete Memory progress, daily history, and the review notebook? The current round will also end.", { confirmLabel: "Delete progress" })) return;
  clearInterval(interval); game = null; hint = null; detailItem = null; finalized = false;
  progress = freshProgress(); persist(); renderReview(); updateLifetime();
  $("board").innerHTML = ""; $("emptyBoard").hidden = false; $("results").hidden = true;
  $("progressText").textContent = "Choose words or syllabaries to begin"; $("progress").value = 0;
  $("timer").textContent = "—"; $("roundLabel").textContent = "Ready"; $("turnText").textContent = "Solo practice";
  $("details").innerHTML = '<p class="small">Match a pair to explore it here.</p>';
  $("feedback").textContent = "A fresh start. Choose your next puzzle.";
  ["hintButton", "revealButton", "restartButton", "endButton"].forEach((id) => { $(id).disabled = true; });
  renderMatches(); updateStats(); $("reviewNotice").textContent = "Memory progress reset.";
};
document.addEventListener("visibilitychange", () => { if (game && !game.ended) { tick(); persist(); } });
window.addEventListener("pagehide", () => {
  if (!game) return;
  if (!game.ended && game.rules.mode !== "daily") game.deck.pairs.filter((pair) => !game.matched.includes(pair.key)).forEach((pair) => saveReview(pair.item));
  persist();
});
updateStats();
if (restoreError) notify(restoreError, true);
