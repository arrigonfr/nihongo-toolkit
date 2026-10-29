import { fetchItems } from "./api.js";
import { BatchQueue } from "./batch-queue.js";
import { wordsHTML } from "./examples.js";
import { renderPractice } from "./practice-view.js";
import { fontList } from "./japanese-fonts.js";
import { rememberControls } from "./settings-storage.js";
import { mountStudyControls, japaneseHTML, readingsHTML, speakJapanese } from "./study-controls.js";
import { bind, unbind, toHiragana, toKatakana } from "wanakana";
import { mountChips } from "./chips.js";
import { mountPracticeMode, showSuddenCountdown } from "./practice-mode.js";
import { setSettingAvailability } from "./settings-panel.js";
(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const tool = document.body.dataset.practiceTool;
  renderPractice(tool);
  const KANA_DIRECTIONS = ["hiragana-romaji", "katakana-romaji", "romaji-hiragana", "romaji-katakana", "romaji-any"];
  const RANDOM_DIRECTIONS = KANA_DIRECTIONS.slice(0, 4);
  // Saved values from the old single-choice select map onto the multi-select; "random" is the exclusive Randomize chip.
  function kanaDirections(value) {
    if (value === "to-romaji") return ["hiragana-romaji", "katakana-romaji"];
    if (value === "to-kana") return ["romaji-hiragana", "romaji-katakana"];
    if (value === "random") return RANDOM_DIRECTIONS;
    const list = String(value ?? "").split(",").filter((item) => KANA_DIRECTIONS.includes(item));
    return list.length ? list : ["hiragana-romaji", "katakana-romaji"];
  }
  if (tool === "kana") {
    mountChips($("#kanaDirection"), {
      multiple: true, exclusive: "random", exclusiveLabel: "Randomize", fieldClass: "direction-field", groupClass: "direction-chips",
      options: [
        { value: "hiragana-romaji", label: "Hiragana → romaji" }, { value: "katakana-romaji", label: "Katakana → romaji" },
        { value: "romaji-hiragana", label: "Romaji → hiragana" }, { value: "romaji-katakana", label: "Romaji → katakana" },
        { value: "romaji-any", label: "Romaji → either script" }, { value: "random", label: "Randomize" }
      ],
      titleDescription: "Pick one or more directions; each question uses one of them at random. Randomize selects all of the four main directions.",
      decode: (value) => value === "random" ? ["random"] : kanaDirections(value),
      encode: (values) => {
        if (values.includes("random")) return "random";
        const list = KANA_DIRECTIONS.filter((item) => values.includes(item));
        return list.length ? list.join(",") : null;
      }
    });
  }
  if (tool === "meaning") mountChips($("#meaningDirection"), { presentation: "button", fieldClass: "direction-field", groupClass: "direction-chips" });
  if (tool === "reading") {
    mountChips($("#readingDirection"), {
      presentation: "button", fieldClass: "direction-field", groupClass: "direction-chips",
      descriptions: {
        "reading-hiragana": "Type readings in hiragana, traditionally used for kun'yomi (Japanese readings). On'yomi are accepted too.",
        "reading-katakana": "Type readings in katakana, traditionally used for on'yomi (Chinese-derived readings). Kun'yomi are accepted too."
      }
    });
  }
  mountPracticeMode($("#sessionMode"), { values: {} });
  mountStudyControls({ furigana: tool !== "kana", romaji: tool !== "kana" });
  const batches = new BatchQueue(
    (level, limit, exclude) => fetchItems("/api/kanji/batch", { mode: tool, level, limit, exclude }),
    { onError: () => showWarning("We’re having trouble loading more kanji right now. You can keep practicing with the questions already loaded while we retry.") }
  );
  const FONTS = ["Noto Sans JP", "Sawarabi Mincho", "M PLUS Rounded 1c", "Zen Kurenaido"];
  const kanaEntries = [];
  const addKanaRow = (type, hira, kata, sounds) => {
    [...hira].forEach((char, index) => kanaEntries.push({ type: "hiragana", display: char, answer: sounds[index] }));
    [...kata].forEach((char, index) => kanaEntries.push({ type: "katakana", display: char, answer: sounds[index] }));
  };
  addKanaRow("kana", "あいうえお", "アイウエオ", ["a","i","u","e","o"]);
  addKanaRow("kana", "かきくけこ", "カキクケコ", ["ka","ki","ku","ke","ko"]);
  addKanaRow("kana", "さしすせそ", "サシスセソ", ["sa","shi","su","se","so"]);
  addKanaRow("kana", "たちつてと", "タチツテト", ["ta","chi","tsu","te","to"]);
  addKanaRow("kana", "なにぬねの", "ナニヌネノ", ["na","ni","nu","ne","no"]);
  addKanaRow("kana", "はひふへほ", "ハヒフヘホ", ["ha","hi","fu","he","ho"]);
  addKanaRow("kana", "まみむめも", "マミムメモ", ["ma","mi","mu","me","mo"]);
  addKanaRow("kana", "やゆよ", "ヤユヨ", ["ya","yu","yo"]);
  addKanaRow("kana", "らりるれろ", "ラリルレロ", ["ra","ri","ru","re","ro"]);
  addKanaRow("kana", "わを", "ワヲ", ["wa","wo"]);
  kanaEntries.push({ type: "hiragana", display: "ん", answer: "n" }, { type: "katakana", display: "ン", answer: "n" });
  addKanaRow("kana", "がぎぐげご", "ガギグゲゴ", ["ga","gi","gu","ge","go"]);
  addKanaRow("kana", "ざじずぜぞ", "ザジズゼゾ", ["za","ji","zu","ze","zo"]);
  addKanaRow("kana", "だぢづでど", "ダヂヅデド", ["da","ji","zu","de","do"]);
  addKanaRow("kana", "ばびぶべぼ", "バビブベボ", ["ba","bi","bu","be","bo"]);
  addKanaRow("kana", "ぱぴぷぺぽ", "パピプペポ", ["pa","pi","pu","pe","po"]);
  const yoonRows = [
    ["き","キ","ky",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["し","シ","sh",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["ち","チ","ch",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["に","ニ","ny",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["ひ","ヒ","hy",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["み","ミ","my",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["り","リ","ry",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["ぎ","ギ","gy",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["じ","ジ","j",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["び","ビ","by",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]],
    ["ぴ","ピ","py",["ゃ","ゅ","ょ"],["ャ","ュ","ョ"]]
  ];
  yoonRows.forEach(([hira, kata, consonant, smallH, smallK]) => {
    [["a","ゃ","ャ"],["u","ゅ","ュ"],["o","ょ","ョ"]].forEach(([vowel, , ], index) => {
      kanaEntries.push({ type: "hiragana", display: hira + smallH[index], answer: consonant + vowel });
      kanaEntries.push({ type: "katakana", display: kata + smallK[index], answer: consonant + vowel });
    });
  });
  const stats = { total: 0, correct: 0, hiragana: { total:0, correct:0 }, katakana: { total:0, correct:0 }, kanji: { total:0, correct:0 } };
  let totalAnswerTimeMs = 0;
  let questionStartedAt = performance.now();
  let sessionStartedAt = 0;
  let autoAdvanceTimer = null;
  let sessionTimeFrame = null;
  let questionScored = false;
  let suddenPending = false;
  let currentAnswerCorrect = false;
  let sessionMode = "free";
  let sessionLimit = 20;
  let questionsUsed = 0;
  let sessionDeadline = 0;
  let sessionActive = false;
  let sessionPendingStart = true;
  let sessionClockStarted = false;
  let sessionPausedAt = 0;
  let pausedDuration = 0;
  let sessionTimer = null;
  let current = null;
  let questionNumber = 0;
  let wrongQuestions = [];
  let fontChoice = "random";
  let questionRequest = 0;
  let randomFont = FONTS[0];
  let sessionSettings = null;
  let readingBound = false, composing = false, candidateRequest = 0;
  const candidates = document.createElement("div");
  candidates.id = "answerCandidates";
  candidates.className = "study-pills";
  candidates.setAttribute("role", "group");
  candidates.setAttribute("aria-label", "Choose the kanji you meant");
  $("#answerForm").append(candidates);
  $("#answerInput").addEventListener("compositionstart", () => { composing = true; });
  $("#answerInput").addEventListener("compositionend", () => { composing = false; });
  function readSettings() {
    return Object.fromEntries(["kanaDirection", "meaningDirection", "readingDirection", "levelSelect",
      "fontChoice", "showStatsToggle", "reviewKanjiToggle"].map((id) => {
      const control = $(`#${id}`);
      return [id, control?.type === "checkbox" ? control.checked : control?.value];
    }));
  }
  function randomItem(list) { return list[Math.floor(Math.random() * list.length)]; }
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]);
  }
  function normalize(text) {
    return String(text ?? "").normalize("NFKC").toLocaleLowerCase().normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "").replace(/[.,!?;:()[\]{}]/g, " ")
      .replace(/\s+/g, " ").trim();
  }
  function katakanaToHiragana(text) {
    return [...text].map((char) => {
      const code = char.codePointAt(0);
      return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
    }).join("");
  }
  const romajiMap = new Map(kanaEntries.map((entry) => [entry.display, entry.answer]));
  function romanize(reading) {
    let input = katakanaToHiragana(String(reading ?? "")).replace(/[\s・.\-]/g, "");
    let output = "";
    while (input) {
      if (input[0] === "っ") {
        const next = [...romajiMap.keys()].sort((a,b) => b.length-a.length).find((key) => input.slice(1).startsWith(key));
        output += next ? (romajiMap.get(next)[0] || "") : "";
        input = input.slice(1);
        continue;
      }
      if (input[0] === "ー") { output += output.match(/[aeiou](?!.*[aeiou])/i)?.[0] || ""; input = input.slice(1); continue; }
      const key = [...romajiMap.keys()].sort((a,b) => b.length-a.length).find((candidate) => input.startsWith(candidate));
      if (key) { output += romajiMap.get(key); input = input.slice(key.length); }
      else { output += input[0]; input = input.slice(1); }
    }
    return output;
  }
  function showWarning(message) {
    const warning = $("#apiWarning");
    warning.textContent = message;
    warning.classList.add("show");
  }
  function useFont() {
    fontChoice = sessionSettings?.fontChoice ?? $("#fontChoice").value;
    randomFont = randomItem(fontList(fontChoice));
    document.documentElement.style.setProperty("--jp-font", `"${randomFont}"`);
  }
  function formatElapsed(milliseconds) {
    const elapsed = Math.max(0, Math.floor(milliseconds));
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor(elapsed / 60000) % 60;
    const seconds = Math.floor(elapsed / 1000) % 60;
    const millis = String(elapsed % 1000).padStart(3, "0");
    const mm = String(hours ? minutes : Math.floor(elapsed / 60000)).padStart(2, "0");
    return `${hours ? `${String(hours).padStart(2, "0")}:` : ""}${mm}:${String(seconds).padStart(2, "0")}.${millis}`;
  }
  function refreshTotalTime() {
    if (!sessionClockStarted) return;
    const now = sessionPausedAt || performance.now();
    $("#totalTimeStat").textContent = formatElapsed(now - sessionStartedAt - pausedDuration);
    if (sessionActive) sessionTimeFrame = requestAnimationFrame(refreshTotalTime);
  }
  function pauseSessionClock() {
    if (!sessionClockStarted || sessionPausedAt) return;
    sessionPausedAt = performance.now();
    cancelAnimationFrame(sessionTimeFrame);
    updateSessionStatus();
  }
  function resumeSessionClock() {
    if (!sessionPausedAt) return;
    const pauseLength = performance.now() - sessionPausedAt;
    pausedDuration += pauseLength;
    if (sessionMode === "timed") sessionDeadline += pauseLength;
    sessionPausedAt = 0;
    sessionTimeFrame = requestAnimationFrame(refreshTotalTime);
    updateSessionStatus();
  }
  function updateStats() {
    $("#answeredStat").textContent = stats.total;
    $("#accuracyStat").textContent = stats.total ? `${Math.round(stats.correct / stats.total * 100)}%` : "—";
    $("#averageTimeStat").textContent = stats.total ? `${(Math.round(totalAnswerTimeMs / stats.total / 100) / 10).toFixed(1)}s` : "—";
    for (const kind of ["hiragana","katakana","kanji"]) {
      const element = $(`#${kind}Stat`);
      if (element) element.textContent = `${stats[kind].correct} / ${stats[kind].total}`;
    }
  }
  function updateSessionFields() {
    const mode = $("#sessionMode").value;
    const timed = mode === "timed";
    const limited = mode === "questions" || timed;
    $("#sessionTargetLabel").textContent = timed ? "Minutes" : "Questions to answer";
    $("#sessionTargetField").hidden = !limited;
    setSettingAvailability($("#sessionTarget"), limited ? "" : `${mode === "sudden" ? "Sudden Death" : "Free mode"} has no session limit.`);
  }
  function updateSessionControls() {
    updateSessionFields();
    $("#startSessionButton").hidden = sessionActive;
    $("#stopSessionButton").hidden = !sessionActive;
    $("#startSessionButton").textContent = sessionPendingStart ? "Start session" : "Start new session";
    $("#answerInput").disabled = !sessionActive;
    $("#checkButton").disabled = !sessionActive || !current;
    $("#skipButton").disabled = !sessionActive;
    $("#showButton").disabled = !sessionActive;
    $("#nextButton").disabled = !sessionActive;
  }
  function updateSessionStatus() {
    const status = $("#sessionStatus");
    if (sessionPendingStart) {
      status.textContent = "Ready · click Start session to begin";
      return;
    }
    if (!sessionActive) {
      status.textContent = `Session complete · ${stats.total} answered`;
      return;
    }
    if (suddenPending) {
      status.textContent = `Sudden Death over · streak ${stats.correct}`;
    } else if (sessionPausedAt) {
      status.textContent = "Paused · reviewing kanji details";
    } else if (sessionMode === "sudden") {
      status.textContent = `Sudden Death · streak ${stats.correct}`;
    } else if (sessionMode === "questions") {
      status.textContent = `${questionsUsed} / ${sessionLimit} questions`;
    } else if (sessionMode === "timed") {
      const remaining = Math.max(0, Math.ceil((sessionDeadline - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = String(remaining % 60).padStart(2, "0");
      status.textContent = `${minutes}:${seconds} remaining`;
    } else {
      status.textContent = sessionClockStarted ? "Free mode · timer running" : "Free mode · timer starts when you answer";
    }
  }
  function finishSession(message, preserveFeedback = false) {
    if (!sessionActive) return;
    const elapsed = sessionClockStarted ? (sessionPausedAt || performance.now()) - sessionStartedAt - pausedDuration : 0;
    sessionActive = false;
    suddenPending = false;
    sessionPendingStart = false;
    questionRequest++;
    clearTimeout(autoAdvanceTimer);
    clearInterval(sessionTimer);
    cancelAnimationFrame(sessionTimeFrame);
    sessionClockStarted = false;
    sessionPausedAt = 0;
    pausedDuration = 0;
    $("#totalTimeStat").textContent = formatElapsed(elapsed);
    $("#questionSection").hidden = true;
    $("#settingsPanel").open = true;
    $("#nextButton").hidden = true;
    $("#answerInput").disabled = true;
    updateSessionControls();
    updateSessionStatus();
    if (!current) {
      $("#questionCount").textContent = "Session ended";
      $("#glyph").textContent = "—";
      $("#promptText").textContent = "Start a new session to continue.";
    }
    const feedback = $("#feedback");
    if (tool === "kana") {
      feedback.className = "feedback";
      feedback.textContent = "";
    } else if (preserveFeedback) {
      feedback.insertAdjacentHTML("beforeend", `<div class="feedback-title">${escapeHTML(message)}</div>`);
    } else {
      feedback.className = "feedback";
      feedback.innerHTML = `<div class="feedback-title">${escapeHTML(message)}</div>`;
    }
    const accuracy = stats.total ? `${Math.round(stats.correct / stats.total * 100)}%` : "—";
    const skipped = sessionMode === "questions" ? Math.max(0, questionsUsed - stats.total) : 0;
    const skippedText = skipped ? ` · ${skipped} skipped` : "";
    const missed = wrongQuestions.length
      ? `<ul class="missed-terms">${wrongQuestions.map(({ term, type, answer }) => `<li><strong>${escapeHTML(term)}</strong> <span>(${escapeHTML(type)})</span>${answer ? ` → ${escapeHTML(answer)}` : ""}</li>`).join("")}</ul>`
      : "<div>No incorrect answers.</div>";
    $("#sessionResults").innerHTML = `<strong>${escapeHTML(message)}</strong><span>${stats.correct} / ${stats.total} correct · ${accuracy} accuracy${skippedText} · ${escapeHTML(formatElapsed(elapsed))} total</span><div><strong>Incorrect terms</strong>${missed}</div>`;
    $("#sessionResults").hidden = false;
  }
  function showStartError(message) {
    const element = $("#startError");
    element.textContent = message;
    element.hidden = !message;
  }
  function startSession() {
    const mode = $("#sessionMode").value;
    const limit = Number($("#sessionTarget").value);
    if (tool !== "kana" && $("#levelSelect").value === "none") {
      showStartError("Choose at least one JLPT level to start.");
      return;
    }
    if ((mode === "questions" || mode === "timed") && (!Number.isInteger(limit) || limit < 1 || limit > 999)) {
      showStartError(mode === "timed" ? "Choose a session length from 1 to 999 minutes." : "Choose a question count from 1 to 999.");
      $("#sessionTarget").focus({ preventScroll: true });
      return;
    }
    showStartError("");
    clearInterval(sessionTimer);
    clearTimeout(autoAdvanceTimer);
    sessionSettings = readSettings();
    $("#sessionStatsContent").hidden = !sessionSettings.showStatsToggle;
    sessionMode = mode;
    sessionLimit = limit;
    questionsUsed = 0;
    sessionDeadline = mode === "timed" ? Date.now() + limit * 60 * 1000 : 0;
    sessionActive = true;
    sessionPendingStart = false;
    $("#questionSection").hidden = false;
    $("#settingsPanel").open = false;
    sessionClockStarted = mode !== "free";
    sessionPausedAt = 0;
    pausedDuration = 0;
    sessionStartedAt = performance.now();
    cancelAnimationFrame(sessionTimeFrame);
    $("#totalTimeStat").textContent = "00:00.000";
    $("#sessionResults").hidden = true;
    $("#sessionResults").textContent = "";
    if (sessionClockStarted) sessionTimeFrame = requestAnimationFrame(refreshTotalTime);
    questionNumber = 0;
    wrongQuestions = [];
    stats.total = 0;
    stats.correct = 0;
    for (const kind of ["hiragana","katakana","kanji"]) {
      stats[kind].total = 0;
      stats[kind].correct = 0;
    }
    totalAnswerTimeMs = 0;
    updateStats();
    updateSessionControls();
    updateSessionStatus();
    if (mode === "timed") {
      sessionTimer = window.setInterval(() => {
        if (!sessionPausedAt && Date.now() >= sessionDeadline) finishSession("Time is up.");
        else updateSessionStatus();
      }, 1000);
    }
    nextQuestion();
  }
  function startFreeClock() {
    if (sessionMode !== "free" || !sessionActive || sessionClockStarted) return;
    sessionClockStarted = true;
    sessionPausedAt = 0;
    pausedDuration = 0;
    sessionStartedAt = performance.now();
    sessionTimeFrame = requestAnimationFrame(refreshTotalTime);
    updateSessionStatus();
  }
  function randomKana(type) {
    const choice = randomItem(kanaDirections(sessionSettings.kanaDirection));
    if (choice.includes("hiragana")) type = "hiragana";
    if (choice.includes("katakana")) type = "katakana";
    const direction = choice.startsWith("romaji-") || choice === "to-kana" ? "to-kana" : "to-romaji";
    const entry = randomItem(kanaEntries.filter((entry) => entry.type === type));
    const answers = direction === "to-kana"
      ? kanaEntries.filter((candidate) => candidate.answer === entry.answer
        && (choice === "romaji-any" || candidate.type === type)).map((candidate) => candidate.display)
      : [entry.answer];
    return {
      kind: type, display: direction === "to-kana" ? entry.answer : entry.display,
      character: entry.display, answer: direction === "to-kana" ? entry.display : entry.answer,
      answers, hideType: choice === "romaji-any", direction, questionType: "kana"
    };
  }
  function kanjiAnswers(data, questionType, character) {
    if (questionType === "meaning") return data.meanings || [];
    if (questionType === "reading") {
      const readings = [...(data.on_readings || []), ...(data.kun_readings || [])]
        .map((reading) => reading.replace(/[.\-]/g, ""));
      return [...new Set(readings.flatMap((reading) => [reading, romanize(reading)]).filter(Boolean))];
    }
    return [character];
  }
  function questionPrompt(question) {
    if (question.kind === "kanji") {
      if (question.questionType === "meaning" && question.direction === "meaning-reverse") return "Type the kanji for this English meaning";
      return {
        meaning: "Type an English meaning",
        reading: {
          "reading-romaji": "Type a reading in romaji (kun-yomi or on-yomi)",
          "reading-hiragana": "Type a reading in hiragana (kun-yomi or on-yomi)",
          "reading-katakana": "Type a reading in katakana (on-yomi or kun-yomi)",
          "reading-any-kana": "Type a reading in hiragana or katakana (on-yomi or kun-yomi)"
        }[question.direction] || "Type an on-yomi or kun-yomi reading in kana or romaji",
      }[question.questionType];
    }
    return question.direction === "to-kana"
      ? `Type the ${question.hideType ? "hiragana or katakana" : question.kind} for this romaji` : "Type the romaji reading";
  }
  function renderQuestion(question) {
    clearTimeout(autoAdvanceTimer);
    current = question;
    candidateRequest++;
    candidates.replaceChildren();
    if (readingBound) { unbind($("#answerInput")); readingBound = false; }
    if (question.questionType === "reading" && question.direction !== "reading-romaji") {
      bind($("#answerInput"), { IMEMode: question.direction === "reading-katakana" ? "toKatakana" : "toHiragana" });
      readingBound = true;
    }
    questionScored = false;
    currentAnswerCorrect = false;
    questionStartedAt = performance.now();
    questionNumber++;
    $("#questionCount").textContent = `Question ${questionNumber}`;
    $("#typeTag").textContent = question.kind === "kanji"
      ? `kanji · ${question.questionType} · ${question.data.jlpt ? `N${question.data.jlpt}` : "Non-JLPT"}`
      : question.direction === "to-romaji" ? `${question.kind} → romaji` : question.kind;
    $("#typeTag").hidden = Boolean(question.hideType);
    let badges = $("#readingBadges");
    if (!badges) {
      badges = document.createElement("span");
      badges.id = "readingBadges";
      badges.className = "reading-badges";
      $("#typeTag").after(badges);
    }
    const hasOn = Boolean(question.data?.on_readings?.length), hasKun = Boolean(question.data?.kun_readings?.length);
    const emphasis = { "reading-katakana": "on", "reading-hiragana": "kun" }[question.direction];
    badges.hidden = !(question.kind === "kanji" && question.questionType === "reading");
    badges.innerHTML = [hasOn && ["on", "音 On’yomi"], hasKun && ["kun", "訓 Kun’yomi"]].filter(Boolean)
      .map(([kind, text]) => `<span class="reading-badge reading-badge-${kind}${emphasis === kind ? " is-expected" : ""}">${text}</span>`).join("");
    $("#glyph").textContent = question.display;
    $("#glyph").classList.toggle("romaji", question.kind !== "kanji" && question.direction === "to-kana");
    $("#glyph").setAttribute("lang", question.kind === "kanji" || question.direction !== "to-kana" ? "ja" : "en");
    $("#promptText").textContent = questionPrompt(question);
    $("#answerInput").value = "";
    $("#answerInput").readOnly = false;
    $("#answerInput").type = "text";
    $("#answerInput").inputMode = "text";
    $("#answerInput").hidden = false;
    $("#answerInput").placeholder = "Type your answer…";
    $("#feedback").className = "feedback";
    $("#feedback").innerHTML = "";
    $("#answerInput").disabled = !sessionActive;
    $("#checkButton").disabled = !sessionActive;
    $("#checkButton").textContent = "Check";
    $("#nextButton").hidden = true;
    $("#nextButton").disabled = !sessionActive;
    $("#skipButton").disabled = !sessionActive;
    $("#showButton").disabled = !sessionActive;
    if (sessionActive) $("#answerInput").focus({ preventScroll: true });
    useFont();
  }
  async function nextQuestion() {
    if (!sessionActive || sessionPendingStart) return;
    if (sessionMode === "timed" && !sessionPausedAt && Date.now() >= sessionDeadline) {
      finishSession("Time is up.");
      return;
    }
    const requestId = ++questionRequest;
    if (tool === "kana") { renderQuestion(randomKana(randomItem(["hiragana", "katakana"]))); return; }
    current = null;
    $("#questionCount").textContent = "Loading kanji…";
    $("#glyph").textContent = "漢";
    $("#promptText").textContent = "Fetching kanji details";
    $("#answerInput").disabled = true;
    $("#checkButton").disabled = true;
    $("#showButton").disabled = true;
    let data;
    try {
      data = await batches.take(sessionSettings.levelSelect);
    } catch (error) {
      if (requestId !== questionRequest) return;
      current = null;
      showWarning(error.message && !/fetch|network|VITE_|backend|database|HTTP/i.test(error.message)
        ? `We couldn’t load kanji questions right now (${error.message}). Please try again in a moment.`
        : "We couldn’t load kanji questions right now. Please check your connection and try again.");
      $("#promptText").textContent = "Could not load kanji. Use Skip to retry, or start a new session with another JLPT level.";
      $("#skipButton").disabled = false;
      return;
    }
    if (requestId !== questionRequest) return;
    const character = data.kanji;
    $("#apiWarning").classList.remove("show");
    const questionType = tool;
    const directionChoice = questionType === "meaning" ? sessionSettings.meaningDirection : sessionSettings.readingDirection;
    const direction = directionChoice === "meaning-random"
      ? (Math.random() < .5 ? "meaning-forward" : "meaning-reverse")
      : directionChoice;
    const reverseMeaning = questionType === "meaning" && direction === "meaning-reverse";
    const meanings = kanjiAnswers(data, questionType, character);
    const meaning = reverseMeaning ? randomItem(meanings) : null;
    renderQuestion({
      kind:"kanji", character, display: reverseMeaning ? meaning : character, data,
      questionType, direction, meaning,
      answers: reverseMeaning ? [character] : meanings
    });
  }
  function advanceQuestion() {
    if (!sessionActive || sessionPendingStart) return;
    resumeSessionClock();
    if (sessionMode === "timed" && !sessionPausedAt && Date.now() >= sessionDeadline) {
      finishSession("Time is up.");
      return;
    }
    if (sessionMode === "questions" && questionsUsed >= sessionLimit) {
      finishSession("Question goal reached.");
      return;
    }
    nextQuestion();
  }
  // Sudden Death: a skip or a revealed answer counts as a miss and ends the session.
  function suddenDeathMiss() {
    stats.total++;
    stats[current.kind].total++;
    questionsUsed++;
    wrongQuestions.push({ term: current.display, type: current.kind, answer: displayAnswers(current) });
    updateStats();
    const feedback = $("#feedback");
    feedback.className = "feedback incorrect";
    if (current.kind === "kanji") {
      feedback.innerHTML = `<div class="feedback-title">Sudden Death over</div>${explainAnswer(current)}`;
      pauseSessionClock();
    } else feedback.textContent = `Answer: ${displayAnswers(current)} · Enter to continue`;
    beginSuddenFinish();
  }
  // Shows the correct answer for about two seconds (or until Continue / Enter) before the results.
  function beginSuddenFinish() {
    suddenPending = true;
    pauseSessionClock();
    clearTimeout(autoAdvanceTimer);
    $("#answerInput").readOnly = true;
    $("#checkButton").disabled = false;
    $("#checkButton").textContent = "Continue";
    $("#nextButton").hidden = true;
    $("#skipButton").disabled = true;
    $("#showButton").disabled = true;
    updateSessionStatus();
    showSuddenCountdown($("#feedback"), 2000);
    autoAdvanceTimer = window.setTimeout(finishSuddenNow, 2000);
  }
  function finishSuddenNow() {
    if (suddenPending) finishSession(`Sudden Death over · streak of ${stats.correct}.`, true);
  }
  function skipQuestion() {
    if (!sessionActive || sessionPendingStart) return;
    if (sessionMode === "sudden" && current && !questionScored) { suddenDeathMiss(); return; }
    if (sessionMode === "timed" && !sessionPausedAt && Date.now() >= sessionDeadline) {
      finishSession("Time is up.");
      return;
    }
    if (questionScored) {
      advanceQuestion();
      return;
    }
    if (sessionMode === "questions" && current) {
      questionsUsed++;
      updateSessionStatus();
      if (questionsUsed >= sessionLimit) {
        finishSession("Question goal reached.");
        return;
      }
    }
    advanceQuestion();
  }
  function acceptedAnswers(question) {
    if (question.kind !== "kanji") return question.answers;
    return question.answers || kanjiAnswers(question.data, question.questionType, question.character);
  }
  function isCorrect(userText, question) {
    if (question.kind !== "kanji") {
      const value = userText.normalize("NFC").trim().toLowerCase();
      if (question.direction === "to-romaji" && !/^[a-z]+$/.test(value)) return false;
      return acceptedAnswers(question).includes(value);
    }
    const provided = userText.split(/[,，;；、/|]+/).map(normalize).filter(Boolean);
    const answers = acceptedAnswers(question);
    if (question.kind === "kanji" && question.questionType === "meaning" && question.direction === "meaning-reverse") {
      return userText.trim().normalize("NFC") === question.character;
    }
    const isKanjiReading = question.kind === "kanji" && question.questionType === "reading";
    const direction = question.direction || sessionSettings.readingDirection || "";
    const rawReadings = isKanjiReading
      ? [...(question.data.on_readings || []), ...(question.data.kun_readings || [])]
        .map((reading) => reading.replace(/[.\-]/g, ""))
      : [];
    const directedKana = direction === "reading-hiragana" ? rawReadings.map(katakanaToHiragana)
      : direction === "reading-katakana" ? rawReadings.map((reading) => [...reading].map((char) => {
        const code = char.codePointAt(0);
        return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : char;
      }).join(""))
      : direction === "reading-any-kana" ? [...rawReadings, ...rawReadings.map(katakanaToHiragana)] : [];
    const romajiAnswers = isKanjiReading
      ? rawReadings.map(romanize).map(normalize)
      : [];
    return provided.some((answer) => answers.some((variant) => {
      const expected = normalize(variant);
      const isKanaInput = /[\u3040-\u30ff]/u.test(answer);
      if (isKanjiReading && direction.startsWith("reading-")) {
        if (direction === "reading-hiragana" || direction === "reading-katakana" || direction === "reading-any-kana") {
          return directedKana.some((reading) => normalize(reading) === answer);
        }
        return romajiAnswers.includes(answer);
      }
      return expected === answer || (isKanjiReading && !isKanaInput && romajiAnswers.includes(answer));
    }));
  }
  function displayAnswers(question) {
    const answers = acceptedAnswers(question);
    if (question.kind === "kanji" && question.questionType === "meaning") return question.direction === "meaning-reverse" ? question.character : answers.join(" · ") || "No meanings available";
    if (question.kind === "kanji" && question.questionType === "reading") return answers.join(" · ") || "No readings available";
    return answers.join(" · ");
  }
  function explainAnswer(question) {
    if (question.kind !== "kanji") return "";
    const data = question.data || {};
    const field = (title, value, wide = false) => `<div${wide ? ' class="wide"' : ""}><dt>${escapeHTML(title)}</dt><dd>${escapeHTML(value)}</dd></div>`;
    return `<dl class="feedback-details">
      <div><dt>Kanji</dt><dd>${japaneseHTML(question.character, data.on_readings?.[0] || data.kun_readings?.[0]?.split(".")[0])}</dd></div>
      ${field("Meanings", data.meanings?.join("; ") || "Not listed", true)}
      <div><dt>On-yomi</dt><dd>${readingsHTML(data.on_readings)}</dd></div>
      <div><dt>Kun-yomi</dt><dd>${readingsHTML(data.kun_readings)}</dd></div>
      ${data.nanori?.length ? `<div><dt>Name readings</dt><dd>${readingsHTML(data.nanori)}</dd></div>` : ""}
      ${field("Strokes", data.stroke_count ?? "Not listed")}
      ${field("JLPT", data.jlpt ? `N${data.jlpt} (estimated)` : "Unrated")}
      ${data.grade ? field("School classification", data.grade <= 6 ? `Grade ${data.grade}` : data.categories.join(" · ")) : ""}
      ${data.categories?.length ? field("Categories", data.categories.join(" · ")) : ""}
      ${data.freq_mainichi_shinbun ? field("Frequency rank", `#${data.freq_mainichi_shinbun}`) : ""}
    </dl><section class="feedback-section"><h3>Example words</h3>
      ${data.examples?.length ? wordsHTML(data.examples) : '<p>No example words listed for this kanji.</p>'}
    </section>`;
  }
  function checkAnswer(revealOnly = false) {
    if (!current || !sessionActive || sessionPendingStart) return;
    if (suddenPending) { finishSuddenNow(); return; }
    if (!revealOnly && sessionMode === "timed" && !sessionPausedAt && Date.now() >= sessionDeadline) {
      finishSession("Time is up.");
      return;
    }
    if (!revealOnly && questionScored) {
      if (!currentAnswerCorrect) advanceQuestion();
      return;
    }
    const input = $("#answerInput").value.trim();
    if (!revealOnly && !input) {
      $("#answerInput").focus({ preventScroll: true });
      return;
    }
    if (revealOnly && sessionMode === "sudden" && !questionScored) { suddenDeathMiss(); return; }
    if (!revealOnly) startFreeClock();
    const correct = !revealOnly && isCorrect(input, current);
    let reachedQuestionLimit = false;
    if (!revealOnly) {
      questionScored = true;
      currentAnswerCorrect = correct;
      totalAnswerTimeMs += Math.max(0, performance.now() - questionStartedAt);
      stats.total++;
      questionsUsed++;
      stats[current.kind].total++;
      if (correct) { stats.correct++; stats[current.kind].correct++; }
      else wrongQuestions.push({ term: current.display, type: current.kind, ...(sessionMode === "sudden" ? { answer: displayAnswers(current) } : {}) });
      reachedQuestionLimit = sessionMode === "questions" && questionsUsed >= sessionLimit;
      updateStats();
      updateSessionStatus();
      $("#checkButton").disabled = correct;
      $("#checkButton").textContent = correct ? "Check" : "Continue";
      const reviewKanji = current.kind === "kanji" && sessionSettings.reviewKanjiToggle;
      $("#nextButton").hidden = !reviewKanji;
      $("#nextButton").textContent = correct ? "Next" : "Continue";
      if (reviewKanji || (!correct && current.kind === "kanji")) pauseSessionClock();
    }
    const feedback = $("#feedback");
    feedback.className = `feedback${revealOnly ? "" : correct ? " correct" : " incorrect"}`;
    if (current.kind !== "kanji") speakJapanese(current.character);
    if (current.kind !== "kanji") {
      feedback.textContent = !revealOnly && !correct ? `Answer: ${displayAnswers(current)} · Enter to continue` : "";
      if (revealOnly) $("#promptText").textContent = `Answer: ${displayAnswers(current)}`;
    } else feedback.innerHTML = `<div class="feedback-title">${revealOnly ? "Answer revealed" : correct ? "Correct!" : "Not quite"}</div>
      ${current.kind === "kanji" ? explainAnswer(current) : `<dl class="feedback-details"><div><dt>Answer</dt><dd>${escapeHTML(displayAnswers(current))}</dd></div></dl>`}
      ${!revealOnly && !correct ? '<p class="feedback-note">Edit your answer, then press Enter to continue.</p>' : ""}`;
    if (!revealOnly && !correct && sessionMode === "sudden") {
      beginSuddenFinish();
    } else if (reachedQuestionLimit && correct && !(current.kind === "kanji" && sessionSettings.reviewKanjiToggle)) {
      finishSession("Question goal reached.", true);
    } else if (correct && current.kind === "kanji" && sessionSettings.reviewKanjiToggle) {
      $("#answerInput").disabled = true;
    } else if (correct) {
      const answeredQuestion = current;
      autoAdvanceTimer = window.setTimeout(() => {
        if (current === answeredQuestion) advanceQuestion();
      }, 500);
    } else if (!revealOnly) {
      $("#answerInput").focus({ preventScroll: true });
      $("#answerInput").select();
    }
  }
  $("#answerForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (composing || !sessionActive || !current) return;
    if (suddenPending) { finishSuddenNow(); return; }
    if (readingBound) {
      $("#answerInput").value = (current.direction === "reading-katakana" ? toKatakana : toHiragana)($("#answerInput").value);
    }
    const input = $("#answerInput").value.trim();
    if (!questionScored && current.direction === "meaning-reverse" && input && !/\p{Script=Han}/u.test(input)) {
      const request = ++candidateRequest, question = current;
      candidates.textContent = "Finding kanji candidates…";
      try {
        const items = await fetchItems("/api/kanji/candidates", { reading: toHiragana(input) });
        if (request !== candidateRequest || current !== question || !sessionActive || $("#answerInput").value.trim() !== input) return;
        candidates.replaceChildren();
        for (const item of items) {
          const button = document.createElement("button");
          button.type = "button"; button.lang = "ja"; button.textContent = item.kanji;
          button.onclick = () => {
            $("#answerInput").value = item.kanji;
            candidates.replaceChildren();
            checkAnswer(false);
          };
          candidates.append(button);
        }
      } catch (error) {
        if (request === candidateRequest && current === question) candidates.textContent = error.message;
      }
      return;
    }
    candidates.replaceChildren();
    checkAnswer(false);
  });
  $("#answerInput").addEventListener("input", () => { candidateRequest++; candidates.replaceChildren(); });
  $("#answerInput").addEventListener("input", startFreeClock);
  $("#skipButton").addEventListener("click", skipQuestion);
  $("#nextButton").addEventListener("click", advanceQuestion);
  $("#showButton").addEventListener("click", () => checkAnswer(true));
  $("#stopSessionButton").addEventListener("click", () => finishSession("Session stopped."));
  $("#fontChoice").addEventListener("change", () => { if (!sessionSettings) useFont(); });
  $("#sessionMode").addEventListener("change", updateSessionFields);
  for (const id of ["sessionMode", "sessionTarget", "levelSelect"]) $(`#${id}`)?.addEventListener("change", () => showStartError(""));
  $("#sessionTarget").addEventListener("input", () => showStartError(""));
  $("#startSessionButton").addEventListener("click", startSession);
  $("#showStatsToggle").addEventListener("change", () => {
    if (!sessionSettings) $("#sessionStatsContent").hidden = !$("#showStatsToggle").checked;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target !== $("#answerForm")) {
      if (event.target.closest("button, input, select, summary, .study-setting-name")) return;
      if (!$("#checkButton").disabled) { event.preventDefault(); checkAnswer(false); }
    }
  });

  rememberControls(`nihon:${tool}-settings-v1`, [
    "kanaDirection", "meaningDirection", "readingDirection", "levelSelect",
    "fontChoice", "sessionMode", "sessionTarget", "showStatsToggle", "reviewKanjiToggle"
  ], showWarning);
  sessionMode = $("#sessionMode").value;
  $("#sessionStatsContent").hidden = !$("#showStatsToggle").checked;
  updateStats();
  updateSessionControls();
  updateSessionStatus();
  useFont();
  nextQuestion();
})();
