import { cellLabel, cellText } from "./cheatsheet-data.js";
import { FONT_STACK, layoutSheet, PAGE } from "./cheatsheet-layout.js";

const escapeXml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]);

export function toSVG(sheet, { standalone = true, grayscale = false } = {}) {
  const { width, height, prims } = layoutSheet(sheet);
  const body = prims.map((p) => {
    if (p.k === "r") {
      return `<rect x="${+p.x.toFixed(2)}" y="${+p.y.toFixed(2)}" width="${+p.w.toFixed(2)}" height="${+p.h.toFixed(2)}"${p.rx ? ` rx="${p.rx}"` : ""} fill="${p.fill}"${p.stroke ? ` stroke="${p.stroke}"` : ""}/>`;
    }
    const spans = p.runs.map((run) => (run.fill && run.fill !== p.fill ? `<tspan fill="${run.fill}">${escapeXml(run.t)}</tspan>` : escapeXml(run.t))).join("");
    return `<text x="${+p.x.toFixed(2)}" y="${+p.y.toFixed(2)}" font-size="${+p.size.toFixed(2)}" font-weight="${p.weight}" fill="${p.fill}" text-anchor="${p.anchor}">${spans}</text>`;
  }).join("\n");
  const ns = standalone ? ' xmlns="http://www.w3.org/2000/svg"' : "";
  const content = grayscale ? `<defs><filter id="sheet-grayscale" color-interpolation-filters="sRGB"><feColorMatrix type="saturate" values="0"/></filter></defs>\n<g filter="url(#sheet-grayscale)">${body}</g>` : body;
  return `<svg${ns} viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" font-family='${FONT_STACK.replace(/'/g, "")}' role="img" aria-label="${escapeXml(sheet.title)} cheatsheet">\n${content}\n</svg>`;
}

export function drawToCanvas(ctx, sheet, scale = 2, { grayscale = false } = {}) {
  const { prims } = layoutSheet(sheet);
  ctx.save();
  ctx.scale(scale, scale);
  ctx.textBaseline = "alphabetic";
  for (const p of prims) {
    if (p.k === "r") {
      ctx.beginPath();
      if (p.rx && ctx.roundRect) ctx.roundRect(p.x, p.y, p.w, p.h, p.rx); else ctx.rect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = p.fill;
      ctx.fill();
      if (p.stroke) { ctx.strokeStyle = p.stroke; ctx.lineWidth = 1; ctx.stroke(); }
      continue;
    }
    ctx.font = `${p.weight} ${p.size}px ${FONT_STACK}`;
    ctx.textAlign = "left";
    const widths = p.runs.map((run) => ctx.measureText(run.t).width);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = p.anchor === "middle" ? p.x - total / 2 : p.anchor === "end" ? p.x - total : p.x;
    p.runs.forEach((run, index) => {
      ctx.fillStyle = run.fill || p.fill;
      ctx.fillText(run.t, x, p.y);
      x += widths[index];
    });
  }
  ctx.restore();
  if (grayscale) {
    const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    for (let index = 0; index < image.data.length; index += 4) {
      const gray = Math.round(image.data[index] * 0.2126 + image.data[index + 1] * 0.7152 + image.data[index + 2] * 0.0722);
      image.data[index] = image.data[index + 1] = image.data[index + 2] = gray;
    }
    ctx.putImageData(image, 0, 0);
  }
}

export function toHTML(sheet, { grayscale = false } = {}) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeXml(sheet.title)} · cheatsheet</title>
<style>
  @page { size: A4; margin: 0; }
  html { background: #e9ece9; }
  body { margin: 0; display: grid; justify-items: center; padding: 16px; }
  .sheet { width: min(100%, ${PAGE.w}px); background: #fff; box-shadow: 0 6px 24px rgb(0 0 0 / 18%); }
  .sheet svg { display: block; width: 100%; height: auto; }
  @media print {
    html { background: #fff; }
    body { padding: 0; display: block; }
    .sheet { width: 210mm; height: 297mm; box-shadow: none; }
    .sheet svg { width: 210mm; height: 297mm; }
  }
</style>
</head>
<body>
<main class="sheet">
${toSVG(sheet, { standalone: false, grayscale })}
</main>
</body>
</html>
`;
}

const pad = (value, width) => {
  let used = 0;
  for (const char of value) used += char.codePointAt(0) >= 0x2e80 ? 2 : 1;
  return value + " ".repeat(Math.max(0, width - used));
};
const displayWidth = (value) => [...value].reduce((sum, char) => sum + (char.codePointAt(0) >= 0x2e80 ? 2 : 1), 0);

function tableRows(table) {
  const labelled = table.rowLabels;
  return table.rows.map((row, index) => [
    ...(labelled ? [labelled[index]] : []),
    ...row.map((item) => (item ? (labelled ? `${cellText(item)} ${item.sub}` : cellLabel(item)) : ""))
  ]);
}
const tableColumns = (table) => (table.rowLabels ? ["", ...table.columns] : table.columns);

export function toText(sheet) {
  const out = [`${sheet.title} · ${sheet.jp}`, sheet.subtitle, ""];
  for (const table of sheet.tables) {
    const header = tableColumns(table), rows = tableRows(table);
    const widths = header.map((label, col) => Math.max(displayWidth(label), ...rows.flatMap((row) => row[col].split("\n").map(displayWidth))));
    out.push(table.title, "-".repeat(table.title.length));
    out.push(header.map((label, col) => pad(label, widths[col])).join(" | ").trimEnd());
    for (const row of rows) {
      const lines = row.map((value) => value.split("\n"));
      for (let index = 0; index < Math.max(...lines.map((cell) => cell.length)); index++) {
        out.push(lines.map((cell, col) => pad(cell[index] || "", widths[col])).join(" | ").trimEnd());
      }
    }
    out.push("");
  }
  for (const note of sheet.notes) out.push(note.title, ...note.lines.map((line) => `- ${line}`), "");
  out.push(sheet.footer, "");
  return out.join("\n");
}

const mdCell = (value) => value.replace(/\|/g, "\\|").replace(/\n/g, "<br>");

export function toMarkdown(sheet) {
  const out = [`# ${sheet.title} · ${sheet.jp}`, "", sheet.subtitle, ""];
  for (const table of sheet.tables) {
    out.push(`## ${table.title}`, "");
    out.push(`| ${tableColumns(table).map(mdCell).join(" | ")} |`);
    out.push(`| ${tableColumns(table).map(() => "---").join(" | ")} |`);
    for (const row of tableRows(table)) out.push(`| ${row.map(mdCell).join(" | ")} |`);
    out.push("");
  }
  for (const note of sheet.notes) out.push(`## ${note.title}`, "", ...note.lines.map((line) => `- ${line}`), "");
  out.push(`_${sheet.footer}_`, "");
  return out.join("\n");
}

const csvCell = (value) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

export function toCSV(sheet) {
  const out = ["table,row," + "column,value"];
  for (const table of sheet.tables) {
    const columns = table.columns;
    table.rows.forEach((row, index) => {
      const label = table.rowLabels ? table.rowLabels[index] : row[0] ? cellLabel(row[0]) : "";
      row.forEach((item, col) => {
        if (!item || (!table.rowLabels && col === 0)) return;
        out.push([table.title, label, columns[col], table.rowLabels ? `${cellText(item)} ${item.sub}` : cellLabel(item)].map(csvCell).join(","));
      });
    });
  }
  return `\ufeff${out.join("\r\n")}\r\n`;
}

const ascii = (text) => new TextEncoder().encode(text);

// One-page A4 PDF holding a JPEG (DCT) image; JPEG bytes are embedded unchanged.
export function buildPdf(jpeg, pixelWidth, pixelHeight, title = "Cheatsheet") {
  const pageW = 595.28, pageH = 841.89;
  const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;
  const objects = [];
  const chunks = [];
  let length = 0;
  const push = (data) => { const bytes = typeof data === "string" ? ascii(data) : data; chunks.push(bytes); length += bytes.length; };
  push("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n");
  const add = (head, stream) => {
    objects.push(length);
    push(`${objects.length} 0 obj\n${head}\n`);
    if (stream) { push("stream\n"); push(stream); push("\nendstream\n"); }
    push("endobj\n");
  };
  const safeTitle = title.replace(/[^\x20-\x7e]/g, "").replace(/[()\\]/g, "");
  add("<< /Type /Catalog /Pages 2 0 R >>");
  add("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
  add(`<< /Length ${content.length} >>`, ascii(content));
  add(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>`, jpeg);
  add(`<< /Title (${safeTitle}) /Producer (Nihon) >>`);
  const xref = length;
  push(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`);
  for (const offset of objects) push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) { out.set(chunk, at); at += chunk.length; }
  return out;
}

export const FORMATS = [
  { id: "png", label: "PNG image", ext: "png", mime: "image/png" },
  { id: "pdf", label: "PDF", ext: "pdf", mime: "application/pdf" },
  { id: "svg", label: "SVG", ext: "svg", mime: "image/svg+xml" },
  { id: "html", label: "HTML", ext: "html", mime: "text/html" },
  { id: "md", label: "Markdown", ext: "md", mime: "text/markdown" },
  { id: "txt", label: "Text", ext: "txt", mime: "text/plain" },
  { id: "csv", label: "CSV", ext: "csv", mime: "text/csv" }
];

export const fileName = (sheet, format) => `nihon-${sheet.id}-cheatsheet.${FORMATS.find((item) => item.id === format).ext}`;

export const textExporters = { svg: toSVG, html: toHTML, md: toMarkdown, txt: toText, csv: toCSV };
