import "./appearance.css";

const key = "nihon:appearance-v1";
export const colorThemes = { matcha: "Matcha", sakura: "Sakura", ocean: "Ocean", wisteria: "Wisteria", amber: "Amber", sumi: "Sumi · ink" };
const media = window.matchMedia("(prefers-color-scheme: dark)");
let preference = { palette: "matcha", mode: "system" };
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
    toggle.dataset.icon = mode === "dark" ? "☼" : "☾";
    toggle.setAttribute("aria-label", `Switch to ${mode === "dark" ? "light" : "dark"} mode`);
    toggle.title = toggle.getAttribute("aria-label");
  }
  const selector = document.getElementById("colorThemeSelect");
  if (selector) selector.value = preference.palette;
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
      preference = { palette: "matcha", mode: "system" };
      restore(event.newValue);
      render();
    } catch (error) { console.warn("Could not synchronize appearance preferences.", error); }
  });
  render();
}

export function mountAppearance(header, toggle) {
  initializeAppearance();
  const controls = document.createElement("div");
  controls.className = "study-appearance";
  const label = document.createElement("label");
  label.className = "study-palette";
  label.innerHTML = `<span class="study-palette-dot" aria-hidden="true"></span><span class="sr-only">Color theme</span>
    <select id="colorThemeSelect" aria-label="Color theme">${Object.entries(colorThemes)
      .map(([value, name]) => `<option value="${value}">${name}</option>`).join("")}</select>`;
  label.querySelector("select").addEventListener("change", (event) => setAppearance({ palette: event.target.value }));
  controls.append(label);
  if (toggle) {
    toggle.classList.add("study-theme");
    toggle.addEventListener("click", () => setAppearance({ mode: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }));
    controls.append(toggle);
  }
  header.append(controls);
  render();
}
