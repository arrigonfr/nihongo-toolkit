import "./appearance.css";
import { translateInterface } from "./interface-i18n.js";

const key = "nihon:appearance-v1";
const languageKey = "nihon:language-v1";
export const colorThemes = { matcha: "Matcha", sakura: "Sakura", ocean: "Ocean", wisteria: "Wisteria", amber: "Amber", sumi: "Sumi" };
export const interfaceLanguages = { en: "English", es: "Español", pt: "Português" };
// Hidden until study content is fully translated; saved choices are kept but not applied.
export const languageSelectionEnabled = import.meta.env.VITE_LANGUAGE_SELECTION === "true";
const languageLabels = { en: "Interface language", es: "Idioma de la interfaz", pt: "Idioma da interface" };
const languageFlags = {
  en: '<path fill="#fff" d="M0 0h24v16H0z"/><path stroke="#b31942" stroke-width="1.23" d="M0 .62h24M0 3.08h24M0 5.54h24M0 8h24M0 10.46h24M0 12.92h24M0 15.38h24"/><path fill="#0a3161" d="M0 0h10v8.62H0z"/><path stroke="#fff" stroke-linecap="round" stroke-dasharray=".1 1.65" d="M1.5 2h7M1.5 4.3h7M1.5 6.6h7"/>',
  es: '<path fill="#aa151b" d="M0 0h24v16H0z"/><path fill="#f1bf00" d="M0 4h24v8H0z"/><path fill="#aa151b" d="M5 6h4v3a2 2 0 0 1-4 0z"/><path fill="#fff" d="M5.5 7h1v2h-1zm2 0h1v2h-1z"/>',
  pt: '<path fill="#009b3a" d="M0 0h24v16H0z"/><path fill="#ffdf00" d="m12 2 10 6-10 6L2 8z"/><circle cx="12" cy="8" r="3.5" fill="#002776"/><path fill="none" stroke="#fff" stroke-width=".8" d="M8.6 7.3a8 8 0 0 1 6.4 2.3"/>'
};
const media = window.matchMedia("(prefers-color-scheme: dark)");
const defaultPreference = { palette: "sumi", mode: "dark" };
let preference = { ...defaultPreference };
let language = "en";
let initialized = false;
let storageNoticeTimer;

function showStorageNotice(message) {
  let banner = document.querySelector(".study-storage-notice");
  if (!banner) {
    banner = document.createElement("div");
    banner.className = "study-storage-notice";
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    const text = document.createElement("span");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "study-storage-notice-close";
    close.setAttribute("aria-label", "Dismiss notice");
    close.textContent = "×";
    close.addEventListener("click", () => { banner.hidden = true; });
    banner.append(text, close);
    document.body.append(banner);
  }
  banner.firstElementChild.textContent = message;
  banner.hidden = false;
  clearTimeout(storageNoticeTimer);
  storageNoticeTimer = setTimeout(() => { banner.hidden = true; }, 8000);
}

function browserLanguage() {
  if (!languageSelectionEnabled) return "en";
  for (const candidate of navigator.languages || [navigator.language]) {
    const code = candidate.split("-")[0].toLowerCase();
    if (Object.hasOwn(interfaceLanguages, code)) return code;
  }
  return "en";
}

function renderLanguage() {
  document.documentElement.dataset.interfaceLanguage = language;
  const picker = document.querySelector(".study-language");
  if (picker) {
    const summary = picker.querySelector("summary");
    const label = `${languageLabels[language]}: ${interfaceLanguages[language]}`;
    summary.lang = language;
    summary.setAttribute("aria-label", label);
    summary.title = label;
    summary.innerHTML = flagIcon(language);
    const group = picker.querySelector("[role=group]");
    group.lang = language;
    group.setAttribute("aria-label", languageLabels[language]);
    for (const button of picker.querySelectorAll("[data-language]")) {
      button.setAttribute("aria-pressed", String(button.dataset.language === language));
    }
  }
  document.dispatchEvent(new CustomEvent("nihon:language-change", { detail: language }));
}

function flagIcon(code) {
  return `<svg class="study-language-flag" viewBox="0 0 24 16" aria-hidden="true">${languageFlags[code]}</svg>`;
}

export function setInterfaceLanguage(value) {
  if (!Object.hasOwn(interfaceLanguages, value)) throw new Error("Unknown interface language.");
  if (!languageSelectionEnabled) throw new Error("Interface language selection is disabled.");
  language = value;
  renderLanguage();
  try { localStorage.setItem(languageKey, language); }
  catch (error) {
    console.warn("Could not save interface language preference.", error);
    showStorageNotice(translateInterface("This language preference could not be saved. It may not carry over to your other tools."));
  }
}

function restore(value) {
  const saved = JSON.parse(value || "{}");
  if (saved.palette in colorThemes) preference.palette = saved.palette;
  if (["system", "light", "dark"].includes(saved.mode)) preference.mode = saved.mode;
}

function render() {
  const root = document.documentElement;
  const mode = preference.mode === "system" ? (media.matches ? "dark" : "light") : preference.mode;
  root.dataset.colorTheme = preference.palette;
  root.dataset.theme = mode;
  const toggle = document.querySelector("#themeButton, #themeCycleBtn");
  if (toggle) {
    toggle.dataset.mode = mode;
    toggle.setAttribute("aria-pressed", String(mode === "dark"));
    toggle.setAttribute("aria-label", `Switch to ${mode === "dark" ? "light" : "dark"} mode`);
    toggle.title = toggle.getAttribute("aria-label");
  }
  const selector = document.getElementById("colorThemeSelect");
  if (selector) selector.value = preference.palette;
  for (const button of document.querySelectorAll("[data-palette]")) button.setAttribute("aria-pressed", String(button.dataset.palette === preference.palette));
  const appearance = document.getElementById("setting-appearance");
  if (appearance) appearance.value = preference.mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = getComputedStyle(root).getPropertyValue("--page").trim();
}

export function setAppearance(update) {
  if (update.palette && !(update.palette in colorThemes)) throw new Error("Unknown color theme.");
  if (update.mode && !["system", "light", "dark"].includes(update.mode)) throw new Error("Unknown appearance mode.");
  preference = { ...preference, ...update };
  render();
  try { localStorage.setItem(key, JSON.stringify(preference)); }
  catch (error) {
    console.warn("Could not save appearance preferences.", error);
    showStorageNotice(translateInterface("This appearance could not be saved. It may not carry over to your other tools."));
  }
}

export function getAppearance() { return { ...preference }; }

export function initializeAppearance() {
  if (initialized) return;
  initialized = true;
  try { restore(localStorage.getItem(key)); }
  catch (error) { console.warn("Could not restore appearance preferences.", error); }
  try {
    const savedLanguage = languageSelectionEnabled ? localStorage.getItem(languageKey) : null;
    language = Object.hasOwn(interfaceLanguages, savedLanguage) ? savedLanguage : browserLanguage();
  } catch (error) {
    console.warn("Could not restore interface language preference.", error);
    language = browserLanguage();
  }
  media.addEventListener("change", render);
  window.addEventListener("storage", (event) => {
    if (languageSelectionEnabled && (event.key === languageKey || event.key === null)) {
      try {
        language = Object.hasOwn(interfaceLanguages, event.newValue) ? event.newValue : browserLanguage();
        renderLanguage();
      } catch (error) { console.warn("Could not synchronize interface language preference.", error); }
    }
    if (event.key !== key && event.key !== null) return;
    try {
      preference = { ...defaultPreference };
      restore(event.newValue);
      render();
    } catch (error) { console.warn("Could not synchronize appearance preferences.", error); }
  });
  render();
  renderLanguage();
}

function bindPicker(picker, optionSelector, onSelect) {
  const summary = picker.querySelector("summary");
  function close() {
    picker.open = false;
    summary.focus();
  }
  picker.addEventListener("click", (event) => {
    const option = event.target.closest(optionSelector);
    if (!option) return;
    onSelect(option);
    close();
  });
  document.addEventListener("click", (event) => { if (!picker.contains(event.target)) picker.open = false; });
  picker.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && picker.open) close();
  });
}

export function mountAppearance(header, toggle) {
  initializeAppearance();
  const navigation = document.querySelector(".navigation");
  if (navigation) header.prepend(navigation);
  const controls = document.createElement("div");
  controls.className = "study-appearance";
  if (languageSelectionEnabled) {
    const languagePicker = document.createElement("details");
    languagePicker.className = "study-language";
    languagePicker.innerHTML = `<summary></summary><div class="study-language-options" role="group">${Object.entries(interfaceLanguages)
      .map(([code, name]) => `<button type="button" data-language="${code}" lang="${code}" aria-label="${name}" title="${name}">${flagIcon(code)}</button>`).join("")}</div>`;
    bindPicker(languagePicker, "[data-language]", (option) => setInterfaceLanguage(option.dataset.language));
    controls.append(languagePicker);
  }
  const label = document.createElement("details");
  label.className = "study-palette";
  label.innerHTML = `<summary aria-label="Color theme" title="Color theme"><span class="study-palette-dot" aria-hidden="true"></span></summary>
    <select id="colorThemeSelect" aria-label="Color theme" hidden>${Object.entries(colorThemes)
      .map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select>
    <div class="study-palette-options" role="group" aria-label="Color theme">${Object.entries(colorThemes).map(([value, name]) => `<button type="button" data-palette="${value}" aria-label="${name}" title="${name}" aria-pressed="false"><span class="study-palette-dot" aria-hidden="true"></span></button>`).join("")}</div>`;
  label.querySelector("select").addEventListener("change", (event) => setAppearance({ palette: event.target.value }));
  bindPicker(label, "[data-palette]", (option) => setAppearance({ palette: option.dataset.palette }));
  controls.append(label);
  if (toggle) {
    toggle.classList.add("study-theme");
    toggle.innerHTML = '<span class="theme-switch-knob" aria-hidden="true"></span>';
    toggle.addEventListener("click", () => setAppearance({ mode: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }));
    controls.append(toggle);
  }
  header.append(controls);
  render();
  renderLanguage();
}
