import "./imposters.css";
import "./chips.css";
import { createSessionView } from "./session-view.js";
import { setSettingAvailability } from "./settings-panel.js";
import { rememberControls } from "./settings-storage.js";
import { API_BASE } from "./api.js";
import { mountChips } from "./chips.js";
import { mountStudyControls, study, japaneseHTML, readingsHTML, audioHTML, speakJapanese } from "./study-controls.js";
import { makeQuestion, meanings, readings, shuffle } from "./imposters-engine.js";

const root = document.getElementById("impostersRoot");
const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const options = (values) => values.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
const modes = [["practice", "Practice"], ["timed", "Timed Challenge"], ["high", "High Score"], ["sudden", "Sudden Death"], ["review", "Mistake Review"]];
const variants = [["kanji-reading", "Kanji → Readings"], ["reading-kanji", "Reading → Kanji"]];
root.innerHTML = `<div class="shell imposters-shell"><header><div class="brand"><span class="brand-mark" lang="ja">似</span><span class="brand-name">Kanji Kuizu<span class="brand-note">at NihongoToolkit</span></span></div><button id="themeButton" type="button" aria-label="Toggle theme"></button></header>
<section class="intro"><span class="eyebrow">Kanji Imposters</span><h1>Kanji Kuizu <span lang="ja">漢字クイズ</span></h1></section>
<details class="card game-settings imposters-settings" id="settings" open><summary>Game settings</summary><div class="settings-body"><form id="settingsForm">
<fieldset class="settings-section"><legend>Session</legend><div class="settings-grid">
<div class="setting imposters-setting-wide"><span class="field-label" id="modeLabel">Game mode</span><select id="mode" aria-labelledby="modeLabel">${options(modes)}</select></div>
<div class="setting"><span class="field-label" id="countLabel">Questions per session</span><select id="count" aria-labelledby="countLabel">${options([["10", "10"], ["20", "20"], ["30", "30"], ["50", "50"], ["custom", "Custom"]])}</select></div>
<div class="setting" id="customWrap" hidden><label for="customCount">Custom question count</label><input id="customCount" type="number" min="1" max="200" value="10"></div>
<div class="setting"><span class="field-label" id="secondsLabel">Seconds per question</span><select id="seconds" aria-labelledby="secondsLabel">${options([["10", "10 seconds"], ["20", "20 seconds"], ["30", "30 seconds"], ["60", "60 seconds"]])}</select></div>
</div></fieldset>
<fieldset class="settings-section"><legend>Questions</legend><div class="settings-grid imposters-question-settings">
<div class="setting"><label for="levelSelect">JLPT levels</label><select id="levelSelect">${options([["all", "All"], ...[5, 4, 3, 2, 1].map((level) => [String(level), `N${level}`])])}</select></div>
<div class="setting"><label for="variants" data-setting-description="Choose whether to identify readings for a kanji, kanji for a reading, or both.">Question variants</label><select id="variants">${options(variants)}</select></div>
</div></fieldset>
<fieldset class="settings-section"><legend>Display and feedback</legend><div class="settings-grid imposters-display-settings">
<div class="setting"><label for="readingPrompt" data-setting-description="How do you want your questions to be? Show the reading as kana or play it as audio.">Reading prompt</label><select id="readingPrompt">${options([["text", "Show kana"], ["audio", "Play audio"]])}</select><small id="volumeNotice" hidden>Check your volume and enable Audio in the study controls.</small></div>
<div class="setting"><span class="field-label" id="fontSizeLabel">Kanji size</span><select id="fontSize" aria-labelledby="fontSizeLabel">${options([["48", "Small"], ["64", "Standard"], ["80", "Large"]])}</select></div>
</div></fieldset>
<fieldset class="settings-section help-section"><legend>Help during play</legend><div class="help-pair">
<fieldset class="help-group"><legend>Hints</legend><div class="settings-grid"><div class="setting"><span class="field-label" id="hintModeLabel">Availability</span><select id="hintMode" aria-labelledby="hintModeLabel">${options([["limited", "Limited"], ["unlimited", "Unlimited"], ["disabled", "Disabled"]])}</select></div><div class="setting"><span class="field-label" id="hintLimitLabel">Hints per session</span><input id="hintLimit" type="number" min="0" max="200" value="3" aria-labelledby="hintLimitLabel"></div></div></fieldset>
<fieldset class="help-group"><legend>Reveal answer</legend><div class="settings-grid"><div class="setting"><span class="field-label" id="revealModeLabel">Availability</span><select id="revealMode" aria-labelledby="revealModeLabel">${options([["limited", "Limited"], ["unlimited", "Unlimited"], ["disabled", "Disabled"]])}</select></div><div class="setting"><span class="field-label" id="revealLimitLabel">Reveals per session</span><input id="revealLimit" type="number" min="0" max="200" value="3" aria-labelledby="revealLimitLabel"></div></div></fieldset>
</div></fieldset></form></div></details>
<div class="imposters-controls"><button id="start" class="primary" type="button">Start session</button><button id="reviewList" type="button">Review list</button></div><p id="error" class="imposters-error" role="alert"></p>
<section id="game" class="card imposters-game" hidden><div class="imposters-status"><span id="progress"></span><span id="score"></span><span id="timer"></span></div><div class="imposters-prompt"><span id="promptLabel" class="eyebrow"></span><h2 id="prompt"></h2><p id="secondary"></p><div id="promptAudio"></div></div><div id="choices" class="imposters-choices" role="group" aria-label="Select all correct answers"></div><div class="imposters-actions"><button id="check" class="primary" type="button" disabled>Check answers</button><button id="hint" type="button">Hint</button><button id="reveal" type="button">Reveal answer</button><button id="stop" type="button">Stop session</button><button id="next" type="button" hidden>Next question</button></div><div id="feedback" class="imposters-feedback" role="status" aria-live="polite"></div></section>
<section id="results" class="card imposters-results" hidden></section></div>`;
const $ = (id) => document.getElementById(id);
$("game").insertAdjacentHTML("afterbegin", '<label class="check-label"><input id="details" type="checkbox" checked> Show readings and example after each answer</label>');
$("details").addEventListener("change", () => {
  const details = $("feedback").querySelector(".imposters-feedback-details");
  if (details) details.hidden = !$("details").checked;
});
mountChips($("mode"), { presentation: "radio", label: "Game mode", descriptions: {
  practice: "Choose all correct answers and review your mistakes without a timer.",
  timed: "Answer each question before its countdown expires.",
  high: "Answer against the clock and build a combo to earn points.",
  sudden: "The first incorrect or revealed answer ends the session.",
  review: "Practice kanji from your saved mistake review list."
} });
mountChips($("variants"), { multiple: true, options: variants.map(([value, label]) => ({ value, label })), allValue: "all", emptyValue: "none" });
$("variants").value = "all";
$("variants").dispatchEvent(new Event("change", { bubbles: true }));
mountStudyControls({ onChange: () => { if (session?.question) renderQuestion(); } });
const reviewKey = "nihon:imposters-review-v1";
function load(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
function save(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { $("error").textContent = "Could not save your progress on this device."; } }
let review = load(reviewKey, {}), session = null, timerHandle = null;
const sessionView = createSessionView({ settings: $("settings"), start: $("start"), results: $("results"), play: [$("game")], setup: [$("reviewList")], footer: true });
function updateAvailability() {
  setSettingAvailability($("customCount"), $("count").value !== "custom" ? "Choose a custom question count." : "");
  $("customWrap").hidden = $("count").value !== "custom";
  setSettingAvailability($("seconds"), ["timed", "high"].includes($("mode").value) ? "" : "Used in Timed Challenge and High Score.");
  const reading = $("variants").value === "all" || $("variants").value.includes("reading-kanji");
  setSettingAvailability($("readingPrompt"), reading ? "" : "Used for Reading to Kanji questions.");
  $("volumeNotice").hidden = !reading || $("readingPrompt").value !== "audio";
  for (const kind of ["hint", "reveal"]) setSettingAvailability($(`${kind}Limit`), $(`${kind}Mode`).value === "limited" ? "" : "Used with limited assistance.");
}
$("settingsForm").addEventListener("change", updateAvailability);
rememberControls("nihon:imposters-settings-v1", [
  "mode", "count", "customCount", "seconds", "levelSelect", "variants", "readingPrompt",
  "fontSize", "hintMode", "hintLimit", "revealMode", "revealLimit", "details"
], (message) => { $("error").textContent = message; });
updateAvailability();
function status() { $("reviewList").textContent = `Review list (${Object.keys(review).length})`; }
status();
$("count").addEventListener("change", () => { $("customWrap").hidden = $("count").value !== "custom"; });
$("readingPrompt").addEventListener("change", () => { $("volumeNotice").hidden = $("readingPrompt").value !== "audio"; });
for (const kind of ["hint", "reveal"]) $(`${kind}Mode`).addEventListener("change", () => { $(`${kind}Limit`).disabled = $(`${kind}Mode`).value !== "limited"; });
function applyFontSize() {
  root.style.setProperty("--kanji-size", `${$("fontSize").value}px`);
  root.style.setProperty("--kanji-mobile-size", `${Number($("fontSize").value) * 0.75}px`);
}
$("fontSize").addEventListener("change", applyFontSize);
applyFontSize();
function showReview(items, heading) {
  $("results").hidden = false;
  $("results").innerHTML = `<h2>${escape(heading)}</h2>${items.length ? `<ul>${items.map((item) => `<li><span lang="ja">${escape(item.kanji)}</span> · ${escape(item.meaning || "")} <button type="button" data-remove="${escape(item.kanji)}">Remove</button></li>`).join("")}</ul>` : "<p>No missed kanji yet.</p>"}`;
}
$("reviewList").addEventListener("click", () => { if (!session) showReview(Object.values(review), "Mistake review list"); });
$("results").addEventListener("click", (event) => { const key = event.target.dataset.remove; if (!key) return; delete review[key]; save(reviewKey, review); status(); event.target.closest("li").remove(); });
async function getJSON(path) { const response = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(20000) }); if (!response.ok) throw new Error("Could not load kanji. Please try again."); return response.json(); }
async function loadPool(level) {
  return (await getJSON(`/api/kanji/batch?mode=both&limit=100&projection=practice&level=${encodeURIComponent(level)}`)).items;
}
$("start").addEventListener("click", async () => {
  $("error").textContent = "";
  const mode = $("mode").value, level = $("levelSelect").value;
  const count = $("count").value === "custom" ? Number($("customCount").value) : Number($("count").value);
  const selectedVariants = $("variants").value === "all" ? variants.map(([value]) => value) : $("variants").value.split(",").filter((value) => value !== "none");
  if (level === "none" || !selectedVariants.length || !Number.isInteger(count) || count < 1 || count > 200 || !$("settingsForm").checkValidity()) { $("error").textContent = "Choose levels and question variants, and enter valid session settings."; return; }
  if (mode === "review" && !Object.keys(review).length) { $("error").textContent = "Your review list is empty."; return; }
  if ($("readingPrompt").value === "audio" && !study.audio && selectedVariants.includes("reading-kanji")) { $("error").textContent = "Enable Audio in the study controls or choose Show kana."; return; }
  sessionView.start();
  const doneLoading = beginLoading($("start"), $("game"));
  $("start").disabled = true;
  $("error").textContent = "Loading kanji…";
  try {
    const random = Math.random;
    const pool = await loadPool(level);
    if (mode === "review") {
      const missing = Object.keys(review).filter((kanji) => !pool.some((item) => item.kanji === kanji));
      for (let index = 0; index < missing.length; index += 8) pool.push(...await Promise.all(missing.slice(index, index + 8).map((kanji) => getJSON(`/api/kanji/${encodeURIComponent(kanji)}`))));
    }
    const eligible = pool.filter((item) => item.kanji && meanings(item).length && readings(item).length && (mode !== "review" || review[item.kanji]));
    if (!eligible.length || pool.length < 5) throw new Error("Not enough suitable kanji for these settings.");
    const actualVariants = selectedVariants;
    const targetCount = count;
    const ordered = shuffle(eligible, random), questions = [];
    for (let index = 0; questions.length < targetCount && index < Math.max(targetCount * 10, ordered.length * actualVariants.length * 2); index++) {
      const target = ordered[index % ordered.length];
      const variant = actualVariants[Math.floor(random() * actualVariants.length)];
      const question = makeQuestion(target, pool, variant, random);
      if (question) questions.push(question);
    }
    if (questions.length < targetCount) throw new Error("Not enough distinct choices for these settings.");
    session = { mode, questions, index: 0, correct: 0, mistakes: [], score: 0, combo: 0, hints: 0, reveals: 0, answered: false, removed: new Set(), selected: new Set() };
    $("settings").open = false; $("results").hidden = true; $("game").hidden = false; $("error").textContent = "";
    renderQuestion(); playPrompt(); startTimer();
  } catch (error) { sessionView.setup(); $("error").textContent = error.message || "Could not start the session."; }
  finally { await doneLoading(); $("start").disabled = Boolean(session); $("reviewList").disabled = Boolean(session); }
});
function startTimer() {
  clearInterval(timerHandle);
  if (!["timed", "high"].includes(session.mode)) { $("timer").textContent = ""; return; }
  const deadline = Date.now() + Number($("seconds").value) * 1000;
  const tick = () => { const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000)); $("timer").textContent = `${remaining}s`; if (!remaining) answer(null); };
  tick(); timerHandle = setInterval(tick, 200);
}
function allowance(kind) { const mode = $(`${kind}Mode`).value; return mode !== "disabled" && (mode === "unlimited" || session[`${kind}s`] < Number($(`${kind}Limit`).value)); }
function renderQuestion() {
  if (!session) return;
  const question = session.questions[session.index]; session.question = question;
  $("progress").textContent = `Question ${session.index + 1} / ${session.questions.length}`;
  $("score").textContent = session.mode === "high" ? `Score ${session.score} · Combo ${session.combo}` : "";
  $("promptLabel").textContent = question.variant === "reading-kanji" ? "Select all kanji with this reading" : "Select all readings for this kanji";
  const audioOnly = question.variant === "reading-kanji" && $("readingPrompt").value === "audio" && study.audio;
  $("prompt").textContent = audioOnly ? "" : question.prompt;
  $("prompt").classList.toggle("kanji-prompt", question.variant === "kanji-reading");
  if (!audioOnly) $("prompt").lang = "ja"; else $("prompt").removeAttribute("lang");
  $("promptAudio").innerHTML = question.variant === "reading-kanji"
    ? audioOnly ? `<button type="button" class="study-audio" data-study-speak="${escape(question.prompt)}" aria-label="Replay question audio">Replay ▶</button>` : audioHTML(question.prompt)
    : "";
  $("secondary").textContent = "";
  $("choices").innerHTML = question.choices.map((choice, index) => {
    const selected = session.selected.has(index);
    const result = session.answered ? choice.correct ? selected ? "correct" : "missed" : selected ? "wrong" : "" : "";
    const label = { correct: "Correct selection", wrong: "Incorrect selection", missed: "Correct, not selected" }[result];
    return `<button type="button" data-choice="${index}" ${question.variant === "reading-kanji" ? 'data-kanji' : ''} aria-pressed="${selected}" class="${session.removed.has(index) ? "removed" : result}" ${session.answered || session.removed.has(index) ? "disabled" : ""}><span class="choice-value" lang="ja">${escape(choice.value)}</span>${label ? `<span class="choice-result" lang="en">${label}</span>` : ""}</button>`;
  }).join("");
  $("check").hidden = session.answered;
  $("check").disabled = !session.selected.size;
  $("hint").disabled = session.answered || !allowance("hint") || !question.choices.some((choice, index) => !choice.correct && !session.removed.has(index));
  $("reveal").disabled = session.answered || !allowance("reveal");
  $("next").hidden = !session.answered;
  if (!session.answered) $("feedback").innerHTML = "";
}
function playPrompt() { if (session?.question.variant === "reading-kanji" && $("readingPrompt").value === "audio" && study.audio) speakJapanese(session.question.prompt); }
$("choices").addEventListener("click", (event) => { const choice = event.target.closest("[data-choice]"); if (!choice || !session || session.answered) return; const index = Number(choice.dataset.choice); if (session.selected.has(index)) session.selected.delete(index); else session.selected.add(index); choice.setAttribute("aria-pressed", String(session.selected.has(index))); $("check").disabled = !session.selected.size; });
$("check").addEventListener("click", () => answer("submitted"));
function answer(result, revealed = false) {
  if (!session || session.answered) return;
  clearInterval(timerHandle); session.answered = true;
  const question = session.question, correct = result === "submitted" && !revealed && question.choices.every((choice, index) => choice.correct === session.selected.has(index));
  if (correct) { session.correct++; session.combo++; if (session.mode === "high") session.score += 100 * Math.min(session.combo, 5); }
  else { session.combo = 0; const item = { kanji: question.target.kanji, meaning: meanings(question.target)[0] }; session.mistakes.push(item); review[item.kanji] = item; if (question.variant === "reading-kanji") question.choices.forEach((choice, index) => { if (choice.correct && !session.selected.has(index)) review[choice.value] = { kanji: choice.value, meaning: meanings(choice.item)[0] }; }); save(reviewKey, review); status(); }
  renderQuestion();
  const detailItems = question.variant === "reading-kanji" ? question.choices.map((choice) => choice.item) : [question.target];
  const details = detailItems.map((item) => {
    const example = item.examples?.[0];
    const itemReadings = [...item.on_readings || [], ...item.kun_readings || []];
    return `<div class="imposters-feedback-item" data-feedback-kanji="${escape(item.kanji)}">
      ${question.variant === "reading-kanji" ? `<strong lang="ja">${escape(item.kanji)}</strong>` : ""}
      <p>${itemReadings.length ? readingsHTML(itemReadings) : "No readings available."}</p>
      <p>${escape(meanings(item).join(" · ") || "No meaning available.")}</p>
      ${example ? `<p>${japaneseHTML(example.word, example.reading)} ${escape((example.meanings || []).join(", "))} ${audioHTML(example.word)}</p>` : ""}
    </div>`;
  }).join("");
  $("feedback").innerHTML = `<strong>${correct ? "Correct" : revealed ? "Answer revealed" : result === null ? "Time is up" : "Not quite"}</strong><div class="imposters-feedback-details"${$("details").checked ? "" : " hidden"}>${details}</div>`;
  if (session.mode === "sudden" && !correct) $("next").textContent = "See results"; else $("next").textContent = session.index + 1 === session.questions.length ? "See results" : "Next question";
}
$("hint").addEventListener("click", () => { if (!session || session.answered || !allowance("hint")) return; const wrong = session.question.choices.map((choice, index) => !choice.correct && !session.removed.has(index) ? index : -1).filter((index) => index >= 0); if (!wrong.length) return; const removed = wrong[Math.floor(Math.random() * wrong.length)]; session.removed.add(removed); session.selected.delete(removed); session.hints++; renderQuestion(); });
$("reveal").addEventListener("click", () => { if (!session || session.answered || !allowance("reveal")) return; session.reveals++; answer(null, true); });
$("next").addEventListener("click", () => { if (!session?.answered) return; if (session.mode === "sudden" && session.mistakes.length || session.index + 1 >= session.questions.length) return finish(true); session.index++; session.answered = false; session.removed = new Set(); session.selected = new Set(); renderQuestion(); playPrompt(); startTimer(); });
$("stop").addEventListener("click", () => finish(false));
function finish(completed) {
  if (!session) return; clearInterval(timerHandle);
  const played = session.correct + session.mistakes.length, accuracy = played ? Math.round(session.correct * 100 / played) : 0;
  const result = session; session = null; $("game").hidden = true; $("settings").open = true;
  $("start").disabled = false; $("reviewList").disabled = false;
  showReview(result.mistakes, "Session results");
  $("results").insertAdjacentHTML("afterbegin", `<p>Correct: ${result.correct} · Mistakes: ${result.mistakes.length} · Accuracy: ${accuracy}%${result.mode === "high" ? ` · Score: ${result.score}` : ""}</p>`);
  sessionView.finish();
  status();
}
import { beginLoading } from "./request-loading.js";