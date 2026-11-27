import { html, setHTML } from "./html.js";
import { createSessionView } from "./session-view.js";
import "./crossword.css";
import { ensureKanjiDetail as fetchKanjiDetail, loadVocabularyPool as fetchVocabularyPool } from "./crossword-api.js";
import { createCrosswordBoardRenderer } from "./crossword-board.js";
import { generateCrossword, hasKanji, PUZZLE_SIZES } from "./crossword-engine.js";
import { bindCrosswordEvents } from "./crossword-events.js";
import { createCrosswordInputController } from "./crossword-input.js";
import { renderStudyInspector as renderInspector } from "./crossword-inspector.js";
import { renderCrosswordShell } from "./crossword-shell.js";
import {
  defaultSettings,
  defaultStats,
  formatTime,
  GAME_MODES,
  loadCrosswordJSON,
  effectiveAnswerMode as resolveAnswerMode,
  STORAGE_KEYS,
  saveCrosswordJSON,
} from "./crossword-storage.js";
import { mountGameExport } from "./game-export.js";
import { beginLoading } from "./request-loading.js";
import { setSettingAvailability } from "./settings-panel.js";
import { mountStudyControls, speakJapanese, study } from "./study-controls.js";

(() => {
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
    feedback: { text: "", tone: "" },
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
  const effectiveAnswerMode = (settings = state.settings) => resolveAnswerMode(/** @type {any} */ (settings));
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
    setSettingAvailability(
      answerSelect,
      ["kanjiChallenge", "kanaChallenge", "reverse"].includes(s.gameMode)
        ? "Answer mode is set by this challenge."
        : "",
    );

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
      hintLimitInput:
        s.gameMode === "relaxed" || ![s.checkAvailability, s.revealAvailability].includes("limited")
          ? "Choose limited checks or reveals outside Relaxed mode."
          : "",
      timedMinutesInput: s.gameMode !== "timed" ? "Used in Timed Challenge." : "",
      kanjiFocusToggle: s.gameMode === "reverse" ? "Reverse mode uses Japanese words as clues." : "",
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
    return (
      state.roundEnded ||
      !state.puzzle ||
      revealAvail === "disabled" ||
      (revealAvail === "limited" && remainingHints() <= 0)
    );
  }

  function updateAssistButtons() {
    const s = state.settings;
    const isRelaxed = s.gameMode === "relaxed";
    const checkAvail = isRelaxed ? "unlimited" : s.checkAvailability;
    const revealAvail = isRelaxed ? "unlimited" : s.revealAvailability;

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
    state.timerSeconds = isCountdown ? Math.max(1, Number(state.settings.timedLimitMinutes) || 5) * 60 : 0;
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
    const doneLoading = beginLoading(
      [...document.querySelectorAll("#newPuzzleBtn, #nextPuzzleBtn")],
      document.getElementById("cwWorkspace"),
    );
    const startError = document.getElementById("startError");
    startError.hidden = true;
    showFeedback("Generating your Japanese vocabulary crossword…");
    try {
      const s = { ...pendingSettings };
      if (s.level === "none") throw new Error("Choose at least one JLPT level to start a puzzle.");
      const rawPool = await loadVocabularyPool(s.level);

      const sizeSpec = PUZZLE_SIZES[s.size] || PUZZLE_SIZES.medium;
      const targetWords =
        s.size === "custom" ? Math.max(4, Math.min(18, Number(s.customWords) || 10)) : sizeSpec.targetWords;
      const gridSize = s.size === "custom" ? Math.max(8, Math.min(16, targetWords + 2)) : sizeSpec.gridSize;

      const seed = `${Date.now()}-${Math.random()}`;
      const recentIds = Array.isArray(state.stats.recentWordIds) ? state.stats.recentWordIds : [];

      const puzzle = generateCrossword(rawPool, {
        gridSize,
        targetWords,
        answerMode: effectiveAnswerMode(s),
        kanjiFocus: s.kanjiFocus,
        recentIds,
        seed: /** @type {any} */ (seed),
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

  const {
    convertAnswerInputLive,
    activeSquareDraft,
    squareDraftMessage,
    setSquareDraft,
    typeIntoSquare,
    deleteSquare,
    applyEntryAnswer,
  } = createCrosswordInputController({
    state,
    getActiveEntry,
    evaluateEntryCompletion,
    advanceCursorInEntry,
    advanceToNextEmptyCell,
    triggerSuddenDeathLoss,
    focusActiveGridCell,
    syncViews: () => {
      renderPuzzleBoard();
      renderClueLists();
      updateActiveClueBanner();
      renderStudyInspector();
      updateProgressMetrics();
    },
    renderBoardAndBanner: () => {
      renderPuzzleBoard();
      updateActiveClueBanner();
    },
  });

  const {
    narrowGridViewport,
    renderPuzzleBoard,
    renderGridCluePopover,
    updateActiveClueBanner,
    renderClueLists,
    renderLifetimeStats,
  } = createCrosswordBoardRenderer({
    state,
    getActiveEntry,
    activeSquareDraft,
    squareDraftMessage,
    canFlipDirection,
    isCheckDisabled,
    isRevealDisabled,
  });

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
    if (!entry?.completed) return;
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
    const startIdx = Math.max(idx, 0);

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

  function canFlipDirection() {
    const cell = state.puzzle?.grid[state.activeCell.row]?.[state.activeCell.col];
    return Boolean(cell?.acrossId && cell?.downId);
  }

  function isCheckDisabled() {
    const availability = state.settings.gameMode === "relaxed" ? "unlimited" : state.settings.checkAvailability;
    return (
      state.roundEnded ||
      !state.puzzle ||
      availability === "disabled" ||
      (availability === "limited" && remainingHints() <= 0)
    );
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
        showFeedback(
          `Sudden Death! An incorrect character ended the round (${rightCount} correct, ${wrongCount} wrong).`,
          "bad",
        );
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
    bindCrosswordEvents({
      state,
      pendingSettings,
      saveJSON,
      showFeedback,
      updateSetting,
      buildNewPuzzle,
      resetPuzzleStats,
      updateProgressMetrics,
      updateAssistButtons,
      showResults,
      handleRevealPuzzle,
      selectCell,
      focusActiveGridCell,
      moveGridFocus,
      activeSquareDraft,
      setSquareDraft,
      typeIntoSquare,
      deleteSquare,
      applyEntryAnswer,
      convertAnswerInputLive,
      getActiveEntry,
      isCheckDisabled,
      handleCheckCurrentWord,
      handleRevealSquare,
      handleRevealWord,
      inspectCompletedCell,
      renderPuzzleBoard,
      renderGridCluePopover,
      renderClueLists,
      updateActiveClueBanner,
      renderStudyInspector,
      ensureKanjiDetail,
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
    settings: document.querySelector(".cw-top-card"),
    start: document.getElementById("newPuzzleBtn"),
    results,
    footer: true,
    play: [document.getElementById("cwWorkspace"), document.querySelector(".cw-status-bar")],
    keepResults: [document.getElementById("studyInspector")],
  });
  document.getElementById("cwEmpty").hidden = true;
  function showResults(title) {
    const solved = state.puzzle.entries.filter((entry) => entry.completed && !entry.revealed).length;
    setHTML(
      results,
      html`<h2 data-i18n-scope>${title}</h2><p data-i18n-scope>${solved} / ${state.puzzle.entries.length} words solved · ${state.stats.wordsRevealed} revealed · ${state.hintsUsed} hints</p>`,
    );
    sessionView.finish();
    renderStudyInspector();
  }
  mountGameExport(document.getElementById("crosswordGrid").parentElement, () => {
    const puzzle = state.puzzle;
    if (!puzzle?.entries.length) return null;
    const solution = new Map();
    puzzle.entries.forEach((entry) =>
      entry.cells.forEach(({ row, col }, index) => solution.set(`${row},${col}`, entry.chars[index])),
    );
    return {
      title: "Pazuru",
      filename: "pazuru",
      grid: puzzle.grid.map((row, rowIndex) =>
        row.map((cell, columnIndex) =>
          cell ? { number: cell.number, answer: solution.get(`${rowIndex},${columnIndex}`) } : null,
        ),
      ),
      sections: [
        ["Across", puzzle.across],
        ["Down", puzzle.down],
      ].map(([title, entries]) => ({
        title,
        lines: entries.map((entry) => ({
          text: `${entry.number}. ${entry.clue.text}`,
          answer: `${entry.number}. ${entry.clue.text} — ${entry.answer}`,
        })),
      })),
    };
  });
  Object.assign(state.settings, { audio: study.audio, furigana: study.furigana, romanization: study.romaji });
  mountStudyControls({
    onChange: (options) => {
      const drafts = [...document.querySelectorAll("#popoverAnswerInput, .cw-clue-inline-input")].map((input) => ({
        id: input.id,
        entryId: input.dataset.clueInputId,
        value: input.value,
        start: input.selectionStart,
        end: input.selectionEnd,
      }));
      Object.assign(state.settings, { audio: options.audio, furigana: options.furigana, romanization: options.romaji });
      renderPuzzleBoard();
      renderClueLists();
      updateActiveClueBanner();
      renderStudyInspector();
      for (const draft of drafts) {
        const input = draft.id
          ? document.getElementById(draft.id)
          : document.querySelector(`[data-clue-input-id="${draft.entryId}"]`);
        if (input) {
          input.value = draft.value;
          input.setSelectionRange(draft.start, draft.end);
        }
      }
    },
  });
  syncControlsFromSettings();
  bindEvents();
  document.getElementById("resetProgressBtn").disabled = true;
})();
