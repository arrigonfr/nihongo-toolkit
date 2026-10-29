import "./practice.css";
import "./study-controls.css";
import "./ui-kit.css";
import "./resources.css";
import "./navigation.js";
import { mountAppearance } from "./appearance.js";
import { SHEETS, buildSheet } from "./cheatsheet-data.js";
import { FORMATS, buildPdf, drawToCanvas, fileName, textExporters, toSVG } from "./cheatsheet-export.js";
import { PAGE } from "./cheatsheet-layout.js";

const META = {
  kana: { label: "Kana", icon: "あ", hue: 340, summary: "Hiragana and katakana charts with dakuten, handakuten, combinations and notes." },
  verb: { label: "Verbs", icon: "動", hue: 150, summary: "Godan, ichidan, する and 来る across 19 forms, plus godan endings." },
  adjective: { label: "Adjectives", icon: "形", hue: 205, summary: "い-adjectives, な-adjectives and いい, plain and polite, 18 forms." }
};
const FORMAT_NOTES = {
  png: "Sharp image, 1985 × 2808 px", pdf: "A4 page (image based)", svg: "Scalable vector graphic", html: "Self-contained page, prints on A4",
  md: "Tables for notes apps", txt: "Aligned plain text", csv: "For spreadsheets and flashcards"
};

mountAppearance(document.querySelector("header"), document.getElementById("themeButton"));

const picker = document.getElementById("sheetPicker");
const preview = document.getElementById("sheetPreview");
const list = document.getElementById("downloadList");
const status = document.getElementById("downloadStatus");
let sheet = null;

for (const { id } of SHEETS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "sheet-tab";
  button.dataset.sheet = id;
  button.style.setProperty("--tab-hue", META[id].hue);
  button.innerHTML = `<span class="sheet-tab-icon" aria-hidden="true">${META[id].icon}</span><span>${META[id].label}</span>`;
  button.addEventListener("click", () => select(id));
  picker.append(button);
}

for (const format of FORMATS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "download-button";
  button.dataset.format = format.id;
  button.innerHTML = `<strong>${format.label}</strong><small>${FORMAT_NOTES[format.id]}</small>`;
  button.addEventListener("click", () => download(format.id, button));
  list.append(button);
}
const print = document.createElement("button");
print.type = "button";
print.className = "download-button";
print.dataset.format = "print";
print.innerHTML = "<strong>Print / Save as PDF</strong><small>Vector text, via the browser dialog</small>";
print.addEventListener("click", () => {
  document.body.dataset.printing = "true";
  window.addEventListener("afterprint", () => delete document.body.dataset.printing, { once: true });
  window.print();
});
list.append(print);

function select(id) {
  sheet = buildSheet(id);
  for (const tab of picker.children) tab.setAttribute("aria-pressed", String(tab.dataset.sheet === id));
  preview.innerHTML = toSVG(sheet, { standalone: false });
  preview.dataset.sheet = id;
  document.getElementById("sheetTitle").textContent = `${sheet.title} · ${sheet.jp}`;
  document.getElementById("sheetSummary").textContent = META[id].summary;
  status.textContent = "";
  history.replaceState(null, "", `#${id}`);
}

function save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function renderCanvas(scale) {
  try { await Promise.all([400, 500, 700, 800].map((weight) => document.fonts.load(`${weight} 16px "Noto Sans JP"`, "あ漢"))); }
  catch { /* fall back to system fonts */ }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(PAGE.w * scale);
  canvas.height = Math.round(PAGE.h * scale);
  drawToCanvas(canvas.getContext("2d"), sheet, scale);
  return canvas;
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))), type, quality));

async function download(id, button) {
  button.disabled = true;
  status.textContent = "Preparing…";
  try {
    const format = FORMATS.find((item) => item.id === id);
    let blob;
    if (id === "png") blob = await toBlob(await renderCanvas(2.5), "image/png");
    else if (id === "pdf") {
      const canvas = await renderCanvas(2.5);
      const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.93)).arrayBuffer());
      blob = new Blob([buildPdf(jpeg, canvas.width, canvas.height, sheet.title)], { type: format.mime });
    } else blob = new Blob([textExporters[id](sheet)], { type: `${format.mime};charset=utf-8` });
    save(blob, fileName(sheet, id));
    status.textContent = `Saved ${fileName(sheet, id)}.`;
  } catch (error) {
    status.textContent = `Could not create the file: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

select(SHEETS.some((item) => `#${item.id}` === location.hash) ? location.hash.slice(1) : "kana");
