import { shuffle } from "../imposters-engine.js";
import { studyPool } from "../study-pool.js";
import { crossResult, frame, validatePuzzle } from "./crossroads-data.js";
import { button, el, ja, root, setupNote, status } from "./dom.js";

export const crossroads = {
  ...studyPool("crossroads", validatePuzzle),
  setup(container) {
    setupNote(
      container,
      `Find the one missing kanji in three compounds across ${crossroads.items.length.toLocaleString()} puzzles. Readings appear after answering.`,
    );
  },
  render(container, item, finish) {
    const board = root(container);
    const frames = el("div", undefined, "pg-frames");
    const hints = item.compounds.map((c) => {
      const block = el("div");
      const word = el("strong", frame(c));
      word.lang = "ja";
      const meaning = el("span");
      block.append(word, meaning);
      frames.append(block);
      return meaning;
    });
    const notice = status();
    let ended = false,
      count = 0,
      selected = "";
    const commit = (guess) => {
      if (ended) return;
      ended = true;
      finish(crossResult(item, guess, count));
    };
    const bank = el("div", undefined, "pg-bank");
    bank.setAttribute("role", "group");
    bank.setAttribute("aria-label", "Choose the missing kanji");
    const check = el("button", "Check answer ", "primary");
    check.type = "button";
    check.disabled = true;
    check.setAttribute("aria-keyshortcuts", "C");
    const checkKbd = el("kbd", "C", "particle-shortcut");
    checkKbd.setAttribute("aria-hidden", "true");
    check.append(checkKbd);
    check.addEventListener("click", () => {
      if (selected) commit(selected);
    });
    const choices = shuffle(item.bank).map((char, index) => {
      const tile = el("button");
      tile.type = "button";
      tile.setAttribute("aria-pressed", "false");
      tile.setAttribute("aria-keyshortcuts", String(index + 1));
      const label = el("span", char);
      label.lang = "ja";
      const kbd = el("kbd", String(index + 1), "particle-shortcut");
      kbd.setAttribute("aria-hidden", "true");
      tile.append(label, kbd);
      tile.addEventListener("click", () => {
        if (ended) return;
        selected = selected === char ? "" : char;
        for (const other of choices) other.setAttribute("aria-pressed", String(other === tile && selected === char));
        check.disabled = !selected;
      });
      bank.append(tile);
      return tile;
    });
    const controls = el("div", undefined, "pg-actions");
    const hint = button("Reveal a meaning ", () => {
      if (count >= 3 || ended) return;
      hints[count].textContent = item.compounds[count].meaning;
      notice.textContent = `Meaning ${count + 1}: ${item.compounds[count].meaning}. Correct answer now earns ${Math.max(1, 2 - count)} point${count ? "" : "s"}.`;
      hint.disabled = ++count === 3;
    });
    hint.setAttribute("aria-keyshortcuts", "R");
    const hintKbd = el("kbd", "R", "particle-shortcut");
    hintKbd.setAttribute("aria-hidden", "true");
    hint.append(hintKbd);
    controls.append(check, hint);
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
      const key = event.key.toLowerCase();
      const option = /^[1-9]$/.test(event.key)
        ? choices[Number(event.key) - 1]
        : key === "c"
          ? check
          : key === "r"
            ? hint
            : null;
      if (option && !option.disabled) {
        event.preventDefault();
        option.click();
      }
    };
    document.addEventListener("keydown", keydown);
    board.append(el("h3", item.theme), frames, el("p", "Choose the missing kanji."), bank, controls, notice);
    return () => {
      ended = true;
      document.removeEventListener("keydown", keydown);
    };
  },
  review(container, item) {
    const explanation = container.querySelector('[data-field="explanation"] dd');
    if (!explanation) return;
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
    explanation.replaceChildren(list);
  },
};
