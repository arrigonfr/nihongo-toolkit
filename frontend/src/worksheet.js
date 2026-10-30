import levels from "./worksheet-kanji.json";
import strokes from "./worksheet-strokes.json";
import fontUrl from "./KanjiStrokeOrders_v4.005.ttf?url";
import { PDFDocument } from "pdf-lib";
import { strToU8, zipSync } from "fflate";

const kana = [..."あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ"];
const escape = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

export function worksheetLayout({ size = 42, paper = "a4", orientation = "portrait" } = {}) {
  const dimensions = paper === "legal" ? [816, 1344] : paper === "letter" ? [816, 1056] : [794, 1123];
  const [width, height] = orientation === "landscape" ? dimensions.reverse() : dimensions;
  const scale = size / 68, minimumWidth = 360 * scale, gridHeight = 120 * scale;
  const columns = Math.max(1, Math.floor((width - 60 + 8) / (minimumWidth + 8)));
  const gridWidth = (width - 60 - (columns - 1) * 8) / columns;
  const rows = Math.max(1, Math.floor((height - 145) / (gridHeight + 8)));
  return { width, height, scale, gridWidth, gridHeight, columns, rows, perPage: columns * rows };
}

export function worksheetCharacters(mode, level) {
  const selectedLevels = Array.isArray(level) ? level : level === "all" ? [5, 4, 3, 2, 1] : [level];
  const kanji = selectedLevels.flatMap((item) => [...(levels[item] || "")]);
  const selectedModes = Array.isArray(mode) ? mode : mode === "both" ? ["kana", "kanji"] : [mode];
  return [...(selectedModes.includes("kana") ? kana : []), ...(selectedModes.includes("kanji") ? kanji : [])];
}

export function worksheetSVG(characters, { page = 0, size = 42, paper = "a4", orientation = "portrait", opacity = 1, numberSize = 12, grayscale = false, font = fontUrl } = {}) {
  const layout = worksheetLayout({ size, paper, orientation });
  const { width, height, scale, gridWidth, gridHeight, columns, perPage } = layout;
  const visible = characters.slice(page * perPage, (page + 1) * perPage);
  const rows = visible.map((character, index) => {
    const column = index % columns, row = Math.floor(index / columns);
    const x = 30 + column * (gridWidth + 8), y = 100 + row * (gridHeight + 8);
    const colors = ["#337ea6", "#c55863", "#3f997d", "#9862a6", "#c17e35", "#5276bb"];
    const glyph = escape(character);
    const data = strokes[character];
    const model = data ? `<svg x="5" y="16" width="86" height="86" viewBox="0 0 109 109"><g fill="none" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">${data[0].map((path, number) => `<path d="${escape(path)}" stroke="${grayscale ? "#555" : colors[number % colors.length]}"/>`).join("")}</g>${data[1].map(([numberX, numberY, number]) => `<text x="${numberX}" y="${numberY}" font-family="sans-serif" font-size="${numberSize}" font-weight="700" fill="#444">${number}</text>`).join("")}</svg>` : `<text x="48" y="78" font-family="StrokeOrder" font-size="68" text-anchor="middle" fill="#555">${glyph}</text>`;
    const rightEdge = gridWidth / scale;
    return `<g transform="translate(${x} ${y}) scale(${scale})"><rect width="${rightEdge}" height="120" fill="#fff" stroke="#b9bdbb"/><path d="M96 0v120 M142 0v120 M188 0v120 M234 0v120 M280 0v120 M96 60h184 M280 40h${rightEdge - 280} M280 80h${rightEdge - 280}" stroke="#d5d8d6" fill="none"/>${model}${[119, 165].flatMap((dx) => [48, 108].map((dy) => `<text x="${dx}" y="${dy}" font-family="sans-serif" font-size="38" text-anchor="middle" fill="#333" opacity=".2">${glyph}</text>`)).join("")}${[30, 70, 110].map((dy) => `<text x="284" y="${dy}" font-family="sans-serif" font-size="27" text-anchor="start" fill="#333" opacity=".15">${glyph}</text>`).join("")}</g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Handwriting worksheet"><style>${font ? `@font-face{font-family:StrokeOrder;src:url('${font}')}` : ""} text:not([font-family]){font-family:sans-serif}</style><rect width="${width}" height="${height}" fill="white"/><text x="30" y="45" font-size="22" font-weight="700" fill="#252b28">Handwriting Practice</text><text x="30" y="68" font-size="11" fill="#676d69">Stroke order · trace · write</text><text x="${width - 30}" y="45" text-anchor="end" font-size="12" fill="#676d69">${page + 1} / ${Math.max(1, Math.ceil(characters.length / perPage))}</text>${rows}<text x="30" y="${height - 18}" font-size="8" fill="#777">KanjiVG · Ulrich Apel and contributors · CC BY-SA 3.0 · kanjivg.tagaini.net · JLPT levels are estimates</text></svg>`;
}

export function mountWorksheet({ picker, preview, panel, grayscale }) {
  const section = document.createElement("section");
  section.className = "worksheet-controls";
  section.hidden = true;
  section.innerHTML = `<fieldset class="worksheet-choices"><legend>Characters</legend><div class="chips">${["kana", "kanji"].map((value) => `<label class="chip-option"><input type="checkbox" data-field="mode" value="${value}" ${value === "kana" ? "checked" : ""}><span>${value === "kana" ? "Kana" : "Kanji"}</span></label>`).join("")}</div></fieldset><fieldset class="worksheet-choices" data-levels><legend>Kanji Level</legend><div class="chips">${[5, 4, 3, 2, 1].map((value) => `<label class="chip-option"><input type="checkbox" data-field="level" value="${value}" ${value === 5 ? "checked" : ""}><span>N${value}</span></label>`).join("")}</div></fieldset><label>Font Size <input data-field="size" type="range" min="34" max="50" value="42"></label><label>Stroke Index Size <input data-field="numbers" type="range" min="7" max="16" value="12"></label><label>Stroke Opacity <input data-field="opacity" type="range" min="15" max="100" value="100"></label><label>Page Layout <select data-field="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label><label>Paper size <select data-field="paper"><option value="a4">A4</option><option value="letter">US Letter</option><option value="legal">US Legal</option></select></label><div class="worksheet-pages"><button type="button" data-action="previous" aria-label="Previous worksheet page">←</button><span data-page></span><button type="button" data-action="next" aria-label="Next worksheet page">→</button></div><p class="worksheet-notice" role="status"></p>`;
  panel.insertBefore(section, panel.querySelector("#downloadList"));
  const button = document.createElement("button");
  button.type = "button"; button.className = "sheet-tab"; button.dataset.sheet = "worksheet";
  button.style.setProperty("--tab-hue", "195");
  button.innerHTML = '<span class="sheet-tab-icon" aria-hidden="true">書</span><span>Worksheet</span>';
  picker.append(button);
  const modes = [...section.querySelectorAll('[data-field="mode"]')], levels = [...section.querySelectorAll('[data-field="level"]')];
  const size = section.querySelector('[data-field="size"]'), paper = section.querySelector('[data-field="paper"]'), orientation = section.querySelector('[data-field="orientation"]'), notice = section.querySelector(".worksheet-notice");
  const opacity = section.querySelector('[data-field="opacity"]'), numbers = section.querySelector('[data-field="numbers"]');
  let page = 0, active = false, fontData, fontBytes;
  const characters = () => worksheetCharacters(modes.filter((input) => input.checked).map((input) => input.value), levels.filter((input) => input.checked).map((input) => input.value));
  const options = (font = fontUrl) => ({ page, size: Number(size.value), paper: paper.value, orientation: orientation.value, opacity: Number(opacity.value) / 100, numberSize: Number(numbers.value), grayscale: grayscale.checked, font });
  function render() {
    const items = characters(), layout = worksheetLayout(options()), pages = Math.max(1, Math.ceil(items.length / layout.perPage));
    page = Math.max(0, Math.min(page, pages - 1));
    section.querySelector('[data-levels]').disabled = !modes.some((input) => input.value === "kanji" && input.checked);
    for (const input of [...modes, ...levels]) input.closest(".chip-option").classList.toggle("is-active", input.checked);
    section.querySelector("[data-page]").textContent = `${page + 1} / ${pages}`;
    section.querySelector('[data-action="previous"]').disabled = page === 0;
    section.querySelector('[data-action="next"]').disabled = page === pages - 1;
    preview.innerHTML = worksheetSVG(items, options());
    preview.style.aspectRatio = `${layout.width} / ${layout.height}`;
    preview.dataset.sheet = "worksheet";
  }
  button.addEventListener("click", () => {
    active = true; section.hidden = false; panel.dataset.worksheet = "true";
    section.querySelector(".worksheet-choices").append(grayscale.closest("label"));
    for (const tab of picker.querySelectorAll(".sheet-tab")) tab.setAttribute("aria-pressed", String(tab === button));
    document.getElementById("sheetTitle").textContent = "Handwriting Practice · 書き方";
    document.getElementById("sheetSummary").textContent = "Numbered stroke models and tracing practice.";
    document.getElementById("downloadStatus").textContent = "";
    for (const item of panel.querySelectorAll("[data-format]")) {
      item.hidden = ["md", "txt", "csv"].includes(item.dataset.format);
      const title = item.querySelector("strong");
      if (title && !item.dataset.originalTitle) item.dataset.originalTitle = title.textContent;
      if (title && item.dataset.format === "png") title.textContent = "PNG Images";
      const description = item.querySelector("small");
      if (description && !item.dataset.originalNote) item.dataset.originalNote = description.textContent;
      if (description && ["png", "svg", "html"].includes(item.dataset.format)) description.textContent = "ZIP compressed";
      else if (description && item.dataset.format === "pdf") description.textContent = "All pages in one PDF";
    }
    history.replaceState(null, "", "#worksheet");
    render();
  });
  section.addEventListener("change", (event) => { if (event.target === grayscale) return; if (event.target.type !== "range") page = 0; render(); });
  section.addEventListener("input", (event) => { if (event.target.type === "range") render(); });
  section.addEventListener("click", (event) => {
    const action = event.target.closest("[data-action]")?.dataset.action;
    if (action) { page += action === "next" ? 1 : -1; render(); }
  });
  grayscale.addEventListener("change", () => { if (active) render(); });
  function deactivate() {
    active = false; section.hidden = true; delete panel.dataset.worksheet;
    panel.insertBefore(grayscale.closest("label"), section);
    preview.style.aspectRatio = "";
    for (const item of panel.querySelectorAll("[data-format]")) {
      item.hidden = false;
      if (item.dataset.originalTitle) item.querySelector("strong").textContent = item.dataset.originalTitle;
      if (item.dataset.originalNote) item.querySelector("small").textContent = item.dataset.originalNote;
    }
  }
  async function embeddedFont() {
    if (!fontData) {
      const response = await fetch(fontUrl);
      if (!response.ok) throw new Error("Stroke-order font is unavailable.");
      const blob = await response.blob();
      fontBytes = new Uint8Array(await blob.arrayBuffer());
      fontData = await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(blob);
      });
    }
    return fontData;
  }
  async function rasterize(svg, layout, format) {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    try {
      const image = new Image(); image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas"); canvas.width = Math.round(layout.width * 1.5); canvas.height = Math.round(layout.height * 1.5);
      canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, format === "pdf" ? "image/jpeg" : "image/png", .93));
      if (!blob) throw new Error("Could not render worksheet.");
      return new Uint8Array(await blob.arrayBuffer());
    } finally { URL.revokeObjectURL(url); }
  }
  async function download(format, progress = () => {}) {
    const items = characters(), config = options(), layout = worksheetLayout(config);
    const count = Math.max(1, Math.ceil(items.length / layout.perPage));
    const needsFont = items.some((character) => !strokes[character]);
    const embedded = needsFont ? await embeddedFont() : "";
    const pdf = format === "pdf" ? await PDFDocument.create() : null;
    const files = {};
    if (needsFont && (format === "svg" || format === "html")) files["stroke-order.ttf"] = fontBytes;
    if (!pdf) files["README.txt"] = strToU8("Stroke diagrams adapted from KanjiVG by Ulrich Apel and contributors, CC BY-SA 3.0: https://kanjivg.tagaini.net/ and https://creativecommons.org/licenses/by-sa/3.0/\nJLPT levels are estimates.\n");
    for (let index = 0; index < count; index++) {
      progress(index + 1, count);
      const name = `page-${String(index + 1).padStart(3, "0")}`;
      const svg = worksheetSVG(items, { ...config, page: index, font: needsFont && (format === "svg" || format === "html") ? "stroke-order.ttf" : embedded });
      if (format === "svg") files[`${name}.svg`] = strToU8(svg);
      else if (format === "html") files[`${name}.html`] = strToU8(`<!doctype html><meta charset="utf-8"><title>Handwriting Practice</title><style>@page{size:${config.paper} ${config.orientation};margin:0}body{margin:0}svg{display:block;width:100%;height:auto}</style>${svg}`);
      else {
        const image = await rasterize(svg, layout, format);
        if (pdf) {
          const jpeg = await pdf.embedJpg(image);
          const pdfPage = pdf.addPage([layout.width * .75, layout.height * .75]);
          pdfPage.drawImage(jpeg, { x: 0, y: 0, width: layout.width * .75, height: layout.height * .75 });
        } else files[`${name}.png`] = image;
      }
    }
    return pdf ? new Blob([await pdf.save()], { type: "application/pdf" }) : new Blob([zipSync(files, { level: 6 })], { type: "application/zip" });
  }
  async function preparePrint() {
    const items = characters(), config = options(), layout = worksheetLayout(config);
    const count = Math.max(1, Math.ceil(items.length / layout.perPage));
    const frame = document.createElement("iframe");
    frame.title = "Print handwriting worksheet";
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
    const pages = Array.from({ length: count }, (_, index) => worksheetSVG(items, { ...config, page: index })).join("");
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${config.paper} ${config.orientation};margin:0}body{margin:0}svg{display:block;width:100%;height:auto;break-after:page}svg:last-child{break-after:auto}</style></head><body>${pages}</body></html>`;
    const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; });
    document.body.append(frame);
    try {
      await loaded;
      if (items.some((character) => !strokes[character])) await frame.contentDocument.fonts.load("68px StrokeOrder", "あ漢");
    } catch (error) {
      frame.remove();
      throw error;
    }
    return frame;
  }
  return { button, deactivate, isActive: () => active, render, download, preparePrint, notice };
}