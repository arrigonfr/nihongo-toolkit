import { hasKanji } from "./crossword-engine.js";
import {
  convertTypedRomaji,
  hasLatin,
  matchExpectedAnswer,
  romajiToKana,
  toHiragana,
  toKatakana,
} from "./kana-input.js";

export function createCrosswordInputController({
  state,
  getActiveEntry,
  evaluateEntryCompletion,
  advanceCursorInEntry,
  advanceToNextEmptyCell,
  triggerSuddenDeathLoss,
  focusActiveGridCell,
  syncViews,
  renderBoardAndBanner,
}) {
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
    return draft?.text
      ? `Typing${draft.reading ? " reading" : ""}: ${draft.text}${draft.error ? ` · ${draft.error}` : ""}`
      : "";
  }

  function setSquareDraft(text, reading = false, error = "") {
    state.squareDraft = text
      ? {
          key: `${state.activeEntryId}:${state.activeCell.row}:${state.activeCell.col}`,
          text,
          reading,
          error,
        }
      : null;
    const input = document.querySelector(".cw-cell.is-active .cw-cell-input");
    if (input) {
      if (input.value !== text) {
        const offset = text.length - input.value.length;
        const start = Math.max(0, input.selectionStart + offset),
          end = Math.max(0, input.selectionEnd + offset);
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

  function setCellChar(row, col, charValue, { autoAdvanceEmpty = false } = {}) {
    if (state.roundEnded || !state.puzzle) return;
    const cell = state.puzzle.grid[row]?.[col];
    if (!cell || cell.locked) return;

    const chars = [...String(charValue || "").replace(/\s+/g, "")];
    if (chars.length > 1) {
      // Multi-character commit (e.g. Japanese IME phrase conversion directly in cell)
      const entry = getActiveEntry();
      if (entry) {
        const startIdx = Math.max(
          0,
          entry.cells.findIndex((c) => c.row === row && c.col === col),
        );
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
            `💀 Sudden Death! Incorrect character entered (${rightCount} correct, ${wrongCount} wrong) — round over.`,
          );
          syncViews();
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
        syncViews();
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
        triggerSuddenDeathLoss(activeEntry, `💀 Sudden Death! "${normalized}" is incorrect — round over.`);
        syncViews();
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

    syncViews();
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

    if (matchesFullLength) {
      for (let i = 0; i < entry.cells.length; i++) {
        const { row, col } = entry.cells[i];
        const cell = state.puzzle.grid[row][col];
        if (cell.locked) continue;
        const ch = chars[i] ?? "";
        cell.value = entry.script === "english" ? ch.toUpperCase() : ch;
        cell.status = "empty";
      }
    } else if (matchesEmptyLength) {
      emptyUnlockCells.forEach(({ row, col }, i) => {
        const cell = state.puzzle.grid[row][col];
        const ch = chars[i] ?? "";
        cell.value = entry.script === "english" ? ch.toUpperCase() : ch;
        cell.status = "empty";
      });
    } else if (matchesUnlockedLength) {
      unlockedCells.forEach(({ row, col }, i) => {
        const cell = state.puzzle.grid[row][col];
        const ch = chars[i] ?? "";
        cell.value = entry.script === "english" ? ch.toUpperCase() : ch;
        cell.status = "empty";
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
          `💀 Sudden Death! Incorrect answer submitted (${rightCount} correct, ${wrongCount} wrong) — round over.`,
        );
        syncViews();
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
    syncViews();
    return { ok: true, error: "" };
  }

  function typeIntoSquare(row, col, val, { final = false } = {}) {
    const entry = getActiveEntry();
    const cell = state.puzzle?.grid[row]?.[col];
    if (!entry || !cell || entry.completed || state.roundEnded) return;
    const target = cell.locked ? entry.cells.find((pos) => !state.puzzle.grid[pos.row][pos.col].locked) : { row, col };
    if (!target) return;
    const targetCell = state.puzzle.grid[target.row][target.col];
    if (!val) {
      setSquareDraft("");
      return;
    }
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
      const kanaPrefix =
        prefix.length &&
        prefix.every(
          (char, i) => !hasKanji(char) && state.puzzle.grid[entry.cells[i].row][entry.cells[i].col].value === char,
        );
      const hit =
        matchExpectedAnswer(typed, entry.chars, entryReading(entry)) ||
        (kanaPrefix && matchExpectedAnswer(prefix.join("") + typed, entry.chars, entryReading(entry)));
      if (hit) {
        setSquareDraft("");
        applyEntryAnswer(entry, hit.join(""));
        return;
      }
    }
    if (hasKanji(val) || (!hasLatin(val) && !activeSquareDraft()?.reading)) {
      setSquareDraft("");
      if ([...val].length === entry.length) {
        applyEntryAnswer(entry, val);
      } else if (cell.locked && val === cell.solution) {
        state.activeCell = { ...target };
        renderBoardAndBanner();
      } else {
        state.activeCell = { ...target };
        setCellChar(target.row, target.col, val, { autoAdvanceEmpty: true });
      }
      return;
    }
    const { kana, rest } = romajiToKana(val, { final });
    const matchingKanaCell = !rest && [...kana].length === 1 && toHiragana(kana) === toHiragana(targetCell.solution);
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
      const nextCell = state.puzzle.grid[r]?.[c];
      const out = nextCell && /[\u30a1-\u30f6]/u.test(nextCell.solution || "") ? toKatakana(ch) : toHiragana(ch);
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

  return {
    convertAnswerInputLive,
    activeSquareDraft,
    squareDraftMessage,
    setSquareDraft,
    setCellChar,
    typeIntoSquare,
    deleteSquare,
    applyEntryAnswer,
  };
}
