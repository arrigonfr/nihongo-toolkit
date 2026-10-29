import { mountChips } from "./chips.js";

const LABELS = { free: "Free", questions: "Question count", timed: "Timed", sudden: "Sudden Death" };
const TOOLTIPS = {
  free: "No limit. Practise for as long as you like; the timer starts with your first answer.",
  questions: "A fixed number of questions, then your results.",
  timed: "Answer as many questions as you can before the clock runs out.",
  sudden: "Keep going until your first miss. A wrong answer, a skip or a revealed answer ends the session and shows your streak."
};

// Single-choice practice mode chips over the page's hidden <select>.
// values maps a canonical mode name (free | questions | timed | sudden) to the select's option value
// when a page uses a different one, e.g. { timed: "time" }; labels / tooltips override the defaults per page.
export function mountPracticeMode(select, { values = {}, labels = {}, tooltips = {}, title = "Practice mode" } = {}) {
  const valueOf = (name) => values[name] ?? name;
  const names = Object.keys(LABELS);
  return mountChips(select, {
    title,
    presentation: "button",
    groupClass: "practice-mode-chips",
    fieldClass: "practice-mode-field",
    options: names.map((name) => ({ value: valueOf(name), label: labels[name] ?? LABELS[name] })),
    descriptions: Object.fromEntries(names.map((name) => [valueOf(name), tooltips[name] ?? TOOLTIPS[name]]))
  });
}

// A thin bar that drains over `ms`, shown while Sudden Death reveals the answer before the results.
export function showSuddenCountdown(container, ms = 2000) {
  container.querySelector(".sudden-countdown")?.remove();
  const bar = document.createElement("div");
  bar.className = "sudden-countdown";
  bar.setAttribute("role", "presentation");
  bar.style.cssText = "height:5px;margin-top:12px;border-radius:99px;overflow:hidden;background:color-mix(in srgb, var(--line, #ccc) 70%, transparent)";
  const fill = document.createElement("div");
  fill.style.cssText = `height:100%;width:100%;border-radius:inherit;background:var(--accent, #c0392b);transform-origin:left;transition:transform ${ms}ms linear`;
  bar.append(fill);
  container.append(bar);
  requestAnimationFrame(() => requestAnimationFrame(() => { fill.style.transform = "scaleX(0)"; }));
  return bar;
}
