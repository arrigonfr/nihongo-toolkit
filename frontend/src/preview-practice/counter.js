import { audioIcon } from "../audio-icon.js";
import { romanizeKana } from "../romanize.js";
import { studyPool } from "../study-pool.js";
import { answers, el, kana, reading, select, setting } from "./ui.js";

const families = () => [...new Map(counter.items.map((i) => [i.family, i])).values()];
const singular = { "sheets of paper": "sheet of paper", "cupfuls of tea": "cupful of tea" };
const quantityLabel = (i) =>
  `${i.quantity} ${i.quantity === 1 ? i.referentSingular || singular[i.referent] || i.referent.replace(/s$/, "") : i.referent}`;
const prompt = (i) => `${quantityLabel(i)} · ${i.sense}`;
function contrast(i) {
  return counter.items.find(
    (x) => x.family === i.family && x.quantity === (i.quantity === 1 ? 2 : i.quantity === 20 ? 10 : i.quantity - 1),
  );
}
export function gradeCounter(i, input) {
  const typed = i.input === "reading",
    near = contrast(i);
  return {
    correct: typed ? i.readings.includes(kana(input)) : input === i.family,
    prompt: prompt(i),
    response: input,
    answer: typed ? i.readings.join(" / ") : i.family,
    mode: `${i.family} · ${i.sound}`,
    explanation: `${i.written} (${i.readings.join(" / ")}) counts ${i.sense}. Compare ${near.written} (${near.audio}).`,
  };
}
export const counter = {
  ...studyPool("counter"),
  setup(c) {
    el(
      c,
      "p",
      `Match objects to their counter or type full kana readings across ${counter.items.length.toLocaleString()} counting prompts.`,
    );
    select(c, "counter-mode", "Practice", [
      ["mixed", "Mixed session"],
      ["family", "Choose the counter"],
      ["reading", "Type the kana reading"],
    ]);
    const table = el(c, "details");
    el(table, "summary", "Browse counter readings");
    const pick = select(
      table,
      "counter-table",
      "Reading table",
      families().map(({ family, referent }) => [family, `${family} · ${referent}`]),
    );
    pick.previousElementSibling.remove();
    pick.setAttribute("aria-label", "Counter reading family");
    pick.dataset.noSettingHelp = "";
    const grid = el(table, "table", null, { class: "preview-practice-table" });
    function show() {
      grid.replaceChildren();
      const header = el(grid, "tr");
      for (const text of ["Form", "Reading"]) el(header, "th", text, { scope: "col" });
      const seen = new Set();
      for (const i of counter.items.filter(
        (x) => x.family === pick.value && !seen.has(x.quantity) && seen.add(x.quantity),
      )) {
        const tr = el(grid, "tr");
        el(tr, "th", i.written, { scope: "row", lang: "ja" });
        reading(el(tr, "td"), i.readings.join(" / "));
        tr.querySelector("button").dataset.studySpeak = i.audio;
        tr.querySelector("button").setAttribute("aria-label", `Listen: ${i.audio}`);
      }
    }
    pick.addEventListener("change", show);
    table.addEventListener("toggle", show);
    show();
  },
  pool(c) {
    const mode = setting(c, "counter-mode", "mixed");
    return counter.items.map((i) => ({
      ...i,
      input: mode === "mixed" ? (Math.random() < 0.5 ? "family" : "reading") : mode,
    }));
  },
  render(c, i, finish) {
    el(c, "p", `Count ${i.sense}.`);
    el(c, "h2", quantityLabel(i));
    if (i.input === "reading") {
      el(c, "p", i.written, { lang: "ja" });
      answers(c, null, "Full reading in kana", (v) => finish(gradeCounter(i, v)));
    } else {
      el(c, "p", "Choose the specific counter family described above.");
      const distractors = families()
        .map((item) => item.family)
        .filter((family) => family !== i.family);
      for (let n = distractors.length - 1; n > 0; n--) {
        const j = Math.floor(Math.random() * (n + 1));
        [distractors[n], distractors[j]] = [distractors[j], distractors[n]];
      }
      const choices = [i.family, ...distractors.slice(0, 5)];
      for (let n = choices.length - 1; n > 0; n--) {
        const j = Math.floor(Math.random() * (n + 1));
        [choices[n], choices[j]] = [choices[j], choices[n]];
      }
      const group = el(c, "div", null, {
        class: "answer-actions preview-practice-options",
        role: "group",
        "aria-label": "Counter family",
      });
      const buttons = choices.map((choice, index) => {
        const button = el(group, "button", null, { type: "button", "aria-keyshortcuts": String(index + 1) });
        el(button, "span", choice, { lang: "ja" });
        el(button, "kbd", String(index + 1), { class: "particle-shortcut", "aria-hidden": "true" });
        button.onclick = () => finish(gradeCounter(i, choice));
        return button;
      });
      const keydown = (event) => {
        if (
          !matchMedia("(min-width: 761px) and (hover: hover)").matches ||
          event.repeat ||
          event.isComposing ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.target.closest("input, textarea, select, [contenteditable=true]") ||
          document.querySelector("dialog[open]")
        )
          return;
        const button = /^[1-6]$/.test(event.key) ? buttons[Number(event.key) - 1] : null;
        if (button) {
          event.preventDefault();
          button.click();
        }
      };
      document.addEventListener("keydown", keydown);
      return () => document.removeEventListener("keydown", keydown);
    }
  },
  review(c, i) {
    const answer = c.querySelector('[data-field="answer"] dd');
    el(answer, "span", ` ${romanizeKana(i.audio)} `, { class: "study-romaji" });
    el(answer, "button", audioIcon, {
      type: "button",
      class: "study-audio",
      "data-study-speak": i.audio,
      "aria-label": `Listen: ${i.audio}`,
    });
  },
};
