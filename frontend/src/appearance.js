import "./appearance.css";
import { navigationPage } from "./routes.js";

const key = "nihon:appearance-v1";
export const colorThemes = { matcha: "Matcha", sakura: "Sakura", ocean: "Ocean", wisteria: "Wisteria", amber: "Amber", sumi: "Sumi" };
const media = window.matchMedia("(prefers-color-scheme: dark)");
const defaultPreference = { palette: "sumi", mode: "dark" };
let preference = { ...defaultPreference };
let initialized = false;

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
    window.alert("This appearance could not be saved. It may not carry over to your other tools.");
  }
}

export function getAppearance() { return { ...preference }; }

export function initializeAppearance() {
  if (initialized) return;
  initialized = true;
  try { restore(localStorage.getItem(key)); }
  catch (error) { console.warn("Could not restore appearance preferences.", error); }
  media.addEventListener("change", render);
  window.addEventListener("storage", (event) => {
    if (event.key !== key && event.key !== null) return;
    try {
      preference = { ...defaultPreference };
      restore(event.newValue);
      render();
    } catch (error) { console.warn("Could not synchronize appearance preferences.", error); }
  });
  render();
}

export function mountAppearance(header, toggle) {
  initializeAppearance();
  const navigation = document.querySelector(".navigation");
  if (navigation) header.prepend(navigation);
  const file = navigationPage(location.pathname);
  const menuItem = [...document.querySelectorAll(".helper-link[data-file]")].find((item) => item.dataset.file === file);
  const description = menuItem?.querySelector(".helper-description")?.textContent.trim().replace(/^\(|\)$/g, "");
  if (description && !header.querySelector(".study-header-description")) {
    const subtitle = document.createElement("p");
    subtitle.className = "study-header-description";
    subtitle.textContent = description;
    header.append(subtitle);
  }
  const controls = document.createElement("div");
  controls.className = "study-appearance";
  const label = document.createElement("details");
  label.className = "study-palette";
  label.innerHTML = `<summary aria-label="Color theme" title="Color theme"><span class="study-palette-dot" aria-hidden="true"></span></summary>
    <select id="colorThemeSelect" aria-label="Color theme" hidden>${Object.entries(colorThemes)
      .map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select>
    <div class="study-palette-options" role="group" aria-label="Color theme">${Object.entries(colorThemes).map(([value, name]) => `<button type="button" data-palette="${value}" aria-label="${name}" title="${name}" aria-pressed="false"><span class="study-palette-dot" aria-hidden="true"></span></button>`).join("")}</div>`;
  label.querySelector("select").addEventListener("change", (event) => setAppearance({ palette: event.target.value }));
  label.addEventListener("click", (event) => {
    const button = event.target.closest("[data-palette]");
    if (!button) return;
    setAppearance({ palette: button.dataset.palette });
    label.open = false;
    label.querySelector("summary").focus();
  });
  document.addEventListener("click", (event) => { if (!label.contains(event.target)) label.open = false; });
  label.addEventListener("keydown", (event) => { if (event.key === "Escape") { label.open = false; label.querySelector("summary").focus(); } });
  controls.append(label);
  if (toggle) {
    toggle.classList.add("study-theme");
    toggle.innerHTML = '<span class="theme-switch-knob" aria-hidden="true"></span>';
    toggle.addEventListener("click", () => setAppearance({ mode: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }));
    controls.append(toggle);
  }
  header.append(controls);
  render();
}
