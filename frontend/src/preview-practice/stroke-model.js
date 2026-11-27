async function drawingRequest(params) {
  const { fetchItems } = await import("../api.js");
  return fetchItems("/api/study/drawing", params);
}
export const models = [];
const byCharacter = new Map();
export async function prepareModels(request = drawingRequest) {
  const rows = await request({});
  models.length = 0;
  byCharacter.clear();
  for (const row of rows) {
    const item = {
      ...row,
      id: `draw-${row.character}`,
      source: "KanjiVG · Ulrich Apel and contributors",
      license: "CC BY-SA 3.0",
      reviewStatus: "source model; feedback uncalibrated",
    };
    models.push(item);
    byCharacter.set(item.character, item);
  }
}
export function parseList(text) {
  const seen = new Set(),
    items = [],
    duplicates = new Set(),
    unsupported = new Set();
  for (const c of text.replace(/[\s,、]+/gu, "")) {
    if (seen.has(c)) duplicates.add(c);
    else if (byCharacter.has(c)) items.push(byCharacter.get(c));
    else unsupported.add(c);
    seen.add(c);
  }
  return { items, duplicates: [...duplicates], unsupported: [...unsupported] };
}
export async function loadModel(item) {
  const { API_BASE } = await import("../api.js");
  const url = new URL(`${API_BASE}/api/study/drawing`);
  url.searchParams.set("character", item.character);
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("The stroke model could not be opened.");
  const payload = await response.json();
  if (!Array.isArray(payload.items) || !payload.items.length) throw new Error("No stroke model found.");
  const [paths, numbers] = payload.items[0];
  return [paths, numbers, payload.meta || null];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const length = (line) => line.slice(1).reduce((sum, p, i) => sum + dist(line[i], p), 0);
export const isAccidentalTap = (line) => !line?.length || length(line) < 1.5;
export function resample(line, n = 24) {
  if (!line.length) return [];
  const stops = [0];
  for (let i = 1; i < line.length; i++) stops.push(stops[i - 1] + dist(line[i - 1], line[i]));
  if (!stops.at(-1)) return Array.from({ length: n }, () => line[0]);
  let j = 1;
  return Array.from({ length: n }, (_, i) => {
    const target = (stops.at(-1) * i) / (n - 1);
    while (j < stops.length - 1 && stops[j] < target) j++;
    const fraction = (target - stops[j - 1]) / (stops[j] - stops[j - 1] || 1);
    return line[j].map((v, k) => line[j - 1][k] + (v - line[j - 1][k]) * fraction);
  });
}
function strokeDirectionWord(start, end) {
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "bottom" : "top";
}
export function compareStroke(line, expected) {
  if (!line.length || !expected.length) return "No stroke to compare.";
  const actual = resample(line),
    model = resample(expected);
  const start = model[0],
    end = model.at(-1),
    first = actual[0],
    last = actual.at(-1);
  const span = length(expected),
    drawn = length(line),
    tolerance = span < 13 ? 5.5 : 12;
  const dx = end[0] - start[0],
    dy = end[1] - start[1];
  const forwardError = actual.reduce((sum, p, i) => sum + dist(p, model[i]), 0) / actual.length;
  const reverseError = actual.reduce((sum, p, i) => sum + dist(p, model[model.length - 1 - i]), 0) / actual.length;
  const straightReversed =
    Math.hypot(dx, dy) > 5 &&
    (last[0] - first[0]) * dx + (last[1] - first[1]) * dy < 0 &&
    forwardError > tolerance * 0.55;
  const curvedReversed = span >= 13 && reverseError < forwardError * 0.72 && forwardError > tolerance * 0.65;
  if (straightReversed || curvedReversed) {
    const refEnd = Math.hypot(dx, dy) > 5 ? end : model[Math.min(4, model.length - 1)];
    return `Draw toward the ${strokeDirectionWord(start, refEnd)}.`;
  }
  if (dist(first, start) > tolerance) {
    const x = start[0] - first[0],
      y = start[1] - first[1];
    return `Start farther ${Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up"}.`;
  }
  if (drawn < span * 0.55 || drawn > span * 1.9 || dist(last, end) > tolerance)
    return "Check how far this stroke extends.";
  const errors = actual.map((p, i) => dist(p, model[i]));
  if (errors.reduce((a, b) => a + b, 0) / errors.length > tolerance * 0.72 || Math.max(...errors) > tolerance * 1.6)
    return "Compare the bend and placement with the model.";
  return "";
}
function bounds(strokes) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const stroke of strokes)
    for (const [x, y] of stroke) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, w: maxX - minX, h: maxY - minY };
}
function alignDrawing(lines, expected) {
  if (!lines.length || !expected.length) return lines;
  const drawn = bounds(lines),
    ref = bounds(expected);
  if (!Number.isFinite(drawn.cx) || !Number.isFinite(ref.cx)) return lines;
  const dx = Math.max(-12, Math.min(12, ref.cx - drawn.cx));
  const dy = Math.max(-12, Math.min(12, ref.cy - drawn.cy));
  const drawnSpan = Math.hypot(drawn.w, drawn.h),
    refSpan = Math.hypot(ref.w, ref.h);
  const scale = drawnSpan > 12 && refSpan > 12 ? Math.max(0.82, Math.min(1.22, refSpan / drawnSpan)) : 1;
  return lines.map((stroke) =>
    stroke.map(([x, y]) => [drawn.cx + dx + (x - drawn.cx) * scale, drawn.cy + dy + (y - drawn.cy) * scale]),
  );
}
export function compareDrawingDetail(lines, expected, { allowOffset = false } = {}) {
  const check = (candidate) => {
    for (let i = 0; i < Math.min(candidate.length, expected.length); i++) {
      const message = compareStroke(candidate[i], expected[i]);
      if (message) return { message: `Stroke ${i + 1}: ${message}`, strokeIndex: i };
    }
    if (candidate.length !== expected.length) {
      return {
        message: `The model has ${expected.length} strokes; you drew ${candidate.length}.`,
        strokeIndex: Math.min(candidate.length, expected.length) - 1,
      };
    }
    return { message: "", strokeIndex: -1 };
  };
  const direct = check(lines);
  if (!direct.message || !allowOffset || lines.length !== expected.length) return direct;
  const aligned = check(alignDrawing(lines, expected));
  return !aligned.message ? aligned : direct;
}
export function compareDrawing(lines, expected, options) {
  return compareDrawingDetail(lines, expected, options).message;
}
