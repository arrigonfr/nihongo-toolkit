import "./study-controls.css";
import "./settings-panel.css";
import "./select-controls.css";
import "./ui-kit.css";
import "./navigation.js";
import { alignFuriganaRuby, formatFurigana } from "./furigana.js";
import { romanizeKana } from "./romanize.js";
import { mountAppearance } from "./appearance.js";
import { mountToolHelp } from "./tool-help.js";
import { mountFontControls } from "./japanese-fonts.js";
import { mountLevelControls } from "./jlpt-levels.js";

const key = "nihon:study-controls-v1";
const escape = (value) => String(value ?? "").replace(/[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const study = { audio: true, furigana: true, romaji: false };
try {
  const saved = JSON.parse(localStorage.getItem(key) || "{}");
  for (const name of Object.keys(study)) if (typeof saved[name] === "boolean") study[name] = saved[name];
} catch (error) { console.warn("Could not read study preferences.", error); }

export function japaneseHTML(word, reading = "", base = word) {
  return `<span class="study-japanese" lang="ja">${alignFuriganaRuby(word, reading, base)}</span>${reading ? `<span class="study-romaji">${escape(romanizeKana(reading))}</span>` : ""}`;
}
export function audioHTML(text) {
  return `<button type="button" class="study-audio" data-study-speak="${escape(text)}" aria-label="Pronounce ${escape(text)}">▶</button>`;
}
export function readingsHTML(readings = []) {
  return readings.map((reading) => {
    const spoken = reading.replace(/[.\-]/g, "");
    return `<span class="study-reading"><span lang="ja">${escape(reading)}</span><span class="study-romaji">(${escape(romanizeKana(spoken))})</span>${audioHTML(spoken)}</span>`;
  }).join(" ");
}
export function speakJapanese(text) {
  if (!study.audio || !text) return;
  if (!window.speechSynthesis) {
    window.alert("Speech playback is not supported by this browser.");
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  const voices = window.speechSynthesis.getVoices().filter((voice) => /^ja(?:[-_]|$)/i.test(voice.lang));
  const quality = (voice) => /premium|enhanced|natural|neural/i.test(voice.name) ? 3
    : /google|microsoft/i.test(voice.name) ? 2 : voice.default ? 1 : 0;
  utterance.voice = voices.sort((a, b) => quality(b) - quality(a))[0] || null;
  utterance.rate = 0.9;
  utterance.onerror = (error) => {
    if (!["interrupted", "canceled"].includes(error.error)) {
      console.error("Japanese speech playback failed.", error);
      window.alert("Japanese speech playback is unavailable. Check your device's Japanese speech voices.");
    }
  };
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function mountSupport() {
  const intro = document.querySelector(".intro, .cw-intro");
  if (!intro || intro.querySelector(".study-support")) return;
  const content = document.createElement("div");
  content.className = "study-intro-content";
  content.append(...intro.childNodes);
  content.insertAdjacentHTML("beforeend", `<p class="study-contribute">
    Have a suggestion or found a bug? <a href="https://github.com/arrigonfr/nihongo-toolkit/issues" target="_blank" rel="noopener noreferrer">Open an issue</a>
    or <a href="https://github.com/arrigonfr/nihongo-toolkit" target="_blank" rel="noopener noreferrer">send a pull request on GitHub</a>.
  </p>`);
  intro.append(content);
  intro.classList.add("study-intro");
  intro.insertAdjacentHTML("beforeend", `<aside class="study-support" aria-label="Support these tools">
    <form action="https://www.paypal.com/ncp/payment/BGUN4RBRVZKKJ" method="post" target="_blank" rel="noopener noreferrer">
      <button class="pp-BGUN4RBRVZKKJ" type="submit" aria-label="Buy me a coffee with PayPal"><span class="study-support-brand" aria-hidden="true">PayPal</span><span class="study-support-label">Buy me a coffee</span></button>
      <img src="https://www.paypalobjects.com/images/Debit_Credit.svg" alt="Accepted payment cards" loading="lazy">
      <span>Con la tecnología de <img src="https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-wordmark-color.svg" alt="PayPal" loading="lazy"></span>
    </form>
  </aside>`);
}
export function sentenceHTML(text, markup) {
  const reading = markup?.replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1");
  return `<span class="study-japanese" lang="ja">${markup ? formatFurigana(markup) : escape(text)}</span>${reading ? `<span class="study-romaji">${escape(romanizeKana(reading))}</span>` : ""}${audioHTML(text)}`;
}
export function mountStudyControls({ furigana = true, romaji = true, onChange = () => {} } = {}) {
  mountSupport();
  mountFontControls();
  mountLevelControls();
  window.speechSynthesis?.getVoices();
  const header = document.querySelector("header");
  const theme = document.querySelector("#themeButton, #themeCycleBtn");
  header.classList.add("study-header");
  header.classList.add("study-embedded");
  const toolbar = document.createElement("div");
  toolbar.className = "study-toolbar";
  toolbar.setAttribute("aria-label", "Study options");
  for (const [name, visible] of Object.entries({ audio: true, furigana, romaji })) {
    const button = document.createElement("button");
    button.type = "button";
    button.id = `${name}QuickToggle`;
    button.hidden = !visible;
    button.addEventListener("click", () => {
      study[name] = !study[name];
      try { localStorage.setItem(key, JSON.stringify(study)); }
      catch (error) { console.warn("Could not save study preferences.", error); }
      refresh();
      onChange(study);
    });
    toolbar.append(button);
  }
  header.append(toolbar);
  mountAppearance(header, theme);
  mountToolHelp();
  function refresh() {
    for (const name of Object.keys(study)) {
      document.documentElement.dataset[`study${name[0].toUpperCase()}${name.slice(1)}`] = String(study[name]);
      const button = toolbar.querySelector(`#${name}QuickToggle`);
      button.textContent = `${{ audio: study.audio ? "🔊 Audio" : "🔇 Audio", furigana: "あ Furigana", romaji: "Aa Romaji" }[name]} ${study[name] ? "On" : "Off"}`;
      button.setAttribute("aria-pressed", String(study[name]));
    }
    if (!study.audio) window.speechSynthesis?.cancel();
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== key) return;
    try {
      const saved = JSON.parse(event.newValue || "{}");
      for (const name of Object.keys(study)) if (typeof saved[name] === "boolean") study[name] = saved[name];
      refresh();
      onChange(study);
    } catch (error) { console.warn("Could not synchronize study preferences.", error); }
  });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-study-speak]");
    if (!button || !study.audio) return;
    speakJapanese(button.dataset.studySpeak);
  });
  refresh();
  window.addEventListener("pagehide", () => window.speechSynthesis?.cancel());
  return {
    setPreferences(update) {
      for (const name of Object.keys(study)) if (typeof update[name] === "boolean") study[name] = update[name];
      try { localStorage.setItem(key, JSON.stringify(study)); }
      catch (error) { console.warn("Could not save study preferences.", error); }
      refresh();
      onChange(study);
    }
  };
}
