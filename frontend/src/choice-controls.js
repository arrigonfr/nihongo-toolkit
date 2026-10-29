import { mountChips } from "./chips.js";

// Button-style mode pills over a hidden <select>.
export function pillSelect(select, descriptions = {}) {
  const api = mountChips(select, { presentation: "button", wrap: false, descriptions, groupClass: "study-pills" });
  return api.sync;
}
