import catalog from "./catalog.json" with { type: "json" };
import { normalize, lookup } from "./classification.js";

export { catalog, normalize };
export const typeNames = { "sound-imitation": "Audible", "non-audible-mimetic": "Non-audible" };

export function findCards({ collection = "approved", q = "", scene, type, frequency, register } = {}) {
  const terms = normalize(q).split(/\s+/).filter(Boolean);
  return catalog.cards.filter(c => {
    if (collection !== "draft" || c.status !== "draft") return false;
    const text = [c.form,c.reading,...c.aliases,c.scene,c.meaning,c.translation].map(normalize).join(" ");
    return terms.every(t => text.includes(t)) && (!scene || c.scene === scene) &&
      (!type || c.type === type) && (!register || c.register === register) &&
      (!frequency || (c.common ? "marked" : "unmarked") === frequency);
  });
}

export const classify = (form, options) => lookup(catalog, form, options);
