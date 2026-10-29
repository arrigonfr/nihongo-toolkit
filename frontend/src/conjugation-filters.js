import { mountChips } from "./chips.js";
import { removeChipsTooltip } from "./plain-fields.js";

const LABELS = {
  politeness: [["plain", "Plain"], ["polite", "Polite"]],
  polarity: [["affirmative", "Affirmative"], ["negative", "Negative"]],
  tense: [["non-past", "Non-past"], ["past", "Past"]]
};

// Politeness / polarity / tense as vertical checkbox chips over the existing hidden selects.
// "both" is the stored value when every chip is on, otherwise a comma list such as "plain,polite".
export function mountConjugationFilters() {
  for (const [field, options] of Object.entries(LABELS)) {
    const select = document.getElementById(`setting-${field}`);
    if (!select) continue;
    mountChips(select, {
      multiple: true,
      options: options.map(([value, label]) => ({ value, label })),
      allValue: "both",
      orientation: "vertical",
      presentation: "checkbox",
      fieldClass: "conjugation-filter-field"
    });
    removeChipsTooltip(select);
  }
}
