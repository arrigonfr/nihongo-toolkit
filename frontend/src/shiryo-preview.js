import "./practice.css";
import "./study-controls.css";
import "./ui-kit.css";
import "./resources.css";
import "./shiryo-preview.css";
import "./navigation.js";
import { mountAppearance } from "./appearance.js";
import { mountSupport } from "./study-controls.js";
import previews from "../previews/shiryo/manifest.json";

const images = import.meta.glob("../previews/shiryo/*.png", { eager: true, query: "?url", import: "default" });
mountAppearance(document.querySelector("header"), document.getElementById("themeButton"));
mountSupport();

const picker = document.getElementById("sheetPicker");
const preview = document.getElementById("sheetPreview");
const image = document.getElementById("sheetPreviewImage");
const status = document.getElementById("previewStatus");
image.addEventListener("load", () => { status.textContent = ""; });
image.addEventListener("error", () => {
  console.error("Could not load the sheet preview.", image.src);
  status.textContent = "Could not load this preview. Please refresh the page to try again.";
});

function selectSheet(sheet) {
  document.getElementById("sheetTitle").textContent = sheet.title;
  preview.dataset.sheet = sheet.id;
  image.alt = `${sheet.title}: cropped, watermarked sample`;
  image.src = images[`../previews/shiryo/${sheet.id}.png`];
  status.textContent = "";
  for (const button of picker.querySelectorAll("[data-sheet]")) {
    button.setAttribute("aria-pressed", String(button.dataset.sheet === sheet.id));
  }
}

for (const sheet of previews) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-tab";
  button.dataset.sheet = sheet.id;
  button.style.setProperty("--tab-hue", sheet.hue);
  const icon = document.createElement("span");
  icon.className = "sheet-tab-icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = sheet.icon;
  const label = document.createElement("span");
  label.textContent = sheet.label;
  button.append(icon, label);
  button.addEventListener("click", () => {
    selectSheet(sheet);
    history.replaceState(null, "", `#${sheet.id}`);
  });
  picker.append(button);
}

function selectFromHash() {
  selectSheet(previews.find((sheet) => `#${sheet.id}` === location.hash) || previews[0]);
}
window.addEventListener("hashchange", selectFromHash);
selectFromHash();
