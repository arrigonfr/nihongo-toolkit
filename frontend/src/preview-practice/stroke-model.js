async function drawingRequest(params) {
  const {fetchItems} = await import("../api.js");
  return fetchItems("/api/study/drawing",params);
}
export const models = [];
const byCharacter = new Map();
export async function prepareModels(request=drawingRequest) {
  const rows = await request({});
  models.length=0; byCharacter.clear();
  for (const row of rows) {
    const item={...row,id:`draw-${row.character}`,source:"KanjiVG · Ulrich Apel and contributors",license:"CC BY-SA 3.0", reviewStatus:"source model; feedback uncalibrated"};
    models.push(item); byCharacter.set(item.character,item);
  }
}
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
export async function loadModel(item) {
  const [model]=await drawingRequest({character:item.character});
  return model;
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
