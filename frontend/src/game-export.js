import "./game-export.css";

const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

function wrapText(text, width, size) {
  const context = document.createElement("canvas").getContext("2d");
  context.font = `${size}px "Noto Sans JP", sans-serif`;
  const lines = [];
  let current = "";
  for (const character of String(text)) {
    if (current && context.measureText(current + character).width > width) {
      lines.push(current.trim());
      current = "";
    }
    current += character;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [""];
}

function mixColor(hex, target, amount) {
  return `#${[1, 3, 5].map((offset) => Math.round(parseInt(hex.slice(offset, offset + 2), 16) * amount + target * (1 - amount)).toString(16).padStart(2, "0")).join("")}`;
}

export function gameSVG(model, { answers = false, dark = false, grayscale = false, zoom = 100, fontScale = 100, cardFill = true, orientation = "portrait" } = {}) {
  const landscape = orientation === "landscape";
  const pageWidth = landscape ? 1123 : 794, pageHeight = landscape ? 794 : 1123;
  const background = dark ? (grayscale ? "#202020" : "#1c211f") : "#ffffff";
  const ink = dark ? (grayscale ? "#f4f4f4" : "#f4f4f0") : (grayscale ? "#222222" : "#202421");
  const muted = dark ? (grayscale ? "#b0b0b0" : "#aeb9b1") : (grayscale ? "#606060" : "#58645c");
  const accent = grayscale ? (dark ? "#606060" : "#d1d1d1") : (dark ? "#487960" : "#bce3c8");
  const block = grayscale ? (dark ? "#080808" : "#272727") : (dark ? "#070a08" : "#242b27");
  const cells = model.grid || [];
  const columns = Math.max(1, ...cells.map((row) => row.length));
  const cellSize = cells.length ? Math.min(650 / columns, 650 / cells.length, 64) : 0;
  const gridWidth = columns * cellSize, gridHeight = cells.length * cellSize;
  const gridX = (794 - gridWidth) / 2, gridY = 90;
  const pieces = [`<text x="397" y="52" text-anchor="middle" font-size="24" font-weight="700">${escape(model.title)}</text>`];
  cells.forEach((row, rowIndex) => row.forEach((cell, columnIndex) => {
    const x = gridX + columnIndex * cellSize, y = gridY + rowIndex * cellSize;
    if (!cell) { pieces.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${block}"/>`); return; }
    const fill = answers && cell.highlight ? accent : background;
    pieces.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fill}" stroke="${muted}" stroke-width="1"/>`);
    if (cell.number) pieces.push(`<text x="${x + 3}" y="${y + Math.max(9, cellSize * .2)}" font-size="${Math.max(7, cellSize * .18)}">${escape(cell.number)}</text>`);
    const text = answers && cell.answer !== undefined ? cell.answer : cell.text;
    const cellFont = Math.min(25 * Number(fontScale) / 100, cellSize * .72);
    if (text) pieces.push(`<text x="${x + cellSize / 2}" y="${y + cellSize * .65}" text-anchor="middle" font-size="${cellFont}" textLength="${Math.min(cellSize * .88, [...String(text)].length * cellFont)}" lengthAdjust="spacingAndGlyphs">${escape(text)}</text>`);
  }));
  const lines = (model.lines || []).map((line) => typeof line === "string" ? line : answers ? line.answer : line.text);
  const lineY = cells.length ? gridY + gridHeight + 28 : 90;
  if (model.table) {
    const tableWidth = pageWidth - 84;
    const widths = [tableWidth * .28, tableWidth * .36, tableWidth * .36], positions = [42, 42 + widths[0], 42 + widths[0] + widths[1]];
    let size = 14 * Number(fontScale) / 100;
    const wrapped = model.table.map((row) => [row.label, row.affirmative, row.negative].map((value, index) => String(value || "").split("\n").flatMap((line) => wrapText(line, widths[index] - 18, size))));
    pieces[0] = `<text x="${pageWidth / 2}" y="52" text-anchor="middle" font-size="24" font-weight="700">${escape(model.title)}</text>`;
    let y = 82;
    const headerHeight = Math.max(26, size * 2);
    pieces.push(`<rect x="42" y="${y}" width="${tableWidth}" height="${headerHeight}" fill="${accent}" stroke="${muted}"/>`);
    ["Form", "Affirmative", "Negative"].forEach((label, index) => pieces.push(`<text x="${positions[index] + 9}" y="${y + headerHeight * .68}" font-size="${size}" font-weight="700">${label}</text>`));
    y += headerHeight;
    wrapped.forEach((row, rowIndex) => {
      const height = Math.max(...row.map((cell) => cell.length)) * size * 1.25 + 12;
      pieces.push(`<rect x="42" y="${y}" width="${tableWidth}" height="${height}" fill="${rowIndex % 2 ? accent : background}" fill-opacity="${rowIndex % 2 ? .18 : 1}" stroke="${muted}" stroke-width=".5"/>`);
      row.forEach((cell, index) => {
        if (index) pieces.push(`<line x1="${positions[index]}" y1="${y}" x2="${positions[index]}" y2="${y + height}" stroke="${muted}" stroke-width=".5"/>`);
        cell.forEach((line, lineIndex) => pieces.push(`<text x="${positions[index] + 9}" y="${y + 6 + size * (lineIndex * 1.25 + 1)}" font-size="${size}"${index === 0 ? ' font-weight="700"' : ""}>${escape(line)}</text>`));
      });
      y += height;
    });
  } else if (model.sections) {
    const sections = model.sections;
    let size = 15 * Number(fontScale) / 100;
    let columns;
    do {
      columns = sections.map((section) => ({ title: section.title, lines: section.lines.flatMap((line) => wrapText(answers ? line.answer : line.text, 340, size)) }));
      if (Math.max(...columns.map((column) => column.lines.length + 2)) * size * 1.4 <= 1065 - lineY) break;
      size -= .5;
    } while (size > 1);
    const height = size * 1.4;
    columns.forEach((column, index) => {
      const x = 42 + index * 365;
      pieces.push(`<text x="${x}" y="${lineY}" font-size="${Math.min(18, height)}" font-weight="700">${escape(column.title)}</text>`);
      pieces.push(`<line x1="${x}" y1="${lineY + 8}" x2="${x + 340}" y2="${lineY + 8}" stroke="${muted}"/>`);
      column.lines.forEach((line, row) => pieces.push(`<text x="${x}" y="${lineY + height * (row + 1.5)}" font-size="${size}">${escape(line)}</text>`));
    });
  } else if (model.chain) {
    const rows = Math.max(1, Math.ceil(model.chain.length / 3));
    const height = Math.min(130, 960 / rows);
    const colors = ["#1f63e8", "#e8244f", "#0a9a58", "#8a35e6", "#e07800", "#0097b8"];
    let size = 14 * Number(fontScale) / 100;
    while (size > 1 && model.chain.some((word) => {
      const title = answers ? word.word : "__________________";
      const titleLines = wrapText(title, 207, answers ? size * 1.3 : 18.2).length;
      return (wrapText(word.meaning || "", 207, size).length * 1.25 + (answers ? 3.8 : 2.6) + (titleLines - 1) * 1.4) * size > height - 20;
    })) size -= .5;
    model.chain.forEach((word, index) => {
      const x = 42 + (index % 3) * 240, y = 85 + Math.floor(index / 3) * height;
      const color = grayscale ? "#686868" : word.playerIndex === undefined ? "#7c8a85" : colors[word.playerIndex % colors.length];
      const cardInk = cardFill ? "#fff" : "#000";
      pieces.push(`<defs><linearGradient id="card-${index}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${mixColor(color, 255, .55)}"/><stop offset=".5" stop-color="${color}"/><stop offset="1" stop-color="${mixColor(color, 0, .7)}"/></linearGradient></defs><rect x="${x}" y="${y}" width="227" height="${height - 8}" rx="8" fill="${cardFill ? `url(#card-${index})` : "#fff"}" stroke="${!cardFill && grayscale ? "#000" : color}"/>`);
      const title = answers ? word.word : "__________________";
      const titleSize = answers ? size * 1.3 : 18.2;
      const titleLines = wrapText(title, 207, titleSize);
      titleLines.forEach((line, row) => pieces.push(`<text x="${x + 113.5}" y="${y + 10 + titleSize + row * titleSize * 1.1}" text-anchor="middle" fill="${cardInk}" font-size="${titleSize}" font-weight="700">${escape(line)}</text>`));
      const offset = (titleLines.length - 1) * 1.4;
      if (answers) pieces.push(`<text x="${x + 113.5}" y="${y + 10 + size * (2.6 + offset)}" text-anchor="middle" fill="${cardInk}" font-size="${size}">${escape(word.reading)}</text>`);
      wrapText(word.meaning || "", 207, size).forEach((line, row) => pieces.push(`<text x="${x + 113.5}" y="${y + (answers ? 10 + size * (3.8 + offset + row * 1.25) : 38 + size * (1 + row * 1.25))}" text-anchor="middle" fill="${cardInk}" font-size="${size}">${escape(line)}</text>`));
    });
  } else {
    const perColumn = Math.max(1, Math.ceil(lines.length / 2));
    const lineHeight = Math.min(24, (1070 - lineY) / perColumn);
    const fontSize = Math.max(.1, Math.min(15 * Number(fontScale) / 100, lineHeight * .9));
    lines.forEach((line, index) => {
      const x = 42 + Math.floor(index / perColumn) * 365, y = lineY + (index % perColumn) * lineHeight;
      const text = String(line ?? "");
      pieces.push(`<text x="${x}" y="${y}" font-size="${fontSize}"${text.length * fontSize > 350 ? ' textLength="350" lengthAdjust="spacingAndGlyphs"' : ""}>${escape(text)}</text>`);
    });
  }
  const scale = Math.max(.5, Math.min(1, Number(zoom) / 100 || 1));
  const fit = landscape && !model.table ? pageHeight / 1123 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}"><rect width="${pageWidth}" height="${pageHeight}" fill="${background}"/><g fill="${ink}" font-family="Noto Sans JP, sans-serif" transform="translate(${pageWidth / 2} ${pageHeight / 2}) scale(${scale * fit}) translate(-${model.table ? pageWidth / 2 : 397} -${model.table ? pageHeight / 2 : 561.5})">${pieces.join("")}</g></svg>`;
}

function exportPages(model, options) {
  if (!model.table) return [gameSVG(model, options)];
  const width = (options.orientation === "landscape" ? 1123 : 794) - 84;
  const height = options.orientation === "landscape" ? 794 : 1123;
  const size = 14 * Number(options.fontScale) / 100;
  const widths = [width * .28, width * .36, width * .36];
  const pages = [[]];
  let used = 82 + Math.max(26, size * 2);
  for (const row of model.table) {
    const count = Math.max(...[row.label, row.affirmative, row.negative].map((value, index) => String(value || "").split("\n").flatMap((line) => wrapText(line, widths[index] - 18, size)).length));
    const rowHeight = count * size * 1.25 + 12;
    if (used + rowHeight > height - 30 && pages.at(-1).length) { pages.push([]); used = 82 + Math.max(26, size * 2); }
    pages.at(-1).push(row); used += rowHeight;
  }
  return pages.map((table) => gameSVG({ ...model, table }, options));
}

export function mountGameExport(container, getModel, { button = document.createElement("button"), label = "Export puzzle", answers = true } = {}) {
  button.type = "button"; button.classList.add("game-export-open"); button.textContent = label;
  const dialog = document.createElement("dialog");
  dialog.className = "game-export-dialog";
  dialog.innerHTML = `<form method="dialog"><header><h2>Export puzzle</h2><button value="close" aria-label="Close">×</button></header></form><div class="game-export-options"><label><input type="checkbox" data-option="answers"> Include answers</label><div class="game-export-theme"><span>Appearance</span><button type="button" class="study-theme" data-option="theme" data-mode="light" aria-label="Switch export to dark mode" aria-pressed="false"><span class="theme-switch-label" aria-hidden="true"></span><span class="theme-switch-knob" aria-hidden="true"></span></button></div><label><input type="checkbox" data-option="grayscale"> Grayscale</label><label>Font size <input type="range" data-option="fontScale" min="60" max="140" value="100"><output data-output="fontScale">100%</output></label><label>Zoom <input type="range" data-option="zoom" min="50" max="100" value="75"><output data-output="zoom">75%</output></label></div><img class="game-export-preview" alt="Export preview"><div class="game-export-actions"><button type="button" data-format="pdf">PDF</button><button type="button" data-format="png">PNG</button><button type="button" data-format="svg">SVG</button><button type="button" data-format="html">HTML</button><button type="button" data-format="print">Print</button></div><p class="game-export-status" role="status"></p>`;
  if (!answers) dialog.querySelector('[data-option="answers"]').closest("label").remove();
  const cardFill = document.createElement("label");
  cardFill.innerHTML = '<input type="checkbox" data-option="cardFill" checked> Fill cards';
  dialog.querySelector(".game-export-options").append(cardFill);
  const layout = document.createElement("label");
  layout.innerHTML = 'Page layout <select data-option="orientation"><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select>';
  dialog.querySelector(".game-export-options").append(layout);
  if (!button.isConnected) container.append(button);
  container.append(dialog);
  let model;
  const option = (name) => dialog.querySelector(`[data-option="${name}"]`);
  const options = () => ({ answers: option("answers")?.checked, dark: option("theme").dataset.mode === "dark", grayscale: option("grayscale").checked, zoom: option("zoom").value, fontScale: option("fontScale").value, cardFill: option("cardFill").checked, orientation: option("orientation").value });
  const sources = () => exportPages(model, options());
  const svg = () => {
    const pages = sources();
    if (pages.length === 1) return pages[0];
    const width = option("orientation").value === "landscape" ? 1123 : 794, height = option("orientation").value === "landscape" ? 794 : 1123;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height * pages.length}" viewBox="0 0 ${width} ${height * pages.length}">${pages.map((page, index) => page.replace('<svg ', `<svg y="${index * height}" `)).join("")}</svg>`;
  };
  const preview = () => { for (const name of ["zoom", "fontScale"]) dialog.querySelector(`[data-output="${name}"]`).textContent = `${option(name).value}%`; dialog.querySelector("img").src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg())}`; };
  button.addEventListener("click", () => {
    model = getModel();
    if (!model) return;
    cardFill.hidden = !model.chain;
    button.textContent = label; dialog.querySelector("h2").textContent = label; preview(); dialog.showModal();
  });
  dialog.addEventListener("input", preview);
  option("theme").addEventListener("click", () => {
    const dark = option("theme").dataset.mode !== "dark";
    option("theme").dataset.mode = dark ? "dark" : "light";
    option("theme").setAttribute("aria-pressed", String(dark));
    option("theme").setAttribute("aria-label", `Switch export to ${dark ? "light" : "dark"} mode`);
    preview();
  });
  dialog.querySelector(".game-export-actions").addEventListener("click", async (event) => {
    const format = event.target.dataset.format;
    if (!format) return;
    const status = dialog.querySelector(".game-export-status");
    try {
      const source = svg(), pages = sources(), landscape = option("orientation").value === "landscape";
      const width = landscape ? 1123 : 794, height = landscape ? 794 : 1123;
      if (format === "print") {
        const frame = document.createElement("iframe");
        frame.title = "Print game export"; frame.style.cssText = "position:fixed;width:0;height:0;border:0;";
        frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A4 ${option("orientation").value};margin:0}body{margin:0}body>svg{display:block;width:100%;height:auto;break-after:page}body>svg:last-child{break-after:auto}</style></head><body>${pages.join("")}</body></html>`;
        const loaded = new Promise((resolve, reject) => { frame.onload = resolve; frame.onerror = reject; });
        document.body.append(frame);
        try {
          await loaded; await frame.contentDocument.fonts.ready;
          const cleanup = () => { frame.remove(); window.removeEventListener("afterprint", cleanup); };
          frame.contentWindow.addEventListener("afterprint", cleanup, { once: true });
          window.addEventListener("afterprint", cleanup, { once: true });
          frame.contentWindow.focus(); frame.contentWindow.print();
        } catch (error) { frame.remove(); throw error; }
        return;
      }
      let blob;
      if (format === "svg") blob = new Blob([source], { type: "image/svg+xml" });
      else if (format === "html") blob = new Blob([`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(model.title)}</title><style>@page{size:A4 ${option("orientation").value};margin:0}body{margin:0}body>svg{display:block;width:min(100%,${width}px);height:auto;margin:auto;break-after:page}body>svg:last-child{break-after:auto}</style></head><body>${pages.join("")}</body></html>`], { type: "text/html;charset=utf-8" });
      else {
        const image = new Image(); image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = width * 2; canvas.height = height * pages.length * 2;
        canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
        const png = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!png) throw new Error("Could not render the image.");
        if (format === "png") blob = png;
        else {
          const { PDFDocument } = await import("pdf-lib");
          const pdf = await PDFDocument.create();
          for (let index = 0; index < pages.length; index++) {
            const slice = document.createElement("canvas"); slice.width = width * 2; slice.height = height * 2;
            slice.getContext("2d").drawImage(canvas, 0, index * height * 2, slice.width, slice.height, 0, 0, slice.width, slice.height);
            const bytes = await new Promise((resolve) => slice.toBlob(resolve, "image/png"));
            const picture = await pdf.embedPng(await bytes.arrayBuffer());
            const page = pdf.addPage([width * .75, height * .75]);
            page.drawImage(picture, { x: 0, y: 0, width: width * .75, height: height * .75 });
          }
          blob = new Blob([await pdf.save()], { type: "application/pdf" });
        }
      }
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = `${model.filename || "puzzle"}.${format}`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000); status.textContent = "";
    } catch (error) { console.error("Game export failed", error); status.textContent = "Could not export this puzzle. Please try again."; }
  });
}