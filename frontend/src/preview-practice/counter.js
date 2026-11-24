import { answers, draft, el, kana, reading, select, setting } from "./ui.js";

// Explicit cells, not a pronunciation generator. Slashes separate supported readings.
const rows = [
  ["本","pencils","long, slender objects","いっぽん にほん さんぼん よんほん ごほん ろっぽん ななほん/しちほん はっぽん きゅうほん じゅっぽん/じっぽん じゅういっぽん にじゅっぽん/にじっぽん"],
  ["枚","sheets of paper","flat, thin objects","いちまい にまい さんまい よんまい ごまい ろくまい ななまい/しちまい はちまい きゅうまい じゅうまい じゅういちまい にじゅうまい"],
  ["個","erasers","individual small objects, using the Sino-Japanese counter","いっこ にこ さんこ よんこ ごこ ろっこ ななこ/しちこ はっこ きゅうこ じゅっこ/じっこ じゅういっこ にじゅっこ/にじっこ"],
  ["人","passengers","people in an ordinary headcount","ひとり ふたり さんにん よにん ごにん ろくにん しちにん/ななにん はちにん きゅうにん/くにん じゅうにん じゅういちにん にじゅうにん"],
  ["匹","pet cats","small animals","いっぴき にひき さんびき よんひき ごひき ろっぴき ななひき/しちひき はっぴき きゅうひき じゅっぴき/じっぴき じゅういっぴき にじゅっぴき/にじっぴき"],
  ["頭","elephants","large animals","いっとう にとう さんとう よんとう ごとう ろくとう ななとう/しちとう はっとう/はちとう きゅうとう じゅっとう/じっとう じゅういっとう にじゅっとう/にじっとう"],
  ["羽","sparrows","birds","いちわ にわ さんわ/さんば よんわ ごわ ろくわ/ろっぱ ななわ/しちわ はちわ/はっぱ きゅうわ じゅうわ/じゅっぱ/じっぱ じゅういちわ にじゅうわ/にじゅっぱ/にじっぱ"],
  ["冊","paperback books","bound volumes","いっさつ にさつ さんさつ よんさつ ごさつ ろくさつ ななさつ/しちさつ はっさつ きゅうさつ じゅっさつ/じっさつ じゅういっさつ にじゅっさつ/にじっさつ"],
  ["台","laptops","machines","いちだい にだい さんだい よんだい ごだい ろくだい ななだい/しちだい はちだい きゅうだい じゅうだい じゅういちだい にじゅうだい"],
  ["杯","cupfuls of tea","servings in cups","いっぱい にはい さんばい よんはい ごはい ろっぱい ななはい/しちはい はっぱい きゅうはい じゅっぱい/じっぱい じゅういっぱい にじゅっぱい/にじっぱい"],
  ["回","practice sessions","occurrences, rather than the total amount of time","いっかい にかい さんかい よんかい ごかい ろっかい ななかい/しちかい はっかい きゅうかい じゅっかい/じっかい じゅういっかい にじゅっかい/にじっかい"],
  ["つ","apples","items, using the native Japanese counting series","ひとつ ふたつ みっつ よっつ いつつ むっつ ななつ やっつ ここのつ とお"]
];
const numbers = ["一","二","三","四","五","六","七","八","九","十","十一","二十"];
const items = rows.flatMap(([family, referent, sense, cells]) => cells.split(" ").map((cell,n) => ({
  ...draft,id:`counter-${family}-${n === 11 ? 20 : n+1}`,family,referent,sense,quantity:n === 11 ? 20 : n+1,
  written: numbers[n] + (family === "つ" && n === 9 ? "" : family), readings:cell.split("/"), audio:cell.split("/")[0],
  sound: family === "つ" || family === "人" && n < 2 ? "native" : cell.includes("っ") ? "small-tsu" : /[びぼば]/.test(cell) ? "voicing" : "regular"
})));
const singular = {"sheets of paper":"sheet of paper","cupfuls of tea":"cupful of tea"};
const quantityLabel = i => `${i.quantity} ${i.quantity===1 ? singular[i.referent] || i.referent.replace(/s$/,"") : i.referent}`;
const prompt = i => `${quantityLabel(i)} · ${i.sense}`;
function contrast(i) {
  return items.find(x => x.family === i.family && x.quantity === (i.quantity === 1 ? 2 : i.quantity === 20 ? 10 : i.quantity-1));
}
export function gradeCounter(i,input) {
  const typed = i.input === "reading", near = contrast(i);
  return {correct:typed ? i.readings.includes(kana(input)) : input === i.family, prompt:prompt(i),response:input,
    answer: typed ? i.readings.join(" / ") : i.family, mode:`${i.family} · ${i.sound}`,
    explanation:`${i.written} (${i.readings.join(" / ")}) counts ${i.sense}. Compare ${near.written} (${near.audio}).`};
}
export const counter = {
  items,
  setup(c) {
    select(c,"counter-mode","Practice", [["mixed","Mixed session"],["family","Choose the counter"],["reading","Type the kana reading"]]);
    select(c,"counter-family","Counter family",[["all","All families"],...rows.map(([k,,sense])=>[k,`${k} · ${sense}`])]);
    select(c,"counter-sound","Sound pattern",[["all","All patterns"],["small-tsu","Small っ"],["voicing","Voicing"],["native","Native readings"],["regular","Other readings"]]);
    const table = el(c,"details");
    el(table,"summary","Browse counter readings");
    const pick = select(table,"counter-table","Reading table",rows.map(([k,ref])=>[k,`${k} · ${ref}`]));
    const grid = el(table,"table",null,{class:"preview-practice-table"});
    function show() {
      grid.replaceChildren();
      const header = el(grid,"tr");
      for (const text of ["Form","Reading"]) el(header,"th",text,{scope:"col"});
      for (const i of items.filter(x=>x.family === pick.value)) {
        const tr = el(grid,"tr");
        el(tr,"th",i.written,{scope:"row",lang:"ja"});
        reading(el(tr,"td"),i.readings.join(" / "));
        tr.querySelector("button").dataset.studySpeak = i.audio;
        tr.querySelector("button").setAttribute("aria-label",`Listen: ${i.audio}`);
      }
    }
    pick.addEventListener("change",show);
    table.addEventListener("toggle",show);
    show();
  },
  pool(c) {
    const family = setting(c,"counter-family","all"), mode = setting(c,"counter-mode","mixed"), sound = setting(c,"counter-sound","all");
    return items.filter(i=>(family === "all" || i.family === family) && (sound === "all" || i.sound === sound))
      .map(i=>({...i,input:mode === "mixed" ? (Math.random()<0.5 ? "family" : "reading") : mode}));
  },
  render(c,i,finish) {
    el(c,"p",`Count ${i.sense}.`);
    el(c,"h2",quantityLabel(i));
    if (i.input === "reading") {
      el(c,"p",i.written,{lang:"ja"});
      answers(c,null,"Full reading in kana",v=>finish(gradeCounter(i,v)));
    } else {
      el(c,"p","Choose the specific counter family described above.");
      answers(c,rows.map(([k])=>k),"Counter family",v=>finish(gradeCounter(i,v)));
    }
  },
  review(c,i) { reading(c,i.audio); }
};
