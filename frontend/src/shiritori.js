import "./shiritori.css";
import { bind, toKana } from "wanakana";
import { API_BASE } from "./api.js";
import { mountChips } from "./chips.js";
import { mountStudyControls, study, japaneseHTML, audioHTML, readingsHTML, speakJapanese } from "./study-controls.js";
import { mountSentenceExamples } from "./examples.js";
import { DEFAULT_RULES, CATEGORIES, READING_ENDING_RULE, parseRules, kana, morae, requiredStart, startOptions, kanjiChain, connection, wordEndingError, validateWord, scoreWord, assistAllowed, matchesCategory, isKanji } from "../../backend/src/shiritori-rules.js";
import { createSeededRandom } from "./crossword-engine.js";
import { JAPANESE_FONTS, isFontSetting, applyJapaneseFont } from "./japanese-fonts.js";
import { confirmAction } from "./confirm-dialog.js";
import { setSettingAvailability } from "./settings-panel.js";

const startOptionList = (word, rules) => { const o = startOptions(word, rules); return [...o.kana, ...o.kanji]; };
const $ = (id) => document.getElementById(id);
const escape = (text) => String(text ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const settingsKey = "nihon:shiritori-settings-v1";
const progressKey = "nihon:shiritori-progress-v1";
const modes = { classic: "Classic", relaxed: "Relaxed", timed: "Timed", sudden: "Sudden Death", daily: "Daily Challenge", category: "Category Shiritori", kanji: "Kanji Shiritori", katakana: "Katakana Challenge", beginner: "Beginner", marathon: "Marathon" };
const modeDescriptions = {
  classic: "Build a chain by connecting each word to the previous word's ending.",
  relaxed: "No timer and unlimited hints. An invalid connection still ends the round.",
  timed: "Play a valid word before the turn countdown expires.", sudden: "Any invalid play ends the round with a loss.",
  daily: "Play ten valid words against the computer with fixed daily rules and no assistance.",
  category: "Build a chain within your selected vocabulary category.", kanji: "Connect words using kanji, rather than kana endings.",
  katakana: "Use words written in katakana.", beginner: "Words up to four morae, unlimited hints and furigana.",
  marathon: "Build a long chain and earn extra points as it grows."
};
const defaults = { ...DEFAULT_RULES, opponent: "computer", players: 2, level: "N5", fontSize: "normal", font: "Noto Sans JP", contrast: false, translations: false };
let settings = { ...defaults };
let progress = { known: [], review: [], daily: { last: "", streak: 0, attempted: "" } };
let restoreError = "";
function validateSettings(value) {
  parseRules(value);
  for (const [key, options] of Object.entries({ opponent: ["computer", "local"], fontSize: ["normal", "large", "larger"], font: { includes: isFontSetting } })) {
    if (key in value && !options.includes(value[key])) throw new Error(`Invalid ${key} preference.`);
  }
  if ("translations" in value && typeof value.translations !== "boolean") throw new Error("Invalid translations preference.");
  if ("players" in value && (!Number.isInteger(value.players) || value.players < 1 || value.players > 6)) throw new Error("Choose one to six local players.");
}
try {
  const saved = JSON.parse(localStorage.getItem(settingsKey) || "{}");
  validateSettings(saved);
  settings = { ...defaults, ...saved };
  delete settings.appearance;
  const stored = JSON.parse(localStorage.getItem(progressKey) || "null");
  if (stored) {
    if (!Array.isArray(stored.known) || !Array.isArray(stored.review) || !stored.daily || !Number.isInteger(stored.daily.streak)) throw new Error("Invalid saved progress");
    progress = stored;
  }
} catch (error) {
  console.error("Could not restore Shiritori preferences.", error);
  restoreError = "Some saved preferences or progress could not be restored. Check your settings before starting.";
}
let game = null;
let generation = 0;
let detailGeneration = 0;
let detailWord = null;
let busy = false;
let timerHandle;
let selected = null;
let checkedText = "";
let candidates = [];
let recentStarters = [];
try {
  const saved = JSON.parse(sessionStorage.getItem("nihon:shiritori-starters") || "[]");
  if (Array.isArray(saved) && saved.every((id) => typeof id === "string")) recentStarters = saved.slice(-12);
} catch (error) { console.warn("Could not restore recent opening words.", error); }
const exampleCache = new Map();
const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};
const previousDay = (date) => {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() - 1);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
};
const info = (message, error = false) => {
  $("feedback").textContent = message;
  $("feedback").dataset.error = String(error);
};
function persist(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (error) { console.error("Could not save Shiritori data.", error); info("Your browser could not save settings and progress. Export your review list before leaving.", true); return false; }
}
const tip = (description) => description ? ` data-setting-description="${escape(description)}"` : "";
function selectSetting(key, label, options, description) {
  return `<div class="setting"><div class="setting-title"><label for="setting-${key}"${tip(description)}>${label}</label></div><select id="setting-${key}" data-setting="${key}">${Object.entries(options).map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></div>`;
}
function numberSetting(key, label, min, max, description) {
  return `<div class="setting"><div class="setting-title"><label for="setting-${key}"${tip(description)}>${label}</label></div><input id="setting-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="1" required></div>`;
}
function checkboxSetting(key, label, description) {
  return `<div class="setting check"><label class="check-label" for="setting-${key}"${tip(description)}><input id="setting-${key}" data-setting="${key}" type="checkbox">${label}</label></div>`;
}
function settingsMarkup() {
  const levels = { all: "All (including unrated)" };
  for (let n = 5; n >= 1; n--) levels[`N${n}`] = `N${n}`;
  for (let from = 5; from > 1; from--) for (let to = from - 1; to >= 1; to--) levels[`N${from}-N${to}`] = `N${from}–N${to}`;
  return `<p class="small">Valid settings save automatically and apply to your next game. The top reading, audio and appearance controls stay live.</p>
  <form id="settingsForm">
  <div class="mode-pills" id="modePills" role="group" aria-label="Game mode">${Object.entries(modes).map(([key, label]) => `<button class="mode-pill" type="button" data-mode="${key}" data-setting-description="${escape(modeDescriptions[key])}" aria-pressed="false">${label}</button>`).join("")}</div>
  <fieldset class="settings-section" id="gameSettings"><legend>Game</legend><div class="settings-grid">
  <input type="hidden" id="setting-mode" data-setting="mode">
  ${selectSetting("opponent", "Play against", { computer: "Computer", local: "Local players / solo" }, "Computer alternates with you. Local mode supports one learner or up to six players sharing this device. Daily always uses the computer.")}
  ${numberSetting("players", "Local players", 1, 6, "Number of players taking turns on this device. Ignored when playing the computer. A losing move ends the round for everyone.")}
  ${selectSetting("timer", "Seconds per turn", { 10: "10 seconds", 20: "20 seconds", 30: "30 seconds", 60: "60 seconds" }, "Only Timed mode uses a countdown. It includes checks, hints, dictionary requests and time in dialogs. Other modes have no timer.")}
  </div></fieldset>
  <fieldset><legend>Vocabulary</legend><div class="settings-grid">
<div class="settings-section"><h3>Study words</h3>
  ${selectSetting("level", "JLPT study levels", levels)}
  ${selectSetting("category", "Vocabulary category", CATEGORIES)}
</div>
<div class="settings-section"><h3>Word rules</h3>
  ${selectSetting("entry", "Word entry", { kana: "Kana", kanji: "Kanji", both: "Both" }, `Romaji converts automatically to kana. Kana accepts either script. Kanji entry confirms a dictionary spelling and links by kanji. Both accepts either form. For Kana entry and kanji chains: ${READING_ENDING_RULE}`)}
  ${selectSetting("wordType", "Allowed word types", { all: "All", nouns: "Nouns", verbs: "Verbs", adjectives: "Adjectives" }, "Use dictionary parts of speech to limit playable vocabulary. All includes expressions, verbs, adjectives and other dictionary words. Verbs and Adjectives also allow nouns.")}
  ${selectSetting("proper", "Proper nouns allowed", { names: "Yes", none: "No" }, "Names must have dictionary evidence. Only names identified by the dictionary are available.")}
</div>
  </div></fieldset>
  <fieldset class="settings-section"><legend>Scoring and rules</legend><div class="settings-grid">
  ${checkboxSetting("voicing", "Allow voiced / unvoiced variation", "Treat か / が and は / ば / ぱ as equivalent at the connection. Off by default. Does not affect kanji connections.")}
  ${checkboxSetting("bonus", "Bonus points and bonus kana", "Every third move assigns a bonus kana: +15 if your valid reading contains it. Reusing more than the last syllable (or more than the last kanji) of the previous word earns +5 per extra overlapping syllable or character. Marathon adds +5 per word.")}
  </div></fieldset>
  <fieldset class="settings-section help-section"><legend>Help during play</legend><div class="help-pair">
  <fieldset class="help-group" id="hintSettings"><legend>Hints</legend><div class="settings-grid">
  ${selectSetting("hints", "Hint availability", { limited: "Limited per player", unlimited: "Unlimited", disabled: "Disabled" })}
  ${numberSetting("hintLimit", "Hints per player", 0, 30)}
  </div></fieldset>
  <fieldset class="help-group" id="revealSettings"><legend>Reveal answer</legend><div class="settings-grid">
  ${checkboxSetting("reveal", "Allow Reveal Answer")}
  ${numberSetting("revealLimit", "Reveals per player", 0, 30)}
  </div></fieldset>
  </div></fieldset>
  <fieldset class="settings-section"><legend>Display and accessibility</legend><div class="settings-grid">
  ${selectSetting("font", "Japanese font", JAPANESE_FONTS)}
  ${selectSetting("fontSize", "Font size", { normal: "Standard", large: "Large", larger: "Extra large" })}
  ${checkboxSetting("contrast", "High contrast")}
  ${checkboxSetting("translations", "Show translations in word chain", "Show the English meaning above or below each word in the word chain. Off by default because long translations can crowd the chain.")}
  </div></fieldset>
  <p id="settingsError" role="alert" class="feedback" hidden></p>
  </form>
  <div class="settings-footer">
    <button id="exportReview" type="button" data-setting-description="Download a JSON file of saved vocabulary, readings, meanings and source metadata.">Export review list</button>
    <button id="importReview" type="button" data-setting-description="Merge a previously exported review list. Files are validated locally and cannot add words to the accepted game dictionary.">Import review list</button>
    <button id="resetProgress" type="button" data-setting-description="Permanently clear discoveries, the review list and Daily streak on this browser, after confirmation. Game statistics reset whenever you start a new game.">Reset progress</button>
    <input id="reviewFile" type="file" accept="application/json,.json" hidden>
  </div>`;
}
$("shiritoriRoot").innerHTML = `<div class="shell">
  <header><div class="brand"><span class="brand-mark" lang="ja">し</span><span class="brand-name">Shiritori<span class="brand-note">at NihongoToolkit</span></span></div><button id="themeButton" type="button" aria-label="Toggle light and dark mode">◐</button></header>
  <section class="intro"><span class="eyebrow">A little play. A little Japanese.</span><h1>Shiritori <span lang="ja">しりとり</span> <button id="helpButton" class="help-button" type="button" aria-label="How to play Shiritori">?</button></h1><p>One word leads to another. Follow the last sound, discover new words, and see how far your Japanese can take you.</p></section>
  <details id="settingsPanel" class="card game-settings" open><summary>Game settings</summary><div class="settings-body">${settingsMarkup()}</div></details>
  <div class="toolbar"><span id="modeBadge" class="tag">Classic · vs. computer</span><button id="reviewButton" type="button">Review list <span id="reviewCount">0</span></button><button id="newGame" class="primary" type="button">Start game →</button></div>
  <p id="startError" class="feedback start-error" role="alert" hidden></p>
  <div class="layout"><main class="main-column">
    <section class="card" aria-label="Current turn">
      <div class="turn-strip"><span id="turnLabel"><span class="turn-dot"></span>Ready when you are</span><span id="timer" class="timer" aria-label="Time remaining">No timer</span></div>
      <div class="prompt"><div><span class="eyebrow">Previous word</span><div id="previousWord" class="previous-word" lang="ja">しりとり</div><span id="previousReading" class="small">Start a new chain</span></div><span class="connection-arrow" aria-hidden="true">→</span><div class="required-wrap"><span class="eyebrow">Your word can start with:</span><ul id="startOptions" class="start-options" lang="ja"></ul></div></div>
      <form id="wordForm"><label class="entry-label" for="wordInput">Keep the chain going</label><div class="entry-row"><input id="wordInput" lang="ja" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60" placeholder="Type a Japanese word…" disabled aria-describedby="entryNote feedback"><button id="playWord" class="primary" type="submit" disabled>Play ↵</button></div><p class="entry-note small" id="entryNote">Romaji converts to kana as you type. You can also use a Japanese keyboard.</p></form>
      <div class="actions"><button id="hintButton" type="button" disabled>Hint</button><button id="revealButton" type="button" disabled>Reveal Answer</button><button id="passButton" type="button" disabled>Pass</button><button id="retryComputer" type="button" hidden>Retry computer turn</button><button id="stopGame" type="button" hidden>End round</button></div>
      <div id="feedback" class="feedback" role="status" aria-live="polite"></div><div id="choices" class="candidates"></div><div id="hintPanel" class="feedback" role="status" hidden></div>
    </section>
    <section id="results" class="card results" tabindex="-1" hidden></section>
    <section class="card"><div class="card-heading"><h2>The word chain</h2><span id="chainCount" class="tag">0 words</span></div><ol id="chain" class="chain"></ol><div id="chainEmpty" class="empty-state"><span class="empty-icon" lang="ja">言葉をつなごう</span>Your first connection is waiting.<br><span class="small">Every word is a chance to learn something new.</span></div></section>
  </main><aside class="sidebar">
    <section class="card"><div class="card-heading"><h2>This round</h2><span id="dailyStreak" class="small"></span></div><div id="scores" class="muted">A fresh chain, a fresh start.</div><div id="stats" class="stats"></div><p id="bonusLabel" class="small" style="margin:16px 0 0">N5 → 10 pts · N1 → 50 pts</p></section>
    <section class="card" id="wordDetails"><div class="card-heading"><h2>Word notebook</h2><span class="small">Learn as you play</span></div><div id="detailBody" class="muted">Tap or hover over a played word to explore its reading, meaning, and an example. Tap an individual kanji for a closer look.</div></section>
    <section class="card rule-note"><h2>A small reminder</h2><p id="ruleSummary"></p><p class="small">Small kana stay with their syllable (しょ → しょ…). Longer overlaps earn bonus points. Prefer a gentler chain? Try Beginner in Settings.</p></section>
  </aside></div>
  <footer><span>Little connections. Lasting vocabulary.</span><a href="./data-sources.html" target="_blank" rel="noopener">Dictionary &amp; sentence credits ↗</a></footer>
  <dialog id="helpDialog" aria-labelledby="helpTitle"><div class="dialog-head"><h2 id="helpTitle">A word game that keeps you learning</h2><button class="close" data-close type="button" aria-label="Close help">×</button></div><div class="dialog-body">
    <div class="help-example" lang="ja">りんご → ごりら → らっぱ</div>
    <p><strong>Shiritori means “taking the tail”.</strong> Start your word with the last syllable of the previous word, or with more of it: the last two or three syllables, or its last kanji or kanji compound. The answer must be longer than the overlap, so it can never begin with the entire previous word. Small kana stay attached (しょ needs しょ, and しょう works). Hiragana and katakana are equivalent. Submit with Enter or Play. Words ending in <strong>ん / ン</strong> and the particle <strong>を / ヲ</strong> are not accepted. Stuck? Use <strong>Pass</strong> to skip your turn; if everyone passes in a row, the round ends.</p>
    <h3>Play your way</h3><p>Play the computer, practice alone, or share this device with up to six local players. Classic retries invalid entries. Sudden Death loses on any invalid submission. Relaxed has unlimited hints and no timer: an invalid connection ends the round. Timed includes dictionary-check time. Beginner caps words at four morae and enables furigana. Marathon adds points for every word.</p>
    <p>Category and Katakana challenges filter the vocabulary. Advanced Kanji Shiritori only accepts overlaps made of the last kanji or kanji compound. Daily uses a date-seeded match with fixed rules: play ten valid human words to win. Only your first attempt each local calendar day counts toward your streak; repeat attempts are practice.</p>
    <h3>Make the rules yours</h3><p>Choose Kana, Kanji or Both, any combination of JLPT levels, a category, parts of speech. Conjugated verbs and adjectives are accepted. Romaji converts as you type; pick the right spelling when a reading is ambiguous. Kanji entry accepts a typed reading only after you confirm its spelling.</p>
    <p>For Kana entry and kanji chains: ${escape(READING_ENDING_RULE)} Dictionary readings are checked even when you type kanji. A long-vowel mark inside a word is fine, as in ケーキ. Outside Kanji Shiritori, Both entry keeps a final ー attached to its syllable (コーヒー requires ヒー). Repeated words and words ending in ん / ン are never accepted. You can allow voiced/unvoiced pairs. No available dictionary continuation ends the round with an explanation, not an invented word.</p>
    <h3>Learn, don’t just guess</h3><p>Hints cycle through first kana, morae, category and a hidden word; Reveal gives a legal word and meaning. Hover, focus or tap chain words to explore them. Kanji buttons show meanings, on’yomi, kun’yomi and compounds. Audio uses an installed Japanese device voice. Sentence availability depends on the dictionary and Tatoeba.</p>
    <h3>Points &amp; progress</h3><p>N5 / N4 / N3 / N2 / N1 earn 10 / 20 / 30 / 40 / 50 points. Unrated words earn 10 and appear only in All. Bonus kana earns 15; extra overlap earns 5 per additional syllable or character. Marathon adds 5 per valid word. Statistics reset for each new game. Save words to a local review list and export/import it in Settings.</p>
    <p class="small">JLPT levels are community estimates. Categories are approximate dictionary-gloss filters. Name coverage is limited to dictionary entries, not an exhaustive list of famous people. Unknown submissions may be sent to the optional Jisho fallback; example lookups may use Tatoeba. Provider errors are shown and are never treated as proof that a word is invalid.</p>
  </div></dialog>
  <dialog id="kanjiDialog" aria-labelledby="kanjiTitle"><div class="dialog-head"><h2 id="kanjiTitle">Kanji details</h2><button class="close" data-close type="button" aria-label="Close kanji details">×</button></div><div class="dialog-body" id="kanjiBody"></div></dialog>
  <dialog id="reviewDialog" aria-labelledby="reviewTitle"><div class="dialog-head"><h2 id="reviewTitle">Your review list</h2><button class="close" data-close type="button" aria-label="Close review list">×</button></div><div class="dialog-body" id="reviewBody"></div></dialog>
</div>`;

mountStudyControls();
mountChips($("setting-wordType"), { fieldClass: "word-type-field" });
mountChips($("setting-proper"), { presentation: "radio", fieldClass: "proper-field" });
bind($("wordInput"), { IMEMode: true });
function applyAccessibility() {
  const display = game?.settings || settings;
  applyJapaneseFont(display.font, generation);
  document.documentElement.dataset.contrast = String(display.contrast);
  document.documentElement.style.setProperty("--scale", { normal: 1, large: 1.15, larger: 1.3 }[display.fontSize] || 1);
}
applyAccessibility();
function syncModePills() {
  for (const pill of document.querySelectorAll("#modePills .mode-pill")) pill.setAttribute("aria-pressed", String(pill.dataset.mode === $("setting-mode").value));
}
function populateSettings() {
  for (const node of document.querySelectorAll("[data-setting]")) {
    const key = node.dataset.setting;
    const value = settings[key];
    if (node.type === "checkbox") node.checked = value;
    else node.value = String(value);
  }
  syncModePills();
  syncAvailability();
  $("settingsError").hidden = true;
}
function syncAvailability() {
  const mode = $("setting-mode").value, daily = mode === "daily";
  const forcedHints = ["daily", "relaxed", "beginner"].includes(mode);
  const reasons = {
    players: $("setting-opponent").value !== "local" ? "Choose local players." : "",
    timer: mode !== "timed" ? "Used in Timed mode." : "",
    hints: forcedHints ? "Hint availability is determined by this mode." : "",
    hintLimit: forcedHints || $("setting-hints").value !== "limited" ? "Choose limited hints outside a fixed-hint mode." : "",
    category: mode === "katakana" ? "Katakana Challenge sets its vocabulary category." : "",
    revealLimit: !$("setting-reveal").checked ? "Allow Reveal Answer to set a limit." : "",
    voicing: mode === "kanji" || $("setting-entry").value === "kanji" ? "Kana voicing does not affect kanji connections." : ""
  };
  for (const control of document.querySelectorAll("[data-setting]")) {
    const key = control.dataset.setting;
    if (key === "mode") continue;
    setSettingAvailability(control, daily && !["font", "fontSize", "contrast", "translations"].includes(key)
      ? "Daily uses fixed rules; your preference is kept." : reasons[key] || "");
  }
}
function showSettingsError(message) {
  $("settingsError").hidden = false;
  $("settingsError").textContent = message;
}
function saveSettings() {
  startError();
  syncAvailability();
  if (!$("settingsForm").checkValidity()) {
    showSettingsError("Enter valid values before these settings can be saved.");
    return;
  }
  const next = { ...settings };
  for (const node of document.querySelectorAll("[data-setting]")) {
    const key = node.dataset.setting;
    if (node.disabled || node.closest("fieldset")?.disabled) continue;
    next[key] = node.type === "checkbox" ? node.checked : typeof defaults[key] === "number" ? Number(node.value) : node.value;
  }
  try { validateSettings(next); } catch (error) { showSettingsError(error.message); return; }
  settings = next;
  applyAccessibility();
  renderChain();
  if (!game) render();
  if (!persist(settingsKey, settings)) {
    showSettingsError("Your browser could not save these settings. They may be lost when you leave.");
    return;
  }
  $("settingsError").hidden = true;
}
$("modePills").addEventListener("click", (event) => {
  const pill = event.target.closest(".mode-pill");
  if (!pill) return;
  $("setting-mode").value = pill.dataset.mode;
  syncModePills();
  saveSettings();
});
$("settingsForm").addEventListener("change", () => saveSettings());
$("settingsForm").addEventListener("input", (event) => {
  if (event.target.type === "number" && $("settingsForm").checkValidity()) saveSettings();
});
$("settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveSettings();
});
populateSettings();
$("settingsPanel").querySelector("summary").addEventListener("click", () => {
  if (!$("settingsPanel").open) populateSettings();
});
$("helpButton").addEventListener("click", () => $("helpDialog").showModal());
document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));

async function api(path, params = {}) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, typeof value === "string" ? value : JSON.stringify(value));
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { Accept: "application/json" } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "The dictionary is unavailable. Please retry.");
  return payload;
}
async function roundWords(query = "") {
  const randomOpening = !query && !game.chain.length && game.rules.mode !== "daily";
  const params = {
    rules: game.rules, ...(query ? { q: query } : {
      ...(game.chain.length ? { prev: { word: game.chain.at(-1).word, reading: game.chain.at(-1).reading } } : {}),
      used: randomOpening ? recentStarters : game.chain.map((w) => w.id),
      ...(randomOpening ? { random: "1" } : {})
    })
  };
  const data = await api("/api/shiritori/words", params);
  if (randomOpening && !data.items.length && recentStarters.length) {
    return (await api("/api/shiritori/words", { ...params, used: [] })).items;
  }
  return data.items;
}
const humanTurn = () => Boolean(game?.active && !game.players[game.turn].computer);
function enableControls() {
  const playable = humanTurn() && !busy;
  for (const id of ["wordInput", "playWord"]) $(id).disabled = !playable;
  const player = game?.players[game.turn];
  $("hintButton").disabled = !playable || game.rules.hints === "disabled" || game.rules.hints === "limited" && player.hints >= game.rules.hintLimit;
  $("revealButton").disabled = !playable || !assistAllowed(game.rules, player, "reveal");
  $("hintButton").textContent = game?.active && game.rules.hints === "limited" ? `Hint · ${Math.max(0, game.rules.hintLimit - player.hints)} left` : "Hint";
  $("revealButton").textContent = game?.active && game.rules.reveal ? `Reveal Answer · ${Math.max(0, game.rules.revealLimit - player.reveals)} left` : "Reveal Answer";
  $("passButton").disabled = !playable || game.rules.mode === "daily";
  $("newGame").disabled = busy;
  $("stopGame").hidden = !game?.active;
}
function render() {
  const rules = game?.rules || parseRules(settings);
  const players = game?.settings || settings;
  $("modeBadge").textContent = `${modes[rules.mode]} · ${rules.mode === "daily" || players.opponent === "computer" ? "vs. computer" : players.players === 1 ? "solo practice" : `${players.players} local players`}`;
  $("newGame").textContent = game ? "New game →" : "Start game →";
  $("reviewCount").textContent = progress.review.length;
  $("dailyStreak").textContent = `${progress.daily.streak} day streak`;
  const restrictedEndings = rules.entry === "kana" || kanjiChain(rules);
  $("ruleSummary").textContent = `${kanjiChain(rules) ? "Reuse the final kanji or kanji compound" : "Reuse the last syllable or more, or the final kanji / compound"}. No repeated words. ${restrictedEndings ? READING_ENDING_RULE : "Words ending in ん / ン are not accepted."}`;
  $("entryNote").textContent = `Romaji converts to kana as you type. You can also use a Japanese keyboard.${restrictedEndings ? ` ${READING_ENDING_RULE}` : ""}`;
  const stats = game?.stats || { words: 0, unique: new Set(), hints: 0, revealed: 0, longest: 0 };
  $("stats").innerHTML = [[stats.words, "Words played"], [stats.longest, "Longest chain"], [stats.unique.size, "Unique words"], [stats.hints, "Hints used"], [stats.revealed, "Words revealed"], [game?.chain.length || 0, "Chain length"]]
    .map(([value, label]) => `<div><strong>${value}</strong><span>${label}</span></div>`).join("");
  if (game) {
    $("scores").innerHTML = game.players.map((player, i) => `<div class="score-row ${game.active && game.turn === i ? "active" : ""}" data-player="${i % 6}"><span><i class="swatch" aria-hidden="true"></i>${game.active && game.turn === i ? "→ " : ""}${escape(player.name)}</span><strong>${player.score} <span class="small">pts</span></strong></div>`).join("");
    const previous = game.chain.at(-1);
    if (previous) {
      $("previousWord").innerHTML = japaneseHTML(rules.entry === "kana" ? previous.reading : previous.word, previous.reading);
      $("previousReading").textContent = `${previous.reading} · ${previous.meaning.split(";")[0]}`;
      $("startOptions").innerHTML = startOptionList(previous, game.rules).map(({ text, size }) => `<li><span>${escape(text)}</span>${game.rules.bonus && size > 1 ? `<small>+${(size - 1) * 5}</small>` : ""}</li>`).join("");
    }
    const player = game.players[game.turn];
    const turnText = player.computer ? "Computer is thinking…" : player.name === "You" ? "Your turn" : `${player.name}’s turn`;
    $("turnLabel").textContent = game.active ? `${turnText}${game.rules.mode === "daily" ? ` · ${game.humanWords}/10 words` : ""}` : "Round complete";
    $("bonusLabel").textContent = game.bonusKana && game.active ? `Bonus kana: ${game.bonusKana} · include it for +15 points` : "N5 → 10 pts · N1 → 50 pts · extra overlap +5";
  }
  enableControls();
}
const sharedChars = (previous, word) => {
  if (game && kanjiChain(game.rules)) {
    const before = [...previous.word];
    const after = [...word.word];
    for (let n = Math.min(before.length, after.length - 1); n > 0; n--) if (before.slice(-n).join("") === after.slice(0, n).join("")) return n;
    return 0;
  }
  const before = kana(previous.reading);
  const after = kana(word.reading);
  for (let n = Math.min(before.length, after.length - 1); n > 0; n--) if (before.endsWith(after.slice(0, n))) return n;
  return 0;
};
function renderChain() {
  const chain = game?.chain || [];
  $("chainCount").textContent = `${chain.length} words`;
  $("chainEmpty").hidden = Boolean(chain.length);
  const laneEnd = [0, 0];
  let column = 0;
  let end = 0;
  const blocks = chain.map((word, i) => {
    const shown = (w) => kanjiChain(game.rules) ? w.word : w.reading;
    const length = [...shown(word)].length;
    const lane = i % 2;
    if (i) column += [...shown(chain[i - 1])].length - sharedChars(chain[i - 1], word);
    column = Math.max(column, laneEnd[lane]);
    laneEnd[lane] = column + length;
    end = Math.max(end, column + length);
    const color = word.playerIndex === undefined ? "starter" : word.playerIndex % 6;
    const meaning = `${word.word !== word.reading ? `${word.word} · ` : ""}${word.meaning.split(";")[0]}`;
    const score = word.points ? `+${word.points.total}${word.overlap?.text ? ` · ↔ ${escape(word.overlap.text)}` : ""}` : "Opening word";
    const detail = word.points ? `${escape(word.player)} · ${score}` : score;
    const gloss = settings.translations ? `<span class="chain-gloss" title="${escape(meaning)}">${escape(meaning)}</span>` : "";
    return `<li class="lane-${lane}" data-player="${color}" style="--col:${column};--len:${length}"><button type="button" data-word-index="${i}" aria-label="Explore ${escape(word.word)}, ${escape(word.reading)}, ${detail}">${kanjiChain(game.rules) ? `<span class="chain-furi" lang="ja">${escape(word.reading)}</span>` : ""}<span class="chain-word" lang="ja">${escape(shown(word))}</span><span class="chain-meta">${score}</span></button>${gloss}</li>`;
  });
  $("chain").style.setProperty("--cols", end);
  $("chain").classList.toggle("with-gloss", Boolean(settings.translations));
  $("chain").classList.toggle("kanji-chain", Boolean(game && kanjiChain(game.rules)));
  $("chain").innerHTML = blocks.join("");
  $("chain").scrollLeft = $("chain").scrollWidth;
}
function deadlineTick() {
  if (!game?.active || !game.deadline) return;
  const remaining = Math.max(0, Math.ceil((game.deadline - Date.now()) / 1000));
  $("timer").textContent = `${remaining}s`;
  $("timer").classList.toggle("urgent", remaining <= 5);
  if (remaining === 0) finish("time ran out", `${game.players[game.turn].name} ran out of time.`, game.turn);
}
function expired() {
  deadlineTick();
  return !game?.active;
}
function resetEntry() {
  selected = null; checkedText = ""; candidates = [];
  $("wordInput").value = ""; $("choices").replaceChildren();
  $("hintPanel").hidden = true; $("hintPanel").textContent = "";
}
function startError(message = "") {
  $("startError").hidden = !message;
  $("startError").textContent = message;
}
async function startGame() {
  if (game?.active && !await confirmAction("End this round and start a new game? Current round statistics will reset. Saved words remain in your notebook.", { confirmLabel: "New game" })) return;
  let rules;
  startError();
  try {
    rules = parseRules(settings);
    if (rules.mode !== "daily" && rules.level === "none") throw new Error("Choose at least one JLPT level to start a game.");
  } catch (error) { startError(error.message); return; }
  const token = ++generation;
  clearInterval(timerHandle);
  const date = today();
  game = {
    rules, settings: { ...settings }, active: false, turn: 0, chain: [], humanWords: 0, bonusKana: "", deadline: 0, hintStep: 0,
    rng: createSeededRandom(rules.mode === "daily" ? date : `${Date.now()}-${Math.random()}`),
    dailyDate: date, rankedDaily: rules.mode === "daily" && progress.daily.attempted !== date,
    knownBefore: new Set(progress.known),
    players: rules.mode === "daily" || settings.opponent === "computer"
      ? [{ name: "You", score: 0, hints: 0, reveals: 0 }, { name: "Computer", score: 0, hints: 0, reveals: 0, computer: true }]
      : Array.from({ length: settings.players }, (_, i) => ({ name: `Player ${i + 1}`, score: 0, hints: 0, reveals: 0 })),
    stats: { words: 0, unique: new Set(), longest: 0, hints: 0, revealed: 0, missed: {} }
  };
  applyAccessibility();
  if (rules.mode === "beginner" && !study.furigana) $("furiganaQuickToggle").click();
  resetEntry(); detailGeneration++; detailWord = null;
  $("detailBody").textContent = "Your word notebook will appear here.";
  $("results").hidden = true; $("retryComputer").hidden = true;
  $("previousWord").textContent = "…"; $("previousReading").textContent = ""; $("startOptions").replaceChildren();
  busy = true; render(); renderChain(); info("Finding your opening word…");
  try {
    const words = await roundWords();
    if (generation !== token) return;
    if (!words.length) throw new Error("No playable words match these settings. Try a wider JLPT range, another category or fewer restrictions.");
    const offset = Math.floor(game.rng() * words.length);
    let starter;
    let following;
    for (let i = 0; i < words.length; i++) {
      const candidate = words[(offset + i) % words.length];
      game.chain = [{ ...candidate, player: "Starter" }];
      following = await nextWords();
      if (generation !== token) return;
      if (following.length) { starter = candidate; break; }
    }
    if (!starter) {
      game.chain = [];
      throw new Error("No playable opening pair was found for these rules. Try a wider JLPT range, another category.");
    }
    game.stats.longest = 1;
    if (rules.mode !== "daily") {
      recentStarters = [...recentStarters.filter((id) => id !== starter.id), starter.id].slice(-12);
      try { sessionStorage.setItem("nihon:shiritori-starters", JSON.stringify(recentStarters)); }
      catch (error) { console.warn("Could not save recent opening words.", error); }
    }
    if (game.rankedDaily) {
      progress.daily.attempted = date;
      persist(progressKey, progress);
    }
    game.active = true; busy = false;
    $("settingsPanel").open = false;
    renderChain(); showWord(starter); speakJapanese(starter.reading); beginTurn(following);
    if (rules.mode === "daily") info(game.rankedDaily ? "Daily challenge: play 10 valid words. Your first attempt counts toward your streak." : "Daily practice: today’s ranked attempt has already been used.");
    else info(`Your opening word is ${starter.word} (${starter.reading}). Continue with ${requiredStart(starter, rules)}.`);
  } catch (error) {
    if (generation !== token) return;
    game.active = false; busy = false; render(); info("");
    startError(error.message);
  }
}
function beginTurn(preloaded = null) {
  resetEntry();
  game.hintStep = 0;
  game.nextWords = preloaded;
  game.bonusKana = game.rules.bonus && game.stats.words % 3 === 2 ? [..."あいうえおかきくけこさしすせそ"][Math.floor(game.rng() * 15)] : "";
  game.deadline = game.rules.mode === "timed" ? Date.now() + game.rules.timer * 1000 : 0;
  clearInterval(timerHandle);
  $("timer").classList.remove("urgent");
  $("timer").textContent = game.deadline ? `${game.rules.timer}s` : "No timer";
  if (game.deadline) timerHandle = setInterval(deadlineTick, 200);
  render();
  if (restoreError) info(restoreError, true);
  if (game.players[game.turn].computer) computerTurn();
  else prepareHumanTurn();
}
async function nextWords() {
  if (game.nextWords) return game.nextWords;
  const words = await roundWords();
  return words.filter((word) => {
    const result = validateWord(word, game.chain.at(-1), game.chain, game.rules);
    return result.ok;
  });
}
async function prepareHumanTurn() {
  const token = generation;
  busy = true; enableControls();
  try {
    const words = await nextWords();
    if (generation !== token || expired()) return;
    game.nextWords = words;
    if (!words.length) {
      finish("no available continuation", `No unused dictionary word matches ${requiredStart(game.chain.at(-1), game.rules)} and the active rules. The chain ends without a loser. Try broader filters for the next game.`, null);
      return;
    }
    busy = false; enableControls();
    $("wordInput").focus();
    if (game.rules.mode === "beginner") assist(false, true);
  } catch (error) {
    if (generation !== token) return;
    busy = false; enableControls();
    info(`${error.message} You can still try a word or retry with Hint.`, true);
  }
}
async function computerTurn() {
  if (!game?.active || !game.players[game.turn].computer || busy) return;
  const token = generation;
  busy = true; $("retryComputer").hidden = true; render();
  try {
    const words = await nextWords();
    if (generation !== token || expired()) return;
    if (!words.length) {
      finish("no available continuation", `The computer has no unused dictionary word matching ${requiredStart(game.chain.at(-1), game.rules)} and the active rules.`, game.turn);
      return;
    }
    const word = words[Math.floor(game.rng() * words.length)];
    busy = false;
    accept(word);
  } catch (error) {
    if (generation !== token) return;
    busy = false; game.deadline = 0; clearInterval(timerHandle);
    $("timer").textContent = "Paused";
    info(`${error.message} The computer turn is paused; retry or end the round.`, true);
    $("retryComputer").hidden = false; render();
  }
}
function reject(result) {
  info(`${result.reason}: ${result.message}`, true);
  const start = requiredStart(game.chain.at(-1), game.rules);
  game.stats.missed[start] = (game.stats.missed[start] || 0) + 1;
  if (game.rules.mode === "sudden" || game.rules.mode === "relaxed" && result.reason === "invalid connection") finish(result.reason, result.message, game.turn);
}
function resolveWord(word) {
  const result = validateWord(word, game.chain.at(-1), game.chain, game.rules);
  if (!result.ok) { reject(result); return; }
  accept(word, result);
}
async function submit() {
  if (!humanTurn() || busy || expired()) return;
  const text = toKana($("wordInput").value.trim(), { IMEMode: false }).normalize("NFKC");
  $("wordInput").value = text;
  if (!text) { info("Enter a word first.", true); return; }
  if (game.rules.entry === "kana" && !/^[ぁ-ゖァ-ヶー]+$/.test(text)) {
    reject({ reason: "vocabulary rule", message: "Kana mode accepts hiragana or katakana only." }); return;
  }
  const endingError = wordEndingError(text, game.rules);
  if (endingError) {
    reject({ reason: "vocabulary rule", message: `${endingError} Choose a different word.` }); return;
  }
  if (!/^[\p{Script=Han}ぁ-ゖァ-ヶー]+$/u.test(text) || /[をヲ]/.test(text)) {
    reject({ reason: "vocabulary rule", message: "Use a Japanese dictionary word without spaces, punctuation, を or ヲ." }); return;
  }
  if (selected && checkedText === text) { resolveWord(selected); return; }
  const token = generation;
  busy = true; enableControls(); info("Checking the dictionary…");
  try {
    candidates = await roundWords(text);
    if (generation !== token || expired()) return;
    checkedText = text;
    if (candidates.length && kanjiChain(game.rules) && !(candidates = candidates.filter((word) => [...word.word].every(isKanji))).length) {
      reject({ reason: "vocabulary rule", message: "Kanji chains only accept words written entirely in kanji." }); return;
    }
    if (!candidates.length) { reject({ reason: "not in accepted vocabulary", message: "No exact dictionary spelling or reading was found, including the enabled fallback. Check your spelling." }); return; }
    const legal = candidates.filter((word) => validateWord(word, game.chain.at(-1), game.chain, game.rules).ok);
    if (!legal.length) { const { ok, ...result } = validateWord(candidates[0], game.chain.at(-1), game.chain, game.rules); reject(result); return; }
    candidates = legal;
    const requiresConfirmation = candidates.length > 1 || game.rules.entry === "kanji" && ![...text].some(isKanji);
    if (requiresConfirmation) {
      $("choices").innerHTML = `<p class="small">Pick the spelling and reading you mean; it is played right away.</p>${candidates.map((word, i) => `<button type="button" data-choice="${i}"><strong lang="ja">${escape(word.word)}</strong> · ${escape(word.reading)}<br><span class="small">${escape(word.meaning)} · ${word.level ? `N${word.level}` : "Unrated"}</span></button>`).join("")}`;
      info("Choose the dictionary entry below to play it.");
    } else {
      selected = candidates[0];
      resolveWord(selected);
    }
  } catch (error) { if (generation === token) info(error.message, true); }
  finally {
    if (generation === token) {
      busy = false; enableControls();
      if (humanTurn()) $("wordInput").focus();
      else if (game?.active) computerTurn();
    }
  }
}
function accept(word, result = validateWord(word, game.chain.at(-1), game.chain, game.rules)) {
  if (!game.active || !result.ok) return;
  generation++;
  busy = false;
  const player = game.players[game.turn];
  const points = scoreWord(word, game.chain.at(-1), game.rules, game.bonusKana);
  const played = { ...word, player: player.name, points };
  played.overlap = connection(word, game.chain.at(-1), game.rules);
  played.playerIndex = game.turn;
  game.chain.push(played);
  player.score += points.total;
  game.stats.words++;
  game.stats.unique.add(word.id);
  game.stats.longest = game.chain.length;
  if (!player.computer) game.humanWords++;
  if (!progress.known.includes(word.id)) { progress.known.push(word.id); persist(progressKey, progress); }
  renderChain(); showWord(played); speakJapanese(word.reading);
  info(`${word.word} · ${word.reading} — ${word.meaning.split(";")[0]}. +${points.total} points${points.overlapBonus ? ` (overlap +${points.overlapBonus})` : ""}${points.kanaBonus ? " (bonus kana +15)" : ""}.`);
  if (game.rules.mode === "daily" && game.humanWords >= 10) {
    finish("daily goal reached", "Ten valid human words — daily challenge complete!", null, true); return;
  }
  game.passes = 0;
  advanceTurn();
}
// Give the player time to hear the word just played before the computer answers.
function advanceTurn(preloaded = null) {
  game.turn = (game.turn + 1) % game.players.length;
  if (!game.players[game.turn].computer) { beginTurn(preloaded); return; }
  const token = generation;
  busy = true; enableControls();
  setTimeout(() => {
    if (generation !== token || !game?.active) return;
    busy = false; beginTurn(preloaded);
  }, 2200);
}
function pass() {
  if (!humanTurn() || busy || expired() || game.rules.mode === "daily") return;
  const player = game.players[game.turn];
  game.passes = (game.passes || 0) + 1;
  if (game.passes >= game.players.length) {
    finish("everyone passed", "Nobody could continue the chain, so the round ends without a loser.", null);
    return;
  }
  const preloaded = game.nextWords;
  info(`${player.name} passed. ${game.players[(game.turn + 1) % game.players.length].name} continues from the same word.`);
  advanceTurn(preloaded);
}
async function assist(reveal, automatic = false) {
  if (!humanTurn() || busy || expired()) return;
  const player = game.players[game.turn];
  if (reveal ? !assistAllowed(game.rules, player, "reveal") : game.rules.hints === "disabled" || game.rules.hints === "limited" && player.hints >= game.rules.hintLimit) return;
  const token = generation;
  busy = true; enableControls();
  try {
    const words = await nextWords();
    if (generation !== token || expired()) return;
    game.nextWords = words;
    if (!words.length) {
      finish("no available continuation", `No unused dictionary word matches ${requiredStart(game.chain.at(-1), game.rules)} and the active rules. The chain ends without a loser. Try broader filters for the next game.`, null);
      return;
    }
    const word = words[0];
    $("hintPanel").hidden = false;
    if (reveal) {
      game.stats.revealed++; player.reveals++;
      $("hintPanel").textContent = `${word.word} · ${word.reading} — ${word.meaning}`;
      $("wordInput").value = game.rules.entry === "kana" ? word.reading : word.word;
      checkedText = $("wordInput").value; selected = word;
      $("choices").replaceChildren();
    } else {
      player.hints++; game.stats.hints++;
      const categories = Object.keys(CATEGORIES).filter((c) => !["all", "nouns"].includes(c) && matchesCategory(word, c));
      const letters = [...word.reading];
      const partial = letters.map((c, i) => i === 0 || i === letters.length - 1 && letters.length > 2 ? c : "_").join(" ");
      const messages = [
        `First kana: ${word.reading[0]}`,
        `A possible word has ${morae(word.reading)} morae.`,
        `Category hint: ${categories.map((c) => CATEGORIES[c]).join(", ") || word.partOfSpeech || "general vocabulary"}.`,
        `Hidden reading: ${partial}`
      ];
      $("hintPanel").textContent = `${automatic ? "Beginner hint · " : ""}${messages[game.hintStep++ % messages.length]}`;
    }
    render();
  } catch (error) { if (generation === token) info(error.message, true); }
  finally { if (generation === token) { busy = false; enableControls(); if (humanTurn()) $("wordInput").focus(); } }
}
function finish(reason, explanation, loser = null, dailyGoal = false) {
  if (!game?.active) return;
  game.active = false; generation++; busy = false; game.deadline = 0;
  info("Round complete — see the results below.");
  clearInterval(timerHandle); $("timer").textContent = "Round ended"; $("choices").replaceChildren(); $("retryComputer").hidden = true;
  const dailyWin = game.rules.mode === "daily" && (dailyGoal || loser !== null && game.players[loser].computer);
  if (game.rankedDaily) {
    if (dailyWin) {
      progress.daily.streak = progress.daily.last === previousDay(game.dailyDate) ? progress.daily.streak + 1 : 1;
      progress.daily.last = game.dailyDate;
    } else progress.daily.streak = 0;
    persist(progressKey, progress);
  }
  const title = dailyWin ? "Daily challenge complete!" : loser === null ? "A chain worth remembering" : game.players.length === 1 ? "Round lost" : game.players[loser].computer ? "You win!" : `${game.players[loser].name} ${game.players[loser].name === "You" ? "lose" : "loses"}`;
  const winners = loser === null ? "" : game.players.filter((_, i) => i !== loser).map((p) => p.name).join(", ");
  const discoveries = game.chain.filter((word, i, list) => !game.knownBefore.has(word.id) && list.findIndex((w) => w.id === word.id) === i);
  const missed = Object.entries(game.stats.missed).sort((a, b) => b[1] - a[1]).map(([k, count]) => `${escape(k)} (${count})`).join(" · ");
  $("results").innerHTML = `<span class="eyebrow">${escape(reason)}</span><h2>${title}</h2><p>${escape(explanation)}${winners ? ` Winner${game.players.length > 2 ? "s" : ""}: ${escape(winners)}.` : ""}</p><p class="small">${game.stats.words} words played · ${game.stats.unique.size} unique words · longest chain ${game.stats.longest}<br>${game.stats.hints} hints · ${game.stats.revealed} reveals${missed ? `<br>Starting kana to practice: ${missed}` : ""}</p><h3>New Word Discovery</h3><p class="small">${discoveries.length ? "New words encountered this round. Tap one to revisit it and save it for later." : "You revisited familiar words this round. That counts as practice, too."}</p><div class="discovery-list">${discoveries.map((word) => `<button type="button" data-player="${word.playerIndex === undefined ? "starter" : word.playerIndex % 6}" data-word-index="${game.chain.indexOf(word)}"><strong>${escape(word.word)}</strong>${escape(word.reading)}<br><span class="small">${escape(word.meaning.split(";")[0])}</span></button>`).join("")}</div>`;
  $("results").hidden = false; render(); $("results").focus();
}

async function showWord(word) {
  detailWord = word;
  const token = ++detailGeneration;
  $("detailBody").innerHTML = `<div class="detail-word">${japaneseHTML(word.word, word.reading)}${audioHTML(word.reading)}</div><div class="detail-reading" lang="ja">${escape(word.reading)} ${audioHTML(word.reading)}</div><div class="detail-tags"><span class="tag">${word.level ? `N${word.level}` : "Unrated"}</span><span class="tag">${morae(word.reading)} morae</span><span class="tag">${escape(word.partOfSpeech || "Part of speech unavailable")}</span></div><p>${escape(word.meaning)}</p><div class="kanji-buttons">${[...new Set([...word.word].filter(isKanji))].map((character) => `<button type="button" data-kanji="${character}" aria-label="Explore kanji ${character}">${character}</button>`).join("")}</div><div id="wordExample" class="small">Loading an example…</div><button type="button" id="saveWord">＋ Save to review</button><p class="small" style="margin-top:12px">${escape(word.source)} · <a href="https://www.edrdg.org/edrdg/licence.html" target="_blank" rel="noopener">Dictionary credits</a></p>`;
  $("saveWord").addEventListener("click", () => {
    if (!progress.review.some((item) => item.word === word.word && item.reading === word.reading)) {
      progress.review.push({ ...word, examples: exampleCache.get(`${word.word}:${word.reading}`) || word.examples || [] });
      persist(progressKey, progress);
    }
    $("saveWord").textContent = "✓ Saved to review"; render();
  });
  const key = `${word.word}:${word.reading}`;
  const initial = exampleCache.get(key) || word.examples?.filter((e) => e.japanese?.includes(word.word) || e.japanese?.includes(word.reading));
  const examples = await mountSentenceExamples($("wordExample"), word.word, initial);
  if (detailGeneration === token && examples.length) exampleCache.set(key, examples);
}
let kanjiRequest = 0;
async function showKanji(character) {
  const token = ++kanjiRequest;
  $("kanjiTitle").textContent = `${character} · Kanji details`;
  $("kanjiBody").textContent = "Loading kanji…";
  if (!$("kanjiDialog").open) $("kanjiDialog").showModal();
  try {
    const word = await api(`/api/kanji/${encodeURIComponent(character)}`);
    if (token !== kanjiRequest) return;
    $("kanjiBody").innerHTML = `<div class="detail-word" lang="ja">${escape(character)}</div><p>${escape(word.meanings.join("; "))}</p><h3>On’yomi</h3><p>${readingsHTML(word.on_readings) || "No on’yomi listed."}</p><h3>Kun’yomi</h3><p>${readingsHTML(word.kun_readings) || "No kun’yomi listed."}</p><h3>Example words</h3>${word.examples.map((item) => `<p>${japaneseHTML(item.word, item.reading)} ${audioHTML(item.reading)}<br><span class="small">${escape(item.meanings.join("; "))}</span></p>`).join("") || "<p>No examples available.</p>"}`;
  } catch (error) { if (token === kanjiRequest) $("kanjiBody").textContent = error.message; }
}
function renderReview() {
  $("reviewBody").innerHTML = progress.review.length ? `<p class="small">Saved on this browser. Export or import your list in Settings.</p>${progress.review.map((word, i) => `<div class="score-row"><span>${japaneseHTML(word.word, word.reading)}${audioHTML(word.reading)}<br><span class="small">${escape(word.meaning)}</span></span><button type="button" data-remove-review="${i}" aria-label="Remove ${escape(word.word)} from review">Remove</button></div>`).join("")}` : "<p>No saved words yet. Play a word, then choose Save to review in the word notebook.</p>";
}
$("reviewButton").addEventListener("click", () => { renderReview(); $("reviewDialog").showModal(); });
$("reviewBody").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-review]");
  if (!button) return;
  progress.review.splice(Number(button.dataset.removeReview), 1); persist(progressKey, progress); renderReview(); render();
});
$("exportReview").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ version: 1, words: progress.review }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a"); link.href = url; link.download = `shiritori-review-${today()}.json`; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("importReview").addEventListener("click", () => $("reviewFile").click());
$("reviewFile").addEventListener("change", async () => {
  const file = $("reviewFile").files[0];
  if (!file) return;
  try {
    if (file.size > 5_000_000) throw new Error("Review files must be smaller than 5 MB.");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.words) || data.words.length > 5000
        || data.words.some((w) => !w || !["word", "reading", "meaning"].every((key) => typeof w[key] === "string" && w[key].length > 0 && w[key].length <= (key === "meaning" ? 5000 : 100))
          || !/^[ぁ-ゖー]+$/.test(kana(w.reading)))) throw new Error("Invalid review file. Import a Shiritori review export with valid words, readings and meanings.");
    const merged = [...progress.review];
    for (const word of data.words) if (!merged.some((w) => w.word === word.word && w.reading === word.reading)) {
      merged.push({ word: word.word, reading: word.reading, meaning: word.meaning, source: typeof word.source === "string" ? word.source : "Imported review" });
    }
    progress.review = merged; persist(progressKey, progress); render(); showSettingsError(`Imported ${data.words.length} entries (duplicates merged).`);
  } catch (error) { showSettingsError(error.message); }
  $("reviewFile").value = "";
});
$("resetProgress").addEventListener("click", async () => {
  if (game?.active) { showSettingsError("End the current round before resetting progress."); return; }
  if (!await confirmAction("Clear all discoveries, saved review words and daily progress on this browser?", { confirmLabel: "Delete progress" })) return;
  progress = { known: [], review: [], daily: { last: "", streak: 0, attempted: "" } };
  persist(progressKey, progress); render(); showSettingsError("Progress reset.");
});
$("newGame").addEventListener("click", startGame);
$("stopGame").addEventListener("click", () => finish("round stopped", "You ended this round. No winner or loser is declared.", null));
$("wordForm").addEventListener("submit", (event) => { event.preventDefault(); if (!event.isComposing) submit(); });
$("wordInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
$("wordInput").addEventListener("input", () => { selected = null; checkedText = ""; $("choices").replaceChildren(); });
$("hintButton").addEventListener("click", () => assist(false));
$("passButton").addEventListener("click", pass);
$("revealButton").addEventListener("click", () => assist(true));
$("retryComputer").addEventListener("click", () => {
  if (game.rules.mode === "timed") { game.deadline = Date.now() + game.rules.timer * 1000; timerHandle = setInterval(deadlineTick, 200); }
  computerTurn();
});
$("choices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-choice]");
  if (!button || !humanTurn() || expired()) return;
  selected = candidates[Number(button.dataset.choice)];
  $("choices").replaceChildren();
  resolveWord(selected, false);
  if (humanTurn()) $("wordInput").focus();
});
function exploreWord(event) {
  const button = event.target.closest("[data-word-index]");
  if (!button || !game) return;
  const word = game.chain[Number(button.dataset.wordIndex)];
  if (event.type !== "click" && detailWord === word) return;
  showWord(word);
}
for (const id of ["chain", "results"]) {
  $(id).addEventListener("click", exploreWord);
  $(id).addEventListener("focusin", exploreWord);
  $(id).addEventListener("pointerover", (event) => { if (event.pointerType === "mouse") exploreWord(event); });
}
$("detailBody").addEventListener("click", (event) => {
  const button = event.target.closest("[data-kanji]");
  if (button) showKanji(button.dataset.kanji);
});
window.addEventListener("pagehide", () => { generation++; detailGeneration++; clearInterval(timerHandle); });
document.addEventListener("visibilitychange", deadlineTick);
render();
