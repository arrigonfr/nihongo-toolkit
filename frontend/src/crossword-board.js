import { html, raw, setHTML } from "./html.js";
import { romanizeKana } from "./romanize.js";

export function createCrosswordBoardRenderer({
  state,
  getActiveEntry,
  activeSquareDraft,
  squareDraftMessage,
  canFlipDirection,
  isCheckDisabled,
  isRevealDisabled,
}) {
  const narrowGridViewport = window.matchMedia("(max-width: 760px)");

  function formatClueDisplay(clue) {
    if (state.settings.furigana && clue.furiganaHTML) {
      return raw(clue.furiganaHTML);
    }
    return clue.text;
  }

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
    boardPanel?.classList.toggle(
      "clue-popup-open",
      !!(state.puzzle && entry && state.popoverOpen && state.settings.inputStyle === "popup"),
    );
    if (!state.puzzle || !entry || !state.popoverOpen || !shouldShowPopup) {
      popEl.hidden = true;
      setHTML(popEl, "");
      return;
    }

    const dirLabel = entry.dir === "across" ? "Across · ヨコ" : "Down · タテ";
    const showTextBox = state.settings.inputStyle === "popup" && !entry.completed && !state.roundEnded;
    const emptyCount = entry.cells.filter(
      ({ row, col }) => !state.puzzle.grid[row][col].value && !state.puzzle.grid[row][col].locked,
    ).length;
    const revDisabled = isRevealDisabled() || entry.completed;
    const checkDisabled = isCheckDisabled();

    popEl.hidden = false;
    setHTML(
      popEl,
      html`
      <div class="cw-popover-top">
        <div class="cw-popover-meta">
          <span class="cw-active-clue-id" data-i18n-scope>${entry.number} ${dirLabel}</span>
          <span class="cw-badge" data-i18n-scope>${entry.clue.badge}</span>
          ${entry.clue.hint ? raw(html`<span style="color:var(--muted)">${entry.clue.hint}</span>`) : ""}
        </div>
        <div class="cw-popover-top-btns" data-i18n-scope>
          <button class="cw-popover-dir-btn" type="button" data-popover-action="flip" title="Switch Across / Down" ${raw(canFlipDirection() ? "" : "hidden")}>⇄</button>
          <button class="cw-popover-close" type="button" data-popover-action="close" aria-label="Close clue popup">×</button>
        </div>
      </div>

      <div class="cw-popover-clue">
        <strong data-i18n-scope>Clue:</strong> ${formatClueDisplay(entry.clue)}
      </div>
      ${!inSquare && state.settings.romanization && entry.clue.romaji ? raw(html`<div class="cw-active-clue-sub">Romaji: ${entry.clue.romaji}</div>`) : ""}

      ${
        showTextBox
          ? raw(html`
        <div class="cw-popover-length-row" data-i18n-scope>
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
        <div class="cw-popover-error" id="popoverErrorMsg" data-i18n-scope ${raw(state.popoverError ? "" : "hidden")}>${state.popoverError}</div>
        <div class="cw-popover-btn-bar" data-i18n-scope>
          <button class="cw-popover-action-btn" type="button" data-popover-action="check" ${raw(checkDisabled ? "disabled" : "")}>Check</button>
          <button class="cw-popover-action-btn" id="revealSquareBtn" type="button" data-popover-action="revealSquare" ${raw(revDisabled ? "disabled" : "")}>Show letter</button>
          <button class="cw-popover-action-btn" id="revealWordBtn" type="button" data-popover-action="revealWord" ${raw(revDisabled ? "disabled" : "")}>Show word</button>
        </div>
      `)
          : raw(html`
        <div class="cw-popover-length-row" data-i18n-scope>
          <span class="cw-popover-length-label">Length: ${entry.length}${entry.completed ? " · ✓ Completed" : " · Type directly in squares"}</span>
        </div>
        <p class="cw-square-draft" role="status" aria-live="polite" data-i18n-scope ${raw(activeSquareDraft()?.text ? "" : "hidden")}>${squareDraftMessage()}</p>
        <div class="cw-popover-btn-bar" data-i18n-scope>
          ${
            !entry.completed && !state.roundEnded
              ? raw(html`
            <button class="cw-popover-action-btn" type="button" data-popover-action="check" ${raw(checkDisabled ? "disabled" : "")}>Check</button>
            <button class="cw-popover-action-btn" id="revealSquareBtn" type="button" data-popover-action="revealSquare" ${raw(revDisabled ? "disabled" : "")}>Show letter</button>
            <button class="cw-popover-action-btn" id="revealWordBtn" type="button" data-popover-action="revealWord" ${raw(revDisabled ? "disabled" : "")}>Show word</button>
          `)
              : ""
          }
        </div>
      `)
      }
    `,
    );

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

  function renderPuzzleBoard() {
    const gridEl = document.getElementById("crosswordGrid");
    if (!state.puzzle?.entries.length) {
      setHTML(gridEl, html`<div style="padding:24px;color:var(--muted)">No puzzle grid available.</div>`);
      return;
    }

    const { rows, cols, grid } = state.puzzle;
    gridEl.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;

    const activeEntry = getActiveEntry();
    const draft = activeSquareDraft();
    const entryHasEditableCells = activeEntry?.cells.some(({ row, col }) => !grid[row][col].locked);
    const activeCoords = new Set((activeEntry?.cells || []).map(({ row, col }) => `${row},${col}`));

    const cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        if (!cell) {
          cells.push(raw('<div class="cw-cell block" role="gridcell" aria-disabled="true"></div>'));
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
        const romajiHint =
          state.settings.romanization && cell.value && !/^[A-Za-z]$/.test(cell.value) ? romanizeKana(cell.value) : "";

        const completedEntryId =
          [cell.acrossId, cell.downId].find((id) => {
            const ent = state.puzzle.entries.find((e) => e.id === id);
            return ent?.completed;
          }) || "";

        const allowDirectInput =
          !state.roundEnded &&
          state.settings.inputStyle === "cell" &&
          (!cell.locked || (inWord && entryHasEditableCells));
        const cellInput =
          isCurrent && allowDirectInput
            ? raw(html`<input
              class="cw-cell-input"
              type="text"
              value="${draft?.text || ""}"
              data-draft="${String(Boolean(draft?.text))}"
              data-cell-input="1"
              data-row="${r}"
              data-col="${c}"
              aria-label="${
                cell.locked
                  ? `Type answer for ${activeEntry.number} ${activeEntry.dir}; crossing character is locked`
                  : `Type character for Row ${r + 1}, Column ${c + 1}`
              }"
              autocapitalize="off"
              autocomplete="off"
              autocorrect="off"
              spellcheck="false"
            >`)
            : "";

        const charContent = split ? displayChars.map((character) => raw(html`<span>${character}</span>`)) : display;

        cells.push(
          raw(html`
          <div
            class="cw-cell${inWord ? " in-active-word" : ""}${isIntersection && inWord ? " is-intersecting" : ""}${isCurrent ? " is-active" : ""}${statusClass}"
            role="gridcell"
            tabindex="${isCurrent ? "0" : "-1"}"
            data-row="${r}"
            data-col="${c}"
            data-completed-entry="${completedEntryId}"
            data-char="${cell.value}"
            aria-label="Row ${r + 1}, Column ${c + 1}${cell.number ? `, Clue ${cell.number}` : ""}${cell.value ? `, ${cell.value}` : ", empty"}"
          >
            ${cell.number ? raw(html`<span class="cw-cell-num">${cell.number}</span>`) : ""}
            <span class="cw-cell-char${split ? " cw-cell-split" : ""}" lang="ja">${charContent}</span>
            ${cellInput}
            ${romajiHint ? raw(html`<span class="cw-cell-romaji">${romajiHint}</span>`) : ""}
          </div>
        `),
        );
      }
    }
    setHTML(gridEl, html`${cells}`);
    renderGridCluePopover();
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
    setHTML(textEl, html`${formatClueDisplay(entry.clue)}`);

    const subParts = [
      `Length: ${entry.length}`,
      entry.clue.badge,
      entry.clue.hint,
      state.settings.romanization && entry.clue.romaji ? `Romaji: ${entry.clue.romaji}` : "",
    ].filter(Boolean);
    subEl.textContent = subParts.join(" · ");
  }

  function renderClueLists() {
    if (!state.puzzle) return;
    const showClueBoxes = state.settings.inputStyle === "clues";
    const revDisabled = isRevealDisabled();
    const checkDisabled = isCheckDisabled();

    const renderList = (entries, containerId) => {
      const container = document.getElementById(containerId);
      setHTML(
        container,
        html`${entries.map((entry) => {
          const isActive = entry.id === state.activeEntryId;
          const errMsg = state.clueErrors[entry.id] || "";
          return raw(html`
          <li
            class="cw-clue-item${isActive ? " active" : ""}${entry.completed ? " completed" : ""}"
            data-entry-id="${entry.id}"
            tabindex="0"
          >
            <span class="cw-clue-num">${entry.number}.</span>
            <div class="cw-clue-body">
              <div class="cw-clue-state" data-i18n-scope>
                <span class="cw-clue-selected"><span aria-hidden="true">➤</span> Selected</span>
                ${raw(entry.completed ? '<span class="cw-clue-solved"><span aria-hidden="true">✓</span> Solved</span>' : '<span class="cw-clue-unanswered">Unanswered</span>')}
              </div>
              <div>${formatClueDisplay(entry.clue)}</div>
              <div class="cw-clue-meta">
                <span class="cw-badge" data-i18n>${entry.clue.badge}</span>
                <span data-i18n>Length: ${entry.length}</span>
                <span>N${entry.item.level}</span>
                ${entry.clue.hint ? raw(html`<span>${entry.clue.hint}</span>`) : ""}
              </div>
              ${
                showClueBoxes && !entry.completed && !state.roundEnded
                  ? raw(html`
                <div class="cw-clue-entry-box" data-i18n-scope>
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
                    <button class="cw-clue-inline-btn" type="button" data-clue-check-id="${entry.id}" ${raw(checkDisabled ? "disabled" : "")}>Check</button>
                    <button class="cw-clue-inline-btn" type="button" data-clue-reveal-sq-id="${entry.id}" ${raw(revDisabled ? "disabled" : "")}>Reveal square</button>
                    <button class="cw-clue-inline-btn" type="button" data-clue-reveal-word-id="${entry.id}" ${raw(revDisabled ? "disabled" : "")}>Reveal word</button>
                  </div>
                  ${errMsg ? raw(html`<div class="cw-clue-inline-error">${errMsg}</div>`) : ""}
                </div>
              `)
                  : ""
              }
            </div>
          </li>
        `);
        })}`,
      );
    };
    renderList(state.puzzle.across, "acrossClueList");
    renderList(state.puzzle.down, "downClueList");
  }

  function renderLifetimeStats() {
    document.getElementById("statPuzzlesCompleted").textContent = String(state.stats.puzzlesCompleted || 0);
    document.getElementById("statWordsCorrect").textContent = String(state.stats.wordsCorrect || 0);
    document.getElementById("statWordsRevealed").textContent = String(state.stats.wordsRevealed || 0);
  }

  return {
    narrowGridViewport,
    renderPuzzleBoard,
    renderGridCluePopover,
    updateActiveClueBanner,
    renderClueLists,
    renderLifetimeStats,
  };
}
