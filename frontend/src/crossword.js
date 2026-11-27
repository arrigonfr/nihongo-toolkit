import { createSessionView } from "./session-view.js";
import { escapeHTML } from "./html.js";
import "./crossword.css";
import { mountGameExport } from "./game-export.js";
import { setSettingAvailability } from "./settings-panel.js";
import { mountStudyControls, study, speakJapanese } from "./study-controls.js";
import { alignFuriganaRuby } from "./furigana.js";
import { beginLoading } from "./request-loading.js";
import { romanizeKana } from "./romanize.js";
import { convertTypedRomaji, hasLatin, matchExpectedAnswer, romajiToKana, toHiragana, toKatakana } from "./kana-input.js";
import {
  PUZZLE_SIZES,
  hasKanji,
  generateCrossword
} from "./crossword-engine.js";
import {
  STORAGE_KEYS,
  GAME_MODES,
  defaultSettings,
  defaultStats,
  loadCrosswordJSON,
  saveCrosswordJSON,
  effectiveAnswerMode as resolveAnswerMode,
  formatTime
} from "./crossword-storage.js";
import { loadVocabularyPool as fetchVocabularyPool, ensureKanjiDetail as fetchKanjiDetail } from "./crossword-api.js";
import { renderCrosswordShell } from "./crossword-shell.js";
import { renderStudyInspector as renderInspector } from "./crossword-inspector.js";

(() => {
  "use strict";

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

  const loadJSON = (key, fallbackFn) => loadCrosswordJSON(key, fallbackFn, reportStorageError);
  const saveJSON = (key, value) => saveCrosswordJSON(key, value, reportStorageError);


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
  delete state.stats.dailyStreak;
  delete state.stats.lastDailyDate;
  delete state.settings.themeCategory;
  if (state.settings.gameMode === "daily") state.settings.gameMode = "classic";
  if (!storageWarning) {
    saveJSON(STORAGE_KEYS.settings, state.settings);
    saveJSON(STORAGE_KEYS.stats, state.stats);
  }

  const root = document.getElementById("crosswordRoot");
  const pendingSettings = { ...state.settings };
  const effectiveAnswerMode = (settings = state.settings) => resolveAnswerMode(settings);
  const loadVocabularyPool = (level) => fetchVocabularyPool(state, level);
  const ensureKanjiDetail = (char) => fetchKanjiDetail(state, char);
  const renderStudyInspector = () => renderInspector(state);

  function isTimerActive() {
    const gm = state.settings.gameMode;
    if (gm === "relaxed") return false;
    return true;
  }

  function applyAppearance() {
    document.documentElement.dataset.fontScale = state.settings.fontScale || "medium";
    document.getElementById("cwWorkspace").dataset.layout = state.settings.layoutDirection;
  }

  function renderShell() {
    renderCrosswordShell(root, { gameMode: state.settings.gameMode, storageWarning });
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
    document.getElementById("endPuzzleBtn").hidden = !state.puzzle || state.roundEnded || !revPuzBtn.disabled;
    document.getElementById("nextPuzzleBtn").hidden = !state.puzzle || !state.roundEnded;

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

  function resetPuzzleStats() {
    state.stats.puzzlesCompleted = 0;
    state.stats.wordsCorrect = 0;
    state.stats.wordsRevealed = 0;
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
          showResults("Time is up");
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
    sessionView.start();
    const doneLoading = beginLoading([...document.querySelectorAll("#newPuzzleBtn, #nextPuzzleBtn")], document.getElementById("cwWorkspace"));
    const startError = document.getElementById("startError");
    startError.hidden = true;
    showFeedback("Generating your Japanese vocabulary crossword…");
    try {
      const s = { ...pendingSettings };
      if (s.level === "none") throw new Error("Choose at least one JLPT level to start a puzzle.");
      const rawPool = await loadVocabularyPool(s.level);


      const sizeSpec = PUZZLE_SIZES[s.size] || PUZZLE_SIZES.medium;
      const targetWords = s.size === "custom"
        ? Math.max(4, Math.min(18, Number(s.customWords) || 10))
        : sizeSpec.targetWords;
      const gridSize = s.size === "custom"
        ? Math.max(8, Math.min(16, targetWords + 2))
        : sizeSpec.gridSize;

      const seed = `${Date.now()}-${Math.random()}`;
      const recentIds = Array.isArray(state.stats.recentWordIds) ? state.stats.recentWordIds : [];

      const puzzle = generateCrossword(rawPool, {
        gridSize,
        targetWords,
        answerMode: effectiveAnswerMode(s),
        kanjiFocus: s.kanjiFocus,
        recentIds,
        seed
      });

      if (puzzle.entries.length < 2) {
        const words = effectiveAnswerMode(s) === "kanji" ? "kanji words" : "words";
        throw new Error(`Could not find enough connected ${words} for this puzzle. Try a wider JLPT range.`);
      }

      if (puzzle.entries.length > 0) {
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
      sessionView.setup();
      if (!state.puzzle) {
        renderPuzzleBoard();
        document.getElementById("activeClueText").textContent = "No crossword available.";
      }
      showFeedback("");
      startError.textContent = error.message || "Could not load vocabulary for this puzzle.";
      startError.hidden = false;
    } finally {
      await doneLoading();
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
      if (state.settings.inputStyle === "popup" && state.activeEntryId === entry.id) state.popoverOpen = false;
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

      saveJSON(STORAGE_KEYS.stats, state.stats);
      showFeedback("🎉 おめでとう！ Puzzle completed! Hover or tap any completed word or kanji to review.", "good");
      updateAssistButtons();
      renderLifetimeStats();
      showResults("Puzzle complete");
    }
  }

  function updateProgressMetrics() {
    if (!state.puzzle) return;
    const completed = state.puzzle.entries.filter((e) => e.completed).length;
    const total = state.puzzle.entries.length;
    document.getElementById("progressMetric").textContent = `${completed} / ${total}`;
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
        const displayChars = [...new Set(Object.values(cell.displayChars || {}))];
        const solved = cell.value && cell.value === cell.solution;
        const split = solved && displayChars.length === 2;
        const display = solved ? displayChars[0] || cell.value : cell.value;
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
            <span class="cw-cell-char${split ? " cw-cell-split" : ""}" lang="ja">${split ? displayChars.map((character) => `<span>${escapeHTML(character)}</span>`).join("") : escapeHTML(display)}</span>
            ${cellInputHTML}
            ${romajiHint ? `<span class="cw-cell-romaji">${escapeHTML(romajiHint)}</span>` : ""}
          </div>
        `);
      }
    }
    gridEl.innerHTML = cellsHTML.join("");
    renderGridCluePopover();
  }

  const narrowGridViewport = window.matchMedia("(max-width: 760px)");

  function positionInlineClue() {
    const popEl = document.getElementById("gridCluePopover");
    const gridScroll = document.getElementById("gridScrollWrap");
    if (!popEl?.classList.contains("cw-cell-popover-inline") || !gridScroll) return;
    if (narrowGridViewport.matches) {
      if (popEl.nextElementSibling !== gridScroll) gridScroll.before(popEl);
    } else if (gridScroll.nextElementSibling !== popEl) {
      gridScroll.after(popEl);
    }
  }
  narrowGridViewport.addEventListener("change", positionInlineClue);

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
    if (inSquare) positionInlineClue();
    else if (popEl.parentElement !== stageEl) stageEl.append(popEl);
    boardPanel?.classList.toggle("popover-open", !!(state.puzzle && entry && state.popoverOpen && shouldShowPopup));
    boardPanel?.classList.toggle("clue-popup-open", !!(state.puzzle && entry && state.popoverOpen && state.settings.inputStyle === "popup"));
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
      ${!inSquare && state.settings.romanization && entry.clue.romaji ? `<div class="cw-active-clue-sub">Romaji: ${escapeHTML(entry.clue.romaji)}</div>` : ""}

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
                <span class="cw-badge" data-i18n>${escapeHTML(entry.clue.badge)}</span>
                <span data-i18n>Length: ${entry.length}</span>
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

  function renderLifetimeStats() {
    document.getElementById("statPuzzlesCompleted").textContent = String(state.stats.puzzlesCompleted || 0);
    document.getElementById("statWordsCorrect").textContent = String(state.stats.wordsCorrect || 0);
    document.getElementById("statWordsRevealed").textContent = String(state.stats.wordsRevealed || 0);
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
    showResults("Sudden Death ended");
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
        showResults("Sudden Death ended");
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
      entry.revealed ||= !entry.completed;
      entry.completed = true;
    }
    saveJSON(STORAGE_KEYS.stats, state.stats);
    renderLifetimeStats();

    state.roundEnded = true;
    clearInterval(state.timerHandle);

    showFeedback("Entire puzzle revealed. Hover or tap any word or kanji to study its details.");
    renderPuzzleBoard();
    renderClueLists();
    updateActiveClueBanner();
    renderStudyInspector();
    updateProgressMetrics();
    updateAssistButtons();
    showResults("Puzzle revealed");
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
    document.getElementById("newPuzzleBtn").addEventListener("click", () => {
      buildNewPuzzle();
    });
    document.getElementById("nextPuzzleBtn").addEventListener("click", () => {
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
    document.getElementById("endPuzzleBtn").addEventListener("click", () => {
      state.roundEnded = true;
      clearInterval(state.timerHandle);
      showFeedback("Puzzle ended. Start a new puzzle when you are ready.");
      updateAssistButtons();
      showResults("Puzzle ended");
    });

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
      const clue = document.getElementById("gridCluePopover");
      if (narrowGridViewport.matches && !clue.hidden) {
        const tile = cellEl.getBoundingClientRect();
        const card = clue.getBoundingClientRect();
        if (tile.top < card.bottom && tile.bottom > card.top) {
          window.scrollBy({ top: tile.top - card.bottom - 8, behavior: "instant" });
        }
      }
    } else {
      cellEl?.focus({ preventScroll: true });
    }
  }

  renderShell();
  const results = document.createElement("section");
  results.id = "puzzleResults";
  results.className = "cw-study-panel";
  document.getElementById("cwWorkspace").after(results);
  const sessionView = createSessionView({
    settings: document.querySelector(".cw-top-card"), start: document.getElementById("newPuzzleBtn"), results, footer: true,
    play: [document.getElementById("cwWorkspace"), document.querySelector(".cw-status-bar")],
    keepResults: [document.getElementById("studyInspector")]
  });
  document.getElementById("cwEmpty").hidden = true;
  function showResults(title) {
    const solved = state.puzzle.entries.filter((entry) => entry.completed && !entry.revealed).length;
    results.innerHTML = `<h2>${title}</h2><p>${solved} / ${state.puzzle.entries.length} words solved · ${state.stats.wordsRevealed} revealed · ${state.hintsUsed} hints</p>`;
    sessionView.finish();
    renderStudyInspector();
  }
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
