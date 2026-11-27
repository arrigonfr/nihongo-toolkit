import { STORAGE_KEYS } from "./crossword-storage.js";
import { speakJapanese } from "./study-controls.js";

export function bindCrosswordEvents({
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
}) {
  for (const [id, key] of [
    ["customWordsInput", "customWords"],
    ["hintLimitInput", "hintLimit"],
    ["timedMinutesInput", "timedLimitMinutes"],
  ]) {
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
    selectCell(state.activeCell.row, state.activeCell.col, true, {
      openPopover: state.settings.inputStyle !== "clues",
    });
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
    if (!cellEl?.dataset.completedEntry) return;
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
      const res = inputEl?.value.trim() ? applyEntryAnswer(entry, inputEl.value) : { ok: true };
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
        const firstEmpty =
          entry.cells.find(
            ({ row, col }) => !state.puzzle.grid[row][col].value && !state.puzzle.grid[row][col].locked,
          ) || entry.cells[0];
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
    const firstEmpty =
      entry.cells.find(({ row, col }) => !state.puzzle.grid[row][col].value && !state.puzzle.grid[row][col].locked) ||
      entry.cells[0];
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
