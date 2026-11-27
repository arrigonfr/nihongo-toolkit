import { escapeHTML as escape } from "./html.js";
import { READING_ENDING_RULE } from "../../backend/src/shiritori-rules.js";
import { JAPANESE_FONTS } from "./japanese-fonts.js";

export const modes = {
  classic: "Classic",
  relaxed: "Relaxed",
  timed: "Timed",
  sudden: "Sudden Death",
  kanji: "Kanji Shiritori",
  katakana: "Katakana Challenge",
  beginner: "Beginner",
  marathon: "Marathon"
};

export const modeDescriptions = {
  classic: "Build a chain by connecting each word to the previous word's ending.",
  relaxed: "No timer and unlimited hints and reveals. An invalid connection still ends the round.",
  timed: "Play a valid word before the turn countdown expires.",
  sudden: "Any invalid play ends the round with a loss.",
  kanji: "Connect words using kanji, rather than kana endings.",
  katakana: "Use words written in katakana.",
  beginner: "Words up to four morae, unlimited hints and furigana.",
  marathon: "Build a long chain and earn extra points as it grows."
};

const tip = (description) => description ? ` data-setting-description="${escape(description)}"` : "";
function selectSetting(key, label, options, description, noHelp = false) {
  return `<div class="setting"><div class="setting-title"><label for="setting-${key}"${tip(description)}>${label}</label></div><select id="setting-${key}" data-setting="${key}"${noHelp ? " data-no-setting-help" : ""}>${Object.entries(options).map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></div>`;
}
function numberSetting(key, label, min, max, description, noHelp = false) {
  return `<div class="setting"><div class="setting-title"><label for="setting-${key}"${tip(description)}>${label}</label></div><input id="setting-${key}" data-setting="${key}" type="number" min="${min}" max="${max}" step="1" required${noHelp ? " data-no-setting-help" : ""}></div>`;
}
function checkboxSetting(key, label, description, noHelp = false) {
  return `<div class="setting check"><label class="check-label" for="setting-${key}"${tip(description)}><input id="setting-${key}" data-setting="${key}" type="checkbox"${noHelp ? " data-no-setting-help" : ""}>${label}</label></div>`;
}

function settingsMarkup() {
  return `<p class="small">Valid settings save automatically and apply to your next game. The top reading, audio and appearance controls stay live.</p>
  <form id="settingsForm">
  <div class="mode-pills" id="modePills" role="group" aria-label="Game mode">${Object.entries(modes).map(([key, label]) => `<button class="mode-pill" type="button" data-mode="${key}" data-setting-description="${escape(modeDescriptions[key])}" aria-pressed="false">${label}</button>`).join("")}</div>
  <fieldset class="settings-section" id="gameSettings"><legend>Game</legend><div class="settings-grid">
  <input type="hidden" id="setting-mode" data-setting="mode">
  ${selectSetting("opponent", "Play against", { computer: "Computer", local: "Local players / solo" }, "Computer alternates with you. Local mode supports one learner or up to six players sharing this device.")}
  ${numberSetting("players", "Local players", 1, 6, "Number of players taking turns on this device. Ignored when playing the computer. A losing move ends the round for everyone.")}
  ${selectSetting("timer", "Seconds per turn", { 10: "10 seconds", 20: "20 seconds", 30: "30 seconds", 60: "60 seconds" }, "Only Timed mode uses a countdown. It includes checks, hints, dictionary requests and time in dialogs. Other modes have no timer.")}
  </div></fieldset>
  <fieldset class="settings-section"><legend>Scoring and rules</legend><div class="settings-grid">
  ${checkboxSetting("voicing", "Allow voiced / unvoiced variation", "Treat か / が and は / ば / ぱ as equivalent at the connection. Off by default. Does not affect kanji connections.")}
  ${checkboxSetting("bonus", "Bonus points", "A single final kana earns no overlap bonus. Start with two or more trailing syllables (or kanji) for +5 per extra unit, without reusing the whole previous word.")}
  ${checkboxSetting("bonusKana", "Bonus kana", "Every third accepted move offers a bonus kana. Include it anywhere in your new accepted word for +15 points, independently of overlap bonuses.")}
  </div></fieldset>
  <fieldset class="settings-section help-section"><legend>Help during play</legend><div class="help-pair">
  <fieldset class="help-group" id="hintSettings"><legend>Hints</legend><div class="settings-grid">
  ${selectSetting("hints", "Hint availability", { limited: "Limited per player", unlimited: "Unlimited", disabled: "Disabled" }, "", true)}
  ${numberSetting("hintLimit", "Hints per player", 0, 30, "", true)}
  </div></fieldset>
  <fieldset class="help-group" id="revealSettings"><legend>Reveal answer</legend><div class="settings-grid">
  ${checkboxSetting("reveal", "Allow Reveal Answer", "", true)}
  ${numberSetting("revealLimit", "Reveals per player", 0, 30, "", true)}
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
    <button id="resetProgress" type="button" data-setting-description="Permanently clear discoveries and the review list on this browser, after confirmation. Game statistics reset whenever you start a new game.">Reset progress</button>
    <input id="reviewFile" type="file" accept="application/json,.json" hidden>
  </div>`;
}

export function renderShiritoriShell(root) {
  root.innerHTML = `<div class="shell">
  <header><div class="brand"><span class="brand-mark" aria-hidden="true"><img src="/tool-icons/shiritori.webp" alt=""></span><span class="brand-name">Shiritori<span class="brand-note">NihongoToolkit</span></span></div><button id="themeButton" type="button" aria-label="Toggle light and dark mode">◐</button></header>
  <section class="intro"><span class="eyebrow"><span lang="ja">しりとり</span> · <span>Word chain</span></span>
        <h1>Follow the last sound. <br><span>Find the next word.</span> <button id="helpButton" class="help-button" type="button" aria-label="How to play Shiritori">?</button></h1><p>One word leads to another. Follow the last sound, discover new words, and see how far your Japanese can take you.</p></section>
  <details id="settingsPanel" class="card game-settings" open><summary>Game settings</summary><div class="settings-body">${settingsMarkup()}</div></details>
  <div class="toolbar"><span id="modeBadge" class="tag">Classic · vs. computer</span><button id="reviewButton" type="button">Review list <span id="reviewCount">0</span></button><button id="newGame" class="primary" type="button">Start game →</button></div>
  <p id="startError" class="feedback start-error" role="alert" hidden></p>
  <div class="layout"><main class="main-column">
    <section class="card" aria-label="Current turn">
      <div class="turn-strip"><span id="turnLabel"><span class="turn-dot"></span>Ready when you are</span><span id="timer" class="timer" aria-label="Time remaining">No timer</span></div>
      <div class="prompt"><div><span class="eyebrow">Previous word</span><div id="previousWord" class="previous-word" lang="ja">しりとり</div><span id="previousReading" class="small">Start a new chain</span></div><span class="connection-arrow" aria-hidden="true">→</span><div class="required-wrap"><span class="eyebrow">Your word can start with:</span><ul id="startOptions" class="start-options" lang="ja"></ul></div></div>
      <form id="wordForm"><label class="entry-label" for="wordInput">Keep the chain going</label><div class="entry-row"><input id="wordInput" lang="ja" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="60" placeholder="Type a Japanese word…" disabled aria-describedby="entryNote feedback"><button id="playWord" class="primary" type="submit" disabled>Play ↵</button></div><p class="entry-note small" id="entryNote">Romaji converts to kana as you type. You can also use a Japanese keyboard.</p></form>
      <div class="actions" data-i18n-scope><button id="hintButton" type="button" disabled>Hint</button><button id="revealButton" type="button" disabled>Reveal Answer</button><button id="passButton" type="button" disabled>Pass</button><button id="retryComputer" type="button" hidden>Retry computer turn</button><button id="stopGame" type="button" hidden>End round</button></div>
      <div id="feedback" class="feedback" role="status" aria-live="polite"></div><div id="choices" class="candidates"></div><div id="hintPanel" class="feedback" role="status" hidden></div>
    </section>
    <section id="results" class="card results" tabindex="-1" hidden></section>
    <section class="card"><div class="card-heading"><h2>The word chain</h2><span id="chainCount" class="tag">0 words</span></div><ol id="chain" class="chain"></ol><div id="chainEmpty" class="empty-state"><span class="empty-icon" lang="ja">言葉をつなごう</span>Your first connection is waiting.<br><span class="small">Every word is a chance to learn something new.</span></div></section>
  </main><aside class="sidebar">
    <section class="card"><div class="card-heading"><h2>This round</h2></div><div id="scores" class="muted">A fresh chain, a fresh start.</div><div id="stats" class="stats"></div><p id="bonusLabel" class="small" style="margin:16px 0 0">N5 → 10 pts · N1 → 50 pts</p></section>
    <section class="card" id="wordDetails"><div class="card-heading"><h2>Word notebook</h2><span class="small">Learn as you play</span></div><div id="detailBody" class="muted">Tap or hover over a played word to explore its reading, meaning, and an example. Tap an individual kanji for a closer look.</div></section>
    <section class="card rule-note"><h2>A small reminder</h2><p id="ruleSummary"></p><p class="small">Small kana stay with their syllable (しょ → しょ…). Longer overlaps earn bonus points. Prefer a gentler chain? Try Beginner in Settings.</p></section>
  </aside></div>
  <footer><span>Little connections. Lasting vocabulary.</span><a href="./data-sources.html" target="_blank" rel="noopener">Dictionary &amp; sentence credits ↗</a></footer>
  <dialog id="helpDialog" aria-labelledby="helpTitle"><div class="dialog-head"><h2 id="helpTitle">A word game that keeps you learning</h2><button class="close" data-close type="button" aria-label="Close help">×</button></div><div class="dialog-body">
    <div class="help-example" lang="ja">りんご → ごりら → らっぱ</div>
    <p><strong>Shiritori means “taking the tail”.</strong> Start your word with the last syllable of the previous word, or with more of it: the last two or three syllables, or its last kanji or kanji compound. The answer must be longer than the overlap, so it can never begin with the entire previous word. Small kana stay attached (しょ needs しょ, and しょう works). Hiragana and katakana are equivalent. Submit with Enter or Play. Words ending in <strong>ん / ン</strong> and the particle <strong>を / ヲ</strong> are not accepted. Stuck? Use <strong>Pass</strong> to skip your turn; if everyone passes in a row, the round ends.</p>
    <h3>Play your way</h3><p>Play the computer, practice alone, or share this device with up to six local players. Classic retries invalid entries. Sudden Death loses on any invalid submission. Relaxed has unlimited hints and reveals and no timer: an invalid connection ends the round. Timed includes dictionary-check time. Beginner caps words at four morae and enables furigana. Marathon adds points for every word.</p>
    <p>Katakana Challenge uses words written in katakana. Advanced Kanji Shiritori only accepts overlaps made of the last kanji or kanji compound.</p>
    <h3>Make the rules yours</h3><p>Choose a game mode, assistance and scoring options. Conjugated verbs and adjectives are accepted. Romaji converts as you type; pick the right spelling when a reading is ambiguous. Kanji Shiritori accepts a typed reading after you confirm its spelling.</p>
    <p>For kanji chains: ${escape(READING_ENDING_RULE)} Dictionary readings are checked even when you type kanji. A long-vowel mark inside a word is fine, as in ケーキ. Outside Kanji Shiritori, a final ー stays attached to its syllable (コーヒー requires ヒー). Repeated words and words ending in ん / ン are never accepted. You can allow voiced/unvoiced pairs. No available dictionary continuation ends the round with an explanation, not an invented word.</p>
    <h3>Learn, don’t just guess</h3><p>Hints cycle through first kana, morae and a hidden reading; Reveal gives a legal word and meaning. Hover, focus or tap chain words to explore them. Kanji buttons show meanings, on’yomi, kun’yomi and compounds. Audio uses an installed Japanese device voice. Sentence availability depends on the dictionary and Tatoeba.</p>
    <h3>Points &amp; progress</h3><p>N5 / N4 / N3 / N2 / N1 earn 10 / 20 / 30 / 40 / 50 points. Unrated words earn 10 and appear only in All. Bonus kana earns 15; extra overlap earns 5 per additional syllable or character. Marathon adds 5 per valid word. Statistics reset for each new game. Save words to a local review list and export/import it in Settings.</p>
    <p class="small">JLPT levels are community estimates. Categories are approximate dictionary-gloss filters. Name coverage is limited to dictionary entries, not an exhaustive list of famous people. Unknown submissions may be sent to the optional Jisho fallback; example lookups may use Tatoeba. Provider errors are shown and are never treated as proof that a word is invalid.</p>
  </div></dialog>
  <dialog id="kanjiDialog" aria-labelledby="kanjiTitle"><div class="dialog-head"><h2 id="kanjiTitle">Kanji details</h2><button class="close" data-close type="button" aria-label="Close kanji details">×</button></div><div class="dialog-body" id="kanjiBody"></div></dialog>
  <dialog id="reviewDialog" aria-labelledby="reviewTitle"><div class="dialog-head"><h2 id="reviewTitle">Your review list</h2><button class="close" data-close type="button" aria-label="Close review list">×</button></div><div class="dialog-body" id="reviewBody"></div></dialog>
</div>`;
}
