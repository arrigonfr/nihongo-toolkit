import { editorialIdentity, editorialTools } from "../editorial-tools.js";
import { mountChips } from "./chips.js";
import { setHTML } from "./html.js";
import { cancelLocalSpeech } from "./local-speech.js";
import { pageFile } from "./routes.js";
import { createSessionView } from "./session-view.js";
import { rememberControls } from "./settings-storage.js";
import { mountStudyControls } from "./study-controls.js";
import "./editorial-session.css";
import "./tool-intro.css";

const slug = pageFile(location.pathname).replace(/\.html$/, "");
const [name, group, purpose, description, , key] = editorialTools[slug];
const [japanese, preferenceNamespace] = editorialIdentity[slug];
const [label, firstLine, secondLine] = {
  crossroads: ["Kanji puzzle", "Three words.", "One missing kanji."],
  train: ["Railway directions", "Read the signs.", "Catch the last train."],
  karuta: ["Listening karuta", "Hear the clue.", "Find its picture."],
  particle: ["Particle practice", "Change a particle.", "Change the meaning."],
  counter: ["Japanese counters", "Count the pencils.", "Now count the paper."],
  draw: ["Handwriting practice", "Follow the strokes.", "Try it from memory."],
  guide: ["Sounds and sensations", "A drizzle. A downpour.", "A word for each."],
}[key];
const lead = {
  crossroads: "Three words share a missing character. Read them together and see which kanji makes all three fit.",
  train: "You’re on the platform. Read the directions in Japanese and work out where to get off or change trains.",
  karuta: "Six pictures are on the table. Listen to the Japanese clue and pick the one it describes.",
  particle: "Read the situation, fill the gap, and see how a different particle changes what the sentence says.",
  counter:
    "Three pencils and three sheets of paper are counted differently in Japanese. Try the counter, then say the number aloud.",
  draw: "Follow the model, try the kanji from memory, then lay your strokes over the original to compare.",
  guide:
    "Start with a scene and compare the Japanese words for what you hear or feel, from a quiet drizzle to a downpour.",
}[key];
const $ = (id) => document.getElementById(id);
const root = $("editorialRoot");
root.classList.add("shell");
setHTML(
  root,
  `<header><a class="brand" href="./" target="_top"><span class="brand-mark" aria-hidden="true"></span><span class="brand-name">${name}<span class="brand-note">NihongoToolkit</span></span></a><button id="themeButton" type="button" aria-label="Toggle theme"></button></header>
  <main><section class="intro tool-intro"><span class="eyebrow"><span lang="ja">${japanese}</span> · <span>${label}</span></span><h1>${firstLine}<br><span>${secondLine}</span></h1><p>${lead}</p></section>
  <p class="editorial-notice" data-i18n-scope><small class="tool-preview-badge">Preview</small> ${key === "draw" ? "KanjiVG stroke models · stroke feedback tolerances await calibration." : "Japanese content and English glosses await review."}</p>
  <section id="workspace" aria-busy="true" data-i18n-scope><p role="status">Loading preview…</p></section></main>`,
);
root
  .querySelector(".brand-mark")
  .append(document.querySelector(`.navigation [data-file="${slug}.html"] .helper-icon img`).cloneNode());
const workspace = $("workspace");
workspace.dataset.tool = key;
const cancelSpeech = () => {
  window.speechSynthesis?.cancel();
  cancelLocalSpeech();
};
const text = (tag, value) => Object.assign(document.createElement(tag), { textContent: value });

function mountActivity(definition) {
  const numericLength = ["particle", "counter", "draw", "crossroads", "train", "karuta"].includes(key);
  setHTML(
    workspace,
    `<details id="settingsPanel" class="settings" open><summary>Session settings</summary>
    <div class="settings-body"><div id="toolFilters"></div>
    <label><span>Session length</span><select id="editorialLength">${numericLength ? '<option value="short">5</option><option value="10">10</option><option value="extended">20</option><option value="50">50</option><option value="100">100</option>' : '<option value="short">Short · up to 5</option><option value="extended">Extended · up to 20</option>'}</select></label>
    <p id="${numericLength ? "poolError" : "poolCount"}" role="status"></p><p id="prefError" role="alert"></p></div></details>
    <button type="button" class="primary" id="startButton">Start session</button>
    <section id="play" hidden><div class="session-heading"><h2 id="roundLabel" tabindex="-1"></h2><button id="stopSessionButton">Stop session</button></div>
    <div id="roundBody"></div><section id="roundFeedback" hidden></section><button class="primary" id="nextButton" hidden>Next</button></section>
    <section id="sessionResults" hidden><h2 tabindex="-1">Session results</h2><p id="resultSummary"></p><div id="reviewList"></div><button id="retryMissed">Retry missed</button></section>`,
  );
  const filters = $("toolFilters"),
    start = $("startButton"),
    results = $("sessionResults");
  definition.setup?.(filters);
  const settings = $("settingsPanel");
  const ids = [...settings.querySelectorAll("select, input[type=checkbox]")].map((control, index) => {
    if (!control.id) control.id = `previewPreference${index}`;
    return control.id;
  });
  rememberControls(`nihon:editorial:${preferenceNamespace}:v1`, ids, (error) => {
    $("prefError").textContent = error;
  });
  for (const select of settings.querySelectorAll(
    "#counter-mode, #draw-mode, #train-network, #train-rule, #train-legs, #train-view, #karuta-category, #karuta-labels, #editorialLength",
  )) {
    if (
      (numericLength && select.id === "editorialLength") ||
      select.id === "counter-mode" ||
      select.id === "draw-mode"
    ) {
      select.dataset.noSettingHelp = "";
    }
    const title =
      {
        editorialLength: "Session length",
        "train-network": "Railway network",
        "train-rule": "Instruction focus",
        "train-legs": "Journey length",
        "train-view": "Route display",
        "karuta-category": "Topic",
        "karuta-labels": "Card display",
      }[select.id] || "Session mode";
    const descriptions = {
      "draw-mode": {
        trace: "Follow the highlighted next stroke directly on the drawing pad.",
        copy: "Draw on a blank pad with the reference model beside it.",
        memory: "Study the character first, then draw it from memory with the model hidden.",
        study: "Inspect the stroke order and step through strokes without drawing.",
      },
      "train-network": {
        all: "Mix journeys from every railway network.",
        lake: "Single linear line with straightforward forward and reverse counting.",
        mountain: "Branching railway with local and rapid services sharing stops.",
        coast: "Interchange network with line transfers between harbour and city lines.",
        river: "Double-interchange metro network with two transfer stations.",
        valley: "Scenic transfer network connecting valley and foothill lines.",
        capital: "Busy city interchange with crossing urban lines.",
        oldtown: "Historic tramway network with town-center transfers.",
        peninsula: "Coastal express network with transfer connections along the peninsula.",
      },
      "train-rule": {
        all: "Include every kind of station and transfer instruction.",
        counting: "Practice counting stops ahead, such as next stop, next-next, or N stops ahead.",
        relative: "Practice getting off one stop before or after a named landmark station.",
        transfer: "Practice changing lines at an interchange station without leaving the station.",
        terminal: "Practice riding all the way to the final terminal stop on the line.",
      },
      "karuta-category": {
        all: "Mix clues across every picture topic.",
        everyday: "Everyday items such as umbrella, clock, cup, key, pencil, and mirror.",
        animals: "Pets, birds, insects, and wildlife.",
        nature: "Nature, plants, outdoor scenes, and classic items.",
        places: "Everyday places, town landmarks, and outdoor activities.",
        vehicles: "Land, sea, and air vehicles.",
        food: "Fruits, meals, desserts, and drinks.",
        kitchen: "Utensils, cookware, and dining staples.",
        home: "Rooms, furniture, and household fixtures.",
        tech: "Electronics and household devices.",
        weather: "Sky, weather phenomena, and seasonal scenes.",
        clothing: "Clothes, footwear, bags, and everyday accessories.",
        music: "Musical instruments, art, awards, and play.",
        sports: "Sports, hiking gear, and travel essentials.",
      },
      "karuta-labels": {
        show: "Show each picture together with its caption.",
        hide: "Hide visible captions for a pure picture-and-listening challenge.",
        captions: "Show text captions only, without pictures.",
      },
    }[select.id];
    mountChips(select, { presentation: "button", title, descriptions });
  }
  const lengthField = $("editorialLength").closest(".chips-field");
  if (key === "counter" && lengthField) {
    const modeField = $("counter-mode")?.closest(".chips-field");
    if (modeField) {
      const row = document.createElement("div");
      row.className = "settings-row";
      modeField.before(row);
      row.append(modeField, lengthField);
    }
  } else if (key === "draw" && lengthField) {
    const collectionField = $("draw-collection")?.closest("label");
    if (collectionField) {
      const row = document.createElement("div");
      row.className = "settings-row";
      collectionField.before(row);
      row.append(collectionField, lengthField);
    }
  }
  if (definition.credits) {
    const credits = document.createElement("details");
    credits.className = "editorial-credits";
    credits.append(text("summary", "Sources and licenses"));
    definition.credits(credits);
    workspace.after(credits);
  }
  const view = createSessionView({ settings, play: [$("play")], results, start, footer: true });
  const pool = () => (definition.pool ? definition.pool(filters) : definition.items);
  function refresh() {
    definition.onSettingsChange?.(filters);
    const count = pool().length;
    if (["particle", "counter"].includes(key)) {
      $("poolError").textContent =
        count < limit()
          ? "Not enough questions for this session length. Choose a shorter session or try again later."
          : "";
      start.disabled = count < limit();
    } else if (key === "draw") {
      $("poolError").textContent = count
        ? ""
        : "No eligible characters. Enter at least one supported kanji or choose another collection.";
      start.disabled = !count;
    } else if (key === "crossroads" || key === "train" || key === "karuta") {
      $("poolError").textContent = count
        ? ""
        : key === "train"
          ? "No eligible journeys. Change the selection to start."
          : "No eligible items. Change the selection to start.";
      start.disabled = !count;
    } else {
      $("poolCount").textContent = count
        ? `${count} eligible · ${Math.min(count, limit())} in this session`
        : "No eligible items. Change the selection to start.";
      start.disabled = !count;
    }
  }
  function limit() {
    const value = $("editorialLength").value;
    return value === "extended" ? 20 : value === "short" ? 5 : Number(value);
  }
  settings.addEventListener("input", refresh);
  settings.addEventListener("change", refresh);
  let deck = [],
    log = [],
    position = 0,
    token = 0,
    cleanup;
  const assessment = (r) =>
    r.assessment || (r.correct === null ? "Self-review" : r.correct ? "Correct" : "Review this answer");
  function leaveRound() {
    ++token;
    cleanup?.();
    cleanup = undefined;
    cancelSpeech();
  }
  function begin(items, size) {
    if (!items.length) {
      refresh();
      return;
    }
    deck = [...items];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    deck = deck.slice(0, size);
    log = [];
    position = 0;
    view.start();
    nextRound();
  }
  function answerFields(r) {
    const details = document.createElement("dl");
    details.className = "game-answer";
    for (const [name, label] of [
      ["prompt", "Prompt"],
      ["response", "Your response"],
      ["answer", "Accepted answer"],
      ["explanation", "Explanation"],
    ]) {
      const field = text("dd", r[name]);
      field.dataset.i18nStudy = "";
      const group = document.createElement("div");
      group.append(text("dt", label), field);
      group.dataset.field = name;
      details.append(group);
    }
    return details;
  }
  function showAnswer(container, item, r) {
    if (r.legs) {
      for (const [index, leg] of r.legs.entries()) {
        const section = document.createElement("section");
        section.className = "journey-leg";
        section.append(text("h4", `Leg ${index + 1} · ${assessment(leg)}`), answerFields(leg));
        container.append(section);
      }
    } else container.append(answerFields(r));
    definition.review?.(container, item, r);
  }
  function nextRound() {
    leaveRound();
    const turn = token,
      item = deck[position],
      body = $("roundBody"),
      feedback = $("roundFeedback");
    body.replaceChildren();
    body.hidden = false;
    feedback.replaceChildren();
    feedback.hidden = true;
    $("nextButton").hidden = true;
    $("roundLabel").textContent = `Round ${position + 1} of ${deck.length}`;
    $("roundLabel").focus();
    cleanup = definition.render(body, item, (result) => {
      if (turn !== token || log.length > position) return;
      log.push({ item, result });
      leaveRound();
      body.hidden = true;
      feedback.hidden = false;
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
    if (log.some(({ result }) => Number.isFinite(result.points)))
      notes.push(`${log.reduce((sum, { result }) => sum + (result.points || 0), 0)} points`);
    const modes = new Map();
    for (const { result } of log)
      if (result.mode) {
        const group = modes.get(result.mode) || [0, 0];
        if (typeof result.correct === "boolean") {
          group[0] += Number(result.correct);
          group[1]++;
        }
        modes.set(result.mode, group);
      }
    for (const [mode, [right, total]] of modes)
      notes.push(total ? `${mode}: ${right}/${total}` : `${mode}: not scored`);
    const legs = log.flatMap(({ result }) => result.legs || []);
    if (legs.length) notes.push(`${legs.filter((leg) => leg.correct).length}/${legs.length} legs correct`);
    $("resultSummary").textContent = `${notes.join(" · ")}. Unanswered items do not count as misses.`;
    $("reviewList").replaceChildren();
    for (const [i, { item, result }] of log.entries()) {
      const row = document.createElement("details");
      row.append(text("summary", `${i + 1}. ${result.prompt} — ${assessment(result)}`));
      showAnswer(row, item, result);
      $("reviewList").append(row);
    }
    $("retryMissed").hidden = !log.some(({ result }) => result.correct === false);
    view.finish();
    results.querySelector("h2").focus();
  }
  start.onclick = () => begin(pool(), limit());
  $("stopSessionButton").onclick = () => {
    const partial = cleanup?.partial?.();
    if (partial && log.length === position) log.push({ item: deck[position], result: partial });
    finish();
  };
  $("nextButton").onclick = () => (++position >= deck.length ? finish() : nextRound());
  $("retryMissed").onclick = () =>
    begin(
      log.filter(({ result }) => result.correct === false).map(({ item }) => item),
      Infinity,
    );
  window.addEventListener("pagehide", cancelSpeech);
  refresh();
}

async function load() {
  try {
    if (key === "guide") {
      const { mountGuide } = await import("./preview-guide/index.js");
      workspace.replaceChildren();
      await mountGuide(workspace);
    } else {
      const definitions =
        group === "Games" ? await import("./preview-games/index.js") : await import("./preview-practice/index.js");
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
mountStudyControls({ audio: true, romaji: true, furigana: key !== "draw", help: [name, `${purpose}. ${description}`] });
void load();
