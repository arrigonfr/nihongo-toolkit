import { studyPool } from "../study-pool.js";
import { shuffle } from "../imposters-engine.js";
import { el, ja, button, root, setupNote, status } from "./dom.js";
import { frame, crossResult, validatePuzzle } from "./crossroads-data.js";

export const crossroads = {
  ...studyPool("crossroads", validatePuzzle),
  setup(container) {
    setupNote(container, "Find the one missing kanji in three compounds. Readings appear after answering.");
  },
  render(container, item, finish) {
    const board = root(container);
    const frames = el("div", undefined, "pg-frames");
    const hints = item.compounds.map(c => {
      const block = el("div");
      const word = el("strong", frame(c));
      word.lang = "ja";
      const meaning = el("span");
      block.append(word, meaning);
      frames.append(block);
      return meaning;
    });
    const form = el("form");
    const label = el("label", "Missing kanji");
    const input = el("input");
    input.autocomplete = "off";
    input.lang = "ja";
    label.append(input);
    const submit = el("button", "Check answer");
    submit.type = "submit";
    const notice = status();
    let composing = false, ignoreSubmit = false, ended = false, count = 0;
    input.addEventListener("compositionstart", () => { composing = true; });
    input.addEventListener("compositionend", () => { composing = false; });
    input.onkeydown = event => {
      if (event.key === "Enter") {
        ignoreSubmit = event.isComposing || composing || event.keyCode === 229;
        if (ignoreSubmit) setTimeout(() => { ignoreSubmit = false; }, 0);
      }
    };
    const commit = guess => {
      if (ended) return;
      ended = true;
      finish(crossResult(item, guess, count));
    };
    form.onsubmit = event => {
      event.preventDefault();
      if (ignoreSubmit || composing) return;
      const guess = input.value.trim();
      if (!/^\p{Script=Han}$/u.test(guess)) {
        notice.textContent = "Enter one kanji or choose one from the bank.";
        input.focus();
        return;
      }
      commit(guess);
    };
    form.append(label, submit);
    const bank = el("div", undefined, "pg-bank");
    for (const char of shuffle(item.bank)) {
      const tile = button(char, () => { input.value = char; input.focus(); });
      tile.lang = "ja";
      bank.append(tile);
    }
    const controls = el("div", undefined, "pg-actions");
    const hint = button("Reveal a meaning", () => {
      if (count >= 3 || ended) return;
      hints[count].textContent = item.compounds[count].meaning;
      notice.textContent = `Meaning ${count + 1}: ${item.compounds[count].meaning}. Correct answer now earns ${Math.max(1, 2 - count)} point${count ? "" : "s"}.`;
      hint.disabled = ++count === 3;
    });
    controls.append(hint, button("Reveal answer", () => commit("")));
    board.append(el("h3", item.theme), frames, el("p", "Type one kanji or choose from the bank, then check your answer. You have one scored guess."), bank, form, controls, notice);
    return () => { ended = true; };
  },
  review(container, item) {
    const list = el("ul");
    for (const c of item.compounds) {
      const li = el("li");
      const link = el("a");
      link.href = `https://jisho.org/search/${encodeURIComponent(c.spelling)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(ja(c.spelling, c.reading));
      li.append(link, ` — ${c.meaning}`);
      list.append(li);
    }
    container.append(list);
  }
};
