import "./crossword.css";
import { mountGameExport } from "./game-export.js";
import { mountChips } from "./chips.js";
import { groupSettings, setSettingAvailability } from "./settings-panel.js";
import { mountStudyControls, study, speakJapanese } from "./study-controls.js";
import { alignFuriganaRuby } from "./furigana.js";
import { API_BASE, fetchItems } from "./api.js";
import { romanizeKana } from "./romanize.js";
import { convertTypedRomaji, hasLatin, matchExpectedAnswer, romajiToKana, toHiragana, toKatakana } from "./kana-input.js";
import { mountSentenceExamples } from "./examples.js";
import {
  THEMES,
  PUZZLE_SIZES,
  matchesTheme,
  hasKanji,
  generateCrossword
} from "./crossword-engine.js";

(() => {
  "use strict";

  const STORAGE_KEYS = {
    settings: "nihon:crossword-settings-v1",
    stats: "nihon:crossword-stats-v1"
  };
  let storageWarning = "";

  function reportStorageError(message, error) {
    console.warn(message, error);
    storageWarning = message;
    const banner = document.getElementById("settingsStorageError");
    if (banner) {
      banner.textContent = message;
      banner.hidden = false;
    }
  }

  const GAME_MODES = {
    classic: { label: "Classic Mode", desc: "Standard crossword with clues and a timer." },
    relaxed: { label: "Relaxed Mode", desc: "No timer, unlimited hints, and no pressure." },
    daily: { label: "Daily Challenge", desc: "One new deterministic puzzle per day with a streak counter." },
    timed: { label: "Timed Challenge", desc: "Complete the puzzle before the countdown runs out." },
    suddenDeath: { label: "Sudden Death", desc: "Any incorrect character or submitted answer ends the round immediately." },
    kanjiChallenge: { label: "Kanji Challenge", desc: "Use words containing kanji, including their kana endings, rather than kana-only answers." },
    kanaChallenge: { label: "Kana Challenge", desc: "Answers are entered in kana, one character per square." },
    reverse: { label: "Reverse Mode", desc: "Clues show Japanese words; enter English meanings in the grid." }
  };

  const LEVEL_OPTIONS = [
    { value: "5", label: "N5 (Beginner)" },
    { value: "4", label: "N4 (Elementary)" },
    { value: "3", label: "N3 (Intermediate)" },
    { value: "2", label: "N2 (Pre-Advanced)" },
    { value: "1", label: "N1 (Advanced)" },
    { value: "5-4", label: "N5–N4 Range" },
    { value: "4-3", label: "N4–N3 Range" },
    { value: "3-2", label: "N3–N2 Range" },
    { value: "3-1", label: "N3–N1 Range" },
    { value: "all", label: "All JLPT (N5–N1)" }
  ];

  const defaultSettings = () => ({
    gameMode: "classic",
    answerMode: "kana", // "kana" | "kanji" | "both"
    level: "5",
    size: "medium", // "small" | "medium" | "large" | "custom"
    customGridSize: 11,
    customWords: 10,
    themeCategory: "all",
    fontScale: "medium", // "small" | "medium" | "large" | "xlarge"
    furigana: true,
    romanization: false,
    audio: true,
    kanjiFocus: false,
    checkAvailability: "unlimited", // "unlimited" | "limited" | "disabled"
    revealAvailability: "unlimited", // "unlimited" | "limited" | "disabled"
    hintLimit: 5,
    timedLimitMinutes: 5,
    layoutDirection: "ltr", // "ltr" | "rtl"
    inputStyle: "popup" // "popup" | "cell" | "clues"
  });

  const defaultStats = () => ({
    puzzlesCompleted: 0,
    wordsCorrect: 0,
    wordsRevealed: 0,
    dailyStreak: 0,
    lastDailyDate: "",
    recentWordIds: [] // recently used word IDs / words to avoid repeating crosswords
  });

  function loadJSON(key, fallbackFn) {
    try {
      const raw = localStorage.getItem(key);
      const merged = raw ? { ...fallbackFn(), ...JSON.parse(raw) } : fallbackFn();
      if (merged.inputStyle && !["popup", "cell", "clues"].includes(merged.inputStyle)) {
        merged.inputStyle = "popup";
      }
      if (merged.gameMode && !GAME_MODES[merged.gameMode]) {
        merged.gameMode = "classic";
      }
      return merged;
    } catch (error) {
      reportStorageError("Saved crossword settings or progress could not be restored. Defaults are in use.", error);
      return fallbackFn();
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      reportStorageError("Your browser could not save crossword settings or progress. Changes may be lost when you leave.", error);
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (ch) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
    ));
  }

  const state = {
    settings: loadJSON(STORAGE_KEYS.settings, defaultSettings),
    stats: loadJSON(STORAGE_KEYS.stats, defaultStats),
    poolCache: new Map(),
    kanjiCache: new Map(),
    puzzle: null,
    activeEntryId: null,
    activeCell: { row: 0, col: 0 },
    preferredDir: "across",
    squareDraft: null,
    popoverOpen: false,
    popoverError: "",
    clueErrors: {},
    inspectedEntryId: null,
    inspectedKanjiChar: null,
    hintsUsed: 0,
    checksUsed: 0,
    revealsUsed: 0,
    roundEnded: false,
    roundWon: false,
    timerSeconds: 0,
    timerHandle: null,
    loading: false,
    feedback: { text: "", tone: "" }
  };

  const root = document.getElementById("crosswordRoot");
  const pendingSettings = { ...state.settings };

  function effectiveAnswerMode(settings = state.settings) {
    const gm = settings.gameMode;
    if (gm === "kanjiChallenge") return "kanji";
    if (gm === "kanaChallenge") return "kana";
    if (gm === "reverse") return "reverse";
    return settings.answerMode;
  }

  function isTimerActive() {
    const gm = state.settings.gameMode;
    if (gm === "relaxed") return false;
    return true;
  }

  function applyAppearance() {
    document.documentElement.dataset.fontScale = state.settings.fontScale || "medium";
    document.getElementById("cwWorkspace").dataset.layout = state.settings.layoutDirection;
  }


  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds));
    const mins = String(Math.floor(s / 60)).padStart(2, "0");
    const secs = String(s % 60).padStart(2, "0");
    return `${mins}:${secs}`;
  }

  function renderShell() {
    root.innerHTML = `
      <div class="cw-shell">
        <header class="cw-header">
          <a class="cw-brand" href="#top" id="brandLink" aria-label="Pazuru Japanese Crossword">
            <span class="cw-brand-mark" aria-hidden="true">謎</span>
            <span class="cw-brand-name">Pazuru<span class="cw-brand-note">at NihongoToolkit</span></span>
          </a>
            <button class="cw-icon-btn" id="themeCycleBtn" type="button" aria-label="Switch appearance theme">◐</button>
        </header>

        <main>
          <section class="cw-intro">
            <p class="cw-eyebrow">Interactive Vocabulary & Kanji Grid</p>
            <h1>Cross paths with Japanese words.</h1>
            <p id="modeDescriptionText"></p>
          </section>

          <section class="cw-top-card ui-panel" aria-label="Game mode and puzzle configuration">
            <p class="study-settings-note">Settings save automatically and apply to your next puzzle. The top reading, audio and appearance controls stay live.</p>
            <div class="cw-mode-pills" id="modePills" role="group" aria-label="Game modes">
              ${Object.entries(GAME_MODES).map(([key, info]) => `
                <button class="cw-mode-pill" type="button" data-mode="${key}" aria-pressed="${state.settings.gameMode === key}">
                  ${escapeHTML(info.label)}
                </button>
              `).join("")}
            </div>

            <div class="cw-quick-controls">
              <div class="settings-row has-level">
                <label class="cw-field">
                  <span>Answer mode</span>
                  <select class="cw-select" id="answerModeSelect">
                    <option value="kana">Kana</option>
                    <option value="kanji">Kanji</option>
                    <option value="both">Both</option>
                  </select>
                </label>

                <label class="cw-field">
                  <span>JLPT level / range</span>
                  <select class="cw-select" id="levelSelect">
                    ${LEVEL_OPTIONS.map((opt) => `<option value="${opt.value}">${escapeHTML(opt.label)}</option>`).join("")}
                  </select>
                </label>
              </div>

              <div class="settings-grid">
                <label class="cw-field">
                  <span>Puzzle size</span>
                  <select class="cw-select" id="sizeSelect">
                    ${Object.entries(PUZZLE_SIZES).map(([key, val]) => `<option value="${key}">${escapeHTML(val.label)}</option>`).join("")}
                  </select>
                </label>

                <label class="cw-field" id="customWordsField" hidden>
                  <span>Custom target words (4–18)</span>
                  <input class="cw-input" id="customWordsInput" type="number" min="4" max="18" value="10">
                </label>

                <label class="cw-field">
                  <span>Theme category</span>
                  <select class="cw-select" id="themeSelect">
                    ${Object.entries(THEMES).map(([key, val]) => `<option value="${key}">${escapeHTML(val.label)} · ${escapeHTML(val.ja)}</option>`).join("")}
                  </select>
                </label>
              </div>
            </div>

            <div class="cw-feedback-banner error" id="settingsStorageError" role="alert"${storageWarning ? "" : " hidden"}>${escapeHTML(storageWarning)}</div>
            <details class="cw-settings" id="settingsDrawer">
              <summary>Settings & study customization</summary>
              <div class="cw-settings-grid settings-grid">
                <label class="cw-field">
                  <span>Character & grid size</span>
                  <select class="cw-select" id="fontScaleSelect">
                    <option value="small">Compact · 38px cells</option>
                    <option value="medium">Standard · 46px cells</option>
                    <option value="large">Large · 54px cells</option>
                    <option value="xlarge">Extra large · 62px cells</option>
                  </select>
                </label>

                <label class="cw-field">
                  <span>Check Answer availability</span>
                  <select class="cw-select" id="checkAvailSelect">
                    <option value="unlimited">Unlimited checks</option>
                    <option value="limited">Limited checks</option>
                    <option value="disabled">Disabled (Challenge)</option>
                  </select>
                </label>

                <label class="cw-field">
                  <span>Reveal Answer availability</span>
                  <select class="cw-select" id="revealAvailSelect">
                    <option value="unlimited">Unlimited reveals</option>
                    <option value="limited">Limited reveals</option>
                    <option value="disabled">Disabled (Challenge)</option>
                  </select>
                </label>

                <label class="cw-field">
                  <span>Hint limit (when limited)</span>
                  <input class="cw-input" id="hintLimitInput" type="number" min="1" max="50" value="5">
                </label>

                <label class="cw-field">
                  <span>Timed challenge minutes</span>
                  <input class="cw-input" id="timedMinutesInput" type="number" min="1" max="60" value="5">
                </label>

                <label class="cw-field">
                  <span>Clue panel layout</span>
                  <select class="cw-select" id="layoutDirSelect">
                    <option value="ltr">Left-to-right (Grid left, Clues right)</option>
                    <option value="rtl">Right-to-left (Clues left, Grid right)</option>
                  </select>
                </label>

                <label class="cw-field">
                  <span>Grid input style</span>
                  <select class="cw-select" id="inputStyleSelect">
                    <option value="popup">Clue popup</option>
                    <option value="cell">In-square</option>
                    <option value="clues">Clue list textboxes</option>
                  </select>
                </label>

                <div class="cw-toggle-group">
                  <label class="cw-switch"><input type="checkbox" id="kanjiFocusToggle"><span><strong>Use Kanji meanings &amp; readings as clues</strong></span></label>
                  <fieldset class="cw-reset-setting"><legend>Fresh start</legend><small>Clear this puzzle’s stats</small><div class="cw-reset-actions"><button class="cw-btn" id="resetProgressBtn" type="button">Reset stats</button><span class="cw-reset-slot" data-reset-slot></span></div></fieldset>
                </div>
              </div>
            </details>
            <div class="cw-actions-row"><button class="cw-btn primary" id="newPuzzleBtn" type="button">New puzzle</button></div>
            <div class="cw-feedback-banner error" id="startError" role="alert" hidden></div>
          </section>

          <section class="cw-empty" id="cwEmpty"><span class="cw-empty-mark" lang="ja" aria-hidden="true">パズル</span><h2>Ready when you are</h2><p>Pick your settings above, then start a game to see your crossword, clues and progress here.</p><button class="cw-btn primary" id="startGameBtn" type="button">Start a game →</button></section>

          <section class="cw-status-bar" hidden aria-label="Puzzle status and assistance">
            <div class="cw-metrics">
              <div class="cw-metric"><strong id="progressMetric">0 / 0</strong><span>words solved</span></div>
              <div class="cw-metric" id="timerMetricWrap"><strong id="timerMetric">00:00</strong><span id="timerLabel">elapsed</span></div>
              <div class="cw-metric"><strong id="hintsMetric">0</strong><span id="hintsLabel">hints used</span></div>
              <div class="cw-metric"><strong id="streakMetric">0</strong><span>daily streak</span></div>
            </div>

            <div class="cw-assist-actions">
              <button class="cw-btn" id="revealPuzzleBtn" type="button">Reveal puzzle</button>
            </div>
          </section>

          <div class="cw-workspace" id="cwWorkspace" data-layout="ltr" hidden>
            <section class="cw-board-panel" aria-label="Crossword grid">
              <div class="cw-active-clue-bar" id="activeClueBar">
                <div class="cw-active-clue-main">
                  <div>
                    <span class="cw-active-clue-id" id="activeClueBadge">—</span>
                    <span class="cw-active-clue-text" id="activeClueText">Generating crossword…</span>
                  </div>
                  <div class="cw-active-clue-sub" id="activeClueSub"></div>
                </div>
                <button class="cw-btn" id="flipDirBtn" type="button" title="Switch Across / Down direction (Tab or Space)">⇄ Direction</button>
              </div>

              <div class="cw-grid-scroll" id="gridScrollWrap">
                <div class="cw-grid-stage" id="gridStage">
                  <div class="cw-grid" id="crosswordGrid" role="grid" aria-label="Japanese vocabulary crossword grid"></div>
                  <div class="cw-cell-popover" id="gridCluePopover" role="dialog" aria-label="Active word clue and answer box" hidden></div>
                </div>
              </div>

              <div class="cw-feedback-banner" id="feedbackBanner" role="status" aria-live="polite" hidden></div>
            </section>

            <section class="cw-clues-panel" aria-label="Crossword clues">
              <div class="cw-clues-columns">
                <div class="cw-clue-group">
                  <h2>Across · ヨコ</h2>
                  <ol class="cw-clue-list" id="acrossClueList"></ol>
                </div>
                <div class="cw-clue-group">
                  <h2>Down · タテ</h2>
                  <ol class="cw-clue-list" id="downClueList"></ol>
                </div>
              </div>
            </section>
          </div>

          <section class="cw-study-panel" id="studyInspector" aria-label="Completed word and kanji study details">
            <div class="cw-study-header">
              <h2>Word & Kanji Study Inspector · 学習カード</h2>
              <span class="cw-badge" id="studyHintLabel">Hover, tap, or complete any word to inspect definitions, examples & kanji</span>
            </div>
            <div id="studyInspectorBody"></div>
          </section>

          <section class="cw-stats-panel" aria-label="Crossword statistics">
            <div class="cw-study-header">
              <h2>Stats · 記録</h2>
            </div>
            <div class="cw-stats-cards">
              <div class="cw-stat-card"><strong id="statPuzzlesCompleted">0</strong><span>Puzzles completed</span></div>
              <div class="cw-stat-card"><strong id="statWordsCorrect">0</strong><span>Words answered</span></div>
              <div class="cw-stat-card"><strong id="statWordsRevealed">0</strong><span>Words revealed</span></div>
              <div class="cw-stat-card"><strong id="statDailyStreak">0</strong><span>Daily challenge streak</span></div>
            </div>
          </section>
        </main>

        <footer class="cw-footer">
          <a href="data-sources.html">Data sources and licenses</a>
        </footer>
      </div>
    `;
    groupSettings(document.querySelector(".cw-settings-grid"), [
      ["Answer checks & reveals", ["checkAvailSelect", "revealAvailSelect", "hintLimitInput", "timedMinutesInput"]],
      ["Input & study", ["inputStyleSelect", "kanjiFocusToggle"]],
      ["Display & layout", ["fontScaleSelect", "layoutDirSelect"]]
    ]);
    document.querySelector(".cw-settings-grid").append(document.querySelector(".cw-toggle-group"));
    const sketch = (body) => `<svg viewBox="0 0 64 38" width="64" height="38" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="30" height="30" rx="3" opacity=".55"/><path d="M12 2v30M22 2v30M2 12h30M2 22h30" opacity=".3"/>${body}</svg>`;
    document.querySelector(".cw-top-card").addEventListener("change", () => { document.getElementById("startError").hidden = true; });
    mountChips(document.getElementById("answerModeSelect"), {
      multiple: true,
      allValue: "both",
      options: [{ value: "kana", label: "Kana かな" }, { value: "kanji", label: "Kanji 漢字" }],
      titleDescription: "Choose the answer script. Select both to accept kana or kanji answers."
    });
    mountChips(document.getElementById("inputStyleSelect"), {
      variant: "card",
      fieldClass: "cw-input-style-field",
      options: [
        { value: "popup", label: "Clue popup", preview: sketch('<rect x="16" y="14" width="46" height="20" rx="4" fill="currentColor" fill-opacity=".15"/><path d="M21 24h24" stroke-linecap="round"/>') },
        { value: "cell", label: "In-square", preview: sketch('<rect x="12" y="12" width="10" height="10" fill="currentColor" fill-opacity=".25"/><path d="M17 14v6" stroke-linecap="round"/>') },
        { value: "clues", label: "Clue list", preview: sketch('<path d="M38 8h24M38 20h24M38 32h24" stroke-linecap="round"/><rect x="38" y="11" width="24" height="5" rx="2" fill="currentColor" fill-opacity=".25"/>') }
      ]
    });
  }

  function syncControlsFromSettings() {
    const s = pendingSettings;
    document.querySelectorAll("#modePills .cw-mode-pill").forEach((btn) => {
      btn.setAttribute("aria-pressed", String(btn.dataset.mode === s.gameMode));
    });
    const modeInfo = GAME_MODES[s.gameMode] || GAME_MODES.classic;
    document.getElementById("modeDescriptionText").textContent = modeInfo.desc;

    const answerSelect = document.getElementById("answerModeSelect");
    answerSelect.value = effectiveAnswerMode(s) === "reverse" ? s.answerMode : effectiveAnswerMode(s);
    setSettingAvailability(answerSelect, ["kanjiChallenge", "kanaChallenge", "reverse"].includes(s.gameMode) ? "Answer mode is set by this challenge." : "");

    document.getElementById("levelSelect").value = s.level;
    document.getElementById("sizeSelect").value = s.size;
    document.getElementById("customWordsField").hidden = s.size !== "custom";
    document.getElementById("customWordsInput").value = String(s.customWords || 10);
    document.getElementById("themeSelect").value = s.themeCategory;
    document.getElementById("fontScaleSelect").value = s.fontScale;
    document.getElementById("checkAvailSelect").value = s.checkAvailability;
    document.getElementById("revealAvailSelect").value = s.revealAvailability;
    document.getElementById("hintLimitInput").value = String(s.hintLimit || 5);
    document.getElementById("timedMinutesInput").value = String(s.timedLimitMinutes || 5);
    document.getElementById("layoutDirSelect").value = s.layoutDirection;
    document.getElementById("inputStyleSelect").value = s.inputStyle || "popup";

    document.getElementById("kanjiFocusToggle").checked = Boolean(s.kanjiFocus);
    const reasons = {
      customWordsInput: s.size !== "custom" ? "Choose a custom puzzle size." : "",
      checkAvailSelect: s.gameMode === "relaxed" ? "Relaxed mode allows unlimited checks." : "",
      revealAvailSelect: s.gameMode === "relaxed" ? "Relaxed mode allows unlimited reveals." : "",
      hintLimitInput: s.gameMode === "relaxed" || ![s.checkAvailability, s.revealAvailability].includes("limited") ? "Choose limited checks or reveals outside Relaxed mode." : "",
      timedMinutesInput: s.gameMode !== "timed" ? "Used in Timed Challenge." : "",
      kanjiFocusToggle: s.gameMode === "reverse" ? "Reverse mode uses Japanese words as clues." : ""
    };
    document.getElementById("answerModeSelect").chipsApi?.sync();
    document.getElementById("inputStyleSelect").chipsApi?.sync();
    for (const [id, reason] of Object.entries(reasons)) setSettingAvailability(document.getElementById(id), reason);

    applyAppearance();
    updateAssistButtons();
    renderLifetimeStats();
  }

  function remainingHints() {
    const s = state.settings;
    if (s.gameMode === "relaxed") return Infinity;
    const limit = Math.max(1, Number(s.hintLimit) || 5);
    return Math.max(0, limit - state.hintsUsed);
  }

  function isRevealDisabled() {
    const s = state.settings;
    const isRelaxed = s.gameMode === "relaxed";
    const revealAvail = isRelaxed ? "unlimited" : s.revealAvailability;
    return state.roundEnded || !state.puzzle || revealAvail === "disabled" || (revealAvail === "limited" && remainingHints() <= 0);
  }

  function updateAssistButtons() {
    const s = state.settings;
    const isRelaxed = s.gameMode === "relaxed";
    const checkAvail = isRelaxed ? "unlimited" : s.checkAvailability;
    const revealAvail = isRelaxed ? "unlimited" : s.revealAvailability;
    const rem = remainingHints();

    const revPuzBtn = document.getElementById("revealPuzzleBtn");

    const disabledAll = state.roundEnded || !state.puzzle;
    document.querySelectorAll("[data-popover-action='check'], [data-clue-check-id]").forEach((button) => {
      button.disabled = disabledAll || isCheckDisabled();
    });
    revPuzBtn.disabled = isRevealDisabled();

    const hintsMetric = document.getElementById("hintsMetric");
    const hintsLabel = document.getElementById("hintsLabel");
    if (checkAvail === "limited" || revealAvail === "limited") {
      hintsMetric.textContent = `${state.hintsUsed} / ${s.hintLimit}`;
      hintsLabel.textContent = "hints used (limited)";
    } else if (checkAvail === "disabled" && revealAvail === "disabled") {
      hintsMetric.textContent = "Off";
      hintsLabel.textContent = "challenge mode";
    } else {
      hintsMetric.textContent = String(state.hintsUsed);
      hintsLabel.textContent = "hints used";
    }
  }

  function showFeedback(text, tone = "") {
    state.feedback = { text, tone };
    const banner = document.getElementById("feedbackBanner");
    if (!banner) return;
    if (!text) {
      banner.hidden = true;
      banner.textContent = "";
      banner.className = "cw-feedback-banner";
      return;
    }
    banner.hidden = false;
    banner.textContent = text;
    banner.className = `cw-feedback-banner${tone ? ` ${tone}` : ""}`;
  }

  async function loadVocabularyPool(level) {
    const cacheKey = `${level}`;
    let existing = state.poolCache.get(cacheKey) || [];
    const recentIds = Array.isArray(state.stats.recentWordIds) ? state.stats.recentWordIds : [];

    // Always fetch a fresh random batch from the backend (including expanded 218k JMdict common words)
    // so puzzles never rely on a static cached 160-word array.
    const rounds = existing.length < 100 ? 2 : 1;
    for (let round = 0; round < rounds; round++) {
      const exclude = [...new Set([...recentIds.slice(-60), ...existing.slice(-50).map((item) => item.id)])]
        .filter((id) => typeof id === "string" && id.length <= 28)
        .slice(0, 95);
      try {
        const batch = await fetchItems("/api/words/batch", {
          level,
          limit: 100,
          kanji: 1,
          expand: 1,
          ...(exclude.length ? { exclude } : {})
        });
        const seen = new Set(existing.map((i) => i.id));
        const freshItems = [];
        for (const item of batch) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            freshItems.push(item);
            for (const kd of item.kanjiDetails || []) {
              if (kd?.kanji) state.kanjiCache.set(kd.kanji, kd);
            }
          }
        }
        // Prepend fresh items and cap total in-memory cache at 450 so new words rotate in continuously
        existing = [...freshItems, ...existing].slice(0, 450);
        if (batch.length < 60) break;
      } catch (err) {
        if (!existing.length) throw err;
        break;
      }
    }

    state.poolCache.set(cacheKey, existing);
    return existing;
  }

  async function ensureKanjiDetail(char) {
    if (state.kanjiCache.has(char)) return state.kanjiCache.get(char);
    try {
      const res = await fetch(`${API_BASE}/api/kanji/${encodeURIComponent(char)}`, {
        headers: { Accept: "application/json" }
      });
      if (res.ok) {
        const data = await res.json();
        state.kanjiCache.set(char, data);
        return data;
      }
    } catch {}
    return null;
  }

  function resetPuzzleStats() {
    state.stats.puzzlesCompleted = 0;
    state.stats.wordsCorrect = 0;
    state.stats.wordsRevealed = 0;
    state.stats.dailyStreak = 0;
    state.stats.lastDailyDate = "";
    saveJSON(STORAGE_KEYS.stats, state.stats);
    renderLifetimeStats();
  }

  function startTimer() {
    clearInterval(state.timerHandle);
    const wrap = document.getElementById("timerMetricWrap");
    const metric = document.getElementById("timerMetric");
    const label = document.getElementById("timerLabel");
    if (!isTimerActive()) {
      wrap.hidden = true;
      return;
    }
    wrap.hidden = false;
    const isCountdown = state.settings.gameMode === "timed";
    state.timerSeconds = isCountdown ? (Math.max(1, Number(state.settings.timedLimitMinutes) || 5) * 60) : 0;
    label.textContent = isCountdown ? "remaining" : "elapsed";
    metric.textContent = formatTime(state.timerSeconds);

    state.timerHandle = setInterval(() => {
      if (state.roundEnded) {
        clearInterval(state.timerHandle);
        return;
      }
      if (isCountdown) {
        state.timerSeconds--;
        metric.textContent = formatTime(state.timerSeconds);
        if (state.timerSeconds <= 0) {
          clearInterval(state.timerHandle);
          state.roundEnded = true;
          showFeedback("Time is up! Review the remaining words or start a new puzzle.", "bad");
          updateAssistButtons();
        }
      } else {
        state.timerSeconds++;
        metric.textContent = formatTime(state.timerSeconds);
      }
    }, 1000);
  }

  async function buildNewPuzzle() {
    if (state.loading) return;
    state.loading = true;
    const startError = document.getElementById("startError");
    startError.hidden = true;
    showFeedback("Generating your Japanese vocabulary crossword…");
    try {
      const s = { ...pendingSettings };
      if (s.level === "none") throw new Error("Choose at least one JLPT level to start a puzzle.");
      const rawPool = await loadVocabularyPool(s.level);

      let filtered = rawPool.filter((item) => matchesTheme(item, s.themeCategory));
      if (filtered.length < 8) {
        // Fallback to full level pool if theme subset is too small for the selected level
        filtered = rawPool;
      }

      const sizeSpec = PUZZLE_SIZES[s.size] || PUZZLE_SIZES.medium;
      const targetWords = s.size === "custom"
        ? Math.max(4, Math.min(18, Number(s.customWords) || 10))
        : sizeSpec.targetWords;
      const gridSize = s.size === "custom"
        ? Math.max(8, Math.min(16, targetWords + 2))
        : sizeSpec.gridSize;

      const todayStr = new Date().toISOString().slice(0, 10);
      const seed = s.gameMode === "daily"
        ? `daily-${todayStr}-${s.level}-${effectiveAnswerMode(s)}`
        : `${Date.now()}-${Math.random()}`;

      const recentIds = s.gameMode === "daily"
        ? []
        : (Array.isArray(state.stats.recentWordIds) ? state.stats.recentWordIds : []);

      const puzzle = generateCrossword(filtered, {
        gridSize,
        targetWords,
        answerMode: effectiveAnswerMode(s),
        kanjiFocus: s.kanjiFocus,
        themeKey: s.themeCategory,
        recentIds,
        seed
      });

      if (puzzle.entries.length < 2) {
        const words = effectiveAnswerMode(s) === "kanji" ? "kanji words" : "words";
        throw new Error(`Could not find enough connected ${words} for this puzzle. Try a wider JLPT range or a different theme.`);
      }

      if (s.gameMode !== "daily" && puzzle.entries.length > 0) {
        const newUsed = puzzle.entries.flatMap((e) => [e.item.id, e.item.word, e.answer].filter(Boolean));
        state.stats.recentWordIds = [...new Set([...newUsed, ...(state.stats.recentWordIds || [])])].slice(0, 300);
      }

      state.settings = { ...s, audio: study.audio, furigana: study.furigana, romanization: study.romaji };
      applyAppearance();
      state.puzzle = puzzle;
      for (const id of ["cwWorkspace"]) document.getElementById(id).hidden = false;
      document.querySelector(".cw-status-bar").hidden = false;
      document.getElementById("cwEmpty").hidden = true;
      document.getElementById("resetProgressBtn").disabled = false;
      state.hintsUsed = 0;
      state.checksUsed = 0;
      state.revealsUsed = 0;
      state.roundEnded = false;
      state.roundWon = false;
      state.popoverOpen = false;
      state.popoverError = "";
      state.squareDraft = null;
      state.clueErrors = {};
      state.inspectedEntryId = null;
      state.inspectedKanjiChar = null;

      // Reset stats each time a new crossword starts
      resetPuzzleStats();

      if (puzzle.entries.length > 0) {
        const first = puzzle.across[0] || puzzle.entries[0];
        state.activeEntryId = first.id;
        state.preferredDir = first.dir;
        state.activeCell = { row: first.row, col: first.col };
      }

      showFeedback("");
      renderPuzzleBoard();
      renderClueLists();
      updateActiveClueBanner();
      renderStudyInspector();
      updateProgressMetrics();
      updateAssistButtons();
      startTimer();
    } catch (error) {
      if (!state.puzzle) {
        renderPuzzleBoard();
        document.getElementById("activeClueText").textContent = "No crossword available.";
      }
      showFeedback("");
      startError.textContent = error.message || "Could not load vocabulary for this puzzle.";
      startError.hidden = false;
    } finally {
      state.loading = false;
    }
  }

  function getActiveEntry() {
    if (!state.puzzle) return null;
    return state.puzzle.entries.find((e) => e.id === state.activeEntryId) || state.puzzle.entries[0] || null;
  }

  function evaluateEntryCompletion(entry, { fromReveal = false } = {}) {
    if (!state.puzzle || !entry) return false;
    const isCompleteAndCorrect = entry.cells.every(({ row, col }, idx) => {
      const cell = state.puzzle.grid[row][col];
      return cell && cell.value === entry.chars[idx];
    });

    if (isCompleteAndCorrect && !entry.completed) {
      entry.completed = true;
      for (const { row, col } of entry.cells) {
        const cell = state.puzzle.grid[row][col];
        if (cell.status !== "revealed") {
          cell.status = "correct";
        }
        cell.locked = true;
      }
      if (!fromReveal) {
        state.stats.wordsCorrect++;
        saveJSON(STORAGE_KEYS.stats, state.stats);
        renderLifetimeStats();
      }
      state.inspectedEntryId = entry.id;
      const firstKanji = [...entry.item.word].find((c) => hasKanji(c)) || null;
      state.inspectedKanjiChar = firstKanji;
      if (firstKanji) ensureKanjiDetail(firstKanji).then(() => renderStudyInspector());
      speakJapanese(entry.item.furigana || entry.item.word);
      checkPuzzleCompletion();
      return true;
    }
    return isCompleteAndCorrect;
  }

  function checkPuzzleCompletion() {
    if (!state.puzzle || state.roundWon) return;
    const allDone = state.puzzle.entries.length > 0 && state.puzzle.entries.every((e) => e.completed);
    if (allDone) {
      state.roundWon = true;
      state.roundEnded = true;
      clearInterval(state.timerHandle);
      state.stats.puzzlesCompleted++;

      if (state.settings.gameMode === "daily") {
        const today = new Date().toISOString().slice(0, 10);
        if (state.stats.lastDailyDate !== today) {
          state.stats.dailyStreak = (state.stats.dailyStreak || 0) + 1;
          state.stats.lastDailyDate = today;
        }
      }
      saveJSON(STORAGE_KEYS.stats, state.stats);
      showFeedback("🎉 おめでとう！ Puzzle completed! Hover or tap any completed word or kanji to review.", "good");
      updateAssistButtons();
      renderLifetimeStats();
    }
  }

  function updateProgressMetrics() {
    if (!state.puzzle) return;
    const completed = state.puzzle.entries.filter((e) => e.completed).length;
    const total = state.puzzle.entries.length;
    document.getElementById("progressMetric").textContent = `${completed} / ${total}`;
    document.getElementById("streakMetric").textContent = String(state.stats.dailyStreak || 0);
  }

  function renderPuzzleBoard() {
    const gridEl = document.getElementById("crosswordGrid");
    if (!state.puzzle || !state.puzzle.entries.length) {
      gridEl.innerHTML = `<div style="padding:24px;color:var(--muted)">No puzzle grid available.</div>`;
      return;
    }

    const { rows, cols, grid } = state.puzzle;
    gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

    const activeEntry = getActiveEntry();
    const draft = activeSquareDraft();
    const entryHasEditableCells = activeEntry?.cells.some(({ row, col }) => !grid[row][col].locked);
    const activeCoords = new Set(
      (activeEntry?.cells || []).map(({ row, col }) => `${row},${col}`)
    );

    const cellsHTML = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) {
          cellsHTML.push(`<div class="cw-cell block" role="gridcell" aria-disabled="true"></div>`);
          continue;
        }
        const isCurrent = state.activeCell.row === r && state.activeCell.col === c;
        const inWord = activeCoords.has(`${r},${c}`);
        const isIntersection = Boolean(cell.acrossId && cell.downId);
        const statusClass = cell.status !== "empty" ? ` status-${cell.status}` : "";
        const romajiHint = state.settings.romanization && cell.value && !/^[A-Za-z]$/.test(cell.value)
          ? romanizeKana(cell.value)
          : "";

        // Determine if cell is part of any completed entry for hover/tap inspection
        const completedEntryId = [cell.acrossId, cell.downId].find((id) => {
          const ent = state.puzzle.entries.find((e) => e.id === id);
          return ent?.completed;
        }) || "";

        const allowDirectInput = !state.roundEnded && state.settings.inputStyle === "cell"
          && (!cell.locked || inWord && entryHasEditableCells);
        const cellInputHTML = isCurrent && allowDirectInput
          ? `<input
              class="cw-cell-input"
              type="text"
              value="${escapeHTML(draft?.text || "")}"
              data-draft="${Boolean(draft?.text)}"
              data-cell-input="1"
              data-row="${r}"
              data-col="${c}"
              aria-label="${cell.locked
                ? `Type answer for ${activeEntry.number} ${activeEntry.dir}; crossing character is locked`
                : `Type character for Row ${r + 1}, Column ${c + 1}`}"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
            >`
          : "";

        cellsHTML.push(`
          <div
            class="cw-cell${inWord ? " in-active-word" : ""}${isIntersection && inWord ? " is-intersecting" : ""}${isCurrent ? " is-active" : ""}${statusClass}"
            role="gridcell"
            tabindex="${isCurrent ? "0" : "-1"}"
            data-row="${r}"
            data-col="${c}"
            data-completed-entry="${completedEntryId}"
            data-char="${escapeHTML(cell.value)}"
            aria-label="Row ${r + 1}, Column ${c + 1}${cell.number ? `, Clue ${cell.number}` : ""}${cell.value ? `, ${cell.value}` : ", empty"}"
          >
            ${cell.number ? `<span class="cw-cell-num">${cell.number}</span>` : ""}
            <span class="cw-cell-char" lang="ja">${escapeHTML(cell.value)}</span>
            ${cellInputHTML}
            ${romajiHint ? `<span class="cw-cell-romaji">${escapeHTML(romajiHint)}</span>` : ""}
          </div>
        `);
      }
    }
    gridEl.innerHTML = cellsHTML.join("");
    renderGridCluePopover();
  }

  function renderGridCluePopover() {
    const popEl = document.getElementById("gridCluePopover");
    const stageEl = document.getElementById("gridStage");
    const gridEl = document.getElementById("crosswordGrid");
    if (!popEl || !stageEl || !gridEl) return;

    const entry = getActiveEntry();
    const shouldShowPopup = state.settings.inputStyle !== "clues";
    const boardPanel = popEl.closest(".cw-board-panel");
    const inSquare = state.settings.inputStyle === "cell";
    popEl.classList.toggle("cw-cell-popover-inline", inSquare);
    if (inSquare && popEl.parentElement === stageEl) stageEl.closest(".cw-grid-scroll").after(popEl);
    else if (!inSquare && popEl.parentElement !== stageEl) stageEl.append(popEl);
    boardPanel?.classList.toggle("popover-open", !!(state.puzzle && entry && state.popoverOpen && shouldShowPopup));
    if (!state.puzzle || !entry || !state.popoverOpen || !shouldShowPopup) {
      popEl.hidden = true;
      popEl.innerHTML = "";
      return;
    }

    const dirLabel = entry.dir === "across" ? "Across · ヨコ" : "Down · タテ";
    const showTextBox = state.settings.inputStyle === "popup" && !entry.completed && !state.roundEnded;
    const emptyCount = entry.cells.filter(({ row, col }) => !state.puzzle.grid[row][col].value && !state.puzzle.grid[row][col].locked).length;
    const revDisabled = isRevealDisabled() || entry.completed;

    popEl.hidden = false;
    popEl.innerHTML = `
      <div class="cw-popover-top">
        <div class="cw-popover-meta">
          <span class="cw-active-clue-id">${entry.number} ${dirLabel}</span>
          <span class="cw-badge">${escapeHTML(entry.clue.badge)}</span>
          ${entry.clue.hint ? `<span style="color:var(--muted)">${escapeHTML(entry.clue.hint)}</span>` : ""}
        </div>
        <div class="cw-popover-top-btns">
          <button class="cw-popover-dir-btn" type="button" data-popover-action="flip" title="Switch Across / Down" ${canFlipDirection() ? "" : "hidden"}>⇄</button>
          <button class="cw-popover-close" type="button" data-popover-action="close" aria-label="Close clue popup">×</button>
        </div>
      </div>

      <div class="cw-popover-clue">
        <strong>Clue:</strong> ${formatClueDisplayHTML(entry.clue)}
      </div>

      ${showTextBox ? `
        <div class="cw-popover-length-row">
          <span class="cw-popover-length-label">Length: ${entry.length}${emptyCount > 0 && emptyCount < entry.length ? ` (${emptyCount} empty)` : ""}</span>
          <input
            class="cw-popover-input"
            id="popoverAnswerInput"
            type="text"
            value=""
            placeholder=""
            aria-label="Type answer for ${entry.number} ${entry.dir}"
            autocapitalize="off"
            autocomplete="off"
            autocorrect="off"
            spellcheck="false"
          >
        </div>
        <div class="cw-popover-error" id="popoverErrorMsg" ${state.popoverError ? "" : "hidden"}>${escapeHTML(state.popoverError)}</div>
        <div class="cw-popover-btn-bar">
          <button class="cw-popover-action-btn" type="button" data-popover-action="check" ${isCheckDisabled() ? "disabled" : ""}>Check</button>
          <button class="cw-popover-action-btn" id="revealSquareBtn" type="button" data-popover-action="revealSquare" ${revDisabled ? "disabled" : ""}>Show letter</button>
          <button class="cw-popover-action-btn" id="revealWordBtn" type="button" data-popover-action="revealWord" ${revDisabled ? "disabled" : ""}>Show word</button>
        </div>
      ` : `
        <div class="cw-popover-length-row">
          <span class="cw-popover-length-label">Length: ${entry.length}${entry.completed ? " · ✓ Completed" : " · Type directly in squares"}</span>
        </div>
        <p class="cw-square-draft" role="status" aria-live="polite" ${activeSquareDraft()?.text ? "" : "hidden"}>${escapeHTML(squareDraftMessage())}</p>
        <div class="cw-popover-btn-bar">
          ${!entry.completed && !state.roundEnded ? `
            <button class="cw-popover-action-btn" type="button" data-popover-action="check" ${isCheckDisabled() ? "disabled" : ""}>Check</button>
            <button class="cw-popover-action-btn" id="revealSquareBtn" type="button" data-popover-action="revealSquare" ${revDisabled ? "disabled" : ""}>Show letter</button>
            <button class="cw-popover-action-btn" id="revealWordBtn" type="button" data-popover-action="revealWord" ${revDisabled ? "disabled" : ""}>Show word</button>
          ` : ""}
        </div>
      `}
    `;

    if (inSquare) {
      popEl.style.removeProperty("width");
      popEl.style.removeProperty("left");
      popEl.style.removeProperty("top");
      return;
    }

    // Position the popover directly below (or above) the active word/cell without covering the active cells
    const { row, col } = state.activeCell;
    const activeCellEl = gridEl.querySelector(`.cw-cell[data-row="${row}"][data-col="${col}"]`);
    if (activeCellEl) {
      const stageWidth = stageEl.offsetWidth || gridEl.offsetWidth || 360;
      const stageHeight = stageEl.offsetHeight || gridEl.offsetHeight || 360;
      const cellTop = activeCellEl.offsetTop;
      const cellLeft = activeCellEl.offsetLeft;
      const cellHeight = activeCellEl.offsetHeight || 42;
      const popWidth = Math.min(340, Math.max(240, stageWidth - 8));
      popEl.style.width = `${popWidth}px`;

      const leftPos = Math.max(4, Math.min(cellLeft, stageWidth - popWidth - 4));
      const popHeight = popEl.offsetHeight || 150;
      const spaceBelow = stageHeight - (cellTop + cellHeight);

      let topPos = cellTop + cellHeight + 6;
      if (spaceBelow < popHeight + 12 && cellTop > popHeight + 12) {
        topPos = Math.max(4, cellTop - popHeight - 6);
      }
      popEl.style.left = `${leftPos}px`;
      popEl.style.top = `${topPos}px`;
    }
  }

  function formatClueDisplayHTML(clue) {
    if (state.settings.furigana && clue.furiganaHTML) {
      return clue.furiganaHTML;
    }
    return escapeHTML(clue.text);
  }

  function updateActiveClueBanner() {
    document.getElementById("flipDirBtn").hidden = !canFlipDirection();
    const entry = getActiveEntry();
    const badgeEl = document.getElementById("activeClueBadge");
    const textEl = document.getElementById("activeClueText");
    const subEl = document.getElementById("activeClueSub");

    if (!entry) {
      badgeEl.textContent = "—";
      textEl.textContent = "Select a square or clue";
      subEl.textContent = "";
      return;
    }

    const dirLabel = entry.dir === "across" ? "Across · ヨコ" : "Down · タテ";
    badgeEl.textContent = `${entry.number} ${dirLabel}`;
    textEl.innerHTML = formatClueDisplayHTML(entry.clue);

    const subParts = [
      `Length: ${entry.length}`,
      entry.clue.badge,
      entry.clue.hint,
      state.settings.romanization && entry.clue.romaji ? `Romaji: ${entry.clue.romaji}` : ""
    ].filter(Boolean);
    subEl.textContent = subParts.join(" · ");
  }

  function renderClueLists() {
    if (!state.puzzle) return;
    const showClueBoxes = state.settings.inputStyle === "clues";
    const revDisabled = isRevealDisabled();
    const renderList = (entries, containerId) => {
      const container = document.getElementById(containerId);
      container.innerHTML = entries.map((entry) => {
        const isActive = entry.id === state.activeEntryId;
        const errMsg = state.clueErrors[entry.id] || "";
        return `
          <li
            class="cw-clue-item${isActive ? " active" : ""}${entry.completed ? " completed" : ""}"
            data-entry-id="${entry.id}"
            tabindex="0"
          >
            <span class="cw-clue-num">${entry.number}.</span>
            <div class="cw-clue-body">
              <div class="cw-clue-state">
                <span class="cw-clue-selected"><span aria-hidden="true">➤</span> Selected</span>
                ${entry.completed ? '<span class="cw-clue-solved"><span aria-hidden="true">✓</span> Solved</span>' : '<span class="cw-clue-unanswered">Unanswered</span>'}
              </div>
              <div>${formatClueDisplayHTML(entry.clue)}</div>
              <div class="cw-clue-meta">
                <span class="cw-badge">${escapeHTML(entry.clue.badge)}</span>
                <span>Length: ${entry.length}</span>
                <span>N${entry.item.level}</span>
                ${entry.clue.hint ? `<span>${escapeHTML(entry.clue.hint)}</span>` : ""}
              </div>
              ${showClueBoxes && !entry.completed && !state.roundEnded ? `
                <div class="cw-clue-entry-box">
                  <div class="cw-clue-inline-row">
                    <input
                      class="cw-clue-inline-input"
                      type="text"
                      value=""
                      placeholder="Answer (${entry.length})…"
                      data-clue-input-id="${entry.id}"
                      aria-label="Answer for ${entry.number} ${entry.dir}"
                      autocapitalize="off"
                      autocomplete="off"
                      autocorrect="off"
                      spellcheck="false"
                    >
                    <button class="cw-clue-inline-btn" type="button" data-clue-check-id="${entry.id}" ${isCheckDisabled() ? "disabled" : ""}>Check</button>
                    <button class="cw-clue-inline-btn" type="button" data-clue-reveal-sq-id="${entry.id}" ${revDisabled ? "disabled" : ""}>Reveal square</button>
                    <button class="cw-clue-inline-btn" type="button" data-clue-reveal-word-id="${entry.id}" ${revDisabled ? "disabled" : ""}>Reveal word</button>
                  </div>
                  ${errMsg ? `<div class="cw-clue-inline-error">${escapeHTML(errMsg)}</div>` : ""}
                </div>
              ` : ""}
            </div>
          </li>
        `;
      }).join("");
    };
    renderList(state.puzzle.across, "acrossClueList");
    renderList(state.puzzle.down, "downClueList");
  }

  function renderStudyInspector() {
    const body = document.getElementById("studyInspectorBody");
    if (!state.puzzle) {
      body.innerHTML = "";
      return;
    }

    const entry = state.puzzle.entries.find((e) => e.id === state.inspectedEntryId && e.completed)
      || state.puzzle.entries.find((e) => e.completed);

    if (!entry) {
      body.innerHTML = `
        <div class="cw-word-card" style="color:var(--muted);text-align:center;padding:22px">
          Complete any word in the crossword (or hover/tap a completed answer) to unlock its full vocabulary card, random example sentence, audio pronunciation, and individual kanji breakdown.
        </div>
      `;
      return;
    }

    const item = entry.item;
    const word = item.word;
    const reading = item.furigana || word;
    const romaji = item.romaji || romanizeKana(reading);
    const examples = item.examples?.length
      ? item.examples
      : item.example
        ? [{ ja: item.example, furigana: item.exampleFurigana, en: item.exampleMeaning, tatoeba_id: item.exampleSourceId }]
        : [];

    const wordDisplayHTML = state.settings.furigana && hasKanji(word) && reading
      ? alignFuriganaRuby(word, reading)
      : escapeHTML(word);

    const kanjiChars = [...new Set([...word].filter((ch) => hasKanji(ch)))];
    const activeKanji = state.inspectedKanjiChar && kanjiChars.includes(state.inspectedKanjiChar)
      ? state.inspectedKanjiChar
      : kanjiChars[0] || null;

    const kanjiData = activeKanji
      ? (state.kanjiCache.get(activeKanji) || (item.kanjiDetails || []).find((k) => k.kanji === activeKanji))
      : null;

    body.innerHTML = `
      <div class="cw-study-grid">
        <div class="cw-word-card" id="completedWordCard">
          <div class="cw-word-head">
            <div>
              <div class="cw-word-title" lang="ja">${wordDisplayHTML}</div>
              <div class="cw-word-reading">
                Reading: <strong lang="ja">${escapeHTML(reading)}</strong>
                ${state.settings.romanization ? ` · <span>${escapeHTML(romaji)}</span>` : ""}
                · <span class="cw-badge">JLPT N${escapeHTML(item.level)}</span>
              </div>
            </div>
            <button class="cw-btn" type="button" data-speak-ja="${escapeHTML(reading)}" aria-label="Pronounce word">▶ Word</button>
          </div>

          <div><strong>Definition:</strong> ${escapeHTML(item.meaning)}</div>
          ${item.partOfSpeech ? `<div style="margin-top:4px;font-size:12px;color:var(--muted)">Part of speech: ${escapeHTML(item.partOfSpeech)}</div>` : ""}

          <div class="cw-example-box"><strong>Example sentences</strong><div id="cwSentenceExamples"></div></div>

          ${kanjiChars.length ? `
            <div style="margin-top:10px">
              <span style="font-size:11px;font-weight:700;color:var(--muted)">KANJI IN THIS WORD (Hover or tap to inspect):</span>
              <div class="cw-kanji-Chips">
                ${kanjiChars.map((ch) => `
                  <button class="cw-kanji-chip${ch === activeKanji ? " active" : ""}" type="button" data-inspect-kanji="${escapeHTML(ch)}" lang="ja">
                    ${escapeHTML(ch)}
                  </button>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>

        <div class="cw-kanji-card" id="completedKanjiCard">
          ${kanjiData ? `
            <div class="cw-kanji-head">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="cw-kanji-glyph" lang="ja">${escapeHTML(kanjiData.kanji)}</span>
                <div>
                  <div style="font-weight:800;font-size:15px">${escapeHTML((kanjiData.meanings || []).join(", ") || "Kanji")}</div>
                  <div style="font-size:12px;color:var(--muted)">
                    ${kanjiData.jlpt ? `JLPT N${kanjiData.jlpt}` : "Unrated"}
                    ${kanjiData.stroke_count ? ` · ${kanjiData.stroke_count} strokes` : ""}
                  </div>
                </div>
              </div>
              <button class="cw-btn" type="button" data-speak-ja="${escapeHTML((kanjiData.kun_readings?.[0] || kanjiData.on_readings?.[0] || kanjiData.kanji).replace(/[.-]/g, ""))}">▶ Reading</button>
            </div>

            <div style="font-size:13px;line-height:1.6">
              <div><strong>On’yomi (音読み):</strong> <span lang="ja">${escapeHTML((kanjiData.on_readings || []).join("、") || "Unlisted")}</span>
                ${state.settings.romanization && kanjiData.on_readings?.length ? ` (${escapeHTML(kanjiData.on_readings.map(romanizeKana).join(", "))})` : ""}
              </div>
              <div><strong>Kun’yomi (訓読み):</strong> <span lang="ja">${escapeHTML((kanjiData.kun_readings || []).join("、") || "Unlisted")}</span>
                ${state.settings.romanization && kanjiData.kun_readings?.length ? ` (${escapeHTML(kanjiData.kun_readings.map((r) => romanizeKana(r.replace(/[.-]/g, ""))).join(", "))})` : ""}
              </div>
            </div>

            <div style="margin-top:8px">
              <strong style="font-size:12px">Example words containing ${escapeHTML(kanjiData.kanji)}:</strong>
              ${kanjiData.examples?.length ? `
                <ul class="cw-compound-list">
                  ${kanjiData.examples.slice(0, 5).map((cw) => {
                    const wDisp = state.settings.furigana && hasKanji(cw.word) && cw.reading
                      ? alignFuriganaRuby(cw.word, cw.reading)
                      : escapeHTML(cw.word);
                    const rom = state.settings.romanization ? ` · ${escapeHTML(romanizeKana(cw.reading))}` : "";
                    return `<li><strong lang="ja">${wDisp}</strong> (${escapeHTML(cw.reading)}${rom}) — ${escapeHTML((cw.meanings || []).join("; "))}</li>`;
                  }).join("")}
                </ul>
              ` : `<div style="font-size:12px;color:var(--muted);margin-top:4px">No compound examples listed.</div>`}
            </div>
          ` : `
            <div style="color:var(--muted);padding:16px;text-align:center">
              ${kanjiChars.length ? "Loading kanji details…" : "This completed word is written in kana without kanji."}
            </div>
          `}
        </div>
      </div>
    `;
    mountSentenceExamples(document.getElementById("cwSentenceExamples"), word, examples.map((example) => ({
      id: example.tatoeba_id || example.id,
      japanese: example.ja || example.japanese,
      english: example.en || example.english,
      furigana: example.furigana,
      license: example.license || "CC BY 2.0 FR"
    })));
  }

  function renderLifetimeStats() {
    document.getElementById("statPuzzlesCompleted").textContent = String(state.stats.puzzlesCompleted || 0);
    document.getElementById("statWordsCorrect").textContent = String(state.stats.wordsCorrect || 0);
    document.getElementById("statWordsRevealed").textContent = String(state.stats.wordsRevealed || 0);
    document.getElementById("statDailyStreak").textContent = String(state.stats.dailyStreak || 0);
  }

  function selectCell(row, col, toggleDirIfSame = false, { openPopover = true } = {}) {
    if (!state.puzzle) return;
    const cell = state.puzzle.grid[row]?.[col];
    if (!cell) return;
    state.squareDraft = null;

    if (toggleDirIfSame && state.activeCell.row === row && state.activeCell.col === col) {
      state.preferredDir = state.preferredDir === "across" ? "down" : "across";
    }

    state.activeCell = { row, col };
    if (state.preferredDir === "across" && cell.acrossId) {
      state.activeEntryId = cell.acrossId;
    } else if (state.preferredDir === "down" && cell.downId) {
      state.activeEntryId = cell.downId;
    } else if (cell.acrossId) {
      state.activeEntryId = cell.acrossId;
      state.preferredDir = "across";
    } else if (cell.downId) {
      state.activeEntryId = cell.downId;
      state.preferredDir = "down";
    }

    if (openPopover && state.settings.inputStyle !== "clues") {
      state.popoverOpen = true;
    } else if (state.settings.inputStyle === "clues") {
      state.popoverOpen = false;
    }
    state.popoverError = "";

    // If the user clicked a completed word/kanji cell, also inspect it immediately
    const entry = getActiveEntry();
    if (entry?.completed) {
      inspectCompletedCell(entry, cell.value);
    }

    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
  }

  function inspectCompletedCell(entry, charValue) {
    if (!entry || !entry.completed) return;
    state.inspectedEntryId = entry.id;
    if (charValue && hasKanji(charValue)) {
      state.inspectedKanjiChar = charValue;
      ensureKanjiDetail(charValue).then(() => renderStudyInspector());
    } else {
      const firstK = [...entry.item.word].find((c) => hasKanji(c)) || null;
      state.inspectedKanjiChar = firstK;
      if (firstK) ensureKanjiDetail(firstK).then(() => renderStudyInspector());
    }
    renderStudyInspector();
  }

  function advanceCursorInEntry(step = 1) {
    const entry = getActiveEntry();
    if (!entry) return;
    const idx = entry.cells.findIndex((c) => c.row === state.activeCell.row && c.col === state.activeCell.col);
    if (idx < 0) return;
    for (let nextIdx = idx + step; nextIdx >= 0 && nextIdx < entry.cells.length; nextIdx += step) {
      const next = entry.cells[nextIdx];
      if (!state.puzzle.grid[next.row][next.col].locked) {
        state.activeCell = { ...next };
        return;
      }
    }
  }

  function advanceToNextEmptyCell() {
    const entry = getActiveEntry();
    if (!entry || !state.puzzle) return;
    const idx = entry.cells.findIndex((c) => c.row === state.activeCell.row && c.col === state.activeCell.col);
    const startIdx = idx >= 0 ? idx : 0;

    // 1. Look forward in the current word for the next empty unlocked square
    for (let offset = 1; offset <= entry.cells.length; offset++) {
      const candidateIdx = (startIdx + offset) % entry.cells.length;
      const { row, col } = entry.cells[candidateIdx];
      const cell = state.puzzle.grid[row][col];
      if (!cell.locked && !cell.value) {
        state.activeCell = { row, col };
        return;
      }
    }

    // 2. If all squares in the current word are filled, step forward by 1 if possible
    if (startIdx + 1 < entry.cells.length) {
      state.activeCell = { ...entry.cells[startIdx + 1] };
    }
  }

  function triggerSuddenDeathLoss(_entry, reasonMsg) {
    state.roundEnded = true;
    state.popoverOpen = false;
    clearInterval(state.timerHandle);
    showFeedback(reasonMsg || "💀 Sudden Death! An incorrect answer ended the round.", "bad");
    updateAssistButtons();
  }

  function setCellChar(row, col, charValue, { autoAdvanceEmpty = false } = {}) {
    if (state.roundEnded || !state.puzzle) return;
    const cell = state.puzzle.grid[row]?.[col];
    if (!cell || cell.locked) return;

    const chars = [...String(charValue || "").replace(/\s+/g, "")];
    if (chars.length > 1) {
      // Multi-character commit (e.g. Japanese IME phrase conversion directly in cell)
      const entry = getActiveEntry();
      if (entry) {
        const startIdx = Math.max(0, entry.cells.findIndex((c) => c.row === row && c.col === col));
        let charCursor = 0;
        let wrongCount = 0;
        let rightCount = 0;
        for (let i = startIdx; i < entry.cells.length && charCursor < chars.length; i++) {
          const pos = entry.cells[i];
          const targetCell = state.puzzle.grid[pos.row][pos.col];
          if (targetCell.locked) continue;
          const ch = chars[charCursor++];
          const val = entry.script === "english" ? ch.toUpperCase() : ch;
          targetCell.value = val;
          if (state.settings.gameMode === "suddenDeath") {
            if (val === targetCell.solution) {
              targetCell.status = "correct";
              rightCount++;
            } else {
              targetCell.status = "incorrect";
              wrongCount++;
            }
          } else {
            targetCell.status = "empty";
          }
          state.activeCell = { row: pos.row, col: pos.col };
        }
        if (state.settings.gameMode === "suddenDeath" && wrongCount > 0) {
          triggerSuddenDeathLoss(
            entry,
            `💀 Sudden Death! Incorrect character entered (${rightCount} correct, ${wrongCount} wrong) — round over.`
          );
          renderPuzzleBoard();
          renderClueLists();
          updateActiveClueBanner();
          renderStudyInspector();
          updateProgressMetrics();
          return;
        }
        for (const { row: r, col: c } of entry.cells) {
          const tc = state.puzzle.grid[r][c];
          for (const id of [tc.acrossId, tc.downId].filter(Boolean)) {
            const ent = state.puzzle.entries.find((e) => e.id === id);
            if (ent) evaluateEntryCompletion(ent);
          }
        }
        if (autoAdvanceEmpty) advanceToNextEmptyCell();
        renderPuzzleBoard();
        renderClueLists();
        updateActiveClueBanner();
        renderStudyInspector();
        updateProgressMetrics();
        return;
      }
    }

    let clean = chars[0] || "";
    if (clean && /[\u3041-\u3096\u30a1-\u30f6]/u.test(clean) && toHiragana(clean) === toHiragana(cell.solution || "")) {
      clean = cell.solution;
    }
    const normalized = clean ? clean.toUpperCase() : "";
    cell.value = normalized;
    cell.status = "empty";

    if (normalized && state.settings.gameMode === "suddenDeath") {
      if (normalized !== cell.solution) {
        cell.status = "incorrect";
        const activeEntry = getActiveEntry();
        triggerSuddenDeathLoss(
          activeEntry,
          `💀 Sudden Death! "${normalized}" is incorrect — round over.`
        );
        renderPuzzleBoard();
        renderClueLists();
        updateActiveClueBanner();
        renderStudyInspector();
        updateProgressMetrics();
        return;
      }
      cell.status = "correct";
    }

    // Check if any entry containing this cell is now completed
    for (const id of [cell.acrossId, cell.downId].filter(Boolean)) {
      const ent = state.puzzle.entries.find((e) => e.id === id);
      if (ent) evaluateEntryCompletion(ent);
    }

    if (autoAdvanceEmpty && clean) {
      advanceToNextEmptyCell();
    }

    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    updateProgressMetrics();
  }

  function entryReading(entry) {
    return String(entry.item?.furigana || entry.item?.reading || "");
  }

  function resolveTypedEntryChars(entry, rawText) {
    const raw = String(rawText || "").replace(/\s+/g, "");
    if (entry.script === "english") return [...raw];
    const typed = hasLatin(raw) ? convertTypedRomaji(raw, { final: true }) : raw;
    return matchExpectedAnswer(typed, entry.chars, entryReading(entry)) || [...typed];
  }

  function convertAnswerInputLive(inputEl, entry) {
    if (!entry || entry.script === "english") return;
    const val = inputEl.value;
    if (!hasLatin(val)) return;
    const next = convertTypedRomaji(val);
    if (next !== val) inputEl.value = next;
  }

  function activeSquareDraft() {
    const key = `${state.activeEntryId}:${state.activeCell.row}:${state.activeCell.col}`;
    if (state.squareDraft?.key !== key || state.roundEnded || getActiveEntry()?.completed) state.squareDraft = null;
    return state.squareDraft;
  }

  function squareDraftMessage() {
    const draft = activeSquareDraft();
    return draft?.text ? `Typing${draft.reading ? " reading" : ""}: ${draft.text}${draft.error ? ` · ${draft.error}` : ""}` : "";
  }

  function setSquareDraft(text, reading = false, error = "") {
    state.squareDraft = text ? {
      key: `${state.activeEntryId}:${state.activeCell.row}:${state.activeCell.col}`, text, reading, error
    } : null;
    const input = document.querySelector(".cw-cell.is-active .cw-cell-input");
    if (input) {
      if (input.value !== text) {
        const offset = text.length - input.value.length;
        const start = Math.max(0, input.selectionStart + offset), end = Math.max(0, input.selectionEnd + offset);
        input.value = text;
        input.setSelectionRange(start, end);
      }
      input.dataset.draft = String(Boolean(text));
    }
    const preview = document.querySelector(".cw-square-draft");
    if (preview) {
      preview.textContent = squareDraftMessage();
      preview.hidden = !text;
    }
  }

  function typeIntoSquare(row, col, val, { final = false } = {}) {
    const entry = getActiveEntry();
    const cell = state.puzzle?.grid[row]?.[col];
    if (!entry || !cell || entry.completed || state.roundEnded) return;
    const target = cell.locked
      ? entry.cells.find((pos) => !state.puzzle.grid[pos.row][pos.col].locked) : { row, col };
    if (!target) return;
    const targetCell = state.puzzle.grid[target.row][target.col];
    if (!val) { setSquareDraft(""); return; }
    if (entry.script === "english") {
      setSquareDraft("");
      state.activeCell = { ...target };
      setCellChar(target.row, target.col, val, { autoAdvanceEmpty: true });
      return;
    }
    const kanjiAnswer = entry.chars.some((c) => hasKanji(c));
    if (kanjiAnswer) {
      const typed = convertTypedRomaji(val, { final: true });
      const index = entry.cells.findIndex((pos) => pos.row === row && pos.col === col);
      const prefix = entry.chars.slice(0, index);
      const kanaPrefix = prefix.length && prefix.every((char, i) => !hasKanji(char)
        && state.puzzle.grid[entry.cells[i].row][entry.cells[i].col].value === char);
      const hit = matchExpectedAnswer(typed, entry.chars, entryReading(entry))
        || (kanaPrefix && matchExpectedAnswer(prefix.join("") + typed, entry.chars, entryReading(entry)));
      if (hit) {
        setSquareDraft("");
        applyEntryAnswer(entry, hit.join(""));
        return;
      }
    }
    if (hasKanji(val) || !hasLatin(val) && !activeSquareDraft()?.reading) {
      setSquareDraft("");
      if ([...val].length === entry.length) {
        applyEntryAnswer(entry, val);
      } else if (cell.locked && val === cell.solution) {
        state.activeCell = { ...target };
        renderPuzzleBoard();
        updateActiveClueBanner();
      } else {
        state.activeCell = { ...target };
        setCellChar(target.row, target.col, val, { autoAdvanceEmpty: true });
      }
      return;
    }
    const { kana, rest } = romajiToKana(val, { final });
    const matchingKanaCell = !rest && [...kana].length === 1
      && toHiragana(kana) === toHiragana(targetCell.solution);
    if (kanjiAnswer && !matchingKanaCell && (hasLatin(val) || activeSquareDraft()?.reading)) {
      setSquareDraft(kana + rest, true);
      if (final) {
        const result = applyEntryAnswer(entry, kana + rest);
        if (result.ok) setSquareDraft("");
        else setSquareDraft(kana + rest, true, result.error);
      }
      return;
    }
    setSquareDraft("");
    state.activeCell = { ...target };
    for (const ch of kana) {
      if (state.roundEnded) break;
      const { row: r, col: c } = state.activeCell;
      const cell = state.puzzle.grid[r]?.[c];
      const out = cell && /[\u30a1-\u30f6]/u.test(cell.solution || "") ? toKatakana(ch) : toHiragana(ch);
      setCellChar(r, c, out, { autoAdvanceEmpty: true });
    }
    if (rest && !state.roundEnded) setSquareDraft(rest);
  }

  function deleteSquare(backward) {
    const { row, col } = state.activeCell;
    const cell = state.puzzle?.grid[row]?.[col];
    if (!cell || cell.locked || state.roundEnded) return;
    setSquareDraft("");
    if (backward && !cell.value) advanceCursorInEntry(-1);
    setCellChar(state.activeCell.row, state.activeCell.col, "");
    focusActiveGridCell();
  }

  function applyEntryAnswer(entry, rawText) {
    if (state.roundEnded || !state.puzzle || !entry) {
      return { ok: false, error: "" };
    }
    const chars = resolveTypedEntryChars(entry, rawText);
    const emptyUnlockCells = entry.cells.filter(({ row, col }) => {
      const cell = state.puzzle.grid[row][col];
      return !cell.locked && !cell.value;
    });
    const unlockedCells = entry.cells.filter(({ row, col }) => !state.puzzle.grid[row][col].locked);

    if (chars.length === 0) {
      return { ok: false, error: "Answer not long enough" };
    }

    const matchesFullLength = chars.length === entry.length;
    const matchesEmptyLength = emptyUnlockCells.length > 0 && chars.length === emptyUnlockCells.length;
    const matchesUnlockedLength = unlockedCells.length > 0 && chars.length === unlockedCells.length;

    if (!matchesFullLength && !matchesEmptyLength && !matchesUnlockedLength) {
      if (chars.length < entry.length) {
        return { ok: false, error: "Answer not long enough" };
      }
      return { ok: false, error: `Answer too long (length is ${entry.length})` };
    }

    const touchedCells = [];
    if (matchesFullLength) {
      for (let i = 0; i < entry.cells.length; i++) {
        const { row, col } = entry.cells[i];
        const cell = state.puzzle.grid[row][col];
        if (cell.locked) continue;
        const ch = chars[i] ?? "";
        cell.value = entry.script === "english" ? ch.toUpperCase() : ch;
        cell.status = "empty";
        touchedCells.push(cell);
      }
    } else if (matchesEmptyLength) {
      emptyUnlockCells.forEach(({ row, col }, i) => {
        const cell = state.puzzle.grid[row][col];
        const ch = chars[i] ?? "";
        cell.value = entry.script === "english" ? ch.toUpperCase() : ch;
        cell.status = "empty";
        touchedCells.push(cell);
      });
    } else if (matchesUnlockedLength) {
      unlockedCells.forEach(({ row, col }, i) => {
        const cell = state.puzzle.grid[row][col];
        const ch = chars[i] ?? "";
        cell.value = entry.script === "english" ? ch.toUpperCase() : ch;
        cell.status = "empty";
        touchedCells.push(cell);
      });
    }

    if (state.settings.gameMode === "suddenDeath") {
      let wrongCount = 0;
      let rightCount = 0;
      for (const { row, col } of entry.cells) {
        const cell = state.puzzle.grid[row][col];
        if (!cell.value) continue;
        if (cell.value === cell.solution) {
          cell.status = "correct";
          rightCount++;
        } else {
          cell.status = "incorrect";
          wrongCount++;
        }
      }
      if (wrongCount > 0) {
        state.popoverError = "";
        delete state.clueErrors[entry.id];
        triggerSuddenDeathLoss(
          entry,
          `💀 Sudden Death! Incorrect answer submitted (${rightCount} correct, ${wrongCount} wrong) — round over.`
        );
        renderPuzzleBoard();
        renderClueLists();
        updateActiveClueBanner();
        renderStudyInspector();
        updateProgressMetrics();
        return { ok: true, error: "" };
      }
    }

    for (const { row, col } of entry.cells) {
      const cell = state.puzzle.grid[row][col];
      for (const id of [cell.acrossId, cell.downId].filter(Boolean)) {
        const ent = state.puzzle.entries.find((e) => e.id === id);
        if (ent) evaluateEntryCompletion(ent);
      }
    }

    state.popoverError = "";
    delete state.clueErrors[entry.id];

    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    updateProgressMetrics();
    return { ok: true, error: "" };
  }

  function canFlipDirection() {
    const cell = state.puzzle?.grid[state.activeCell.row]?.[state.activeCell.col];
    return Boolean(cell?.acrossId && cell?.downId);
  }

  function isCheckDisabled() {
    const availability = state.settings.gameMode === "relaxed" ? "unlimited" : state.settings.checkAvailability;
    return state.roundEnded || !state.puzzle || availability === "disabled"
      || (availability === "limited" && remainingHints() <= 0);
  }

  function handleCheckCurrentWord() {
    if (state.roundEnded || !state.puzzle) return;
    const entry = getActiveEntry();
    if (!entry) return;

    const checkAvail = state.settings.gameMode === "relaxed" ? "unlimited" : state.settings.checkAvailability;
    if (checkAvail === "disabled") return;
    if (checkAvail === "limited" && remainingHints() <= 0) {
      showFeedback("No hints remaining for this puzzle.", "bad");
      return;
    }

    let enteredCount = 0;
    let wrongCount = 0;
    let rightCount = 0;

    entry.cells.forEach(({ row, col }, idx) => {
      const cell = state.puzzle.grid[row][col];
      if (!cell.value) return; // Do NOT reveal missing squares!
      enteredCount++;
      if (cell.value === entry.chars[idx]) {
        cell.status = "correct";
        rightCount++;
      } else {
        cell.status = "incorrect";
        wrongCount++;
      }
    });

    if (enteredCount === 0) {
      showFeedback("Enter at least one character in the current word before checking.");
      return;
    }

    state.hintsUsed++;
    state.checksUsed++;

    if (wrongCount > 0) {
      if (state.settings.gameMode === "suddenDeath") {
        state.roundEnded = true;
        clearInterval(state.timerHandle);
        showFeedback(`Sudden Death! An incorrect character ended the round (${rightCount} correct, ${wrongCount} wrong).`, "bad");
      } else {
        showFeedback(`Checked word: ${rightCount} correct, ${wrongCount} needs correction.`, "bad");
      }
    } else {
      evaluateEntryCompletion(entry);
      showFeedback(`All ${rightCount} entered character(s) in this word are correct!`, "good");
    }

    renderPuzzleBoard();
    renderClueLists();
    renderStudyInspector();
    updateProgressMetrics();
    updateAssistButtons();
  }

  function consumeRevealAllowance() {
    const revealAvail = state.settings.gameMode === "relaxed" ? "unlimited" : state.settings.revealAvailability;
    if (revealAvail === "disabled") return false;
    if (revealAvail === "limited" && remainingHints() <= 0) {
      showFeedback("No reveals remaining for this puzzle.", "bad");
      return false;
    }
    state.hintsUsed++;
    state.revealsUsed++;
    return true;
  }

  function handleRevealSquare() {
    if (state.roundEnded || !state.puzzle) return;
    const { row, col } = state.activeCell;
    const cell = state.puzzle.grid[row]?.[col];
    if (!cell || cell.locked) return;
    if (!consumeRevealAllowance()) return;

    cell.value = cell.solution;
    cell.status = "revealed";
    cell.locked = true;

    for (const id of [cell.acrossId, cell.downId].filter(Boolean)) {
      const ent = state.puzzle.entries.find((e) => e.id === id);
      if (ent) evaluateEntryCompletion(ent, { fromReveal: true });
    }

    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    updateProgressMetrics();
    updateAssistButtons();
  }

  function handleRevealWord() {
    if (state.roundEnded || !state.puzzle) return;
    const entry = getActiveEntry();
    if (!entry || entry.completed) return;
    if (!consumeRevealAllowance()) return;

    entry.cells.forEach(({ row, col }, idx) => {
      const cell = state.puzzle.grid[row][col];
      cell.value = entry.chars[idx];
      if (cell.status !== "correct") cell.status = "revealed";
      cell.locked = true;
    });
    entry.revealed = true;
    state.stats.wordsRevealed++;
    saveJSON(STORAGE_KEYS.stats, state.stats);
    renderLifetimeStats();
    evaluateEntryCompletion(entry, { fromReveal: true });

    for (const { row, col } of entry.cells) {
      const cell = state.puzzle.grid[row][col];
      for (const id of [cell.acrossId, cell.downId].filter(Boolean)) {
        const other = state.puzzle.entries.find((e) => e.id === id);
        if (other && !other.completed) evaluateEntryCompletion(other, { fromReveal: true });
      }
    }

    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    updateProgressMetrics();
    updateAssistButtons();
  }

  function handleRevealPuzzle() {
    if (state.roundEnded || !state.puzzle) return;
    if (!consumeRevealAllowance()) return;

    for (const entry of state.puzzle.entries) {
      if (!entry.completed) {
        state.stats.wordsRevealed++;
      }
      entry.cells.forEach(({ row, col }, idx) => {
        const cell = state.puzzle.grid[row][col];
        cell.value = entry.chars[idx];
        if (cell.status !== "correct") cell.status = "revealed";
        cell.locked = true;
      });
      entry.revealed = true;
      entry.completed = true;
    }
    saveJSON(STORAGE_KEYS.stats, state.stats);
    renderLifetimeStats();

    state.roundEnded = true;
    clearInterval(state.timerHandle);
    const first = state.puzzle.entries[0];
    if (first) inspectCompletedCell(first, first.chars[0]);

    showFeedback("Entire puzzle revealed. Hover or tap any word or kanji to study its details.");
    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    updateProgressMetrics();
    updateAssistButtons();
  }

  function updateSetting(key, value) {
    pendingSettings[key] = value;
    saveJSON(STORAGE_KEYS.settings, pendingSettings);
    syncControlsFromSettings();
  }

  function bindEvents() {
    for (const [id, key] of [["customWordsInput", "customWords"], ["hintLimitInput", "hintLimit"], ["timedMinutesInput", "timedLimitMinutes"]]) {
      document.getElementById(id).addEventListener("change", (event) => {
        const input = event.target;
        if (input.value && input.checkValidity() && Number.isInteger(input.valueAsNumber)) return;
        event.stopImmediatePropagation();
        showFeedback("Enter a valid number to save this setting.", "error");
      });
      document.getElementById(id).addEventListener("input", (event) => {
        const input = event.target;
        if (!input.value || !input.checkValidity() || !Number.isInteger(input.valueAsNumber)) return;
        pendingSettings[key] = input.valueAsNumber;
        saveJSON(STORAGE_KEYS.settings, pendingSettings);
      });
    }
    // Mode pills
    document.getElementById("modePills").addEventListener("click", (e) => {
      const btn = e.target.closest(".cw-mode-pill");
      if (!btn) return;
      updateSetting("gameMode", btn.dataset.mode);
    });

    // Quick controls
    document.getElementById("answerModeSelect").addEventListener("change", (e) => {
      updateSetting("answerMode", e.target.value);
    });
    document.getElementById("levelSelect").addEventListener("change", (e) => {
      updateSetting("level", e.target.value);
    });
    document.getElementById("sizeSelect").addEventListener("change", (e) => {
      updateSetting("size", e.target.value);
    });
    document.getElementById("customWordsInput").addEventListener("change", (e) => {
      updateSetting("customWords", Number(e.target.value) || 10);
    });
    document.getElementById("themeSelect").addEventListener("change", (e) => {
      updateSetting("themeCategory", e.target.value);
    });
    document.getElementById("startGameBtn").addEventListener("click", () => document.getElementById("newPuzzleBtn").click());
    document.getElementById("newPuzzleBtn").addEventListener("click", () => {
      buildNewPuzzle();
    });

    // Settings drawer
    document.getElementById("fontScaleSelect").addEventListener("change", (e) => {
      updateSetting("fontScale", e.target.value);
    });
    document.getElementById("checkAvailSelect").addEventListener("change", (e) => {
      updateSetting("checkAvailability", e.target.value);
    });
    document.getElementById("revealAvailSelect").addEventListener("change", (e) => {
      updateSetting("revealAvailability", e.target.value);
    });
    document.getElementById("hintLimitInput").addEventListener("change", (e) => {
      updateSetting("hintLimit", Math.max(1, Number(e.target.value) || 5));
    });
    document.getElementById("timedMinutesInput").addEventListener("change", (e) => {
      updateSetting("timedLimitMinutes", Math.max(1, Number(e.target.value) || 5));
    });
    document.getElementById("layoutDirSelect").addEventListener("change", (e) => {
      updateSetting("layoutDirection", e.target.value);
    });
    document.getElementById("inputStyleSelect").addEventListener("change", (e) => {
      updateSetting("inputStyle", e.target.value);
    });
    document.getElementById("kanjiFocusToggle").addEventListener("change", (e) => {
      updateSetting("kanjiFocus", e.target.checked);
    });

    // Reset stats
    document.getElementById("resetProgressBtn").addEventListener("click", () => {
      resetPuzzleStats();
      updateProgressMetrics();
      showFeedback("Stats have been reset.");
    });

    // Assistance buttons
    document.getElementById("revealPuzzleBtn").addEventListener("click", handleRevealPuzzle);

    document.getElementById("flipDirBtn").addEventListener("click", () => {
      selectCell(state.activeCell.row, state.activeCell.col, true, { openPopover: state.settings.inputStyle !== "clues" });
      if (state.settings.inputStyle === "cell") focusActiveGridCell();
    });

    // Grid interactions (Click, Tap, Hover, In-Cell Input, Keyboard)
    const gridEl = document.getElementById("crosswordGrid");
    let cellIsComposing = false;

    gridEl.addEventListener("click", (e) => {
      const cellEl = e.target.closest(".cw-cell:not(.block)");
      if (!cellEl) return;
      if (e.target.matches(".cw-cell-input")) {
        state.popoverOpen = true;
        renderGridCluePopover();
        return;
      }
      const r = Number(cellEl.dataset.row);
      const c = Number(cellEl.dataset.col);
      const openPop = state.settings.inputStyle !== "clues";
      selectCell(r, c, true, { openPopover: openPop });
      if (state.settings.inputStyle === "popup") {
        document.getElementById("popoverAnswerInput")?.focus();
      } else if (state.settings.inputStyle === "clues") {
        const activeId = state.activeEntryId;
        const clueInput = document.querySelector(`.cw-clues-panel [data-clue-input-id="${activeId}"]`);
        if (clueInput) {
          clueInput.focus();
        } else {
          focusActiveGridCell();
        }
      } else {
        focusActiveGridCell();
      }
    });

    gridEl.addEventListener("compositionstart", (e) => {
      if (e.target.matches?.(".cw-cell-input")) {
        cellIsComposing = true;
        e.target.dataset.draft = "true";
      }
    });

    gridEl.addEventListener("compositionend", (e) => {
      if (!e.target.matches?.(".cw-cell-input")) return;
      cellIsComposing = false;
      const val = e.target.value;
      const r = Number(e.target.dataset.row);
      const c = Number(e.target.dataset.col);
      typeIntoSquare(r, c, val);
      focusActiveGridCell();
    });

    gridEl.addEventListener("input", (e) => {
      if (!e.target.matches?.(".cw-cell-input") || !e.target.isConnected) return;
      if (cellIsComposing || e.isComposing) return;
      const val = e.target.value;
      const r = Number(e.target.dataset.row);
      const c = Number(e.target.dataset.col);
      typeIntoSquare(r, c, val);
      focusActiveGridCell();
    });

    gridEl.addEventListener("beforeinput", (e) => {
      if (!e.target.matches?.(".cw-cell-input") || cellIsComposing || e.isComposing || e.target.value) return;
      if (["deleteContentBackward", "deleteContentForward"].includes(e.inputType)) {
        e.preventDefault();
        deleteSquare(e.inputType === "deleteContentBackward");
      }
    });

    gridEl.addEventListener("mouseover", (e) => {
      const cellEl = e.target.closest(".cw-cell:not(.block)");
      if (!cellEl || !cellEl.dataset.completedEntry) return;
      const ent = state.puzzle?.entries.find((item) => item.id === cellEl.dataset.completedEntry);
      if (ent?.completed) {
        inspectCompletedCell(ent, cellEl.dataset.char);
      }
    });

    gridEl.addEventListener("keydown", (e) => {
      if (!state.puzzle || cellIsComposing || e.isComposing || e.keyCode === 229) return;
      const { row, col } = state.activeCell;
      const editingDraft = e.target.matches?.(".cw-cell-input") && Boolean(e.target.value);
      if (editingDraft && ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
      if (state.settings.inputStyle === "cell" && editingDraft && ["Enter", " "].includes(e.key)) {
        e.preventDefault();
        typeIntoSquare(row, col, e.target.value, { final: true });
        focusActiveGridCell();
        return;
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        moveGridFocus(row, col, 0, 1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveGridFocus(row, col, 0, -1);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        moveGridFocus(row, col, 1, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveGridFocus(row, col, -1, 0);
      } else if (e.key === " " || e.key === "Tab") {
        e.preventDefault();
        selectCell(row, col, true, { openPopover: state.popoverOpen });
        focusActiveGridCell();
      } else if (e.key === "Escape") {
        if (editingDraft) {
          e.preventDefault();
          setSquareDraft("");
        } else if (state.popoverOpen) {
          e.preventDefault();
          state.popoverOpen = false;
          renderGridCluePopover();
        }
      } else if (e.key === "Backspace" || e.key === "Delete") {
        e.preventDefault();
        deleteSquare(e.key === "Backspace");
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (state.settings.inputStyle === "clues") {
          const activeId = state.activeEntryId;
          document.querySelector(`.cw-clues-panel [data-clue-input-id="${activeId}"]`)?.focus();
        } else {
          if (!state.popoverOpen) {
            state.popoverOpen = true;
            renderGridCluePopover();
          }
          document.getElementById("popoverAnswerInput")?.focus();
        }
      } else if (
        state.settings.inputStyle === "cell" &&
        !e.target.matches?.(".cw-cell-input") &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault();
        typeIntoSquare(row, col, e.key);
        focusActiveGridCell();
      }
    });

    const popEl = document.getElementById("gridCluePopover");
    popEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-popover-action]");
      if (!btn || !state.puzzle) return;
      const action = btn.dataset.popoverAction;
      const entry = getActiveEntry();
      if (action === "close") {
        state.popoverOpen = false;
        state.popoverError = "";
        renderGridCluePopover();
      } else if (action === "flip") {
        selectCell(state.activeCell.row, state.activeCell.col, true, { openPopover: true });
        if (state.settings.inputStyle === "cell") focusActiveGridCell();
      } else if (action === "revealSquare") {
        handleRevealSquare();
      } else if (action === "revealWord") {
        handleRevealWord();
      } else if (action === "check" && entry && !isCheckDisabled()) {
        if (state.settings.inputStyle === "cell" && activeSquareDraft()?.text) {
          typeIntoSquare(state.activeCell.row, state.activeCell.col, state.squareDraft.text, { final: true });
          if (activeSquareDraft()?.error) return;
        }
        const inputEl = document.getElementById("popoverAnswerInput");
        const res = inputEl && inputEl.value.trim()
          ? applyEntryAnswer(entry, inputEl.value) : { ok: true };
        if (!res.ok) {
          state.popoverError = res.error;
          const errEl = document.getElementById("popoverErrorMsg");
          if (errEl) {
            errEl.textContent = res.error;
            errEl.hidden = !res.error;
          }
        } else handleCheckCurrentWord();
      }
    });

    popEl.addEventListener("input", (e) => {
      if (e.target.id !== "popoverAnswerInput" || e.isComposing) return;
      convertAnswerInputLive(e.target, getActiveEntry());
    });

    popEl.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Escape") {
        e.preventDefault();
        state.popoverOpen = false;
        state.popoverError = "";
        renderGridCluePopover();
        focusActiveGridCell();
      } else if (e.key === "Enter" && e.target.id === "popoverAnswerInput") {
        e.preventDefault();
        const entry = getActiveEntry();
        if (!entry) return;
        const res = applyEntryAnswer(entry, e.target.value);
        if (!res.ok) {
          state.popoverError = res.error;
          const errEl = document.getElementById("popoverErrorMsg");
          if (errEl) {
            errEl.textContent = res.error;
            errEl.hidden = !res.error;
          }
        }
      }
    });

    const cluesPanel = document.querySelector(".cw-clues-panel");
    cluesPanel.addEventListener("click", (e) => {
      const saveBtn = e.target.closest("[data-clue-check-id]");
      if (saveBtn && state.puzzle) {
        e.stopPropagation();
        if (isCheckDisabled()) return;
        const entryId = saveBtn.dataset.clueCheckId;
        const entry = state.puzzle.entries.find((ent) => ent.id === entryId);
        const inputEl = cluesPanel.querySelector(`[data-clue-input-id="${entryId}"]`);
        if (entry && inputEl) {
          state.activeEntryId = entry.id;
          state.preferredDir = entry.dir;
          const res = inputEl.value.trim() ? applyEntryAnswer(entry, inputEl.value) : { ok: true };
          if (!res.ok) {
            state.clueErrors[entry.id] = res.error;
            renderClueLists();
          } else handleCheckCurrentWord();
        }
        return;
      }

      const revSqBtn = e.target.closest("[data-clue-reveal-sq-id]");
      if (revSqBtn && state.puzzle) {
        e.stopPropagation();
        const entryId = revSqBtn.dataset.clueRevealSqId;
        const entry = state.puzzle.entries.find((ent) => ent.id === entryId);
        if (entry) {
          state.activeEntryId = entry.id;
          state.preferredDir = entry.dir;
          const inEntry = entry.cells.some((c) => c.row === state.activeCell.row && c.col === state.activeCell.col);
          if (!inEntry || state.puzzle.grid[state.activeCell.row]?.[state.activeCell.col]?.locked) {
            const nextOpen = entry.cells.find(({ row, col }) => !state.puzzle.grid[row][col].locked) || entry.cells[0];
            state.activeCell = { row: nextOpen.row, col: nextOpen.col };
          }
          handleRevealSquare();
        }
        return;
      }

      const revWordBtn = e.target.closest("[data-clue-reveal-word-id]");
      if (revWordBtn && state.puzzle) {
        e.stopPropagation();
        const entryId = revWordBtn.dataset.clueRevealWordId;
        const entry = state.puzzle.entries.find((ent) => ent.id === entryId);
        if (entry) {
          state.activeEntryId = entry.id;
          state.preferredDir = entry.dir;
          handleRevealWord();
        }
        return;
      }

      if (e.target.closest(".cw-clue-inline-input")) {
        const inputEl = e.target.closest(".cw-clue-inline-input");
        const entry = state.puzzle?.entries.find((ent) => ent.id === inputEl.dataset.clueInputId);
        if (entry && state.activeEntryId !== entry.id) {
          state.activeEntryId = entry.id;
          state.preferredDir = entry.dir;
          const firstEmpty = entry.cells.find(({ row, col }) => !state.puzzle.grid[row][col].value && !state.puzzle.grid[row][col].locked) || entry.cells[0];
          state.activeCell = { row: firstEmpty.row, col: firstEmpty.col };
          renderPuzzleBoard();
          updateActiveClueBanner();
          cluesPanel.querySelectorAll(".cw-clue-item").forEach((li) => {
            li.classList.toggle("active", li.dataset.entryId === entry.id);
          });
        }
        return;
      }

      const itemEl = e.target.closest(".cw-clue-item");
      if (!itemEl || !state.puzzle) return;
      const entry = state.puzzle.entries.find((ent) => ent.id === itemEl.dataset.entryId);
      if (!entry) return;
      state.activeEntryId = entry.id;
      state.preferredDir = entry.dir;
      const firstEmpty = entry.cells.find(({ row, col }) => !state.puzzle.grid[row][col].value && !state.puzzle.grid[row][col].locked) || entry.cells[0];
      state.activeCell = { row: firstEmpty.row, col: firstEmpty.col };
      state.popoverOpen = state.settings.inputStyle !== "clues";
      state.popoverError = "";
      if (entry.completed) inspectCompletedCell(entry, entry.chars[0]);
      renderPuzzleBoard();
      renderClueLists();
      updateActiveClueBanner();
      const inlineInput = cluesPanel.querySelector(`[data-clue-input-id="${entry.id}"]`);
      if (inlineInput) {
        inlineInput.focus();
      } else if (state.settings.inputStyle === "popup") {
        document.getElementById("popoverAnswerInput")?.focus();
      } else {
        focusActiveGridCell();
      }
    });

    cluesPanel.addEventListener("input", (e) => {
      const inputEl = e.target.closest?.(".cw-clue-inline-input");
      if (!inputEl || e.isComposing) return;
      const entry = state.puzzle?.entries.find((ent) => ent.id === inputEl.dataset.clueInputId);
      convertAnswerInputLive(inputEl, entry);
    });

    cluesPanel.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter" && e.target.matches?.(".cw-clue-inline-input")) {
        e.preventDefault();
        const entryId = e.target.dataset.clueInputId;
        const entry = state.puzzle?.entries.find((ent) => ent.id === entryId);
        if (!entry) return;
        state.activeEntryId = entry.id;
        state.preferredDir = entry.dir;
        const res = applyEntryAnswer(entry, e.target.value);
        if (!res.ok) {
          state.clueErrors[entry.id] = res.error;
          renderClueLists();
          cluesPanel.querySelector(`[data-clue-input-id="${entryId}"]`)?.focus();
        }
      }
    });

    cluesPanel.addEventListener("mouseover", (e) => {
      const itemEl = e.target.closest(".cw-clue-item.completed");
      if (!itemEl || !state.puzzle) return;
      const entry = state.puzzle.entries.find((ent) => ent.id === itemEl.dataset.entryId);
      if (entry?.completed) inspectCompletedCell(entry, entry.chars[0]);
    });

    // Study inspector interactions (Kanji chips & Audio buttons)
    const inspector = document.getElementById("studyInspector");
    inspector.addEventListener("click", (e) => {
      const speakBtn = e.target.closest("[data-speak-ja]");
      if (speakBtn) {
        speakJapanese(speakBtn.dataset.speakJa);
        return;
      }
      const kanjiChip = e.target.closest("[data-inspect-kanji]");
      if (kanjiChip) {
        const ch = kanjiChip.dataset.inspectKanji;
        state.inspectedKanjiChar = ch;
        ensureKanjiDetail(ch).then(() => renderStudyInspector());
        renderStudyInspector();
      }
    });

    inspector.addEventListener("mouseover", (e) => {
      const kanjiChip = e.target.closest("[data-inspect-kanji]");
      if (kanjiChip && state.inspectedKanjiChar !== kanjiChip.dataset.inspectKanji) {
        const ch = kanjiChip.dataset.inspectKanji;
        state.inspectedKanjiChar = ch;
        ensureKanjiDetail(ch).then(() => renderStudyInspector());
        renderStudyInspector();
      }
    });
  }

  function moveGridFocus(row, col, dr, dc) {
    if (!state.puzzle) return;
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < state.puzzle.rows && c >= 0 && c < state.puzzle.cols) {
      if (state.puzzle.grid[r][c]) {
        state.preferredDir = dr !== 0 ? "down" : "across";
        selectCell(r, c, false);
        focusActiveGridCell();
        return;
      }
      r += dr;
      c += dc;
    }
  }

  function focusActiveGridCell() {
    const { row, col } = state.activeCell;
    const cellEl = document.querySelector(`.cw-cell[data-row="${row}"][data-col="${col}"]`);
    const cellInput = cellEl?.querySelector(".cw-cell-input");
    if (cellInput) {
      cellInput.focus({ preventScroll: true });
    } else {
      cellEl?.focus({ preventScroll: true });
    }
  }

  renderShell();
  mountGameExport(document.getElementById("crosswordGrid").parentElement, () => {
    const puzzle = state.puzzle;
    if (!puzzle?.entries.length) return null;
    const solution = new Map();
    puzzle.entries.forEach((entry) => entry.cells.forEach(({ row, col }, index) => solution.set(`${row},${col}`, entry.chars[index])));
    return {
      title: "Pazuru", filename: "pazuru",
      grid: puzzle.grid.map((row, rowIndex) => row.map((cell, columnIndex) => cell ? { number: cell.number, answer: solution.get(`${rowIndex},${columnIndex}`) } : null)),
      sections: [["Across", puzzle.across], ["Down", puzzle.down]].map(([title, entries]) => ({ title, lines: entries.map((entry) => ({
        text: `${entry.number}. ${entry.clue.text}`,
        answer: `${entry.number}. ${entry.clue.text} — ${entry.answer}`
      })) }))
    };
  });
  Object.assign(state.settings, { audio: study.audio, furigana: study.furigana, romanization: study.romaji });
  mountStudyControls({ onChange: (options) => {
    const drafts = [...document.querySelectorAll("#popoverAnswerInput, .cw-clue-inline-input")].map((input) => ({
      id: input.id, entryId: input.dataset.clueInputId, value: input.value,
      start: input.selectionStart, end: input.selectionEnd
    }));
    Object.assign(state.settings, { audio: options.audio, furigana: options.furigana, romanization: options.romaji });
    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    for (const draft of drafts) {
      const input = draft.id ? document.getElementById(draft.id)
        : document.querySelector(`[data-clue-input-id="${draft.entryId}"]`);
      if (input) {
        input.value = draft.value;
        input.setSelectionRange(draft.start, draft.end);
      }
    }
  } });
  syncControlsFromSettings();
  bindEvents();
  document.getElementById("resetProgressBtn").disabled = true;
})();
