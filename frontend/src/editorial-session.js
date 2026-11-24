import { editorialIdentity, editorialTools } from "../editorial-tools.js";
import { pageFile } from "./routes.js";
import { mountStudyControls } from "./study-controls.js";
import { cancelLocalSpeech } from "./local-speech.js";
import { rememberControls } from "./settings-storage.js";
import { mountChips } from "./chips.js";
import { createSessionView } from "./session-view.js";
import "./editorial-session.css";
import "./tool-intro.css";

const slug = pageFile(location.pathname).replace(/\.html$/, "");
const [name, group, purpose, description,, key] = editorialTools[slug];
const [japanese, preferenceNamespace] = editorialIdentity[slug];
const [label, firstLine, secondLine] = {
  crossroads: ["Kanji puzzle", "Three words.", "One missing kanji."],
  train: ["Railway directions", "Read the signs.", "Catch the last train."],
  karuta: ["Listening karuta", "Hear the clue.", "Find its picture."],
  particle: ["Particle practice", "Change a particle.", "Change the meaning."],
  counter: ["Japanese counters", "Count the pencils.", "Now count the paper."],
  draw: ["Handwriting practice", "Follow the strokes.", "Try it from memory."],
  guide: ["Sounds and sensations", "A drizzle. A downpour.", "A word for each."]
}[key];
const lead = {
  crossroads: "Three words share a missing character. Read them together and see which kanji makes all three fit.",
  train: "You’re on the platform. Read the directions in Japanese and work out where to get off or change trains.",
  karuta: "Six pictures are on the table. Listen to the Japanese clue and pick the one it describes.",
  particle: "Read the situation, fill the gap, and see how a different particle changes what the sentence says.",
  counter: "Three pencils and three sheets of paper are counted differently in Japanese. Try the counter, then say the number aloud.",
  draw: "Follow the model, try the kanji from memory, then lay your strokes over the original to compare.",
  guide: "Start with a scene and compare the Japanese words for what you hear or feel, from a quiet drizzle to a downpour."
}[key];
const $ = id => document.getElementById(id);
const root = $("editorialRoot");
root.classList.add("shell");
root.innerHTML = `<header><a class="brand" href="./" target="_top"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">${name}<span class="brand-note">NihongoToolkit</span></span></a><button id="themeButton" type="button" aria-label="Toggle theme"></button></header>
  <main><section class="intro tool-intro"><span class="eyebrow"><span lang="ja">${japanese}</span> · <span>${label}</span></span><h1>${firstLine}<br><span>${secondLine}</span></h1><p>${lead}</p></section>
  <p class="editorial-notice" data-i18n-scope><small class="tool-preview-badge">Preview</small> Japanese content and English glosses await review.</p>
  <section id="workspace" aria-busy="true" data-i18n-scope><p role="status">Loading preview…</p></section></main>`;
root.querySelector(".brand-mark").append(document.querySelector(`.navigation [data-file="${slug}.html"] .helper-icon img`).cloneNode());
const workspace = $("workspace");
const cancelSpeech = () => { window.speechSynthesis?.cancel(); cancelLocalSpeech(); };
const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });

function mountActivity(definition) {
  workspace.innerHTML = `<details id="settingsPanel" class="settings" open><summary>Session settings</summary>
    <div class="settings-body"><div id="toolFilters"></div>
    <label><span>Session length</span><select id="editorialLength"><option value="short">Short · up to 5</option><option value="extended">Extended · up to 20</option></select></label>
    <p id="poolCount" role="status"></p><p id="prefError" role="alert"></p></div></details>
    <button type="button" class="primary" id="startButton">Start session</button>
    <section id="play" hidden><div class="session-heading"><h2 id="roundLabel" tabindex="-1"></h2><button id="stopSessionButton">Stop session</button></div>
    <div id="roundBody"></div><section id="roundFeedback" hidden></section><button class="primary" id="nextButton" hidden>Next</button></section>
    <section id="sessionResults" hidden><h2 tabindex="-1">Session results</h2><p id="resultSummary"></p><div id="reviewList"></div><button id="retryMissed">Retry missed</button></section>`;
  const filters = $("toolFilters"), start = $("startButton"), results = $("sessionResults");
  definition.setup?.(filters);
  const settings = $("settingsPanel");
  const ids = [...settings.querySelectorAll("select, input[type=checkbox]")].map((control, index) => {
    if (!control.id) control.id = `previewPreference${index}`;
    return control.id;
  });
  rememberControls(`nihon:editorial:${preferenceNamespace}:v1`, ids, error => { $("prefError").textContent = error; });
  for (const select of settings.querySelectorAll("#particle-task, #counter-mode, #draw-mode, #editorialLength")) {
    mountChips(select, { presentation: "button", title: select.id === "editorialLength" ? "Session length" : "Session mode" });
  }
  if (definition.credits) {
    const credits = document.createElement("details");
    credits.className = "editorial-credits";
    credits.append(text("summary", "Sources and licenses"));
    definition.credits(credits);
    workspace.after(credits);
  }
  const view = createSessionView({ settings, play: [$("play")], results, start, footer: true });
  const pool = () => definition.pool ? definition.pool(filters) : definition.items;
  function refresh() {
    const count = pool().length;
    $("poolCount").textContent = count ? `${count} eligible · ${Math.min(count, limit())} in this session` : "No eligible items. Change the selection to start.";
    start.disabled = !count;
  }
  function limit() { return $("editorialLength").value === "extended" ? 20 : 5; }
  settings.addEventListener("input", refresh);
  settings.addEventListener("change", refresh);
  let deck = [], log = [], position = 0, token = 0, cleanup;
  const assessment = r => r.correct === null ? "Self-review" : r.correct ? "Correct" : "Review this answer";
  function leaveRound() {
    ++token;
    cleanup?.();
    cleanup = undefined;
    cancelSpeech();
  }
  function begin(items, size) {
    if (!items.length) { refresh(); return; }
    deck = [...items];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    deck = deck.slice(0, size);
    log = []; position = 0;
    view.start();
    nextRound();
  }
  function showAnswer(container, item, r) {
    const details = document.createElement("dl");
    for (const [label, value] of [["Prompt", r.prompt], ["Your response", r.response], ["Accepted answer", r.answer], ["Explanation", r.explanation]]) {
      const field = text("dd", value);
      field.dataset.i18nStudy = "";
      details.append(text("dt", label), field);
    }
    container.append(details);
    definition.review?.(container, item, r);
  }
  function nextRound() {
    leaveRound();
    const turn = token, item = deck[position], body = $("roundBody"), feedback = $("roundFeedback");
    body.replaceChildren(); body.hidden = false;
    feedback.replaceChildren(); feedback.hidden = true;
    $("nextButton").hidden = true;
    $("roundLabel").textContent = `Round ${position + 1} of ${deck.length}`;
    $("roundLabel").focus();
    cleanup = definition.render(body, item, result => {
      if (turn !== token || log.length > position) return;
      log.push({ item, result });
      leaveRound();
      body.hidden = true; feedback.hidden = false;
      const heading = text("h3", assessment(result));
      heading.tabIndex = -1;
      feedback.append(heading);
      showAnswer(feedback, item, result);
      heading.focus();
      $("nextButton").textContent = position + 1 === deck.length ? "See results" : "Next round";
      $("nextButton").hidden = false;
    });
  }
  function finish() {
    leaveRound();
    const correct = log.filter(({ result }) => result.correct === true).length;
    const notes = [`${log.length} of ${deck.length} answered`, `${correct} correct`];
    if (log.some(({ result }) => Number.isFinite(result.points))) notes.push(`${log.reduce((sum, { result }) => sum + (result.points || 0), 0)} points`);
    const modes = new Map();
    for (const { result } of log) if (result.mode) {
      const group = modes.get(result.mode) || [0, 0];
      if (typeof result.correct === "boolean") { group[0] += Number(result.correct); group[1]++; }
      modes.set(result.mode, group);
    }
    for (const [mode, [right, total]] of modes) notes.push(total ? `${mode}: ${right}/${total}` : `${mode}: not scored`);
    const legs = log.flatMap(({ result }) => result.legs || []);
    if (legs.length) notes.push(`${legs.filter(leg => leg.correct).length}/${legs.length} legs correct`);
    $("resultSummary").textContent = `${notes.join(" · ")}. Unanswered items do not count as misses.`;
    $("reviewList").replaceChildren();
    for (const [i, { item, result }] of log.entries()) {
      const row = document.createElement("details");
      row.append(text("summary", `${i + 1}. ${result.prompt} — ${assessment(result)}`));
      showAnswer(row, item, result);
      $("reviewList").append(row);
    }
    $("retryMissed").hidden = !log.some(({ result }) => result.correct === false);
    view.finish(); results.querySelector("h2").focus();
  }
  start.onclick = () => begin(pool(), limit());
  $("stopSessionButton").onclick = () => {
    const partial = cleanup?.partial?.();
    if (partial && log.length === position) log.push({ item: deck[position], result: partial });
    finish();
  };
  $("nextButton").onclick = () => ++position >= deck.length ? finish() : nextRound();
  $("retryMissed").onclick = () => begin(log.filter(({ result }) => result.correct === false).map(({ item }) => item), Infinity);
  window.addEventListener("pagehide", cancelSpeech);
  refresh();
}

async function load() {
  try {
    if (key === "guide") {
      const { mountGuide } = await import("./preview-guide/index.js");
      workspace.replaceChildren(); await mountGuide(workspace);
    } else {
      const definitions = group === "Games" ? await import("./preview-games/index.js") : await import("./preview-practice/index.js");
      const definition = definitions[key];
      await definition.prepare?.();
      mountActivity(definition);
    }
  } catch (error) {
    console.error("Could not initialize editorial preview.", error);
    const message = text("p", "This preview could not load. Reload to try again.");
    message.setAttribute("role", "alert");
    const retry = text("button", "Reload preview");
    retry.onclick = () => location.reload();
    workspace.replaceChildren(message, retry);
  } finally {
    workspace.setAttribute("aria-busy", "false");
  }
}
mountStudyControls({ audio: key !== "draw", romaji: key !== "draw", furigana: key !== "draw", help: [name, `${purpose}. ${description}`] });
void load();
