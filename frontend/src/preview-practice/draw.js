import { audioIcon } from "../audio-icon.js";
import { romanizeKana } from "../romanize.js";
import {
  compareDrawingDetail,
  compareStroke,
  isAccidentalTap,
  loadModel,
  models,
  parseList,
  prepareModels,
} from "./stroke-model.js";
import { button, el, select, setting } from "./ui.js";

const LIST_STORAGE_KEY = "nihon:editorial:kanji-draw:list:v1";
const LIVE_STORAGE_KEY = "nihon:editorial:kanji-draw:live:v1";
const modes = [
  ["trace", "Trace the next stroke"],
  ["copy", "Copy beside a model"],
  ["memory", "Draw from memory"],
  ["study", "Study stroke order without drawing"],
];
const choices = [
  ...["5", "4", "3", "2", "1"].map((n) => [n, `JLPT N${n} estimate`]),
  ["0", "No JLPT estimate"],
  ...[1, 2, 3, 4, 5, 6].map((n) => [`grade${n}`, `School grade ${n}`]),
  ["all", "All supported kanji"],
  ["custom", "One character or a custom list"],
];
function readLivePrefs() {
  const defaults = { grid: true, numbers: true, liveCheck: true };
  try {
    const saved = JSON.parse(localStorage.getItem(LIVE_STORAGE_KEY) || "{}");
    return {
      grid: typeof saved.grid === "boolean" ? saved.grid : defaults.grid,
      numbers: typeof saved.numbers === "boolean" ? saved.numbers : defaults.numbers,
      liveCheck: typeof saved.liveCheck === "boolean" ? saved.liveCheck : defaults.liveCheck,
    };
  } catch {
    return defaults;
  }
}
function saveLivePrefs(prefs) {
  try {
    localStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(prefs));
  } catch {}
}
function checkbox(c, id, text, checked = true) {
  const label = el(c, "label", null, { class: "check-label" });
  const field = el(label, "input", null, { id, name: id, "data-setting": id, type: "checkbox" });
  field.checked = checked;
  label.append(text);
  return field;
}
function svg(parent, tag, attrs = {}) {
  const node = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  parent.append(node);
  return node;
}
function board(c, label, grid) {
  const s = svg(c, "svg", { viewBox: "0 0 109 109", role: "img", "aria-label": label, class: "draw-square" });
  const guides = svg(s, "path", { d: "M54.5 0v109 M0 54.5h109", class: "draw-guides" });
  guides.toggleAttribute("hidden", !grid);
  return s;
}
function arrowTransform(points) {
  if (!points?.length) return "";
  const start = points[0];
  const ahead =
    points.find((p, i) => i > 0 && Math.hypot(p[0] - start[0], p[1] - start[1]) >= 4.5) ||
    points[Math.min(1, points.length - 1)];
  const dx = ahead[0] - start[0],
    dy = ahead[1] - start[1];
  if (Math.hypot(dx, dy) < 0.5) return "";
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const tx = start[0] + (dx / Math.hypot(dx, dy)) * 4.2;
  const ty = start[1] + (dy / Math.hypot(dx, dy)) * 4.2;
  return `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) rotate(${angle.toFixed(1)})`;
}
function addDirectionMarker(layer, points, dotRadius = 2) {
  if (!points?.length) return;
  const [x, y] = points[0];
  svg(layer, "circle", { cx: x, cy: y, r: String(dotRadius), class: "draw-origin" });
  const transform = arrowTransform(points);
  if (transform) svg(layer, "polygon", { points: "2.4,0 -1.6,-1.6 -0.7,0 -1.6,1.6", transform, class: "draw-arrow" });
}
function renderReadings(container, label, list) {
  if (!list?.length) return;
  const group = el(container, "span", null, { class: "draw-reading-group" });
  el(group, "span", `${label}: `, { class: "draw-reading-label" });
  for (const value of list.slice(0, 4)) {
    const spoken = value.replace(/[.-]/g, "");
    const chip = el(group, "span", null, { class: "study-reading" });
    el(chip, "span", value, { lang: "ja" });
    el(chip, "span", ` (${romanizeKana(spoken)})`, { class: "study-romaji" });
    el(chip, "button", audioIcon, {
      type: "button",
      class: "study-audio",
      "data-study-speak": spoken,
      "aria-label": `Pronounce ${spoken}`,
    });
  }
}
function mount(c, item, finish, [paths, numbers, meta], signal) {
  const mode = item.practice || "trace";
  const prefs = readLivePrefs();
  let studying = mode === "memory",
    self = mode === "study",
    assisted = mode !== "memory";
  let overlay = false,
    inspected = false,
    complete = false,
    replayIndex = 0,
    playing = false,
    timer,
    animation;
  let modelCollapsed = false;
  let active = null,
    current = [],
    livePath,
    mismatch = "",
    mismatchIndex = -1;
  const lines = [];
  const head = el(c, "div", null, { class: "draw-head" });
  const title = el(head, "h2", `Study ${item.character}`);
  if (meta && (meta.meanings?.length || meta.on_readings?.length || meta.kun_readings?.length)) {
    const metaBox = el(head, "div", null, { class: "draw-meta" });
    if (meta.meanings?.length) el(metaBox, "p", meta.meanings.slice(0, 4).join(" · "), { class: "draw-meanings" });
    if (meta.on_readings?.length || meta.kun_readings?.length) {
      const readingsBox = el(metaBox, "p", null, { class: "draw-readings" });
      renderReadings(readingsBox, "On", meta.on_readings);
      renderReadings(readingsBox, "Kun", meta.kun_readings);
    }
  }
  const hint = el(head, "p", null, { class: "draw-hint" });
  const liveBar = el(c, "div", null, {
    class: "draw-live-options",
    role: "group",
    "aria-label": "Display and feedback options",
  });
  const gridToggle = checkbox(liveBar, "draw-grid", "Show grid", prefs.grid);
  const numbersToggle = checkbox(liveBar, "draw-numbers", "Show stroke numbers", prefs.numbers);
  const liveToggle =
    mode === "trace" ? checkbox(liveBar, "draw-live-check", "Check each stroke as I draw", prefs.liveCheck) : null;
  const boards = el(c, "div", null, { class: "draw-boards" });
  const refBox = el(boards, "div", null, { class: "draw-pane draw-pane-model" });
  const refHeader = el(refBox, "div", null, { class: "draw-pane-header" });
  el(refHeader, "strong", "Stroke model");
  const modelCounter = el(refHeader, "span", `Stroke 1 / ${paths.length}`, { class: "draw-counter" });
  const ref = board(refBox, "Ordered stroke model", prefs.grid);
  const referencePaths = paths.map((d) => svg(ref, "path", { d, class: "draw-stroke" }));
  const expected = referencePaths.map((path) => {
    const length = path.getTotalLength();
    const count = Math.max(2, Math.ceil(length / 1.5) + 1);
    return Array.from({ length: count }, (_, i) => {
      // getPointAtLength uses the same 109-unit coordinate frame as the pad.
      const p = path.getPointAtLength((length * i) / (count - 1));
      return [p.x, p.y];
    });
  });
  const refNumbers = svg(ref, "g");
  const numbersOn = (layer, index) => {
    if (!prefs.numbers) return;
    numbers.forEach(([x, y, n], i) => {
      if (index == null || i === index) svg(layer, "text", { x, y, class: "draw-number" }).textContent = n;
    });
  };
  const renderRefNumbers = () => {
    refNumbers.replaceChildren();
    numbersOn(refNumbers);
  };
  renderRefNumbers();
  const refMarker = svg(ref, "g");
  const refControls = el(refBox, "div", null, { class: "draw-pane-controls" });

  const padBox = el(boards, "div", null, { class: "draw-pane draw-pane-pad" });
  const padHeader = el(padBox, "div", null, { class: "draw-pane-header" });
  el(padHeader, "strong", "Your writing");
  const padCounter = el(padHeader, "span", `0 / ${paths.length} strokes`, { class: "draw-counter" });
  const toggleModel =
    mode === "trace"
      ? button(
          padHeader,
          "Hide model",
          () => {
            modelCollapsed = !modelCollapsed;
            sync();
          },
          { class: "draw-inline-toggle" },
        )
      : null;
  const pad = board(padBox, "Writing pad; use stroke study for a keyboard alternative", prefs.grid);
  pad.classList.add("draw-pad");
  pad.tabIndex = 0;
  const guide = svg(pad, "g"),
    ink = svg(pad, "g");
  const padControls = el(padBox, "div", null, { class: "draw-pane-controls" });

  gridToggle.addEventListener("change", () => {
    prefs.grid = gridToggle.checked;
    saveLivePrefs(prefs);
    ref.querySelector(".draw-guides").toggleAttribute("hidden", !prefs.grid);
    pad.querySelector(".draw-guides").toggleAttribute("hidden", !prefs.grid);
  });
  numbersToggle.addEventListener("change", () => {
    prefs.numbers = numbersToggle.checked;
    saveLivePrefs(prefs);
    renderRefNumbers();
    sync();
  });
  liveToggle?.addEventListener("change", () => {
    prefs.liveCheck = liveToggle.checked;
    saveLivePrefs(prefs);
    if (!prefs.liveCheck && !mismatch) {
      mismatchIndex = -1;
    } else if (prefs.liveCheck && lines.length && lines.length <= expected.length) {
      const err = compareStroke(lines.at(-1), expected[lines.length - 1]);
      mismatchIndex = err ? lines.length - 1 : -1;
      if (err) msg.textContent = `Stroke ${lines.length}: ${err} Undo to retry, or keep drawing.`;
    }
    sync();
  });

  const msg = el(c, "p", "", { role: "status", "aria-live": "polite", class: "draw-status" });
  const actions = el(c, "div", null, { class: "answer-actions draw-actions" });
  const add = (parent, name, fn, attrs) => button(parent, name, fn, attrs);
  function stopReplay() {
    clearTimeout(timer);
    animation?.cancel();
    animation = undefined;
    if (playing) {
      playing = false;
      replay.textContent = "Replay strokes";
    }
  }
  function step(index, animate = false, keepPlaying = false) {
    if (!keepPlaying) stopReplay();
    else {
      clearTimeout(timer);
      animation?.cancel();
      animation = undefined;
    }
    replayIndex = (index + paths.length) % paths.length;
    referencePaths.forEach((p, i) => (p.style.opacity = i === replayIndex ? "1" : ".45"));
    refMarker.replaceChildren();
    addDirectionMarker(refMarker, expected[replayIndex], 2);
    modelCounter.textContent = `Stroke ${replayIndex + 1} / ${paths.length}`;
    const p = referencePaths[replayIndex],
      [x, y] = expected[replayIndex][0];
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const len = p.getTotalLength();
      animation = p.animate(
        [
          { strokeDasharray: `${len} ${len}`, strokeDashoffset: len },
          { strokeDasharray: `${len} ${len}`, strokeDashoffset: 0 },
        ],
        { duration: 560 },
      );
    }
    const [, second] = expected[replayIndex],
      dx = second[0] - x,
      dy = second[1] - y;
    const direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
    msg.textContent = `Stroke ${replayIndex + 1} of ${paths.length}. Start at the dot and move ${direction}.`;
  }
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
  const replay = add(refControls, "Replay strokes", () => {
    if (playing) {
      stopReplay();
      return;
    }
    let i = 0;
    playing = !reduced();
    if (playing) replay.textContent = "Pause replay";
    const next = () => {
      step(i++, true, true);
      if (i < paths.length && !reduced()) timer = setTimeout(next, 740);
      else {
        playing = false;
        replay.textContent = "Replay strokes";
      }
    };
    next();
    if (reduced()) msg.textContent += " Use Next stroke to step through the model.";
  });
  const prevStep = add(refControls, "Previous stroke", () => step(replayIndex - 1, true));
  const nextStep = add(refControls, "Next stroke", () => step(replayIndex + 1, true));

  const undo = add(padControls, "Undo last stroke", () => {
    discard();
    lines.pop();
    ink.lastElementChild?.remove();
    mismatch = "";
    mismatchIndex = -1;
    msg.textContent = "";
    sync();
  });
  const clear = add(padControls, "Clear drawing", () => {
    discard();
    lines.length = 0;
    ink.replaceChildren();
    mismatch = "";
    mismatchIndex = -1;
    msg.textContent = "";
    sync();
  });
  const reveal = add(padControls, "Show overlay", () => {
    assisted = true;
    inspected = true;
    overlay = !overlay;
    sync();
  });

  const begin = add(
    actions,
    "Hide model and draw",
    () => {
      stopReplay();
      studying = false;
      msg.textContent = "";
      sync();
    },
    { class: "primary" },
  );
  const check = add(
    actions,
    "Compare with model",
    () => {
      if (active !== null) return;
      const detail = compareDrawingDetail(lines, expected, { allowOffset: mode !== "trace" });
      if (!detail.message)
        return end(
          true,
          assisted ? "Assisted match" : "Unassisted match",
          "The strokes match the shown model within the preview tolerances.",
        );
      inspected = true;
      assisted = true;
      overlay = true;
      mismatch = detail.message;
      mismatchIndex = detail.strokeIndex;
      msg.textContent = `${detail.message} Undo and try again, or self-review. A different trace does not mean the kanji is invalid.`;
      sync();
    },
    { class: "primary" },
  );
  const keep = add(
    actions,
    "Finish self-review",
    () => end(null, "Self-review", "Stroke study completed without automatic scoring."),
    { class: "primary" },
  );
  const record = add(actions, "Save for retry", () => end(false, "Model differs", mismatch));
  const study = add(actions, "Self-review", () => {
    discard();
    self = true;
    inspected = true;
    assisted = true;
    overlay = true;
    msg.textContent = "Compare the model with your attempt, or follow the strokes without drawing.";
    sync();
    keep.focus();
  });
  add(actions, "Skip", () => end(null, "Skipped", "Skipped without scoring."));

  const pathOf = (line) => line.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  function end(correct, kind, explanation) {
    if (complete) return;
    complete = true;
    stopReplay();
    discard();
    finish({
      correct,
      mode: kind,
      ...(correct === null ? {} : { points: kind === "Unassisted match" ? 1 : 0 }),
      prompt: `Write ${item.character}`,
      answer: `${item.character} · ${paths.length} strokes`,
      response: `${kind} · ${lines.length} strokes drawn`,
      explanation,
      snapshot: { paths, drawn: lines.map(pathOf), grid: prefs.grid, character: item.character },
    });
  }
  function sync() {
    const blind = mode === "memory" && !studying && !inspected && !self;
    refBox.hidden = blind || (mode === "trace" && modelCollapsed && !self);
    padBox.hidden = studying || (self && !lines.length);
    if (toggleModel) {
      toggleModel.hidden = self;
      toggleModel.textContent = modelCollapsed ? "Show model" : "Hide model";
      toggleModel.setAttribute("aria-expanded", String(!modelCollapsed));
    }
    title.textContent = blind
      ? "Draw the character from memory"
      : `${self || studying ? "Study" : "Draw"} ${item.character}`;
    hint.textContent = self
      ? "Follow each stroke from its starting dot. Finish when you’re ready; this review is not scored."
      : studying
        ? "Study the model, then hide it before drawing."
        : mode === "trace"
          ? "Trace the highlighted stroke from its starting dot."
          : "Draw each stroke in order. Compare when you’re ready.";
    padCounter.textContent = blind
      ? `${lines.length} ${lines.length === 1 ? "stroke" : "strokes"}`
      : `${lines.length} / ${paths.length} strokes`;
    [...ink.children].forEach((node, i) => node.classList.toggle("draw-stroke-mismatch", i === mismatchIndex));
    guide.replaceChildren();
    if (!blind && !studying && (overlay || mode === "trace")) {
      paths.forEach((d, i) => {
        if (!overlay && i !== lines.length && i !== mismatchIndex) return;
        const cls = i === mismatchIndex ? "draw-stroke draw-template-target" : "draw-stroke draw-template";
        svg(guide, "path", { d, class: cls });
      });
      if (mismatchIndex >= 0 && expected[mismatchIndex]) {
        addDirectionMarker(guide, expected[mismatchIndex], 1.8);
        numbersOn(guide, mismatchIndex);
      } else if (mode === "trace" && expected[lines.length]) {
        addDirectionMarker(guide, expected[lines.length], 1.7);
        numbersOn(guide, lines.length);
      }
    }
    replay.hidden = prevStep.hidden = nextStep.hidden = blind;
    begin.hidden = !studying || self;
    undo.hidden = clear.hidden = check.hidden = reveal.hidden = self || studying;
    clear.disabled = undo.disabled = check.disabled = !lines.length;
    reveal.textContent = overlay ? "Hide overlay" : blind ? "Reveal model and overlay" : "Show overlay";
    keep.hidden = !self;
    record.hidden = self || !mismatch;
    study.hidden = self;
  }
  function release() {
    const id = active;
    active = null;
    if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  }
  function discard() {
    if (active === null) return;
    release();
    livePath?.remove();
    current = [];
  }
  function point(e) {
    const transform = pad.getScreenCTM();
    if (!transform) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(transform.inverse());
    return [p.x, p.y];
  }
  function extend(e) {
    if (e.pointerId !== active) return;
    for (const move of e.getCoalescedEvents?.() || []) {
      const p = point(move);
      if (p) current.push(p);
    }
    const p = point(e);
    if (p) current.push(p);
    livePath.setAttribute("d", pathOf(current));
  }
  pad.onpointerdown = (e) => {
    if (!e.isPrimary || e.button !== 0 || active !== null || self || studying || complete) return;
    const p = point(e);
    if (!p) return;
    pad.setPointerCapture(e.pointerId);
    active = e.pointerId;
    current = [p];
    livePath = svg(ink, "path", { d: pathOf(current), class: "draw-stroke" });
  };
  pad.onpointermove = extend;
  pad.onpointerup = (e) => {
    if (active !== e.pointerId) return;
    extend(e);
    release();
    if (isAccidentalTap(current)) {
      livePath?.remove();
      current = [];
      return;
    }
    lines.push(current);
    current = [];
    mismatch = "";
    mismatchIndex = -1;
    if (mode === "trace" && prefs.liveCheck && lines.length <= expected.length) {
      const err = compareStroke(lines.at(-1), expected[lines.length - 1]);
      if (err) {
        mismatchIndex = lines.length - 1;
        msg.textContent = `Stroke ${lines.length}: ${err} Undo to retry, or keep drawing.`;
        sync();
        return;
      }
    }
    const blind = mode === "memory" && !studying && !inspected && !self;
    msg.textContent = blind
      ? `${lines.length} ${lines.length === 1 ? "stroke" : "strokes"} drawn.`
      : lines.length === paths.length
        ? `All ${paths.length} strokes drawn. Compare with model when ready.`
        : `${lines.length} of ${paths.length} strokes drawn.`;
    sync();
  };
  pad.onpointercancel = pad.onlostpointercapture = (e) => {
    if (e.pointerId === active) discard();
  };
  const onKeyDown = (e) => {
    if (complete) return;
    const target = e.target;
    if (
      target &&
      (target.matches?.("input:not([type=checkbox]):not([type=radio]), textarea, select") || target.isContentEditable)
    )
      return;
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "z") {
      if (!undo.hidden && !undo.disabled) {
        e.preventDefault();
        undo.click();
      }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowRight" && !nextStep.hidden) {
      e.preventDefault();
      nextStep.click();
    } else if (e.key === "ArrowLeft" && !prevStep.hidden) {
      e.preventDefault();
      prevStep.click();
    } else if (e.key.toLowerCase() === "r" && !replay.hidden) {
      e.preventDefault();
      replay.click();
    } else if (e.key === "Enter" && (target === c.ownerDocument.body || target === pad)) {
      if (!begin.hidden) {
        e.preventDefault();
        begin.click();
      } else if (!check.hidden && !check.disabled) {
        e.preventDefault();
        check.click();
      } else if (!keep.hidden) {
        e.preventDefault();
        keep.click();
      }
    }
  };
  c.ownerDocument.addEventListener("keydown", onKeyDown);
  signal.addEventListener(
    "abort",
    () => {
      stopReplay();
      discard();
      c.ownerDocument.removeEventListener("keydown", onKeyDown);
    },
    { once: true },
  );
  step(0);
  sync();
}
function credit(c) {
  const p = el(c, "p", null, { class: "muted small" });
  el(p, "a", "KanjiVG", { href: "https://kanjivg.tagaini.net/", target: "_blank", rel: "noopener" });
  p.append(" · Ulrich Apel and contributors · repacked ordered paths · ");
  el(p, "a", "CC BY-SA 3.0", {
    href: "https://creativecommons.org/licenses/by-sa/3.0/",
    target: "_blank",
    rel: "noopener",
  });
  p.append(". School grades: KANJIDIC2, EDRG · ");
  el(p, "a", "CC BY-SA 4.0", {
    href: "https://creativecommons.org/licenses/by-sa/4.0/",
    target: "_blank",
    rel: "noopener",
  });
}
export const draw = {
  items: models,
  prepare: prepareModels,
  credits: credit,
  setup(c) {
    select(c, "draw-mode", "Practice", modes);
    const collection = select(c, "draw-collection", "Character collection", choices);
    collection.dataset.noSettingHelp = "";
    const label = el(c, "label", null, { class: "preview-practice-field" });
    el(label, "span", "Custom characters");
    const input = el(label, "input", null, {
      type: "text",
      id: "draw-list",
      lang: "ja",
      maxlength: "250",
      placeholder: "一日語",
      autocomplete: "off",
    });
    const note = el(c, "p", null, { id: "draw-list-status", role: "status" });
    let linkedOverride = false;
    const sync = () => {
      const custom = collection.value === "custom";
      label.hidden = !custom;
      note.hidden = !custom;
      if (custom) {
        const parsed = parseList(input.value);
        note.textContent = `${parsed.items.length} supported. Duplicates: ${parsed.duplicates.join(" ") || "none"}. Unsupported: ${parsed.unsupported.join(" ") || "none"}.`;
      }
    };
    collection.addEventListener("change", () => {
      linkedOverride = false;
      sync();
    });
    input.addEventListener("input", () => {
      if (!linkedOverride) {
        try {
          localStorage.setItem(LIST_STORAGE_KEY, input.value);
        } catch {}
      }
      sync();
    });
    // The shell restores validated selects after setup; sync dependent UI then, too.
    const linked = new URLSearchParams(c.ownerDocument.location.search).get("kanji");
    queueMicrotask(() => {
      if (linked) {
        linkedOverride = true;
        collection.value = "custom";
        collection.chipsApi?.sync();
        input.value = [...linked].slice(0, 250).join("");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      } else {
        try {
          const savedList = localStorage.getItem(LIST_STORAGE_KEY);
          if (savedList) {
            input.value = savedList;
            input.dispatchEvent(new Event("input", { bubbles: true }));
          }
        } catch {}
      }
      sync();
    });
    sync();
  },
  pool(c) {
    const source = setting(c, "draw-collection", "5");
    const list =
      source === "custom"
        ? parseList(c.querySelector("#draw-list").value).items
        : source === "all"
          ? models
          : models.filter((i) => i.level === source || `grade${i.grade}` === source);
    return list.map((i) => ({ ...i, practice: setting(c, "draw-mode", "trace") }));
  },
  render(c, item, finish) {
    const controller = new AbortController(),
      region = el(c, "section", null, { class: "draw-practice" });
    async function load() {
      region.replaceChildren();
      el(region, "p", `Loading the stroke model for ${item.character}…`, { role: "status" });
      try {
        const [data] = await Promise.all([loadModel(item), import("./draw.css")]);
        if (controller.signal.aborted) return;
        region.replaceChildren();
        mount(region, item, finish, /** @type {any} */ (data), controller.signal);
      } catch {
        if (controller.signal.aborted) return;
        region.replaceChildren();
        el(
          region,
          "p",
          "The stroke model could not be opened. Retry, or stop the session to change targets. This is not a missed answer.",
          { role: "alert" },
        );
        button(region, "Retry model", load);
      }
    }
    void load();
    return () => controller.abort();
  },
  review(c, i, r) {
    if (r?.snapshot?.paths?.length) {
      const figure = el(c, "figure", null, { class: "draw-review-snapshot" });
      const s = board(figure, `Your strokes compared with ${i.character}`, r.snapshot.grid);
      for (const d of r.snapshot.paths) svg(s, "path", { d, class: "draw-stroke draw-template" });
      for (const d of r.snapshot.drawn) svg(s, "path", { d, class: "draw-stroke" });
      el(
        figure,
        "figcaption",
        r.snapshot.drawn.length ? "Your strokes over the KanjiVG model" : "KanjiVG stroke model",
      );
    }
    el(c, "a", `Explore ${i.character} in the Kanji Atlas`, {
      href: `/kanji-chizucho?kanji=${encodeURIComponent(i.character)}`,
      target: "_blank",
      rel: "noopener",
    });
    c.append(" · ");
    el(c, "a", `Open a handwriting worksheet for ${i.character}`, {
      href: `/shiryo?kanji=${encodeURIComponent(i.character)}#worksheet`,
      target: "_blank",
      rel: "noopener",
    });
    credit(c);
  },
};
