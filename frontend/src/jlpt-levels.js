import { mountChips } from "./chips.js";
import { selectedLevels, matchesLevel } from "@nihon/shared/jlpt-levels";

export { selectedLevels, matchesLevel };

export function mountLevelControls() {
  for (const select of document.querySelectorAll("select#levelSelect, select#setting-level")) {
    if (select.dataset.levelChoices) continue;
    select.dataset.levelChoices = "true";
    const prefix = [...select.options].some((option) => /^N[1-5]$/.test(option.value)) ? "N" : "";
    const unrated = [...select.options].some((option) => option.value === "unrated")
      || select.id === "setting-level" && /活用\.html|しりとり\.html/.test(decodeURIComponent(location.pathname));
    const levels = [5, 4, 3, 2, 1, ...(unrated ? ["unrated"] : [])];
    const valueOf = (n) => n === "unrated" ? n : prefix + n;
    if (![...select.options].some((option) => option.value === "none")) select.add(new Option("none", "none"));
    mountChips(select, {
      multiple: true,
      options: levels.map((n) => ({ value: valueOf(n), label: n === "unrated" ? "Non-JLPT" : `N${n}` })),
      allValue: "all",
      emptyValue: "none",
      fieldClass: "level-field",
      groupClass: "study-levels",
      optionClass: "chip",
      actions: [
        { label: "All", run: "all", attrs: { "data-level-all": "" } },
        { label: "Clear", run: "clear", attrs: { "data-level-clear": "" } }
      ],
      decode: (value) => selectedLevels(value).map(valueOf).filter((item) => levels.map(valueOf).includes(item)),
      encode: (values) => {
        const list = levels.map(valueOf).filter((item) => values.includes(item));
        return !list.length ? "none" : list.length === levels.length ? "all" : list.join(",");
      }
    });
  }
}
