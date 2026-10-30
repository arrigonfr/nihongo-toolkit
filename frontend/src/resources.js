import "./practice.css";
import "./study-controls.css";
import "./ui-kit.css";
import "./resources.css";
import "./chips.css";
import "./navigation.js";
import { mountAppearance } from "./appearance.js";
import { mountSupport } from "./study-controls.js";
import { SHEETS, buildSheet } from "./cheatsheet-data.js";
import { FORMATS, buildPdf, drawToCanvas, fileName, textExporters, toSVG } from "./cheatsheet-export.js";
import { PDFDocument } from "pdf-lib";
import { strToU8, zipSync } from "fflate";
import { FONT_STACK, PAGE, paginateReference } from "./cheatsheet-layout.js";
import { mountWorksheet } from "./worksheet.js";

const META = {
  kana: { label: "Kana", icon: "あ", hue: 340, summary: "Hiragana and katakana charts with dakuten, handakuten, combinations and notes." },
  verb: { label: "Verbs", icon: "動", hue: 150, summary: "Godan, ichidan, する and 来る across 19 forms, plus godan endings." },
  adjective: { label: "Adjectives", icon: "形", hue: 205, summary: "い-adjectives, な-adjectives and いい, plain and polite, 18 forms." },
  particles: { label: "Particles", icon: "助", hue: 175, summary: "Particle roles, connections and nuances with examples." },
  counters: { label: "Counters", icon: "数", hue: 32, summary: "Common counters, irregular readings and examples." },
  radicals: { label: "Radicals", icon: "部", hue: 195, summary: "Common forms and examples, plus the 214 traditional radicals." },
  ambiguities: { label: "Word contrasts", icon: "違", hue: 350, summary: "Choose between confusable words and particles with examples." },
  lookalikes: { label: "Kanji Lookalikes", icon: "似", hue: 35, summary: "Visual clues for commonly confused kanji." },
  "grammar-contrasts": { label: "Grammar contrasts", icon: "文", hue: 160, summary: "Conditionals, appearance, obligation, passive forms and intention." }
};
const FORMAT_NOTES = {
  png: "Sharp image, 1985 × 2808 px", pdf: "A4 page (image based)", svg: "Scalable vector graphic", html: "Self-contained page, prints on A4",
  md: "Tables for notes apps", txt: "Aligned plain text", csv: "For spreadsheets and flashcards"
};

mountAppearance(document.querySelector("header"), document.getElementById("themeButton"));
mountSupport();

const picker = document.getElementById("sheetPicker");
const preview = document.getElementById("sheetPreview");
const list = document.getElementById("downloadList");
const status = document.getElementById("downloadStatus");
const grayscale = document.getElementById("sheetGrayscale");
const worksheet = mountWorksheet({ picker, preview, panel: document.querySelector(".download-panel"), grayscale });
const controls = document.createElement("section");
controls.className = "worksheet-controls reference-controls";
controls.hidden = true;
controls.innerHTML = '<label>Page layout <select data-reference="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label>Paper size <select data-reference="paper"><option value="a4">A4</option><option value="letter">US Letter</option><option value="legal">US Legal</option></select></label><div class="worksheet-pages"><button type="button" data-reference-action="previous" aria-label="Previous page">←</button><span data-reference-page></span><button type="button" data-reference-action="next" aria-label="Next page">→</button></div>';
document.querySelector(".download-panel").insertBefore(controls, list);
worksheet.button.addEventListener("click", () => { controls.hidden = true; });
let sheet = null, page = 0;
const paginated = () => ["counters", "radicals", "lookalikes", "grammar-contrasts"].includes(sheet?.id);
const pages = () => paginated() ? paginateReference(sheet) : [sheet];
const paper = () => controls.querySelector('[data-reference="paper"]').value;
const orientation = () => controls.querySelector('[data-reference="orientation"]').value;
function dimensions() {
  const sizes = { a4: [794, 1123], letter: [816, 1056], legal: [816, 1344] };
  const size = sizes[paper()];
  return orientation() === "landscape" ? [...size].reverse() : size;
}
function pageSVG(item, standalone = true) {
  const svg = toSVG(item, { standalone, grayscale: grayscale.checked });
  if (!paginated()) return svg;
  const [width, height] = dimensions();
  return `<svg${standalone ? ' xmlns="http://www.w3.org/2000/svg"' : ""} viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${sheet.title} cheatsheet"><rect width="100%" height="100%" fill="white"/><svg x="0" y="0" width="${width}" height="${height}" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family='${FONT_STACK.replace(/'/g, "")}'>${svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"))}</svg></svg>`;
}
function render() {
  const all = pages();
  page = Math.max(0, Math.min(page, all.length - 1));
  preview.innerHTML = pageSVG(all[page], false);
  preview.style.aspectRatio = paginated() ? dimensions().join(" / ") : "";
  controls.hidden = !paginated();
  controls.querySelector("[data-reference-page]").textContent = `${page + 1} / ${all.length}`;
  controls.querySelector('[data-reference-action="previous"]').disabled = page === 0;
  controls.querySelector('[data-reference-action="next"]').disabled = page === all.length - 1;
  for (const button of list.querySelectorAll("[data-format]")) {
    const format = button.dataset.format;
    if (!FORMAT_NOTES[format]) continue;
    button.querySelector("small").textContent = paginated() && ["png", "svg", "html"].includes(format)
      ? "ZIP with one file per page" : paginated() && format === "pdf"
        ? "All pages, selected paper size" : FORMAT_NOTES[format];
  }
}
controls.addEventListener("change", () => render());
controls.addEventListener("click", (event) => {
  const action = event.target.closest("[data-reference-action]")?.dataset.referenceAction;
  if (action) { page += action === "next" ? 1 : -1; render(); }
});
grayscale.addEventListener("change", () => { if (!worksheet.isActive()) render(); });

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
print.addEventListener("click", async () => {
  let frame;
  try { frame = worksheet.isActive() ? await worksheet.preparePrint() : await prepareSheetPrint(); }
  catch (error) { status.textContent = `Could not prepare printing: ${error.message}`; return; }
  const cleanup = () => { frame.remove(); window.removeEventListener("afterprint", cleanup); };
  frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
  window.addEventListener("afterprint", cleanup, { once: true });
  try { frame.contentWindow.focus(); frame.contentWindow.print(); }
  catch (error) { cleanup(); status.textContent = `Could not print: ${error.message}`; }
});
list.append(print);

async function prepareSheetPrint() {
  const frame = document.createElement("iframe");
  frame.title = "Print cheatsheet";
  frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
  const stylesheets = [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => `<link rel="stylesheet" href="${link.href}">`).join("");
  const size = paginated() ? `${paper()} ${orientation()}` : "A4";
  frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8">${stylesheets}<style>@page{size:${size};margin:0}body{margin:0}body>svg{display:block;width:100%;height:auto;break-after:page}body>svg:last-child{break-after:auto}</style></head><body>${pages().map((item) => pageSVG(item)).join("")}</body></html>`;
  const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; });
  document.body.append(frame);
  try { await loaded; await frame.contentDocument.fonts.ready; }
  catch (error) { frame.remove(); throw error; }
  return frame;
}

function select(id) {
  worksheet.deactivate();
  sheet = buildSheet(id);
  page = 0;
  for (const tab of picker.querySelectorAll(".sheet-tab")) tab.setAttribute("aria-pressed", String(tab.dataset.sheet === id));
  render();
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
  drawToCanvas(canvas.getContext("2d"), sheet, scale, { grayscale: grayscale.checked });
  return canvas;
}

const toBlob = (canvas, type, quality) => new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not encode image."))), type, quality));

async function download(id, button) {
  button.disabled = true;
  status.textContent = "Preparing…";
  try {
    const format = FORMATS.find((item) => item.id === id);
    if (worksheet.isActive()) {
      const blob = await worksheet.download(id, (current, total) => { status.textContent = `Preparing page ${current} of ${total}…`; });
      const name = `nihon-handwriting-worksheet.${id === "pdf" ? "pdf" : "zip"}`;
      save(blob, name);
      status.textContent = `Saved ${name}.`;
      return;
    }
    if (paginated() && ["png", "pdf", "svg", "html"].includes(id)) {
      const all = pages(), [width, height] = dimensions();
      const pdf = id === "pdf" ? await PDFDocument.create() : null;
      const files = {};
      for (let index = 0; index < all.length; index++) {
        status.textContent = `Preparing page ${index + 1} of ${all.length}…`;
        const svg = pageSVG(all[index]);
        const name = `page-${String(index + 1).padStart(3, "0")}`;
        if (id === "svg") files[`${name}.svg`] = strToU8(svg);
        else if (id === "html") files[`${name}.html`] = strToU8(`<!doctype html><meta charset="utf-8"><title>${sheet.title}</title><style>@page{size:${paper()} ${orientation()};margin:0}body{margin:0}svg{display:block;width:100%;height:auto}</style>${svg}`);
        else {
          const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
          try {
            const image = new Image(); image.src = url; await image.decode();
            const canvas = document.createElement("canvas"); canvas.width = Math.round(width * 2); canvas.height = Math.round(height * 2);
            canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
            const bytes = new Uint8Array(await (await toBlob(canvas, pdf ? "image/jpeg" : "image/png", .93)).arrayBuffer());
            if (pdf) {
              const jpeg = await pdf.embedJpg(bytes), pdfPage = pdf.addPage([width * .75, height * .75]);
              pdfPage.drawImage(jpeg, { x: 0, y: 0, width: width * .75, height: height * .75 });
            } else files[`${name}.png`] = bytes;
          } finally { URL.revokeObjectURL(url); }
        }
      }
      const name = `nihon-${sheet.id}-cheatsheet.${pdf ? "pdf" : "zip"}`;
      save(pdf ? new Blob([await pdf.save()], { type: "application/pdf" }) : new Blob([zipSync(files, { level: 6 })], { type: "application/zip" }), name);
      status.textContent = `Saved ${name}.`;
      return;
    }
    let blob;
    if (id === "png") blob = await toBlob(await renderCanvas(2.5), "image/png");
    else if (id === "pdf") {
      const canvas = await renderCanvas(2.5);
      const jpeg = new Uint8Array(await (await toBlob(canvas, "image/jpeg", 0.93)).arrayBuffer());
      blob = new Blob([buildPdf(jpeg, canvas.width, canvas.height, sheet.title)], { type: format.mime });
    } else blob = new Blob([textExporters[id](sheet, { grayscale: grayscale.checked })], { type: `${format.mime};charset=utf-8` });
    save(blob, fileName(sheet, id));
    status.textContent = `Saved ${fileName(sheet, id)}.`;
  } catch (error) {
    status.textContent = `Could not create the file: ${error.message}`;
  } finally {
    button.disabled = false;
  }
}

if (location.hash === "#worksheet") worksheet.button.click();
else select(location.hash === "#grammar-contrasts-2" ? "grammar-contrasts" : SHEETS.some((item) => `#${item.id}` === location.hash) ? location.hash.slice(1) : "kana");
