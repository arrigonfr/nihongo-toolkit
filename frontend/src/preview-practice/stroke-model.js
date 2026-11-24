import manifest from "./stroke-index.json" with { type: "json" };
import { inflateSync, strFromU8 } from "fflate";

let offset = 0;
export const models = [...manifest.characters].map((character,i) => {
  const start = offset;
  offset += manifest.sizes[i];
  return { id:`draw-${character}`, character, level:manifest.levels[i], grade:manifest.grades[i], start, end:offset-1,
    source:"KanjiVG · Ulrich Apel and contributors", license:"CC BY-SA 3.0", contentVersion:manifest.revision, reviewStatus:"source model; feedback uncalibrated" };
});
const byCharacter = new Map(models.map(i=>[i.character,i]));
export function parseList(text) {
  const seen = new Set(), items = [], duplicates = new Set(), unsupported = new Set();
  for (const c of text.replace(/[\s,、]+/gu,"")) {
    if (seen.has(c)) duplicates.add(c);
    else if (byCharacter.has(c)) items.push(byCharacter.get(c));
    else unsupported.add(c);
    seen.add(c);
  }
  return {items,duplicates:[...duplicates],unsupported:[...unsupported]};
}
export async function loadModel(item,signal) {
  const response = await fetch(new URL("./stroke-models.bin",import.meta.url),{headers:{Range:`bytes=${item.start}-${item.end}`},signal});
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const block = response.status === 206 ? bytes : bytes.subarray(item.start,item.end+1);
  if (block.length !== item.end-item.start+1) throw new Error("Incomplete stroke asset");
  return JSON.parse(strFromU8(inflateSync(block)));
}
const dist = (a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const length = line => line.slice(1).reduce((sum,p,i)=>sum+dist(line[i],p),0);
export function resample(line,n=24) {
  if (!line.length) return [];
  const stops = [0];
  for (let i=1;i<line.length;i++) stops.push(stops[i-1]+dist(line[i-1],line[i]));
  if (!stops.at(-1)) return Array.from({length:n},()=>line[0]);
  let j=1;
  return Array.from({length:n},(_,i)=>{
    const target = stops.at(-1)*i/(n-1);
    while (j<stops.length-1 && stops[j]<target) j++;
    const fraction = (target-stops[j-1])/(stops[j]-stops[j-1] || 1);
    return line[j].map((v,k)=>line[j-1][k]+(v-line[j-1][k])*fraction);
  });
}
export function compareStroke(line,expected) {
  if (!line.length || !expected.length) return "No stroke to compare.";
  const actual = resample(line), model = resample(expected);
  const start = model[0], end = model.at(-1), first = actual[0], last = actual.at(-1);
  const span = length(expected), drawn = length(line), tolerance = span < 13 ? 5.5 : 12;
  const dx=end[0]-start[0], dy=end[1]-start[1];
  if (Math.hypot(dx,dy)>5 && (last[0]-first[0])*dx+(last[1]-first[1])*dy < 0) {
    return `Draw toward the ${Math.abs(dx)>Math.abs(dy) ? dx>0?"right":"left" : dy>0?"bottom":"top"}.`;
  }
  if (dist(first,start)>tolerance) {
    const x=start[0]-first[0], y=start[1]-first[1];
    return `Start farther ${Math.abs(x)>Math.abs(y) ? x>0?"right":"left" : y>0?"down":"up"}.`;
  }
  if (drawn < span*0.55 || drawn > span*1.9 || dist(last,end)>tolerance) return "Check how far this stroke extends.";
  const errors = actual.map((p,i)=>dist(p,model[i]));
  if (errors.reduce((a,b)=>a+b,0)/errors.length > tolerance*.72 || Math.max(...errors)>tolerance*1.6) return "Compare the bend and placement with the model.";
  return "";
}
export function compareDrawing(lines,expected) {
  for (let i=0;i<Math.min(lines.length,expected.length);i++) {
    const message = compareStroke(lines[i],expected[i]);
    if (message) return `Stroke ${i+1}: ${message}`;
  }
  if (lines.length !== expected.length) return `The model has ${expected.length} strokes; you drew ${lines.length}.`;
  return "";
}
