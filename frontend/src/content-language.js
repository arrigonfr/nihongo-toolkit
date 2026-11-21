// Study content (definitions, sentence translations) follows the interface language, with labeled fallbacks.
const escape = (value) => String(value ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const contentLanguage = () => document.documentElement.dataset.interfaceLanguage || "en";

export function localizedDefinitions(senses, language = contentLanguage()) {
  const seen = new Set();
  const definitions = [];
  let machine = false, translated = 0, untranslated = 0;
  for (const sense of senses || []) {
    const english = sense.english_definitions || [];
    if (!english.length) continue;
    const translation = language === "en" ? null : sense.translations?.[language];
    if (translation) { translated++; machine ||= translation.machine; }
    else if (language !== "en") untranslated++;
    for (const text of translation?.definitions || english) {
      if (seen.has(text.toLowerCase())) continue;
      seen.add(text.toLowerCase());
      definitions.push({ text, lang: translation ? language : "en" });
    }
  }
  return { definitions, machine, fallback: untranslated > 0 && !translated, partial: untranslated > 0 && translated > 0 };
}

export function localizedSentence(example, language = contentLanguage()) {
  const translation = language === "en" ? null : example.translations_by_language?.[language];
  if (!translation) return { text: example.english, lang: "en", machine: false, fallback: language !== "en",
    translationId: example.translationId, translationOwner: example.translationOwner };
  // Machine translations are made from the English translation, so its credit stays.
  const credit = translation.machine ? example : translation;
  return { text: translation.text, lang: language, machine: translation.machine, fallback: false,
    translationId: credit.translationId, translationOwner: credit.translationOwner };
}

function notesHTML({ machine, fallback, partial }) {
  const notes = [machine && "Machine translation", fallback && "English fallback", partial && "Partly in English"].filter(Boolean);
  return notes.length ? `<span class="translation-note">${notes.map((note) => `<span>${note}</span>`).join(" · ")}</span>` : "";
}

function renderDefinitions({ senses, limit, inline, empty }) {
  const result = localizedDefinitions(senses);
  const definitions = result.definitions.slice(0, limit);
  if (!definitions.length) return empty ? `<p class="example-empty">${escape(empty)}</p>` : "";
  if (inline) return `${notesHTML(result)}${result.machine || result.fallback || result.partial ? " " : ""}${definitions
    .map(({ text, lang }) => `<span data-i18n-study lang="${lang}">${escape(text)}</span>`).join("; ")}`;
  return `${notesHTML(result)}<ol class="meanings">${definitions
    .map(({ text, lang }) => `<li data-i18n-study lang="${lang}">${escape(text)}</li>`).join("")}</ol>`;
}

export function definitionsHTML(senses, { limit = 8, inline = false, empty = "", tag = "div", className = "localized-definitions" } = {}) {
  const options = { senses: (senses || []).map(({ english_definitions, translations }) => ({ english_definitions, translations })), limit, inline, empty };
  return `<${tag} class="${className}" data-definitions="${escape(JSON.stringify(options))}">${renderDefinitions(options)}</${tag}>`;
}

function renderSentence(example, part) {
  const shown = localizedSentence(example);
  if (part === "credit") return shown.translationId ? `<a class="sentence-credit" href="https://tatoeba.org/sentences/show/${encodeURIComponent(shown.translationId)}"
    target="_blank" rel="noopener noreferrer">Translation · ${escape(shown.translationOwner || "contributors")}</a>` : "";
  return `${notesHTML(shown)}<div data-i18n-study lang="${shown.lang}">${escape(shown.text)}</div>`;
}

// part: "text" for the shown translation, "credit" for its Tatoeba translator link.
export function sentenceTranslationHTML(example, part = "text") {
  const data = { english: example.english, translationId: example.translationId, translationOwner: example.translationOwner,
    translations_by_language: example.translations_by_language };
  const className = part === "credit" ? "sentence-translation-credit" : "sentence-translation";
  return `<div class="${className}" data-part="${part}" data-sentence-translation="${escape(JSON.stringify(data))}">${renderSentence(data, part)}</div>`;
}

function refresh() {
  for (const element of document.querySelectorAll("[data-definitions]")) {
    try { element.innerHTML = renderDefinitions(JSON.parse(element.dataset.definitions)); }
    catch (error) { console.warn("Could not refresh definitions:", error); }
  }
  for (const element of document.querySelectorAll("[data-sentence-translation]")) {
    try { element.innerHTML = renderSentence(JSON.parse(element.dataset.sentenceTranslation), element.dataset.part); }
    catch (error) { console.warn("Could not refresh sentence translation:", error); }
  }
}
document.addEventListener("nihon:language-change", refresh);
