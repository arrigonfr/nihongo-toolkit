import { API_BASE } from "./api.js";
import "./feedback.css";
import { japaneseHTML, sentenceHTML, audioHTML } from "./study-controls.js";

export const escape = (value) => String(value ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function sentencesHTML(examples, query = "") {
  const offset = Math.floor(Math.random() * examples.length);
  const ordered = [...examples.slice(offset), ...examples.slice(0, offset)];
  const content = `<div class="sentence-list">${ordered.slice(0, 3).map((item) => `
    <div class="sentence-item" data-sentence-text="${escape(item.japanese)}">
      <div lang="ja" class="sentence-japanese">${sentenceHTML(item.japanese, item.furigana)}</div>
      <div>${escape(item.english)}</div>
      ${item.id ? `<a class="sentence-credit" href="https://tatoeba.org/sentences/show/${encodeURIComponent(item.id)}"
        target="_blank" rel="noopener noreferrer">Tatoeba · ${escape(item.owner || "contributors")} · ${escape(item.license || "CC BY 2.0 FR")}</a>` : ""}
      ${item.translationId ? `<a class="sentence-credit" href="https://tatoeba.org/sentences/show/${encodeURIComponent(item.translationId)}"
        target="_blank" rel="noopener noreferrer">Translation · ${escape(item.translationOwner || "contributors")}</a>` : ""}
    </div>`).join("")}</div>`;
  if (!query) return content;
  return `<div class="sentence-panel" data-sentence-query="${escape(query)}">
    <div class="sentence-results">${examples.length ? content : "No translated examples found for this word."}</div>
    <div class="sentence-actions"><button type="button" class="sentence-next">Another example</button>
    <span class="sentence-status" role="status" aria-live="polite"></span></div></div>`;
}

async function loadSentenceResult(query, signal, { random = false, exclude = [] } = {}) {
  const params = new URLSearchParams({ q: query });
  if (random) {
    params.set("random", "1");
    params.set("exclude", JSON.stringify(exclude.slice(0, 10)));
  }
  const response = await fetch(`${API_BASE}/api/sentences?${params}`, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error("Example sentences are temporarily unavailable. Please try again in a moment.");
  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error("Example sentences could not be read. Please retry.");
  const examples = payload.data.map((item) => {
    const translation = item.translations?.find((t) => t.lang === "eng");
    return {
      id: item.id, japanese: item.text, furigana: item.furigana, english: translation?.text ?? "",
      owner: item.owner, translationOwner: translation?.owner, translationId: translation?.id, license: item.license
    };
  });
  return { examples, warning: payload.warning || "" };
}

export async function loadSentences(query, signal) {
  return (await loadSentenceResult(query, signal)).examples;
}

const requests = new Map();
const cache = new Map();
const mounts = new WeakMap();
export async function mountSentenceExamples(element, query, initial = []) {
  const token = {};
  mounts.set(element, token);
  element.innerHTML = sentencesHTML(initial, query);
  if (initial.length) return initial;
  element.querySelector(".sentence-results").textContent = "Looking for example sentences…";
  element.querySelector(".sentence-next").disabled = true;
  try {
    if (!cache.has(query) && !requests.has(query)) {
      requests.set(query, loadSentences(query).then((items) => {
        if (items.length) {
          if (cache.size >= 200) cache.delete(cache.keys().next().value);
          cache.set(query, items);
        }
        return items;
      }).finally(() => requests.delete(query)));
    }
    const items = cache.get(query) || await requests.get(query);
    if (element.isConnected && mounts.get(element) === token) element.innerHTML = sentencesHTML(items, query);
    return items;
  } catch (error) {
    if (element.isConnected && mounts.get(element) === token) {
      element.querySelector(".sentence-status").textContent = error.message;
      element.querySelector(".sentence-next").textContent = "Retry examples";
      element.querySelector(".sentence-next").disabled = false;
      element.querySelector(".sentence-results").textContent = "Examples are temporarily unavailable.";
    }
    console.warn("Example sentence lookup failed:", error);
    return [];
  }
}

document.addEventListener("click", async (event) => {
  const button = event.target.closest(".sentence-next");
  if (!button || button.disabled) return;
  const panel = button.closest(".sentence-panel");
  const status = panel.querySelector(".sentence-status");
  const exclude = [...panel.querySelectorAll("[data-sentence-text]")].map((item) => item.dataset.sentenceText);
  button.disabled = true;
  status.textContent = "Finding another example…";
  try {
    const { examples, warning } = await loadSentenceResult(panel.dataset.sentenceQuery, undefined, { random: true, exclude });
    if (!panel.isConnected) return;
    if (examples.length) panel.querySelector(".sentence-results").innerHTML = sentencesHTML(examples);
    status.textContent = warning || (!examples.length ? "No translated examples found."
      : examples.every((item) => exclude.includes(item.japanese)) ? "No different example is available right now." : "");
    button.textContent = "Another example";
  } catch (error) {
    if (panel.isConnected) { status.textContent = error.message; button.textContent = "Retry examples"; }
  } finally { button.disabled = false; }
});

export function wordsHTML(words) {
  return `<ul class="example-word-list">${words.map((item) =>
    `<li><span lang="ja" class="example-word">${japaneseHTML(item.word, item.reading)}</span>${audioHTML(item.reading || item.word)}
      <span class="example-definition">${item.meanings.map(escape).join("; ")}</span></li>`).join("")}</ul>`;
}
