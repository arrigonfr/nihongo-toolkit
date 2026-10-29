import { fetchItems } from "./api.js";
import { setSettingAvailability } from "./settings-panel.js";
import { BatchQueue } from "./batch-queue.js";
import { mountSentenceExamples, loadSentences } from "./examples.js";
import { romanizeKana } from "./romanize.js";
import { meaningChoices } from "./quiz-choices.js";
import { rememberControls } from "./settings-storage.js";
import { mountFontControls, fontList, isFontSetting } from "./japanese-fonts.js";
import { mountStudyControls, japaneseHTML, speakJapanese } from "./study-controls.js";
import { mountChips } from "./chips.js";
import { mountLevelControls } from "./jlpt-levels.js";
import { mountPracticeMode, showSuddenCountdown } from "./practice-mode.js";
(() => {
  "use strict";
  const batches = new BatchQueue(
    async (level, limit, exclude) => {
      const items = await fetchItems("/api/words/batch", { level, limit, exclude });
      const normalized = items.map(normalizeWord);
      if (normalized.some((item) => !item)) throw new Error("We couldn’t prepare the next vocabulary words right now.");
      state.words.push(...normalized);
      if (state.words.length > 300) state.words.splice(0, state.words.length - 300);
      return normalized;
    },
    { batchSize: 100, lowWater: 30, onError: () => setWarning("We’re having trouble loading more words right now. You can keep practicing with the words already loaded while we retry.") }
  );
  const STORAGE = {
    showStats: "goi-show-stats-v1",
    showExample: "goi-show-example-v1", kanaDirection: "goi-kana-direction-v1", font: "goi-font-v1"
  };
  const LEVELS = ["N5", "N4", "N3", "N2", "N1"];
  const MODES = {
    "multiple-ej": "Multiple choice (E→J)", "typing-ej": "Typing (E→J)", "cloze-ej": "Cloze (E→J)",
    "multiple-je": "Multiple choice (J→E)", "typing-je": "Typing (J→E)", "cloze-je": "Cloze (J→E)"
  };
  const parseMode = (value) => {
    const [mode, dir] = String(value).split("-");
    return { mode: ["multiple", "typing", "cloze"].includes(mode) ? mode : "multiple", dir: dir === "je" ? "je" : "ej" };
  };
  const answerKey = (item) => currentSettings().dir === "ej" ? item.word : item.meaning;
  const FONTS = ["Noto Sans JP", "Sawarabi Mincho", "M PLUS Rounded 1c", "Zen Kurenaido"];
  const $ = (selector) => document.querySelector(selector);
  const state = {
    current: null, words: [], previousDistractors: [], selectedOption: null, checked: false, wrongAnswerPending: false, inputActivated: false,
    answered: 0, correct: 0, totalAnswerMs: 0, timedAnswers: 0, questionStartedAt: 0,
    showExample: readBoolean(STORAGE.showExample, true), showStats: readBoolean(STORAGE.showStats, true),
    kanaDirection: readString(STORAGE.kanaDirection, "to-romaji"), questionDirection: "to-romaji",
    font: readString(STORAGE.font, "Noto Sans JP"), failedTerms: [], suddenPending: false,
    advanceTimer: null, stats: {}, loading: false,
    session: { type: "free", questionLimit: 10, timeLimitMs: 600000, startedAt: 0, endedAt: 0, pausedAt: 0, pausedMs: 0, presented: 0, skipped: 0, finished: false, clockTimer: null }
  };

  function readBoolean(key, fallback = false) {
    try {
      const saved = localStorage.getItem(key);
      return saved === null ? fallback : saved === "true";
    }
    catch (error) { console.warn("Could not read saved preference.", error); return fallback; }
  }
  function readString(key, fallback) {
    try { return localStorage.getItem(key) || fallback; }
    catch (error) { console.warn("Could not read saved preference.", error); return fallback; }
  }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }
  function normalizeWord(item) {
    if (!item || typeof item.word !== "string" || !item.word.trim() || typeof item.meaning !== "string" || !item.meaning.trim()) return null;
    const levelNum = Number(item.level);
    const normalized = {
      id: item.id,
      word: item.word.trim(),
      furigana: typeof item.furigana === "string" ? item.furigana.trim() : (typeof item.reading === "string" ? item.reading.trim() : ""),
      meaning: item.meaning.trim(),
      level: Number.isInteger(levelNum) && levelNum >= 1 && levelNum <= 5 ? `N${levelNum}` :
        (LEVELS.includes(item.level) ? item.level : "N3"),
      romaji: typeof item.romaji === "string" ? item.romaji.trim() : "",
      exampleSourceId: item.exampleSourceId,
      examples: (item.examples || []).map((example) => ({
        id: example.tatoeba_id, japanese: example.ja, furigana: example.furigana, english: example.en, license: "CC BY 2.0 FR"
      })),
      pos: item.partOfSpeech || item.part_of_speech || item.pos || "",
      example: typeof item.example === "string" ? item.example :
        (typeof item.sentence === "string" ? item.sentence : (typeof item.examples?.[0] === "string" ? item.examples[0] : "")),
      exampleMeaning: typeof item.exampleMeaning === "string" ? item.exampleMeaning :
        (typeof item.sentenceMeaning === "string" ? item.sentenceMeaning : "")
    };
    return normalized;
  }
  function setStatus(message, error = false) {
    const el = $("#status");
    el.textContent = message;
    el.classList.toggle("error", error);
  }
  function setWarning(message = "") {
    const el = $("#warning");
    el.textContent = message;
    el.classList.toggle("visible", Boolean(message));
  }
  function setStartError(message = "") {
    const el = $("#startError");
    el.textContent = message;
    el.hidden = !message;
  }
  function randomItem(items) { return items[Math.floor(Math.random() * items.length)]; }
  function readSettings() {
    return {
      level: $("#levelSelect").value, ...parseMode($("#modeSelect").value), modeKey: $("#modeSelect").value,
      kanaDirection: state.kanaDirection, font: state.font,
      showStats: state.showStats, showExample: state.showExample
    };
  }
  function currentSettings() { return state.session.settings || readSettings(); }
  function useFont() {
    const font = currentSettings().font;
    const selected = randomItem(fontList(font));
    document.documentElement.style.setProperty("--jp-font", `"${selected}"`);
  }
  function levelForRequest() {
    const selection = currentSettings().level;
    return selection === "Random" || selection === "none" ? "all" : selection;
  }
  async function acquireWord() {
    const level = levelForRequest();
    const item = await batches.take(level);
    if (level !== levelForRequest()) return acquireWord();
    setWarning("");
    return item;
  }
  function markQuestionNumber() {
    const count = state.session.type === "questions" ? ` / ${state.session.questionLimit}`
      : state.session.type === "sudden" ? ` · streak ${state.correct}` : "";
    $("#questionLabel").textContent = `Question ${state.session.presented}${count}`;
    $("#sessionTimer").hidden = state.session.type !== "time";
  }
  function meaningsFor(current) {
    const { choices, distractors } = meaningChoices(current, state.words, state.previousDistractors);
    state.previousDistractors = [...state.previousDistractors, current.meaning, ...distractors].slice(-120);
    return choices;
  }
  function wordChoicesFor(current) {
    const pool = [...new Set(state.words.map((item) => item.word).filter((word) => word && word !== current.word))];
    const picks = [];
    while (picks.length < 3 && pool.length) picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    const choices = [current.word, ...picks];
    for (let i = choices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [choices[i], choices[j]] = [choices[j], choices[i]];
    }
    return choices;
  }
  function highlightTerm(html, item) {
    const term = [item.word, item.furigana].filter(Boolean).map(escapeHTML).sort((a, b) => b.length - a.length).find((t) => html.includes(t));
    return term ? html.replace(term, `<mark>${term}</mark>`) : html;
  }
  function kanaPlaceholder(label) {
    return state.questionDirection === "to-romaji" ? `${label} (romaji)` : `${label} (kana or kanji)`;
  }
  function getExample(item) {
    const candidates = [item.word, item.furigana].filter(Boolean).sort((a, b) => b.length - a.length);
    const available = [...item.examples, ...(item.example ? [{ japanese: item.example, english: item.exampleMeaning }] : [])]
      .filter((example) => candidates.some((term) => example.japanese?.includes(term)));
    const example = available.length ? randomItem(available) : null;
    if (example) {
      let clozeSentence = example.japanese;
      let targetFound = false;
      for (const term of candidates) {
        const index = clozeSentence.indexOf(term);
        if (index >= 0) {
          clozeSentence = `${clozeSentence.slice(0, index)}___${clozeSentence.slice(index + term.length)}`;
          targetFound = true;
          break;
        }
      }
      if (!targetFound) {
        return {
          sentence: example.japanese,
          clozeSentence: `「${item.meaning}」という意味の言葉は「___」です。`,
          translation: example.english,
          generated: true
        };
      }
      return { sentence: example.japanese, clozeSentence, translation: example.english, generated: false };
    }
    const sentence = `「${item.meaning}」という意味の言葉は「${item.word}」です。`;
    return {
      sentence,
      clozeSentence: `「${item.meaning}」という意味の言葉は「___」です。`,
      translation: `The word meaning “${item.meaning}” is “${item.word}.”`,
      generated: true
    };
  }
  function renderQuestion(item) {
    const inputWasActive = state.inputActivated;
    state.session.presented += 1;
    state.current = item;
    state.questionStartedAt = Date.now();
    state.selectedOption = null;
    state.checked = false;
    state.wrongAnswerPending = false;
    $("#question").hidden = false;
    $("#sessionStatsContent").hidden = !currentSettings().showStats;
    $("#questionContent").hidden = false;
    $("#questionTop").hidden = false;
    $("#resultsPanel").hidden = true;
    $("#word").innerHTML = japaneseHTML(item.word, item.furigana);
    $("#example").hidden = true;
    $("#levelBadge").textContent = item.level;
    $("#meta").innerHTML = `${item.pos ? `<span>${escapeHTML(item.pos)}</span>` : ""}<span>${escapeHTML(item.level)} vocabulary</span>`;
    $("#feedback").hidden = true;
    $("#nextButton").hidden = true;
    $("#checkButton").hidden = false;
    $("#showButton").hidden = false;
    $("#skipButton").hidden = false;
    $("#answerInput").value = "";
    $("#answerInput").readOnly = false;
    const { mode, dir } = currentSettings();
    const selectedDirection = currentSettings().kanaDirection;
    state.questionDirection = selectedDirection === "random"
      ? randomItem(["to-romaji", "to-kana"])
      : selectedDirection;
    useFont();
    $("#options").innerHTML = "";
    $("#options").hidden = mode !== "multiple";
    $("#answerInput").hidden = mode === "multiple";
    if (mode === "multiple") {
      const choices = dir === "ej" ? wordChoicesFor(item) : meaningsFor(item);
      $("#prompt").textContent = dir === "ej" ? "Choose the Japanese word" : "Choose the English meaning";
      if (dir === "ej") $("#word").innerHTML = `<span class="english-prompt">${escapeHTML(item.meaning)}</span>`;
      $("#options").innerHTML = choices.map((choice, index) =>
        `<button class="option${dir === "ej" ? " japanese" : ""}" type="button" data-meaning="${escapeHTML(choice)}" data-choice-index="${index + 1}"><span class="option-key" aria-hidden="true">${index + 1}</span><span>${escapeHTML(choice)}</span></button>`
      ).join("");
      $("#checkButton").hidden = true;
    } else if (mode === "typing" && dir === "je") {
      $("#prompt").textContent = "Type the English meaning";
      $("#word").innerHTML = japaneseHTML(item.word, item.furigana);
      $("#answerInput").hidden = false;
      $("#answerInput").placeholder = "Type the English meaning";
    } else if (mode === "cloze" && dir === "je") {
      const example = getExample(item);
      $("#prompt").textContent = "Type the English meaning of the highlighted word";
      $("#word").innerHTML = example.generated ? japaneseHTML(item.word, item.furigana)
        : `<span class="japanese">${escapeHTML(example.sentence).replace(/(.*)/, (all) => highlightTerm(all, item))}</span>`;
      $("#answerInput").hidden = false;
      $("#answerInput").placeholder = "Type the English meaning";
    } else if (mode === "typing") {
      $("#prompt").innerHTML = `Type the Japanese vocabulary word for:<strong>${escapeHTML(item.meaning)}</strong>`;
      $("#word").textContent = "？";
      $("#answerInput").hidden = false;
      $("#answerInput").placeholder = kanaPlaceholder("Type the Japanese word");
    } else {
      const example = getExample(item);
      $("#word").textContent = "？";
      $("#prompt").textContent = `${example.generated ? "Meaning clue" : "Complete the sentence"} · type the missing Japanese word`;
      $("#prompt").insertAdjacentHTML("beforeend", `<strong class="japanese">${escapeHTML(example.clozeSentence)}</strong>`);
      $("#answerInput").hidden = false;
      $("#answerInput").placeholder = kanaPlaceholder("Type the missing word");
    }
    markQuestionNumber();
    setStatus("");
    if (!$("#answerInput").hidden && inputWasActive) $("#answerInput").focus({ preventScroll: true });
  }
  async function nextQuestion() {
    if (state.loading || state.session.finished) return;
    if (state.suddenPending) { finishQuiz("sudden"); return; }
    resumeSessionClock();
    clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
    if (state.session.type === "questions" && state.session.presented >= state.session.questionLimit) {
      finishQuiz("questions");
      return;
    }
    state.loading = true;
    $("#checkButton").disabled = true;
    $("#startButton").disabled = true;
    $("#skipButton").disabled = true;
    setStatus("Finding a word…");
    try {
      const item = await acquireWord();
      if (state.session.finished) return;
      if (currentSettings().mode === "cloze" && getExample(item).generated) {
        setStatus("Finding an example sentence…");
        try {
          const examples = await loadSentences(item.word);
          if (state.session.finished) return;
          item.examples = [...item.examples, ...examples];
          if (getExample(item).generated) setWarning("No matching example sentence is available. This question uses a meaning clue instead.");
        } catch (error) {
          if (state.session.finished) return;
          console.warn("Cloze example lookup failed:", error);
          setWarning(`${error.message} This question uses a meaning clue instead.`);
        }
      }
      renderQuestion(item);
    } catch (error) {
      if (state.session.finished) return;
      state.current = null;
      $("#questionContent").hidden = true;
      setWarning(error.message && !/fetch|network|VITE_|backend|database|HTTP/i.test(error.message)
        ? `We couldn’t load vocabulary words right now (${error.message}). Please try again in a moment.`
        : "We couldn’t load vocabulary words right now. Please check your connection and try again.");
      finishQuiz("error");
      setStatus("Could not load a word. Use Start quiz to retry.", true);
    } finally {
      state.loading = false;
      $("#checkButton").disabled = false;
      $("#startButton").disabled = false;
      $("#skipButton").disabled = false;
    }
  }
  function skipQuestion() {
    if (!state.current || state.session.finished || state.loading) return;
    if (state.session.type === "sudden") { checkAnswer(true); return; }
    state.session.skipped += 1;
    nextQuestion();
  }
  // Sudden Death: a skip or a revealed answer counts as a miss and ends the session.
  function recordSuddenMiss() {
    const item = state.current;
    const modeName = MODES[currentSettings().mode];
    state.answered += 1;
    for (const [key, label] of [[`level:${item.level}`, item.level], [`mode:${modeName}`, modeName]]) {
      state.stats[key] ||= { label, answered: 0, correct: 0 };
      state.stats[key].answered += 1;
    }
    state.failedTerms.push({ word: item.word, furigana: item.furigana, romaji: item.romaji, meaning: item.meaning, level: item.level });
    renderStats();
  }
  // Shows the correct answer for about two seconds (or until Continue / Enter) before the results.
  function beginSuddenFinish() {
    state.suddenPending = true;
    pauseSessionClock();
    $("#nextButton").innerHTML = 'Continue <span class="quiz-shortcut" aria-hidden="true">(Enter / N)</span>';
    setStatus("Sudden Death over. Here is the answer; your results follow in a moment.");
    clearTimeout(state.advanceTimer);
    showSuddenCountdown($("#feedback"), 2000);
    state.advanceTimer = setTimeout(() => finishQuiz("sudden"), 2000);
  }
  function updateLiveStats() {
    if (!state.session.startedAt) return;
    const elapsed = elapsedSessionTime();
    $("#totalTimeStat").textContent = formatClock(elapsed);
    if (state.session.type === "time" && !state.session.finished) {
      const remaining = Math.max(0, state.session.timeLimitMs - elapsed);
      $("#sessionTimer").textContent = `${formatClock(remaining)} left`;
      if (remaining === 0) finishQuiz("time");
    }
  }
  function elapsedSessionTime(now = Date.now()) {
    const end = state.session.endedAt || now;
    const activePause = state.session.pausedAt ? Math.max(0, end - state.session.pausedAt) : 0;
    return Math.max(0, end - state.session.startedAt - state.session.pausedMs - activePause);
  }
  function pauseSessionClock() {
    if (state.session.startedAt && !state.session.pausedAt && !state.session.finished) {
      state.session.pausedAt = Date.now();
      updateLiveStats();
    }
  }
  function resumeSessionClock() {
    if (!state.session.pausedAt) return;
    state.session.pausedMs += Math.max(0, Date.now() - state.session.pausedAt);
    state.session.pausedAt = 0;
    updateLiveStats();
  }
  function formatClock(milliseconds) {
    const total = Math.max(0, Math.floor(milliseconds));
    const minutes = Math.floor(total / 60000);
    const seconds = Math.floor(total % 60000 / 1000);
    const millis = total % 1000;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
  }
  function finishQuiz(reason) {
    if (state.session.finished || !state.session.startedAt) return;
    state.session.finished = true;
    state.suddenPending = false;
    state.session.endedAt = Date.now();
    if (state.session.pausedAt) {
      state.session.pausedMs += Math.max(0, state.session.endedAt - state.session.pausedAt);
      state.session.pausedAt = 0;
    }
    clearInterval(state.session.clockTimer);
    clearTimeout(state.advanceTimer);
    state.advanceTimer = null;
    $("#question").hidden = false;
    $("#questionContent").hidden = true;
    $("#questionTop").hidden = true;
    $("#resultsPanel").hidden = false;
    $("#settingsPanel").open = true;
    $("#sessionStatsContent").hidden = !currentSettings().showStats;
    $("#answerInput").blur();
    updateLiveStats();
    updateSessionControls();
    const totalAccuracy = state.answered ? `${Math.round(state.correct / state.answered * 100)}%` : "—";
    $("#resultsSummary").textContent = reason === "sudden"
      ? `Sudden Death over. Your streak: ${state.correct} correct in a row. ${state.session.presented} ${state.session.presented === 1 ? "question" : "questions"} seen.`
      : reason === "time"
      ? `Time is up. You saw ${state.session.presented} ${state.session.presented === 1 ? "question" : "questions"}, answered ${state.answered}, and skipped ${state.session.skipped}.`
      : reason === "questions" ? `You completed all ${state.session.questionLimit} questions. ${state.session.skipped} skipped.`
      : `${reason === "error" ? "Session ended because a word could not be loaded." : "Session stopped."} You answered ${state.answered} of ${state.session.presented} presented questions; ${state.session.skipped} skipped.`;
    $("#resultAnswered").textContent = `${state.answered} / ${state.session.presented}`;
    $("#resultAccuracy").textContent = totalAccuracy;
    $("#resultAverage").textContent = state.timedAnswers ? formatDuration(state.totalAnswerMs / state.timedAnswers) : "—";
    $("#resultTotal").textContent = formatClock(elapsedSessionTime());
    $("#failedTerms").innerHTML = `<h3>Failed terms</h3>${state.failedTerms.length
      ? `<ul>${state.failedTerms.map((item) => `<li><strong lang="ja">${escapeHTML(item.word)}</strong>${item.furigana ? ` <span lang="ja">［${escapeHTML(item.furigana)}］</span>` : ""}${item.romaji ? ` <span>(${escapeHTML(item.romaji)})</span>` : ""} — ${escapeHTML(item.meaning)} <span>(${escapeHTML(item.level)})</span></li>`).join("")}</ul>`
      : "<p>No failed terms. Great work!</p>"}`;
    setStatus("Quiz complete. Start another quiz whenever you're ready.");
  }
  function acceptedAnswers(item, direction = null) {
    if (direction === "to-romaji") return romajiVariants(item.romaji || romanizeKana(item.furigana || item.word));
    if (direction === "to-kana") return [...new Set([item.word, item.furigana].filter(Boolean))];
    if (direction === "meaning") return meaningVariants(item.meaning);
    return [...new Set([item.word, item.furigana, ...romajiVariants(item.romaji || romanizeKana(item.furigana))])];
  }
  function meaningVariants(meaning) {
    const text = String(meaning || "");
    const parts = text.split(/[;,/]/).map((part) => part.trim()).filter(Boolean);
    const stripped = parts.map((part) => part.replace(/\([^)]*\)/g, "").trim()).filter(Boolean);
    return [...new Set([text, ...parts, ...stripped])];
  }
  function expectedAnswers(item) {
    const { mode, dir } = currentSettings();
    if (mode === "multiple") return [];
    return acceptedAnswers(item, dir === "je" ? "meaning" : state.questionDirection);
  }
  function romajiVariants(value) {
    if (!value) return [];
    const alternatives = {
      "ā": ["ā", "aa", "a"], "aa": ["ā", "aa", "a"],
      "ē": ["ē", "ei", "ee", "e"], "ei": ["ē", "ei", "ee", "e"], "ee": ["ē", "ei", "ee", "e"],
      "ī": ["ī", "ii", "i"], "ii": ["ī", "ii", "i"],
      "ō": ["ō", "ou", "oo", "o"], "ou": ["ō", "ou", "oo", "o"], "oo": ["ō", "ou", "oo", "o"],
      "ū": ["ū", "uu", "u"], "uu": ["ū", "uu", "u"]
    };
    const tokens = value.toLowerCase().match(/ō|ou|oo|ā|aa|ē|ei|ee|ī|ii|ū|uu|[^ōouāaēeiīūu]+|[ōouāaēeiīūu]/gu) || [];
    let variants = [""];
    for (const token of tokens) {
      const choices = alternatives[token] || [token];
      variants = variants.flatMap((prefix) => choices.map((choice) => prefix + choice)).slice(0, 64);
    }
    const seen = new Set();
    return variants.filter((answer) => {
      const normalized = normalizedAnswer(answer);
      if (!normalized || seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    });
  }
  function normalizedAnswer(value) {
    return String(value).normalize("NFKD").toLowerCase().replace(/\p{M}/gu, "").replace(/[\s。、，,.!?！？・「」『』'’\-]/g, "");
  }
  function currentAnswer() {
    if (currentSettings().mode === "multiple") return state.selectedOption;
    return $("#answerInput").value.trim();
  }
  function checkAnswer(revealed = false) {
    if (!state.current || state.checked || state.loading || state.session.finished) return;
    const mode = currentSettings().mode;
    const given = currentAnswer();
    if (!revealed && !given) {
      setStatus(mode === "multiple" ? "Choose a meaning first." : "Type an answer first.", true);
      return;
    }
    const isCorrect = !revealed && (mode === "multiple"
      ? given === answerKey(state.current)
      : expectedAnswers(state.current).some((answer) => normalizedAnswer(answer) === normalizedAnswer(given)));
    state.checked = true;
    state.wrongAnswerPending = !revealed && !isCorrect && mode !== "multiple";
    if (!revealed) {
      state.totalAnswerMs += Math.max(0, Date.now() - state.questionStartedAt);
      state.timedAnswers += 1;
      state.answered += 1;
      if (isCorrect) state.correct += 1;
      const level = state.current.level;
      const modeName = MODES[currentSettings().modeKey];
      for (const [key, label] of [[`level:${level}`, level], [`mode:${modeName}`, modeName]]) {
        state.stats[key] ||= { label, answered: 0, correct: 0 };
        state.stats[key].answered += 1;
        if (isCorrect) state.stats[key].correct += 1;
      }
      if (!isCorrect) state.failedTerms.push({
        word: state.current.word, furigana: state.current.furigana, romaji: state.current.romaji,
        meaning: state.current.meaning, level: state.current.level
      });
      renderStats();
    } else if (state.session.type === "sudden") recordSuddenMiss();
    const feedback = $("#feedback");
    feedback.hidden = false;
    feedback.className = `feedback ${isCorrect ? "correct" : revealed ? "" : "incorrect"}`;
    const title = revealed ? "Answer revealed" : isCorrect ? "Correct!" : "Not quite";
    const accepted = expectedAnswers(state.current);
    const acceptedText = accepted.length ? `<br>Accepted answers: ${accepted.map(escapeHTML).join(", ")}` : "";
    feedback.innerHTML = `<strong>${title}</strong>Answer: ${japaneseHTML(state.current.word, state.current.furigana)} — ${escapeHTML(state.current.meaning)}${acceptedText}`;
    const reviewed = state.current;
    const shouldShowExample = revealed || currentSettings().showExample || !isCorrect;
    const section = document.createElement("section");
    section.className = "feedback-section";
    section.hidden = !shouldShowExample;
    section.innerHTML = `<h3>Example sentences</h3><div class="feedback-examples"></div>`;
    feedback.append(section);
    if (shouldShowExample) mountSentenceExamples(section.querySelector(".feedback-examples"), reviewed.word, reviewed.examples);
    if (state.wrongAnswerPending && !$("#answerInput").hidden) {
      $("#answerInput").value = "";
      feedback.insertAdjacentHTML("beforeend", "<p>Your answer is counted as incorrect. Review it, then use Next question to continue.</p>");
    }
    $("#answerInput").readOnly = !state.wrongAnswerPending;
    $("#word").innerHTML = japaneseHTML(state.current.word, state.current.furigana);
    speakJapanese(state.current.furigana || state.current.word);
    $("#example").hidden = true;
    $("#options").querySelectorAll(".option").forEach((button) => {
      button.disabled = true;
      button.classList.remove("selected");
      if (button.dataset.meaning === answerKey(state.current)) button.classList.add("correct-answer");
      if (!isCorrect && button.dataset.meaning === given) button.classList.add("incorrect-answer");
    });
    $("#checkButton").hidden = true;
    $("#showButton").hidden = true;
    $("#skipButton").hidden = true;
    $("#nextButton").hidden = false;
    $("#nextButton").innerHTML = (state.session.type === "questions" && state.session.presented >= state.session.questionLimit
      ? "See results" : "Next question") + ' <span class="quiz-shortcut" aria-hidden="true">(Enter / N)</span>';
    if (revealed) setStatus("Answer shown; this question is not included in your stats.");
    else if (state.wrongAnswerPending) setStatus("Incorrect answer recorded. Review it, then use Next question to continue.");
    else if (!isCorrect) setStatus("Incorrect answer recorded. Review the correct answer, then continue.");
    else if (isCorrect && !currentSettings().showExample) {
      setStatus("Correct — moving to the next question…");
      state.advanceTimer = setTimeout(() => {
        state.advanceTimer = null;
        nextQuestion();
      }, 600);
    } else setStatus("");
    if (shouldShowExample) {
      pauseSessionClock();
      const statusText = $("#status").textContent;
      setStatus(`${statusText ? `${statusText} ` : ""}Session timer paused while you review.`);
    }
    if (state.session.type === "sudden" && (revealed || !isCorrect)) beginSuddenFinish();
  }
  function renderBreakdown(container, records) {
    const entries = Object.values(records).filter((item) => item.answered);
    if (!entries.length) {
      container.innerHTML = '<span class="head">No answers yet</span>';
      return;
    }
    container.innerHTML = '<span class="head">Group</span><span class="head value">Done</span><span class="head value">Right</span>' +
      entries.map((item) => `<span>${escapeHTML(item.label)}</span><span class="value">${item.answered}</span><span class="value">${Math.round(item.correct / item.answered * 100)}%</span>`).join("");
  }
  function renderStats() {
    $("#answeredStat").textContent = state.answered;
    $("#accuracyStat").textContent = state.answered ? `${Math.round(state.correct / state.answered * 100)}%` : "—";
    $("#averageTimeStat").textContent = state.timedAnswers ? formatDuration(state.totalAnswerMs / state.timedAnswers) : "—";
    $("#sessionStatsContent").hidden = !currentSettings().showStats;
    renderBreakdown($("#levelBreakdown"), Object.fromEntries(Object.entries(state.stats).filter(([key]) => key.startsWith("level:"))));
    renderBreakdown($("#modeBreakdown"), Object.fromEntries(Object.entries(state.stats).filter(([key]) => key.startsWith("mode:"))));
  }
  function formatDuration(milliseconds) {
    const seconds = milliseconds / 1000;
    if (seconds >= 60) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
    return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  }
  function selectOption(button) {
    if (!button || state.checked || state.loading) return;
    state.selectedOption = button.dataset.meaning;
    $("#options").querySelectorAll(".option").forEach((option) => option.classList.toggle("selected", option === button));
    setStatus("");
    checkAnswer(false);
  }
  function updateSessionTypeFields() {
    const type = $("#sessionType").value;
    updateKanaDirection();
    $("#questionLimitField").hidden = type !== "questions";
    $("#timeLimitField").hidden = type !== "time";
    setSettingAvailability($("#questionLimit"), type === "questions" ? "" : "Used with question-count sessions.");
    setSettingAvailability($("#timeLimit"), type === "time" ? "" : "Used with timed sessions.");
  }
  function updateKanaDirection() {
    const { mode, dir } = parseMode($("#modeSelect").value);
    const applies = mode !== "multiple" && dir === "ej";
    setSettingAvailability($("#kanaDirection"), applies ? "" : "Kana direction applies to typing and cloze questions that ask for Japanese (E→J).");
  }
  function updateSessionControls() {
    const running = Boolean(state.session.startedAt) && !state.session.finished;
    $("#startButton").hidden = running;
    $("#stopSessionButton").hidden = !running;
  }
  function updateShortcutHint() {
    document.body.dataset.quizMode = currentSettings().mode;
    const hint = $("#shortcutHint");
    if (hint) hint.hidden = currentSettings().mode !== "multiple";
  }
  function startQuiz() {
    if (state.loading) return;
    state.previousDistractors = [];
    clearInterval(state.session.clockTimer);
    clearTimeout(state.advanceTimer);
    const type = $("#sessionType").value;
    if (selectedLevelCount() === 0) {
      setStartError("Choose at least one JLPT level to start a quiz.");
      return;
    }
    setStartError("");
    const questionLimit = Math.min(200, Math.max(1, Math.floor(Number($("#questionLimit").value) || 10)));
    const timeLimitMs = Math.min(180, Math.max(1, Math.floor(Number($("#timeLimit").value) || 10))) * 60000;
    $("#questionLimit").value = questionLimit;
    $("#timeLimit").value = timeLimitMs / 60000;
    quizSettings.save();
    state.answered = 0;
    state.correct = 0;
    state.totalAnswerMs = 0;
    state.timedAnswers = 0;
    state.failedTerms = [];
    state.stats = {};
    state.current = null;
    state.inputActivated = false;
    state.session = {
      type, questionLimit, timeLimitMs, settings: readSettings(), startedAt: Date.now(), endedAt: 0,
      pausedAt: 0, pausedMs: 0, presented: 0, skipped: 0, finished: false, clockTimer: null
    };
    $("#settingsPanel").open = false;
    $("#question").hidden = false;
    $("#questionContent").hidden = true;
    $("#questionTop").hidden = false;
    $("#resultsPanel").hidden = true;
    $("#sessionStatsContent").hidden = !currentSettings().showStats;
    updateShortcutHint();
    updateSessionControls();
    renderStats();
    state.session.clockTimer = setInterval(updateLiveStats, 10);
    updateLiveStats();
    $("#startButton").textContent = "Loading…";
    nextQuestion().finally(() => { $("#startButton").textContent = "Start quiz"; });
  }
  const selectedLevelCount = () => $("#levelSelect").value === "none" ? 0 : 1;
  mountLevelControls();
  mountChips($("#modeSelect"), {
    presentation: "button", fieldClass: "goi-field", groupClass: "mode-chips",
    titleDescription: "E→J: you see English and answer in Japanese. J→E: you see Japanese and answer in English. Multiple choice picks from four options, Typing types the answer, Cloze uses an example sentence."
  });
  mountChips($("#kanaDirection"), {
    presentation: "button", fieldClass: "goi-field", groupClass: "mode-chips",
    titleDescription: "How kana answers are expected in typing and cloze questions. Any accepted form (kanji, kana or romaji) still counts."
  });
  mountPracticeMode($("#sessionType"), { values: { timed: "time" } });
  const quizSettings = rememberControls("nihon:goi-settings-v1",
    ["levelSelect", "modeSelect", "sessionType", "questionLimit", "timeLimit"], setWarning);
  $("#showExampleToggle").checked = state.showExample;
  $("#showExampleToggle").addEventListener("change", (event) => {
    state.showExample = event.target.checked;
    try { localStorage.setItem(STORAGE.showExample, String(state.showExample)); }
    catch (error) { console.warn("Could not save example preference.", error); setStatus("Could not save example preference.", true); }
  });
  $("#showStatsToggle").checked = state.showStats;
  $("#showStatsToggle").addEventListener("change", (event) => {
    state.showStats = event.target.checked;
    $("#sessionStatsContent").hidden = !currentSettings().showStats;
    try { localStorage.setItem(STORAGE.showStats, String(state.showStats)); }
    catch (error) { console.warn("Could not save stats preference.", error); setStatus("Could not save stats preference.", true); }
  });
  mountFontControls();
  $("#fontChoice").value = isFontSetting(state.font) ? state.font : "random";
  state.font = $("#fontChoice").value;
  $("#fontChoice").addEventListener("change", (event) => {
    state.font = event.target.value;
    if (!state.session.settings) useFont();
    try { localStorage.setItem(STORAGE.font, state.font); }
    catch (error) { console.warn("Could not save font preference.", error); setStatus("Could not save font preference.", true); }
  });
  $("#kanaDirection").value = ["to-romaji", "to-kana", "random"].includes(state.kanaDirection) ? state.kanaDirection : "to-romaji";
  state.kanaDirection = $("#kanaDirection").value;
  $("#kanaDirection").chipsApi.sync();
  $("#kanaDirection").addEventListener("change", (event) => {
    state.kanaDirection = event.target.value;
    try { localStorage.setItem(STORAGE.kanaDirection, state.kanaDirection); }
    catch (error) { console.warn("Could not save kana direction preference.", error); setStatus("Could not save kana direction preference.", true); }
  });
  $("#sessionType").addEventListener("change", updateSessionTypeFields);
  for (const id of ["levelSelect", "sessionType", "questionLimit", "timeLimit"]) $(`#${id}`).addEventListener("change", () => setStartError(""));
  $("#modeSelect").addEventListener("change", () => { updateShortcutHint(); updateKanaDirection(); });
  $("#startButton").addEventListener("click", startQuiz);
  $("#stopSessionButton").addEventListener("click", () => finishQuiz("stopped"));
  $("#checkButton").addEventListener("click", () => checkAnswer(false));
  $("#showButton").addEventListener("click", () => checkAnswer(true));
  $("#skipButton").addEventListener("click", skipQuestion);
  $("#nextButton").addEventListener("click", nextQuestion);
  $("#options").addEventListener("click", (event) => {
    const button = event.target.closest(".option");
    selectOption(button);
  });
  $("#answerInput").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (state.wrongAnswerPending) nextQuestion();
      else checkAnswer(false);
    }
  });
  $("#answerInput").addEventListener("focus", () => { state.inputActivated = true; });
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.repeat || event.isComposing || document.querySelector("dialog[open]")) return;
    const target = event.target;
    if (target.closest(".study-setting-name")) return;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target.isContentEditable;
    if (!typing && /^[1-4]$/.test(event.key) && currentSettings().mode === "multiple" && !state.checked && !state.loading) {
      const option = [...$("#options").querySelectorAll(".option")].find((button) => button.dataset.choiceIndex === event.key);
      if (option) { event.preventDefault(); selectOption(option); }
    } else if (event.key === " " && !typing && state.current && !$("#skipButton").hidden) {
      event.preventDefault(); skipQuestion();
    } else if ((event.key === "s" || event.key === "S") && !typing && state.current && !state.checked) {
      event.preventDefault(); checkAnswer(true);
    } else if ((event.key === "Enter" || event.key.toLowerCase() === "n") && !typing && state.checked && !$("#nextButton").hidden) {
      event.preventDefault(); nextQuestion();
    } else if (event.key === "Enter" && !typing && state.wrongAnswerPending) {
      event.preventDefault(); nextQuestion();
    } else if (event.key === "Enter" && !typing && state.current && !state.checked) {
      event.preventDefault(); checkAnswer(false);
    }
  });
  updateSessionTypeFields();
  updateShortcutHint();
  useFont();
  renderStats();
})();
mountStudyControls();
