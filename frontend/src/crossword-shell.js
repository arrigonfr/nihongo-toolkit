import { escapeHTML } from "./html.js";
import { mountChips } from "./chips.js";
import { groupSettings } from "./settings-panel.js";
import { PUZZLE_SIZES } from "./crossword-engine.js";
import { GAME_MODES, LEVEL_OPTIONS } from "./crossword-storage.js";

export function renderCrosswordShell(root, { gameMode, storageWarning }) {
  root.innerHTML = `
      <div class="cw-shell">
        <header class="cw-header">
          <a class="cw-brand" href="#top" id="brandLink" aria-label="Pazuru Japanese Crossword">
            <span class="cw-brand-mark" aria-hidden="true"><img src="/tool-icons/pazuru.webp" alt=""></span>
            <span class="cw-brand-name">Pazuru<span class="cw-brand-note">NihongoToolkit</span></span>
          </a>
            <button class="cw-icon-btn" id="themeCycleBtn" type="button" aria-label="Switch appearance theme">◐</button>
        </header>

        <main>
          <section class="cw-intro"><span class="eyebrow"><span lang="ja">パズル</span> · <span>Japanese crossword</span></span>
        <h1>Cross paths <br><span>with Japanese words.</span></h1>
            <p id="modeDescriptionText"></p>
          </section>

          <section class="cw-top-card ui-panel" aria-label="Game mode and puzzle configuration">
            <p class="study-settings-note">Settings save automatically and apply to your next puzzle. The top reading, audio and appearance controls stay live.</p>
            <div class="cw-mode-pills" id="modePills" role="group" aria-label="Game modes">
              ${Object.entries(GAME_MODES).map(([key, info]) => `
                <button class="cw-mode-pill" type="button" data-mode="${key}" aria-pressed="${gameMode === key}">
                  ${escapeHTML(info.label)}
                </button>
              `).join("")}
            </div>

            <div class="cw-quick-controls">
              <div class="settings-row cw-quick-row">
                <label class="cw-field">
                  <span>JLPT level / range</span>
                  <select class="cw-select" id="levelSelect">
                    ${LEVEL_OPTIONS.map((opt) => `<option value="${opt.value}">${escapeHTML(opt.label)}</option>`).join("")}
                  </select>
                </label>

                <label class="cw-field">
                  <span>Answer mode</span>
                  <select class="cw-select" id="answerModeSelect">
                    <option value="kana">Kana</option>
                    <option value="kanji">Kanji</option>
                    <option value="both">Both</option>
                  </select>
                </label>

                <label class="cw-field cw-size-field">
                  <span>Puzzle size</span>
                  <select class="cw-select" id="sizeSelect">
                    ${Object.entries(PUZZLE_SIZES).map(([key, val]) => `<option value="${key}">${escapeHTML(val.label)}</option>`).join("")}
                  </select>
                </label>

                <label class="cw-field cw-custom-field" id="customWordsField" hidden>
                  <span>Custom target words (4–18)</span>
                  <input class="cw-input" id="customWordsInput" type="number" min="4" max="18" value="10">
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
            <div class="cw-feedback-banner error" id="startError" role="alert" hidden></div>
          </section>

          <section class="cw-empty" id="cwEmpty"><span class="cw-empty-mark" lang="ja" aria-hidden="true">パズル</span><h2>Ready when you are</h2><p>Pick your settings above, then start a game to see your crossword, clues and progress here.</p><button class="cw-btn primary" id="newPuzzleBtn" type="button">New puzzle</button></section>

          <section class="cw-status-bar" hidden aria-label="Puzzle status and assistance">
            <div class="cw-metrics">
              <div class="cw-metric"><strong id="progressMetric">0 / 0</strong><span>words solved</span></div>
              <div class="cw-metric" id="timerMetricWrap"><strong id="timerMetric">00:00</strong><span id="timerLabel">elapsed</span></div>
              <div class="cw-metric"><strong id="hintsMetric">0</strong><span id="hintsLabel">hints used</span></div>
              <div class="cw-metric"><strong id="statPuzzlesCompleted">0</strong><span>puzzles completed</span></div>
              <div class="cw-metric"><strong id="statWordsCorrect">0</strong><span>words answered</span></div>
              <div class="cw-metric"><strong id="statWordsRevealed">0</strong><span>words revealed</span></div>
            </div>

            <div class="cw-assist-actions">
              <button class="cw-btn" id="revealPuzzleBtn" type="button">End and Reveal puzzle</button>
              <button class="cw-btn" id="endPuzzleBtn" type="button" hidden>End puzzle</button>
              <button class="cw-btn primary" id="nextPuzzleBtn" type="button" hidden>New puzzle</button>
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
