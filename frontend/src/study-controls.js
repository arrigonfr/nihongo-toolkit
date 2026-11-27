import "./study-controls.css";
import { escapeHTML as escape } from "./html.js";
import "./tool-intro.css";
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
import { createSupportButton } from "./support.js";
import { cancelLocalSpeech, speakLocalJapanese } from "./local-speech.js";
import { japaneseVoice } from "./japanese-voice.js";
import { audioIcon } from "./audio-icon.js";

const key = "nihon:study-controls-v1";
export const study = { audio: true, furigana: true, romaji: false };
let speechGeneration = 0;
try {
  const saved = JSON.parse(localStorage.getItem(key) || "{}");
  for (const name of Object.keys(study)) if (typeof saved[name] === "boolean") study[name] = saved[name];
} catch (error) { console.warn("Could not read study preferences.", error); }

export function japaneseHTML(word, reading = "", base = word) {
  return `<span class="study-japanese" lang="ja">${alignFuriganaRuby(word, reading, base)}</span>${reading ? `<span class="study-romaji">${escape(romanizeKana(reading))}</span>` : ""}`;
}
export function audioHTML(text) {
  return `<button type="button" class="study-audio" data-study-speak="${escape(text)}" aria-label="Pronounce ${escape(text)}">${audioIcon}</button>`;
}
export function readingsHTML(readings = []) {
  return readings.map((reading) => {
    const spoken = reading.replace(/[.\-]/g, "");
    return `<span class="study-reading"><span lang="ja">${escape(reading)}</span><span class="study-romaji">(${escape(romanizeKana(spoken))})</span>${audioHTML(spoken)}</span>`;
  }).join(" ");
}
export function speakJapanese(text) {
  if (!study.audio || !text) return;
  const voice = japaneseVoice(window.speechSynthesis?.getVoices() || []);
  if (!voice || !window.SpeechSynthesisUtterance) {
    void speakLocalJapanese(text);
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ja-JP";
  utterance.voice = voice;
  const generation = speechGeneration;
  utterance.onerror = (error) => {
    if (study.audio && generation === speechGeneration && !["interrupted", "canceled"].includes(error.error)) {
      console.warn("Japanese device voice failed; trying Japanese synthesis.", error);
      void speakLocalJapanese(text);
    }
  };
  window.speechSynthesis.speak(utterance);
}

export function mountSupport() {
  const intro = document.querySelector(".intro, .cw-intro");
  if (!intro || document.querySelector(".study-support")) return;
  const content = document.createElement("div");
  content.className = "study-intro-content";
  content.append(...intro.childNodes);
  intro.append(content);
  intro.classList.add("study-intro", "tool-intro");
  const header = document.querySelector("header");
  let toolbar = header.querySelector(".study-toolbar");
  if (!toolbar) {
    toolbar = document.createElement("div");
    toolbar.className = "study-toolbar";
    toolbar.setAttribute("aria-label", "Study options");
    header.classList.add("study-header");
    header.append(toolbar);
  }
  toolbar.append(createSupportButton());
}
export function sentenceHTML(text, markup) {
  const reading = markup?.replace(/\{[^{}|]+\|([^{}]+)\}/g, "$1");
  return `<span class="study-japanese" lang="ja">${markup ? formatFurigana(markup) : escape(text)}</span>${reading ? `<span class="study-romaji">${escape(romanizeKana(reading))}</span>` : ""}${audioHTML(text)}`;
}
export function mountStudyControls({ audio = true, furigana = true, romaji = true, help, onChange = () => {} } = {}) {
  mountSupport();
  mountFontControls();
  mountLevelControls();
  window.speechSynthesis?.getVoices();
  const header = document.querySelector("header");
  const theme = document.querySelector("#themeButton, #themeCycleBtn");
  header.classList.add("study-header");
  header.classList.add("study-embedded");
  for (const panel of document.querySelectorAll("details#settingsPanel, details#settingsDrawer, details:has(> #settings)")) panel.open = true;
  const toolbar = header.querySelector(".study-toolbar");
  for (const [name, visible] of Object.entries({ audio, furigana, romaji })) {
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
    toolbar.insertBefore(button, toolbar.querySelector(".study-support"));
  }
  header.append(toolbar);
  mountAppearance(header, theme);
  mountToolHelp(help);
  function refresh() {
    for (const name of Object.keys(study)) {
      document.documentElement.dataset[`study${name[0].toUpperCase()}${name.slice(1)}`] = String(study[name]);
      const button = toolbar.querySelector(`#${name}QuickToggle`);
      button.textContent = { audio: study.audio ? "🔊 Audio" : "🔇 Audio", furigana: "あ Furigana", romaji: "Aa Romaji" }[name];
      button.title = `${study[name] ? "Disable" : "Enable"} ${name}`;
      button.setAttribute("aria-pressed", String(study[name]));
    }
    if (!study.audio) {
      speechGeneration++;
      window.speechSynthesis?.cancel();
      cancelLocalSpeech();
    }
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
  window.addEventListener("pagehide", () => {
    speechGeneration++;
    window.speechSynthesis?.cancel();
    cancelLocalSpeech();
  });
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
