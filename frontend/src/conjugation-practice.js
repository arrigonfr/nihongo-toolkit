import { bind } from "wanakana";
import { API_BASE } from "./api.js";
import { PracticeSession, cleanSettings, defaults, modes, createPool, dailyStreak, localDate, exampleFor, ruleFor, normalizeAnswer, sampleChoices, taskList } from "./conjugation-practice-engine.js";
import { wordCategories, formCatalog } from "./conjugation-practice-data.js";
import { mountStudyControls, study, japaneseHTML, audioHTML } from "./study-controls.js";
import { escape } from "./examples.js";
import { romanizeKana } from "./romanize.js";
import { JAPANESE_FONTS, applyJapaneseFont } from "./japanese-fonts.js";
import "./conjugation-practice.css";
import { groupSettings, setSettingAvailability } from "./settings-panel.js";
import { pillSelect } from "./choice-controls.js";
import { mountConjugationFilters } from "./conjugation-filters.js";
import { confirmAction } from "./confirm-dialog.js";
import { mountChips } from "./chips.js";
import { plainSelect, plainNumber, plainCheck, removeChipsTooltip } from "./plain-fields.js";

const $ = (id) => document.getElementById(id);
const storageKey = "nihon:conjugation-practice-v1";
let settings = cleanSettings(), progress = {}, days = [], completed = 0, session, clock, composing = false;
const notice = (message) => { $("notice").textContent = message; };
try {
  const saved = JSON.parse(localStorage.getItem(storageKey) || "{}");
  const records = saved.progress || {};
  if (!records || typeof records !== "object" || Array.isArray(records)) throw new Error("Invalid progress records.");
  for (const [key, value] of Object.entries(records)) {
    if (key.length > 200 || !value || !["attempts", "correct", "wrong"].every((field) => Number.isSafeInteger(value[field]) && value[field] >= 0)
      || value.attempts !== value.correct + value.wrong || !Number.isFinite(value.last)) throw new Error("Invalid progress totals.");
  }
  if (saved.days !== undefined && (!Array.isArray(saved.days) || saved.days.some((day) => !/^\d{4}-\d{2}-\d{2}$/.test(day)))) throw new Error("Invalid daily history.");
  if (saved.completed !== undefined && (!Number.isSafeInteger(saved.completed) || saved.completed < 0)) throw new Error("Invalid completed count.");
  settings = cleanSettings(saved.settings);
  progress = records; days = saved.days || []; completed = saved.completed || 0;
} catch (error) {
  console.warn("Could not restore conjugation practice.", error);
  notice("Saved practice data could not be restored. Defaults are in use; your other tools are unaffected.");
}
function persist() {
  if (session && !session.completedRecorded && (session.results.length >= session.limit || session.reason === "Time is up")) {
    completed++;
    session.completedRecorded = true;
    if (session.settings.mode === "daily") days = [...new Set([...days, localDate()])];
  }
  try { localStorage.setItem(storageKey, JSON.stringify({ settings, progress, days, completed })); }
  catch (error) {
    console.warn("Could not save conjugation practice.", error);
    notice("Your browser could not save practice progress. Keep this tab open; progress may be lost when it closes.");
  }
}
const select = (id, label, options, tip) => `<label for="setting-${id}"${tip ? ` data-setting-description="${escape(tip)}"` : ""}>${label}<select id="setting-${id}" data-setting="${id}">${options.map(([value, name]) => `<option value="${value}">${escape(name)}</option>`).join("")}</select></label>`;
const number = (id, label, min, max, tip) => `<label for="setting-${id}"${tip ? ` data-setting-description="${escape(tip)}"` : ""}>${label}<input id="setting-${id}" data-setting="${id}" type="number" min="${min}" max="${max}" step="1" required></label>`;
const checkbox = (id, label) => `<label class="check-label"><input id="setting-${id}" type="checkbox" data-setting="${id}">${label}</label>`;
const options = (...values) => values.map((value) => [value, value[0].toUpperCase() + value.slice(1)]);
$("quickSettings").innerHTML = select("mode", "Practice mode", Object.entries(modes))
  + select("questions", "Questions per session", Array.from({ length: 20 }, (_, i) => [(i + 1) * 5, `${(i + 1) * 5} questions`]));
$("quickSettings").insertBefore($("levelSettings"), $("setting-questions").closest("label"));
const syncModePills = pillSelect($("setting-mode"), {
  classic: "Conjugate words with your selected filters.", quick: "A short drill of five questions.",
  marathon: "Continue until you stop or reach the mistake limit.", timed: "Answer as many questions as you can before time runs out.",
  sudden: "The first missed or assisted answer ends the challenge.", daily: "Complete five questions to build your daily streak.",
  weak: "Practice previously missed or assisted word–form pairs.", mixed: "Review previously practiced word–form pairs.",
  comparison: "Distinguish potential, passive and causative forms.", sentence: "Conjugate the word to complete a sentence.",
  reverse: "Identify the base word or grammatical features of a conjugated form.", irregular: "Focus on irregular verbs."
});
$("questionSettings").innerHTML = [
  select("politeness", "Politeness", [["both", "All"], ["plain", "Plain"], ["polite", "Polite"]]),
  select("polarity", "Polarity", [["both", "All"], ["affirmative", "Affirmative"], ["negative", "Negative"]]),
  select("tense", "Tense", [["both", "All"], ["non-past", "Non-past"], ["past", "Past"]]),
  select("input", "Answer input", [["either", "Kana or kanji · either"], ["kana", "Kana only"], ["kanji", "Kanji spelling"], ["both", "Both · spelling / reading"]], "Choose how do you want to type your answer"),
  select("language", "Question language", [["ja", "日本語"], ["en", "English"], ["both", "Japanese & English"]]),
  select("prompt", "Requested form shown as", [["name", "Form name"], ["description", "Usage description"], ["sentence", "Example sentence with a blank"], ["mixed", "Mixed"]]),
  select("priority", "Word priority", [["balanced", "Balanced"], ["new", "New words"], ["review", "Previously practiced words"]]),
  select("reverseTask", "Reverse mode: identify", [["base", "Base word"], ["form", "Form name"], ["polarity", "Polarity"], ["tense", "Tense"], ["politeness", "Politeness"]], "Choose what you will be quizzed on"),
  number("seconds", "Timed duration (s)", 10, 3600),
  plainNumber("mistakes", "Max. Marathon mistakes", 0, 100),
  checkbox("repeat", "Repeat missed questions later"), checkbox("timer", "Show elapsed time in untimed modes")
].join("");
$("supportSettings").innerHTML = select("hints", "Hints", options("unlimited", "limited", "disabled"), "Will you put a limit to your hints?")
  + number("hintLimit", "Hints Limit", 1, 100)
  + select("reveals", "Answer reveals", options("unlimited", "limited", "disabled"), "Will you put a limit to your answer reveals?")
  + number("revealLimit", "Reveals Limit", 1, 100)
  + plainCheck("examples", "Example sentences after answering")
  + plainCheck("meaning", "Show meaning in the question") + plainCheck("type", "Show word type in the question");
$("displaySettings").innerHTML = [
  select("font", "Japanese font", Object.entries(JAPANESE_FONTS)),
  plainSelect("fontSize", "Japanese font size", [24, 32, 40, 48, 56, 64].map((n) => [n, `${n}px`]))
].join("");
groupSettings($("questionSettings"), [
  ["Form filters", ["setting-politeness", "setting-polarity", "setting-tense"]],
  ["Questions & answers", ["setting-input", "setting-language", "setting-prompt", "setting-reverseTask"]],
  ["Practice flow", ["setting-priority", "setting-repeat"]],
  ["Timer & challenge limits", ["setting-seconds", "field-mistakes", "setting-timer"]]
]);
mountConjugationFilters();
mountChips($("setting-reverseTask"), {
  multiple: true, allValue: "all", fieldClass: "wide",
  options: [["base", "Base word"], ["form", "Form name"], ["polarity", "Polarity"], ["tense", "Tense"], ["politeness", "Politeness"]].map(([value, label]) => ({ value, label })),
  actions: [{ label: "All", run: "all" }]
});
groupSettings($("supportSettings"), [["Hints & reveals", []], ["Learning support", ["field-examples", "field-meaning", "field-type"]]]);
const hintsGrid = $("supportSettings").querySelector(".settings-section-grid");
hintsGrid.classList.add("assist-grid");
for (const [name, ids] of [["Hints", ["setting-hints", "setting-hintLimit"]], ["Answer reveals", ["setting-reveals", "setting-revealLimit"]]]) {
  const group = document.createElement("div");
  group.className = "assist-group";
  group.setAttribute("role", "group"); group.setAttribute("aria-label", name);
  group.append(...ids.map((id) => $(id).closest("label") || $(id)));
  hintsGrid.append(group);
}
function mountList(containerId, key, entries, label) {
  const values = entries.map(([value]) => String(value));
  const field = $(containerId);
  const select = document.createElement("select");
  select.id = `list-${key}`; select.dataset.list = key; select.setAttribute("aria-label", label);
  select.add(new Option("none", "none"));
  field.append(select);
  mountChips(select, {
    multiple: true, wrap: false, label, allValue: "all", emptyValue: "none",
    options: entries.map(([value, text]) => ({ value: String(value), label: text })),
    decode: (value) => value === "all" ? [...values] : value === "none" ? [] : value.split(",").filter((item) => values.includes(item)),
    encode: (list) => { const picked = values.filter((item) => list.includes(item)); return !picked.length ? "none" : picked.length === values.length ? "all" : picked.join(","); },
    actions: [{ label: "All", run: "all" }, { label: "Clear", run: "clear" }]
  });
  return select;
}
mountList("levelSettings", "levels", [5, 4, 3, 2, 1].map((n) => [n, `N${n}`]), "JLPT study level");
$("levelSettings").insertAdjacentHTML("beforeend", '<p class="level-note small muted">Levels are estimates; Non-JLPT means unrated.</p>');
mountList("typeSettings", "types", Object.entries(wordCategories), "Word types");
mountList("formSettings", "forms", Object.entries(formCatalog).map(([id, form]) => [id, `${form.en} · N${form.level}`]), "Conjugation forms");
mountStudyControls({ onChange: () => { syncSettings(); if (session && !session.ended) renderQuestion(); } });
removeChipsTooltip($("setting-font"));
function formsForLevels(levels) {
  return Object.keys(formCatalog).filter((form) => levels.includes(formCatalog[form].level));
}
function syncSettings() {
  for (const [name, value] of Object.entries(settings)) {
    const control = $("setting-" + name);
    if (control) { if (control.type === "checkbox") control.checked = value; else { control.value = value; control.chipsApi?.sync(); } }
  }
  for (const select of document.querySelectorAll("select[data-list]")) {
    const picked = settings[select.dataset.list].map(String);
    const all = [...select.chipsApi.codec.regular];
    const value = !picked.length ? "none" : all.every((item) => picked.includes(item)) ? "all" : all.filter((item) => picked.includes(item)).join(",");
    if (![...select.options].some((option) => option.value === value)) select.add(new Option(value, value));
    select.value = value; select.chipsApi.sync();
  }
  syncModePills();
  document.documentElement.style.setProperty("--jp-size", (session?.settings.fontSize ?? settings.fontSize) + "px");
  applyJapaneseFont(session?.settings.font ?? settings.font, session?.started ?? "settings");
  const mode = settings.mode, recognition = ["comparison", "reverse"].includes(mode);
  const choice = mode === "comparison" || mode === "reverse" && !taskList(settings.reverseTask).includes("base");
  const reasons = {
    questions: ["quick", "daily", "timed", "marathon", "sudden"].includes(mode) ? "Session length is determined by this mode." : "",
    seconds: mode !== "timed" ? "Used in Timed Challenge." : "",
    mistakes: mode !== "marathon" ? "Used in Marathon." : "",
    timer: mode === "timed" ? "Timed Challenge always shows the countdown." : "",
    reverseTask: mode !== "reverse" ? "Used in Reverse Mode." : "",
    input: choice ? "This mode uses answer choices instead of typed answers." : "",
    prompt: recognition ? "Recognition modes provide their own question." : "",
    priority: ["weak", "mixed"].includes(mode) ? "This mode selects from your practice history." : "",
    meaning: recognition ? "Hidden while identifying a conjugated form." : "",
    type: recognition ? "Hidden while identifying a conjugated form." : "",
    repeat: ["sudden", "comparison", "reverse"].includes(mode) ? "Missed questions do not repeat in this mode." : "",
    hintLimit: settings.hints !== "limited" ? "Available when Hints is Limited." : "",
    revealLimit: settings.reveals !== "limited" ? "Available when Answer reveals is Limited." : ""
  };
  for (const [key, reason] of Object.entries(reasons)) setSettingAvailability($("setting-" + key), reason);
}
function updateSettings(event) {
  const { setting, list } = event.target.dataset;
  if (!setting && !list) return;
  if (list) {
    const picked = event.target.chipsApi.current();
    settings[list] = list === "levels" ? picked.map(Number) : picked;
    if (list === "levels") settings.forms = formsForLevels(settings.levels);
  } else {
    const input = event.target;
    let value = input.type === "checkbox" ? input.checked : input.value;
    if (typeof defaults[setting] === "number") {
      value = Number(value);
      if (!input.checkValidity() || !Number.isInteger(value)) { input.reportValidity(); return; }
    }
    settings[setting] = value;
  }
  startError(""); syncSettings(); persist();
}
document.addEventListener("change", updateSettings);
document.addEventListener("input", (event) => {
  if (event.target.type === "number" && event.target.value !== "" && event.target.checkValidity()) updateSettings(event);
});
function japanese(word, reading, { solution = false } = {}) {
  const script = solution ? "both" : "furigana";
  const text = script === "kana" ? reading : word;
  const html = ["both", "furigana"].includes(script) ? japaneseHTML(text, reading)
    : `<span lang="ja">${escape(text)}</span>${study.romaji ? `<span class="study-romaji">${escape(romanizeKana(reading))}</span>` : ""}`;
  return html + (script === "both" ? `<span class="base-reading" lang="ja">${escape(reading)}</span>` : "");
}
function enableKanji(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (/\p{Script=Han}/u.test(node.textContent) && node.parentElement.closest('[lang="ja"]')
      && !node.parentElement.closest("rt, button")) nodes.push(node);
  }
  for (const node of nodes) {
    const fragment = document.createDocumentFragment();
    for (const char of node.textContent) {
      if (!/\p{Script=Han}/u.test(char)) { fragment.append(char); continue; }
      const button = document.createElement("button");
      button.type = "button"; button.className = "kanji-tap"; button.dataset.kanji = char; button.textContent = char;
      button.setAttribute("aria-label", `Kanji information: ${char}`); button.title = "Tap for meaning, readings and words";
      fragment.append(button);
    }
    node.replaceWith(fragment);
  }
}
const traitsJa = { plain: "普通体", polite: "丁寧体", neutral: "共通形", affirmative: "肯定", negative: "否定", "non-past": "非過去", past: "過去" };
const descriptionsJa = {
  present: "習慣や現在・未来のことを表す", negative: "しないこと・そうではないことを表す", past: "過去の出来事を表す",
  pastNegative: "過去にしなかったことを表す", te: "文をつなぐ形にする", ta: "たで終わる過去の形にする",
  nai: "ないで終わる否定の形にする", desire: "したい気持ちを表す", progressive: "動作の進行や結果の状態を表す",
  potential: "できることを表す", passive: "動作を受けることを表す", causative: "人に何かをさせることを表す",
  causativePassive: "人に何かをさせられることを表す", volitional: "一緒にすることを提案する",
  imperative: "強い命令を表す", ba: "ばを使って条件を表す", tara: "たらを使って条件を表す",
  nara: "ならを使って条件を表す", adverb: "動詞を修飾する形にする", respectful: "動作をする人を高める",
  humble: "自分側を低めて敬意を表す", formal: "ますを使わず、連用形で文をつなぐ",
  contracted: "短い形で、させられることを表す", formalNegative: "ありませんを使って否定する"
};
function localized(ja, en) {
  const language = session?.settings.language || settings.language;
  return language === "ja" ? ja : language === "en" ? en : `${ja} · ${en}`;
}
function bilingual(ja, en) { return localized(ja, en); }
function formName(family) { return localized(formCatalog[family].ja, formCatalog[family].en); }
function traitLabel(value) { return localized(traitsJa[value], value === "neutral" ? "Unmarked / connective" : value); }
function isChoice() { return session.settings.mode === "comparison" || session.settings.mode === "reverse" && session.task !== "base"; }
function renderQuestion() {
  if (!session || session.ended) return;
  const q = session.current, s = session.settings;
  const recognition = s.mode === "reverse" || s.mode === "comparison";
  const word = recognition ? q.row : q.entry;
  const example = exampleFor(q);
  const field = s.mode === "comparison" ? "form" : session.task;
  let requested;
  if (recognition) {
    const names = { base: ["辞書形は？", "What is the base word?"], form: ["何形ですか？", "Which form is this?"],
      tense: ["時制は？", "Which tense?"], polarity: ["肯定・否定は？", "Which polarity?"], politeness: ["丁寧さは？", "Which politeness level?"] };
    requested = `<strong>${bilingual(...names[field])}</strong><p class="small muted">${bilingual("複数の解釈がある場合は、どれも正解です。", "If the form has multiple valid analyses, any is accepted.")}</p>`;
  } else {
    const register = `<span class="requested-register">${bilingual("丁寧さ", "Politeness")}: ${bilingual(traitsJa[q.row.politeness], q.row.politeness === "neutral" ? "Unmarked / connective" : q.row.politeness)}</span>`;
    const traits = [q.row.polarity, q.row.tense].filter((v) => v !== "neutral")
      .map((value) => bilingual(traitsJa[value], value)).join(" · ");
    requested = `<strong>${session.prompt === "description" ? bilingual(descriptionsJa[q.family], formCatalog[q.family].use) : bilingual(formCatalog[q.family].ja, formCatalog[q.family].en)}</strong><div class="traits">${register}${traits}</div>`;
    if (session.prompt === "sentence") {
      requested = `<div class="sentence-prompt" lang="ja">${escape(example.before)} <strong>＿＿＿</strong> ${escape(example.after)}</div>
        <p class="small">${escape(example.english)}</p>` + requested;
    }
  }
  $("questionBody").innerHTML = `<div class="word-prompt"><span class="badge">N${q.level} · ${recognition ? "READ & RECOGNIZE" : "CONJUGATE"}</span>
    <div class="base-word">${japanese(word.word, word.reading)} ${audioHTML(word.reading)}</div>
    ${!recognition && s.meaning ? `<p class="muted">${escape(q.entry.meanings.join("; "))}</p>` : ""}
    ${!recognition && s.type ? `<p class="muted small">${escape(wordCategories[q.entry.category])}</p>` : ""}
    </div><div class="requested-form" data-prompt="${recognition ? "recognition" : session.prompt}">${requested}</div>`;
  enableKanji($("questionBody"));
  const choice = isChoice();
  $("answerInput").hidden = choice; $("answerChoice").hidden = true;
  $("answerOptions").hidden = !choice;
  $("answerLabel").htmlFor = choice ? "" : "answerInput";
  $("answerLabel").textContent = bilingual("答え", "Your answer");
  if (choice) {
    const all = field === "form" ? Object.keys(formCatalog) : field === "tense" ? ["non-past", "past", "neutral"]
      : field === "polarity" ? ["affirmative", "negative"] : ["plain", "polite", "neutral"];
    const correct = session.identifications().map((item) => field === "form" ? item.family : item.row[field]);
    if (session.choiceValues?.key !== session.current) session.choiceValues = { key: session.current, list: sampleChoices(all, correct) };
    const values = session.choiceValues.list;
    const previous = $("answerChoice").value;
    $("answerChoice").innerHTML = `<option value="">${localized("選んでください", "Choose an answer")}</option>` +
      values.map((value) => `<option value="${value}">${escape(field === "form" ? formName(value) : traitLabel(value))}</option>`).join("");
    $("answerChoice").value = previous;
    $("answerOptions").innerHTML = values.map((value, index) => `<button type="button" data-answer="${value}" aria-pressed="${value === previous}" ${!session.canAnswer() ? "disabled" : ""}>${escape(field === "form" ? formName(value) : traitLabel(value))}${index < 9 ? `<kbd class="practice-shortcut">${index + 1}</kbd>` : ""}</button>`).join("");
  }
  $("inputHelp").textContent = choice ? "Select an answer, then check."
    : s.input === "both" ? "Enter both: kanji spelling / kana reading. For example: 食べた / たべた."
      : s.input === "kanji" ? "Use the displayed dictionary spelling’s kanji where available. Your own IME converts kana to kanji."
        : "Type Japanese or romaji — romaji converts to kana automatically. Enter to check.";
  $("answerInput").placeholder = s.input === "both" ? "漢字 / かな" : "ここに入力…";
  $("answerInput").disabled = !session.canAnswer();
  $("answerChoice").disabled = !session.canAnswer();
  $("checkButton").disabled = !session.canAnswer();
  $("hintButton").disabled = !session.canAssist("hints");
  $("revealButton").disabled = !session.canAssist("reveals");
  $("hintButton").textContent = `Hint${s.hints === "limited" ? ` · ${Math.max(0, s.hintLimit - session.hints)} left` : ""}`;
  $("revealButton").textContent = `Reveal answer${s.reveals === "limited" ? ` · ${Math.max(0, s.revealLimit - session.reveals)} left` : ""}`;
  $("sessionMode").textContent = modes[s.mode];
  $("questionCount").textContent = `Question ${session.results.length + Number(!session.scored)}${Number.isFinite(session.limit) ? ` / ${session.limit}` : ""}`;
  $("sessionProgress").hidden = !Number.isFinite(session.limit);
  $("sessionProgress").max = Number.isFinite(session.limit) ? session.limit : 1;
  $("sessionProgress").value = session.results.length;
  $("followup").hidden = !session.scored;
  $("retryButton").hidden = !session.feedback || session.feedback === "correct" || Boolean(session.pendingEnd);
  $("nextButton").textContent = session.pendingEnd || session.results.length >= session.limit ? "See results →" : "Next question →";
  renderFeedback();
  tick();
}
function renderFeedback() {
  $("feedback").hidden = !session.feedback;
  const showSolution = ["correct", "revealed"].includes(session.feedback);
  $("ruleCard").hidden = !showSolution;
  if (!session.feedback) { $("feedback").replaceChildren(); $("ruleContent").replaceChildren(); $("ruleCard").open = false; return; }
  const q = session.current;
  const correct = session.settings.mode === "reverse" && session.task === "base" ? q.entry : q.row;
  const titles = { correct: "✓ Correct", near: "≈ Nearly correct — check the ending", incorrect: "✕ Not quite — let’s learn the pattern", revealed: "Answer revealed — keep practicing" };
  const example = exampleFor(q);
  $("feedback").dataset.grade = session.feedback;
  const answer = isChoice() ? session.answer && (formCatalog[session.answer]?.en || session.answer) : session.answer;
  if (!showSolution) {
    $("feedback").innerHTML = `<h3>${titles[session.feedback]}</h3><p><strong>Your answer:</strong> ${escape(answer)}</p>
      <p>${session.pendingEnd ? "The challenge has ended. View your results or use Reveal answer." : "Edit your answer and check again, move on, or use Reveal answer for the correct form, explanation and example."} Checking alone does not reveal the answer.</p>
      <p class="small muted">This first attempt is recorded for review. A retry helps you learn without changing that score.</p>`;
    $("ruleContent").replaceChildren();
    return;
  }
  $("feedback").innerHTML = `<h3>${titles[session.feedback]}</h3>
    <p class="small"><strong>Your answer:</strong> ${escape(answer || "Revealed without an answer")}</p>
    <div class="solution">${japanese(correct.word, correct.reading, { solution: true })} ${audioHTML(correct.reading)}</div>
    ${isChoice() ? `<p>${[...new Set(session.identifications().map((item) => `${formCatalog[item.family].en} · ${item.row.politeness} · ${item.row.polarity} · ${item.row.tense}`))].map(escape).join("<br>")}</p>` : ""}
    <p class="small"><strong>${escape(q.entry.word)} · ${escape(q.entry.reading)}</strong> — ${escape(q.entry.meanings.join("; "))}</p>
    <p>${escape(ruleFor(q))}</p>
    ${session.assisted || session.results.at(-1)?.grade !== session.feedback ? '<p class="small muted">Hints, reveals and retries are for learning. Only your first unassisted answer earns credit.</p>' : ""}
    ${session.settings.examples ? `<div class="feedback-example"><p lang="ja">${escape(example.before)}${japaneseHTML(q.row.word, q.row.reading)}${escape(example.after)} ${audioHTML(example.japanese)}</p><p>${escape(example.english)}</p></div>` : ""}`;
  $("ruleContent").innerHTML = `<h3>${escape(formCatalog[q.family].en)}</h3><p>${escape(formCatalog[q.family].use)}</p><p>${escape(ruleFor(q))}</p>`;
  enableKanji($("feedback"));
}
function renderProgress() {
  $("streak").textContent = dailyStreak(days);
  const records = Object.entries(progress);
  const attempts = records.reduce((sum, [, r]) => sum + r.attempts, 0), correct = records.reduce((sum, [, r]) => sum + r.correct, 0);
  $("lifetime").textContent = `${completed} completed sessions · ${attempts ? Math.round(correct / attempts * 100) : 0}% unassisted accuracy`;
  const all = createPool({ ...defaults, levels: [5, 4, 3, 2, 1], forms: Object.keys(formCatalog) });
  const lookup = new Map(all.map((q) => [q.key, q]));
  const weak = new Map();
  for (const [key, record] of records) {
    const question = lookup.get(key);
    if (!question || !record.wrong && !record.review) continue;
    weak.set(question.family, (weak.get(question.family) || 0) + record.wrong + Number(Boolean(record.review)));
  }
  $("weakForms").innerHTML = [...weak.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
    .map(([family, wrong]) => `<div class="weak-item"><span>${escape(formCatalog[family].en)}</span><span>${wrong} to review</span></div>`).join("")
    || '<p class="muted small">Your review list will take shape as you practice.</p>';
  $("missedWords").innerHTML = records.filter(([key, record]) => lookup.has(key) && (record.wrong || record.review))
    .sort((a, b) => b[1].last - a[1].last).map(([key, record]) => {
      const q = lookup.get(key);
      return `<li><span lang="ja">${escape(q.entry.word)}</span> · ${escape(q.row.label)} · ${escape(q.row.politeness)} <span class="muted">${record.wrong ? `${record.wrong} missed` : "Saved unfinished"}</span></li>`;
    }).join("") || "<li>No missed words yet.</li>";
}
function tick() {
  if (!session || session.ended) return;
  if (session.expire()) { finish(); return; }
  const timed = session.settings.mode === "timed";
  $("clock").hidden = !timed && !session.settings.timer;
  const seconds = timed ? Math.max(0, Math.ceil((session.deadline - Date.now()) / 1000)) : Math.floor(((session.finished ?? Date.now()) - session.started) / 1000);
  $("clock").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}${timed ? " left" : " elapsed"}`;
}
function focusAnswer() {
  (isChoice() ? $("answerOptions").querySelector("button") : $("answerInput")).focus({ preventScroll: true });
  $("practiceDisplay").scrollIntoView({ block: "start" });
}
function startError(message) {
  $("startError").textContent = message;
  if (message) $("startError").scrollIntoView({ block: "nearest" });
}
function start() {
  const invalid = [...document.querySelectorAll("[data-setting]")].find((input) => !input.disabled && !input.checkValidity());
  const missing = !settings.levels.length ? "Choose at least one JLPT level to start."
    : !settings.types.length ? "Choose at least one word type to start."
    : !settings.forms.length ? "Choose at least one conjugation form to start." : "";
  if (invalid || missing) {
    startError(missing || "Check your numeric settings before starting.");
    return;
  }
  try { session = new PracticeSession(settings, progress); }
  catch (error) { startError(error.message); return; }
  syncSettings();
  startError(""); notice(""); $("setup").hidden = true; $("results").hidden = true; $("practice").hidden = false;
  document.body.dataset.practicing = "true";
  $("resetButton").disabled = true;
  $("answerInput").value = ""; $("answerChoice").value = ""; $("hintText").hidden = true;
  persist(); renderQuestion(); clearInterval(clock); clock = setInterval(tick, 250);
  focusAnswer();
}
function finish() {
  clearInterval(clock);
  if (!session.ended) session.end("Session ended");
  if (!session.saved) {
    session.saved = true; persist();
  }
  const summary = session.summary();
  $("practice").hidden = true; $("results").hidden = false; $("resetButton").disabled = false;
  delete document.body.dataset.practicing;
  $("resultsTitle").textContent = session.reason;
  $("resultContent").innerHTML = `<div class="result-stats">${[
    [summary.correct, "Correct"], [summary.incorrect, "Incorrect / assisted"], [`${summary.accuracy}%`, "Accuracy"],
    [`${Math.floor(summary.seconds / 60)}:${String(summary.seconds % 60).padStart(2, "0")}`, "Time spent"]
  ].map(([value, label]) => `<div class="result-stat"><strong>${value}</strong>${label}</div>`).join("")}</div>
    <p>${summary.total} answers recorded. Accuracy counts first, unassisted answers; retries cannot inflate your score.</p>
    <h3>Forms practiced</h3><p>${summary.forms.map((family) => escape(formCatalog[family].en)).join(" · ") || "No answers yet."}</p>
    <h3>Words to revisit</h3><p class="review-words" lang="ja">${summary.review.map(escape).join(" · ") || "—"}</p>
    <p class="muted small">${summary.review.length ? "These patterns will appear more often in future practice." : "Every focused session builds recall."}</p>`;
  renderProgress(); $("resultsTitle").focus();
}
$("startButton").addEventListener("click", start);
$("restartButton").addEventListener("click", () => { session = null; $("setup").hidden = false; $("results").hidden = true; syncSettings(); $("startButton").focus(); });
$("endButton").addEventListener("click", async () => {
  const active = session;
  const choice = await confirmAction("End this practice session?", { review: !session.scored });
  if (!choice || session !== active || session.ended) return;
  if (choice === "save" && !session.scored) {
    const record = progress[session.current.key] || { attempts: 0, correct: 0, wrong: 0 };
    progress[session.current.key] = { ...record, review: true, last: Date.now() };
  }
  session.end("Session ended"); finish();
});
bind($("answerInput"), { IMEMode: true });
$("answerInput").addEventListener("compositionstart", () => { composing = true; });
$("answerInput").addEventListener("compositionend", () => { composing = false; });
$("answerInput").addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.isComposing || event.keyCode === 229)) event.preventDefault(); });
$("answerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  if (!session || composing || !session.canAnswer()) return;
  const input = isChoice() ? $("answerChoice") : $("answerInput");
  if (!normalizeAnswer(input.value)) {
    $("answerNotice").textContent = "Enter an answer before checking, or use Reveal answer.";
    (isChoice() ? $("answerOptions").querySelector("button") : input).focus();
    return;
  }
  $("answerNotice").textContent = ""; notice("");
  session.submit(input.value, { choice: isChoice() });
  persist();
  if (session.ended) { finish(); return; }
  renderQuestion(); renderProgress();
  if (["incorrect", "near"].includes(session.feedback)) {
    $("feedback").focus({ preventScroll: true });
    if (window.matchMedia("(max-width: 850px)").matches) $("feedback").scrollIntoView({ block: "start" });
  } else {
    $("nextButton").focus();
  }
});
$("nextButton").addEventListener("click", () => {
  session.next();
  if (session.ended) { finish(); return; }
  $("answerInput").value = ""; $("answerChoice").value = ""; $("hintText").hidden = true;
  $("answerNotice").textContent = "";
  renderQuestion(); focusAnswer();
});
$("answerOptions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-answer]");
  if (!button || button.disabled) return;
  $("answerChoice").value = button.dataset.answer;
  for (const option of $("answerOptions").children) option.setAttribute("aria-pressed", String(option === button));
});
document.addEventListener("keydown", (event) => {
  if (!session || session.ended || !matchMedia("(min-width: 761px) and (hover: hover)").matches
    || event.isComposing || event.ctrlKey || event.metaKey || event.altKey || document.querySelector("dialog[open]")
    || event.target.closest("input, textarea, select, [contenteditable=true]")) return;
  const key = event.key.toLowerCase();
  const button = /^[1-9]$/.test(key) && isChoice() ? $("answerOptions").children[Number(key) - 1]
    : $({ h: "hintButton", r: "revealButton", c: "checkButton", n: "nextButton" }[key]);
  if (button && !button.disabled && !button.closest("[hidden]")) { event.preventDefault(); button.click(); }
});
$("retryButton").addEventListener("click", () => {
  if (!session.retry()) return;
  $("answerInput").value = ""; $("answerChoice").value = ""; $("hintText").hidden = true;
  renderQuestion(); focusAnswer();
});
$("hintButton").addEventListener("click", () => {
  if (!session.hint()) { if (session.ended) finish(); return; }
  const q = session.current;
  const word = session.settings.mode === "reverse" && session.task === "base" ? q.entry : q.row;
  const hints = isChoice()
    ? [wordCategories[q.entry.category], "Compare the endings and remember that some surface forms have multiple analyses.", ruleFor(q)]
    : [wordCategories[q.entry.category], `First kana: ${word.reading[0]}`,
      `${[...word.reading].length} kana characters (small kana count separately).`, ruleFor(q),
      word.reading.length > 2 ? `${word.reading[0]}${"＿".repeat(word.reading.length - 2)}${word.reading.at(-1)}`
        : `${word.reading.length === 2 ? word.reading[0] : ""}＿`];
  $("hintText").textContent = hints[Math.min(session.hintStep - 1, hints.length - 1)] + " · This question will count as assisted.";
  $("hintText").hidden = false; renderQuestion();
});
$("revealButton").addEventListener("click", () => {
  session.submit("", { reveal: true });
  persist();
  if (session.ended) { finish(); return; }
  renderQuestion(); renderProgress(); $("nextButton").focus();
});
$("resetButton").addEventListener("click", async () => {
  if (!await confirmAction("Reset all conjugation practice scores, weak forms and daily streaks? Settings and other tools will not change.", { confirmLabel: "Reset progress" })) return;
  progress = {}; days = []; completed = 0; session = null;
  $("results").hidden = true; $("setup").hidden = false;
  persist(); renderProgress(); syncSettings(); notice("Conjugation practice progress reset.");
});
document.addEventListener("visibilitychange", tick);
window.addEventListener("pagehide", () => clearInterval(clock));
window.addEventListener("pageshow", () => {
  if (session && !session.ended) { tick(); clearInterval(clock); if (!session.ended) clock = setInterval(tick, 250); }
});
let kanjiRequest = 0;
document.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-kanji]");
  if (!button) return;
  const character = button.dataset.kanji, token = ++kanjiRequest;
  $("kanjiTitle").textContent = character;
  $("kanjiContent").textContent = "Loading kanji information…";
  $("kanjiDialog").showModal();
  try {
    const url = `${API_BASE}/api/kanji/${encodeURIComponent(character)}`;
    const responses = await Promise.all([url, `${url}/words?limit=5`].map((target) => fetch(target, { signal: AbortSignal.timeout(10000) })));
    if (responses.some((response) => !response.ok)) throw new Error("Kanji information is unavailable. Check your dictionary connection and try again.");
    const [data, words] = await Promise.all(responses.map((response) => response.json()));
    if (!Array.isArray(data.meanings) || !Array.isArray(data.on_readings) || !Array.isArray(data.kun_readings)) throw new Error("The dictionary returned unreadable kanji information.");
    if (!Array.isArray(words.items)) throw new Error("The dictionary returned unreadable example words.");
    if (token !== kanjiRequest) return;
    const examples = words.items.flatMap((entry) => {
      const spelling = entry.japanese?.find((form) => form.word?.includes(character) && form.reading);
      return spelling ? [{ word: spelling.word, reading: spelling.reading, meanings: entry.senses?.flatMap((sense) => sense.english_definitions || []) || [] }] : [];
    }).slice(0, 5);
    $("kanjiContent").innerHTML = `<p>${data.meanings.map(escape).join("; ")}</p>
      <p><strong>On’yomi:</strong> ${data.on_readings.map(escape).join(" · ") || "None listed"}</p>
      <p><strong>Kun’yomi:</strong> ${data.kun_readings.map(escape).join(" · ") || "None listed"}</p>
      <h3>Example words</h3>${examples.map((entry) => `<p>${japaneseHTML(entry.word, entry.reading)} — ${escape(entry.meanings.slice(0, 3).join("; "))}</p>`).join("") || "<p>No example words listed.</p>"}`;
  } catch (error) {
    console.warn("Kanji lookup failed.", error);
    if (token === kanjiRequest) $("kanjiContent").textContent = error.message;
  }
});
syncSettings(); renderProgress();
