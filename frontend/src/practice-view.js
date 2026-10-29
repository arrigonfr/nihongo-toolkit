import "./practice.css";

const tools = {
  kana: { name: "Kana", icon: "あ", description: "Hiragana and katakana", heading: "Make kana second nature." },
  meaning: { name: "Imi", icon: "意", description: "Kanji meaning practice", heading: "Find meaning in every kanji." },
  reading: { name: "Yomi", icon: "読", description: "Kanji reading practice", heading: "Give every kanji a voice." }
};

export function renderPractice(kind) {
  const tool = tools[kind];
  if (!tool) throw new Error(`Unknown practice tool: ${kind}`);
  const kanji = kind !== "kana";
  const direction = kind === "kana"
    ? `<label>Kana direction<select id="kanaDirection">
        <option value="hiragana-romaji,katakana-romaji" selected>Kana → romaji</option>
        <option value="to-romaji">Kana (any) → romaji</option>
        <option value="to-kana">Romaji → kana (script shown)</option>
        <option value="random">Randomize</option>
      </select></label>`
    : kind === "meaning"
      ? `<label>Meaning direction<select id="meaningDirection">
          <option value="meaning-forward">Kanji → English meaning</option>
          <option value="meaning-reverse">English meaning → Kanji</option>
          <option value="meaning-random">Both</option>
        </select></label>`
      : `<label>Answer script<select id="readingDirection">
          <option value="reading-romaji">Romaji</option>
          <option value="reading-hiragana">Hiragana</option>
          <option value="reading-katakana">Katakana</option>
          <option value="reading-any-kana">Either kana script</option>
        </select></label>`;
  document.getElementById("practiceRoot").innerHTML = `
    <div class="shell">
      <header>
        <a class="brand" href="#" aria-label="${tool.name} at NihongoToolkit home"><span class="brand-mark" aria-hidden="true">${tool.icon}</span><span class="brand-name">${tool.name}<span class="brand-note">at NihongoToolkit</span></span></a>
        <button class="icon-button" id="themeButton" type="button" aria-label="Toggle theme">◐</button>
      </header>
      <main>
        <section class="intro">
          <p class="eyebrow">A small daily practice</p><h1>${tool.heading}</h1>
          <p>${kanji ? "Choose a JLPT level and build confidence one kanji at a time." : "Practice hiragana and katakana together with quick questions and focused sessions."}</p>
        </section>
        <div class="main-column">
          <section class="quiz-card" aria-label="${tool.description}">
            <details class="settings" id="settingsPanel" open>
              <summary>Quiz settings</summary>
              <div class="settings-body">
              <p class="study-settings-note">Settings save automatically and apply to your next session. The top study controls stay live.</p>
                <div class="settings-row practice-settings-row">
                ${kanji ? `<label>JLPT level<select id="levelSelect">
                  <option value="all">All</option>
                  <option value="5" selected>N5</option><option value="4">N4</option><option value="3">N3</option>
                  <option value="2">N2</option><option value="1">N1</option>
                  <option value="unrated">Non-JLPT</option>
                </select><small>Levels are estimates; Non-JLPT means unrated.</small></label>` : ""}
                ${direction}
                </div>
                <div class="font-field"><select id="fontChoice"><option value="random">Rotate</option><option value="Noto Sans JP" selected>Noto Sans JP</option></select></div>
              </div>
            </details>
            <div class="warning" id="apiWarning" role="status"></div>
            <section class="session-stats" id="sessionStats" aria-label="Session statistics">
              <div class="stats-heading"><h2>Session stats</h2><label class="stats-toggle"><input id="showStatsToggle" type="checkbox" checked> Show stats</label></div>
              <div class="session-controls">
                <label>Practice mode<select id="sessionMode">
                  <option value="free">Free</option><option value="questions">Question count</option><option value="timed">Timed</option><option value="sudden">Sudden Death</option>
                </select></label>
                <label id="sessionTargetField"><span id="sessionTargetLabel">Questions to answer</span>
                  <input class="answer-input" id="sessionTarget" type="number" min="1" max="999" value="20" inputmode="numeric">
                </label>
                <button class="button primary" id="startSessionButton" type="button">Start session</button>
              </div>
              <div class="start-error" id="startError" role="alert" hidden></div>
              <div class="session-status" id="sessionStatus" aria-live="polite"></div>
              <div id="sessionStatsContent">
                <div class="stats-overview">
                  <div class="stat-box"><strong class="stat-value" id="answeredStat">0</strong><span class="stat-label">answered</span></div>
                  <div class="stat-box"><strong class="stat-value" id="accuracyStat">—</strong><span class="stat-label">accuracy</span></div>
                  <div class="stat-box"><strong class="stat-value" id="averageTimeStat">—</strong><span class="stat-label">avg. answer</span></div>
                  <div class="stat-box"><strong class="stat-value" id="totalTimeStat">00:00.000</strong><span class="stat-label">total time</span></div>
                </div>
                <div class="stat-breakdown">
                  ${kanji ? '<div class="breakdown-row"><span>Kanji</span><strong id="kanjiStat">0 / 0</strong></div>' :
                    '<div class="breakdown-row"><span>Hiragana</span><strong id="hiraganaStat">0 / 0</strong></div><div class="breakdown-row"><span>Katakana</span><strong id="katakanaStat">0 / 0</strong></div>'}
                </div>
              </div>
            </section>
            ${kanji ? '<label class="switch-option review-option"><input id="reviewKanjiToggle" type="checkbox"> Pause to review kanji details</label>' : ""}
            <section id="questionSection" aria-label="Question" hidden>
            <div class="card-top"><span class="question-label" id="questionCount">Ready</span><span class="tag" id="typeTag">${kind}</span><button class="button stop-session" id="stopSessionButton" type="button">Stop session</button></div>
            ${kanji ? "" : '<div class="kana-feedback-slot"><div class="feedback" id="feedback" role="status"></div></div>'}
            <div class="prompt" aria-live="polite"><div class="glyph" id="glyph" lang="ja">${tool.icon}</div><p class="question-text" id="promptText"></p></div>
            <form id="answerForm" autocomplete="off">
              <label class="sr-only" for="answerInput">Your answer</label>
              <div class="answer-row"><input class="answer-input" id="answerInput" type="text" placeholder="Type your answer…" autocorrect="off" autocapitalize="off" autocomplete="off" spellcheck="false"><button class="button primary" id="checkButton" type="submit">Check</button></div>
            </form>
            <div class="button-row"><button class="button" id="skipButton" type="button">Skip</button><button class="button" id="showButton" type="button">Show answer</button><button class="button" id="nextButton" type="button" hidden>Next</button></div>
            ${kanji ? '<div class="feedback" id="feedback" role="status"></div>' : ""}
            </section>
            <div class="session-results" id="sessionResults" aria-live="polite" hidden></div>
          </section>
        </div>
        <footer><a href="data-sources.html">Data sources and licenses</a></footer>
      </main>
    </div>`;
  return tool;
}
