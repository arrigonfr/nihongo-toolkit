export const normalize = value => String(value ?? "").normalize("NFKC").trim().toLowerCase()
  .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 96));

// This edition has no approved classifications. In particular, a dictionary
// umbrella tag must never become an approved sound-imitation label by itself.
export function lookup(catalog, form, { editorial = false, reading, sense } = {}) {
  const candidates = editorial ? [...catalog.cards,...catalog.controls] : [];
  const matches = candidates.filter(c => {
    const forms = [c.form,c.reading,...c.aliases];
    return (!sense || c.id === sense) && (!reading || forms.some(f =>
      !/\p{Script=Han}/u.test(f) && normalize(f) === normalize(reading))) &&
      forms.some(f => normalize(f) === normalize(form));
  }).map(c => ({ sense: c.id, proposed: c.type, entry: c.entry, fingerprint: c.fingerprint,
    sourceVersion: catalog.manifest.dictionary.release }));
  return { status: matches.length ? "draft" : "unknown", matches };
}
