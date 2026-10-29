import { cellText } from "./cheatsheet-data.js";

// A4 at 96 dpi. Layout produces drawing primitives that become SVG, canvas or PDF pixels.
export const PAGE = { w: 794, h: 1123, margin: 30 };
export const FONT_STACK = '"Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif';

const INK = "#262a27", MUTED = "#6b726c", PAPER = "#ffffff";
const hsl = (h, s, l) => `hsl(${Math.round(((h % 360) + 360) % 360)} ${s}% ${l}%)`;

export function textWidth(text, size) {
  let units = 0;
  for (const char of text) units += char.codePointAt(0) >= 0x2e80 ? 1 : 0.56;
  return units * size;
}

export function wrapText(text, size, maxWidth) {
  const lines = [];
  let line = "";
  for (const char of text) {
    if (line && textWidth(line + char, size) > maxWidth) {
      if (char === " ") { lines.push(line); line = ""; continue; }
      const lastSpace = line.lastIndexOf(" ");
      const cjk = char.codePointAt(0) >= 0x2e80;
      if (!cjk && lastSpace > 0) {
        lines.push(line.slice(0, lastSpace));
        line = line.slice(lastSpace + 1) + char;
      } else {
        lines.push(line);
        line = char;
      }
    } else line += char;
  }
  if (line) lines.push(line);
  return lines;
}

const rect = (prims, x, y, w, h, fill, rx = 0, stroke) => prims.push({ k: "r", x, y, w, h, rx, fill, stroke });
const text = (prims, x, y, runs, size, o = {}) => prims.push({
  k: "t", x, y, size, anchor: o.anchor || "middle", weight: o.weight || 400, fill: o.fill || INK,
  runs: typeof runs === "string" ? [{ t: runs }] : runs
});

function header(prims, sheet) {
  const { margin, w } = PAGE, h = 62;
  rect(prims, margin, margin, w - margin * 2, h, hsl(sheet.hue, 50, 38), 14);
  rect(prims, w - margin - 190, margin, 190, h, hsl(sheet.hue2, 70, 52), 14);
  rect(prims, w - margin - 190, margin, 20, h, hsl(sheet.hue2, 70, 52));
  text(prims, margin + 20, margin + 30, sheet.title, 25, { anchor: "start", weight: 800, fill: "#fff" });
  text(prims, margin + 20, margin + 50, sheet.subtitle, 9.5, { anchor: "start", fill: "#ffffffdd" });
  text(prims, w - margin - 95 + 6, margin + 38, sheet.jp, sheet.jp.length > 8 ? 16 : 19, { weight: 700, fill: "#fff" });
  return margin + h;
}

function footer(prims, sheet) {
  const { w, h, margin } = PAGE;
  const lines = wrapText(sheet.footer, 8, w - margin * 2);
  lines.forEach((line, index) => text(prims, w / 2, h - margin + 4 - (lines.length - 1 - index) * 11, line, 8, { fill: MUTED }));
  text(prims, margin, h - 12, "Nihon · cheatsheet", 7, { anchor: "start", fill: "#9aa19b" });
  text(prims, w - margin, h - 12, "A4", 7, { anchor: "end", fill: "#9aa19b" });
}

function fitSize(label, size, width, min = 6) {
  const natural = textWidth(label, size);
  return natural <= width ? size : Math.max(min, size * width / natural);
}

function drawCell(prims, item, x, y, w, rowH, o) {
  const label = cellText(item);
  const size = fitSize(label, o.mainSize, w - 8);
  const runs = item.parts.map(([t, hl]) => ({ t, fill: hl ? o.accent : o.ink }));
  const baseline = item.sub ? y + rowH / 2 - 0.5 : y + rowH / 2 + size * 0.36;
  text(prims, x + w / 2, baseline, runs, size, { weight: o.weight || 600 });
  if (item.sub) text(prims, x + w / 2, y + rowH - 4.5, item.sub, fitSize(item.sub, o.subSize, w - 8, 5.5), { fill: MUTED });
}

function drawWrapped(prims, item, x, y, w, rowH, size) {
  let lines = wrapText(cellText(item), size, w - 10);
  let fontSize = size;
  while (lines.length > 2 && fontSize > 6) { fontSize -= 0.5; lines = wrapText(cellText(item), fontSize, w - 10); }
  const top = y + rowH / 2 - ((lines.length - 1) * (fontSize + 2)) / 2 + fontSize * 0.35;
  lines.forEach((line, index) => text(prims, x + 6, top + index * (fontSize + 2), line, fontSize, { anchor: "start", fill: MUTED }));
}

export function drawTable(prims, table, x, y, o) {
  const widths = o.colW, total = widths.reduce((a, b) => a + b, 0);
  const rowH = o.rowH, headH = o.headH || 22;
  let cursor = y;
  if (table.title) {
    rect(prims, x, cursor + 2, 4, 12, o.accent, 2);
    text(prims, x + 10, cursor + 12, table.title, 10.5, { anchor: "start", weight: 800, fill: o.dark });
    cursor += 18;
  }
  rect(prims, x, cursor, total, headH, o.head, 7);
  let cx = x;
  table.columns.forEach((label, index) => {
    text(prims, cx + widths[index] / 2, cursor + headH / 2 + 3.5, label, fitSize(label, 9.5, widths[index] - 6), { weight: 700, fill: "#fff" });
    cx += widths[index];
  });
  cursor += headH + 2;
  table.rows.forEach((row, rowIndex) => {
    rect(prims, x, cursor, total, rowH - 1, rowIndex % 2 ? o.tintB : o.tintA, 5);
    let px = x;
    row.forEach((item, col) => {
      if (item) {
        if (col === 0) {
          const parts = item.sub ? 2 : 1;
          text(prims, px + 8, cursor + (parts === 2 ? rowH / 2 - 2 : rowH / 2 + 3.5), item.parts[0][0], fitSize(item.parts[0][0], 10, widths[0] - 12), { anchor: "start", weight: 700, fill: o.dark });
          if (item.sub) text(prims, px + 8, cursor + rowH - 5.5, item.sub, 8, { anchor: "start", fill: MUTED });
        } else if (o.wrapCols?.includes(col)) drawWrapped(prims, item, px, cursor, widths[col], rowH - 1, 8.5);
        else drawCell(prims, item, px, cursor, widths[col], rowH - 1, { ...o, mainSize: o.mainSize, weight: 600 });
      }
      px += widths[col];
    });
    cursor += rowH;
  });
  return cursor - y;
}

function drawKana(prims, table, x, y, w, rowH, baseHue, span, labelWidth = 20) {
  const columns = table.columns.length, cellW = (w - labelWidth) / columns;
  let cursor = y;
  text(prims, x, cursor + 11, table.title, 10, { anchor: "start", weight: 800, fill: hsl(baseHue, 55, 28) });
  cursor += 16;
  rect(prims, x, cursor, w, 15, hsl(baseHue, 45, 40), 6);
  table.columns.forEach((label, index) => text(prims, x + labelWidth + cellW * index + cellW / 2, cursor + 10.5, label, 8.5, { weight: 700, fill: "#fff" }));
  cursor += 17;
  const last = Math.max(1, table.rows.length - 1);
  table.rows.forEach((row, index) => {
    const hue = baseHue + (span * index) / last;
    rect(prims, x, cursor, w, rowH - 2, hsl(hue, 80, 95.5), 6);
    rect(prims, x, cursor, labelWidth - 2, rowH - 2, hsl(hue, 60, 85), 6);
    text(prims, x + (labelWidth - 2) / 2, cursor + rowH / 2 + 3, table.rowLabels[index], 8.5, { weight: 800, fill: hsl(hue, 55, 28) });
    row.forEach((item, col) => {
      if (!item) return;
      const cx = x + labelWidth + cellW * col + cellW / 2;
      text(prims, cx, cursor + rowH / 2 + 1.5, cellText(item), 17.5, { weight: 500, fill: hsl(hue, 45, 18) });
      text(prims, cx, cursor + rowH - 4.5, item.sub, 7.5, { fill: hsl(hue, 30, 38) });
    });
    cursor += rowH;
  });
  return cursor - y;
}

function drawNote(prims, note, x, y, w, h, hue, size = 8.5) {
  rect(prims, x, y, w, h, hsl(hue, 70, 96), 9, hsl(hue, 45, 80));
  rect(prims, x, y + 8, 3.5, 16, hsl(hue, 60, 45), 2);
  text(prims, x + 12, y + 20, note.title, 10.5, { anchor: "start", weight: 800, fill: hsl(hue, 55, 28) });
  let cursor = y + 36;
  for (const line of note.lines) {
    const wrapped = wrapText(line, size, w - 26);
    wrapped.forEach((part, index) => { text(prims, x + 12 + (index ? 8 : 0), cursor, (index ? "" : "• ") + part, size, { anchor: "start", fill: INK }); cursor += size + 3.5; });
    cursor += 2.5;
  }
  return cursor - y + 6;
}

function layoutKana(sheet, prims) {
  const { margin, w } = PAGE, colW = (w - margin * 2 - 26) / 2;
  let top = header(prims, sheet) + 12;
  const scripts = [{ name: "Hiragana", jp: "ひらがな", hue: 345, span: 40, tables: sheet.tables.slice(0, 3), note: sheet.notes[0] },
    { name: "Katakana", jp: "カタカナ", hue: 195, span: 70, tables: sheet.tables.slice(3), note: sheet.notes[1] }];
  scripts.forEach((script, index) => {
    const x = margin + index * (colW + 26);
    let cursor = top;
    rect(prims, x, cursor, colW, 24, hsl(script.hue, 55, 92), 12);
    text(prims, x + 14, cursor + 16.5, `${script.jp}  ${script.name}`, 12, { anchor: "start", weight: 800, fill: hsl(script.hue, 55, 26) });
    cursor += 30;
    const rowH = 31;
    cursor += drawKana(prims, script.tables[0], x, cursor, colW, rowH, script.hue, script.span) + 6;
    cursor += drawKana(prims, script.tables[1], x, cursor, colW, rowH, script.hue, script.span) + 6;
    const comboW = 20 + 3 * 60;
    const start = cursor;
    const comboH = drawKana(prims, script.tables[2], x, cursor, comboW, rowH, script.hue, script.span);
    drawNote(prims, script.note, x + comboW + 8, start + 16, colW - comboW - 8, comboH - 16, script.hue, 9.5);
  });
}

function layoutVerb(sheet, prims) {
  const { margin, w } = PAGE, width = w - margin * 2;
  const palette = {
    accent: hsl(sheet.hue2, 85, 38), dark: hsl(sheet.hue, 55, 24), head: hsl(sheet.hue, 45, 36),
    tintA: hsl(sheet.hue, 50, 96), tintB: hsl(sheet.hue, 30, 99), ink: INK, subSize: 8
  };
  let cursor = header(prims, sheet) + 12;
  cursor += drawTable(prims, sheet.tables[0], margin, cursor, { ...palette, colW: [112, 196, 104, 110, 100, 100], rowH: 29.5, mainSize: 13.5, wrapCols: [1] }) + 10;
  cursor += drawTable(prims, sheet.tables[1], margin, cursor, { ...palette, colW: [50, 94, 99, 99, 95, 95, 95, 95], rowH: 25, headH: 20, mainSize: 12.5 }) + 8;
  drawNote(prims, sheet.notes[0], margin, cursor, width, 92, sheet.hue2, 9.5);
}

function layoutAdjective(sheet, prims) {
  const { margin, w } = PAGE, width = w - margin * 2;
  const palette = {
    accent: hsl(sheet.hue2, 85, 38), dark: hsl(sheet.hue, 60, 24), head: hsl(sheet.hue, 50, 38),
    tintA: hsl(sheet.hue, 60, 96), tintB: hsl(sheet.hue, 30, 99), ink: INK, subSize: 8
  };
  let cursor = header(prims, sheet) + 12;
  cursor += drawTable(prims, sheet.tables[0], margin, cursor, { ...palette, colW: [118, 184, 140, 140, 140], rowH: 34, mainSize: 13, wrapCols: [1] }) + 12;
  const cardW = (width - 24) / 3;
  const hues = [sheet.hue, 150, sheet.hue2];
  sheet.notes.filter((note) => !note.wide).forEach((note, index) => drawNote(prims, note, margin + index * (cardW + 12), cursor, cardW, 112, hues[index], 8.5));
  const wide = sheet.notes.find((note) => note.wide);
  if (wide) drawNote(prims, wide, margin, cursor + 124, width, 112, 270, 9.5);
}

export function layoutSheet(sheet) {
  const prims = [];
  rect(prims, 0, 0, PAGE.w, PAGE.h, PAPER);
  ({ kana: layoutKana, verb: layoutVerb, adjective: layoutAdjective })[sheet.id](sheet, prims);
  footer(prims, sheet);
  return { width: PAGE.w, height: PAGE.h, prims };
}
