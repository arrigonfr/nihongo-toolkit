import "./practice.css";
import "./study-controls.css";
import "./ui-kit.css";
import "./resources.css";
import "./shiryo-preview.css";
import "./navigation.js";
import { mountAppearance } from "./appearance.js";
import { mountSupport } from "./study-controls.js";
import { mountHelpDialog } from "./tool-help.js";
import { kanaSheet } from "./kana-sheet-data.js";
import { FORMATS, buildPdf, fileName, textExporters, toSVG } from "./cheatsheet-export.js";
import { PAGE } from "./cheatsheet-layout.js";
import previews from "../previews/shiryo/manifest.json";

const images = import.meta.glob("../previews/shiryo/*.png", { eager: true, query: "?url", import: "default" });
const SUMMARIES = {
  kana: "Hiragana and katakana charts with dakuten, handakuten, combinations and notes.",
  verb: "Godan, ichidan, する and 来る across 19 forms, plus godan endings.",
  adjective: "い-adjectives, な-adjectives and いい, plain and polite, 18 forms.",
  particles: "Particle roles, connections and nuances with examples.",
  counters: "Common counters, irregular readings and examples.",
  radicals: "Common forms and examples, plus the 214 traditional radicals.",
  ambiguities: "Choose between confusable words and particles with examples.",
  lookalikes: "Visual clues for commonly confused kanji.",
  "grammar-contrasts": "Conditionals, appearance, obligation, passive forms and intention.",
  worksheet: "Printable kanji and kana stroke-order handwriting practice sheets."
};
const FORMAT_NOTES = {
  png: "Sharp image, 1985 × 2808 px", pdf: "A4 page (image based)", svg: "Scalable vector graphic", html: "Self-contained page, prints on A4",
  md: "Tables for notes apps", txt: "Aligned plain text", csv: "For spreadsheets and flashcards"
};

mountAppearance(document.querySelector("header"), document.getElementById("themeButton"));
mountSupport();
mountHelpDialog(["Shiryō", "Download the free Hiragana & Katakana cheatsheet or browse watermarked previews of the other printable study sheets."], "shiryo-preview");

const picker = document.getElementById("sheetPicker");
const preview = document.getElementById("sheetPreview");
const image = document.getElementById("sheetPreviewImage");
const status = document.getElementById("previewStatus");
const sheetTitle = document.getElementById("sheetTitle");
const sheetSummary = document.getElementById("sheetSummary");
const previewNotice = document.getElementById("previewNotice");
const kanaDownloads = document.getElementById("kanaDownloads");
const grayscale = document.getElementById("sheetGrayscale");
const controls = document.getElementById("referenceControls");
const list = document.getElementById("downloadList");
const downloadStatus = document.getElementById("downloadStatus");

const kana = kanaSheet();
let activeId = "kana";

image.addEventListener("load", () => { status.textContent = ""; });
image.addEventListener("error", () => {
  console.error("Could not load the sheet preview.", image.src);
  status.textContent = "Could not load this preview. Please refresh the page to try again.";
});

const paper = () => controls.querySelector('[data-reference="paper"]').value;
const orientation = () => controls.querySelector('[data-reference="orientation"]').value;
function dimensions() {
  const sizes = { a4: [794, 1123], letter: [816, 1056], legal: [816, 1344] };
  const size = sizes[paper()];
  return orientation() === "landscape" ? [...size].reverse() : size;
}
function pageLayout() {
  const [w, h] = dimensions();
  return { ...PAGE, w, h, label: { a4: "A4", letter: "US Letter", legal: "US Legal" }[paper()] };
}
function pageSVG(standalone = true) {
  return toSVG(kana, { standalone, grayscale: grayscale.checked, page: pageLayout() });
}
function renderKana() {
  preview.classList.remove("preview-paper");
  preview.innerHTML = pageSVG(false);
  preview.style.aspectRatio = dimensions().join(" / ");
  const [width, height] = dimensions();
  const notes = {
    ...FORMAT_NOTES,
    png: `Sharp image, ${Math.round(width * 2.5)} × ${Math.round(height * 2.5)} px`,
    pdf: `${pageLayout().label} ${orientation()} (image based)`,
    html: `Self-contained page, prints on ${pageLayout().label}`
  };
  for (const button of list.querySelectorAll("[data-format]")) {
    const format = button.dataset.format;
    if (notes[format]) button.querySelector("small").textContent = notes[format];
  }
}

controls.addEventListener("change", () => { if (activeId === "kana") renderKana(); });
grayscale.addEventListener("change", () => { if (activeId === "kana") renderKana(); });

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
  const [width, height] = dimensions();
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(pageSVG())}`;
  await img.decode();
  canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}
const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))), type, quality));

async function downloadKana(id, button) {
  button.disabled = true;
  downloadStatus.textContent = "Preparing…";
  try {
    const format = FORMATS.find((item) => item.id === id);
    let blob;
    if (id === "png") blob = await toBlob(await renderCanvas(2.5), "image/png");
    else if (id === "pdf") {
      const canvas = await renderCanvas(2.5);
      const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.93)).arrayBuffer());
      blob = new Blob([buildPdf(jpeg, canvas.width, canvas.height, kana.title, dimensions())], { type: format.mime });
    } else if (id === "svg") blob = new Blob([pageSVG()], { type: format.mime });
    else if (id === "html") blob = new Blob([`<!doctype html><meta charset="utf-8"><title>${kana.title}</title><style>@page{size:${paper()} ${orientation()};margin:0}body{margin:0}svg{display:block;width:100%;height:auto}</style>${pageSVG()}`], { type: format.mime });
    else blob = new Blob([textExporters[id](kana, { grayscale: grayscale.checked })], { type: `${format.mime};charset=utf-8` });
    save(blob, fileName(kana, id));
    downloadStatus.textContent = `Saved ${fileName(kana, id)}.`;
  } catch (error) {
    downloadStatus.textContent = `Could not create the file: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

for (const format of FORMATS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "download-button";
  button.dataset.format = format.id;
  button.innerHTML = `<strong>${format.label}</strong><small>${FORMAT_NOTES[format.id]}</small>`;
  button.addEventListener("click", () => downloadKana(format.id, button));
  list.append(button);
}
const print = document.createElement("button");
print.type = "button";
print.className = "download-button";
print.dataset.format = "print";
print.innerHTML = "<strong>Print / Save as PDF</strong><small>Vector text, via the browser dialog</small>";
print.addEventListener("click", async () => {
  const frame = document.createElement("iframe");
  frame.title = "Print cheatsheet";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
  const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => `<link rel="stylesheet" href="${link.href}">`).join("");
  const size = `${paper()} ${orientation()}`;
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${stylesheets}<style>@page{size:${size};margin:0}body{margin:0}body>svg{display:block;width:100%;height:auto}</style></head><body>${pageSVG()}</body></html>`;
  const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; });
  document.body.append(frame);
  const cleanup = () => { frame.remove(); window.removeEventListener("afterprint", cleanup); };
  try {
    await loaded;
    await frame.contentDocument.fonts.ready;
    frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
    window.addEventListener("afterprint", cleanup, { once: true });
    frame.contentWindow.focus();
    frame.contentWindow.print();
  } catch (error) {
    cleanup();
    downloadStatus.textContent = `Could not print: ${error.message}`;
  }
});
list.append(print);

function selectSheet(sheet) {
  activeId = sheet.id;
  preview.dataset.sheet = sheet.id;
  sheetSummary.textContent = SUMMARIES[sheet.id] || "";
  status.textContent = "";
  downloadStatus.textContent = "";
  for (const button of picker.querySelectorAll("[data-sheet]")) {
    button.setAttribute("aria-pressed", String(button.dataset.sheet === sheet.id));
  }
  if (sheet.id === "kana") {
    sheetTitle.textContent = `${kana.title} · ${kana.jp}`;
    previewNotice.hidden = true;
    kanaDownloads.hidden = false;
    renderKana();
  } else {
    sheetTitle.textContent = sheet.title;
    previewNotice.hidden = false;
    kanaDownloads.hidden = true;
    preview.classList.add("preview-paper");
    preview.style.aspectRatio = "";
    image.alt = `${sheet.title}: cropped, watermarked sample`;
    image.src = images[`../previews/shiryo/${sheet.id}.png`];
    preview.replaceChildren(image);
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

function balancePicker() {
  const buttons = [...picker.querySelectorAll(".sheet-tab")];
  const gap = parseFloat(getComputedStyle(picker).columnGap) || 0;
  let best = null;
  function partition(start, rows) {
    if (start === buttons.length) {
      const widths = rows.map((row) => row.width);
      const spread = Math.max(...widths) - Math.min(...widths);
      if (!best || rows.length < best.rows.length || (rows.length === best.rows.length && spread < best.spread)) best = { rows, spread };
      return;
    }
    if (best && rows.length >= best.rows.length) return;
    let width = 0;
    for (let end = start; end < buttons.length; end++) {
      width += buttons[end].offsetWidth + (end === start ? 0 : gap);
      if (width > picker.clientWidth && end > start) break;
      partition(end + 1, [...rows, { end, width }]);
    }
  }
  partition(0, []);
  const breaks = best.rows.slice(0, -1).map((row) => row.end).join(",");
  if (picker.dataset.breaks === breaks) return;
  picker.dataset.breaks = breaks;
  picker.querySelectorAll(".sheet-picker-break").forEach((item) => item.remove());
  for (const row of best.rows.slice(0, -1)) {
    const spacer = document.createElement("span");
    spacer.className = "sheet-picker-break";
    spacer.setAttribute("aria-hidden", "true");
    buttons[row.end].after(spacer);
  }
}
new ResizeObserver(balancePicker).observe(picker);
balancePicker();

function selectFromHash() {
  selectSheet(previews.find((sheet) => `#${sheet.id}` === location.hash) || previews[0]);
}
window.addEventListener("hashchange", selectFromHash);
selectFromHash();
