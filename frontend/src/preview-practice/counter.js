import { studyPool } from "../study-pool.js";
import { answers, el, kana, reading, select, setting } from "./ui.js";

const families = () => [...new Map(counter.items.map(i => [i.family, i])).values()];
const singular = {"sheets of paper":"sheet of paper","cupfuls of tea":"cupful of tea"};
const quantityLabel = i => `${i.quantity} ${i.quantity===1 ? singular[i.referent] || i.referent.replace(/s$/,"") : i.referent}`;
const prompt = i => `${quantityLabel(i)} · ${i.sense}`;
function contrast(i) {
  return counter.items.find(x => x.family === i.family && x.quantity === (i.quantity === 1 ? 2 : i.quantity === 20 ? 10 : i.quantity-1));
}
export function gradeCounter(i,input) {
  const typed = i.input === "reading", near = contrast(i);
  return {correct:typed ? i.readings.includes(kana(input)) : input === i.family, prompt:prompt(i),response:input,
    answer: typed ? i.readings.join(" / ") : i.family, mode:`${i.family} · ${i.sound}`,
    explanation:`${i.written} (${i.readings.join(" / ")}) counts ${i.sense}. Compare ${near.written} (${near.audio}).`};
}
export const counter = {
  ...studyPool("counter"),
  setup(c) {
    select(c,"counter-mode","Practice", [["mixed","Mixed session"],["family","Choose the counter"],["reading","Type the kana reading"]]);
    select(c,"counter-family","Counter family",[["all","All families"],...families().map(({family,sense})=>[family,`${family} · ${sense}`])]);
    select(c,"counter-sound","Sound pattern",[["all","All patterns"],["small-tsu","Small っ"],["voicing","Voicing"],["native","Native readings"],["regular","Other readings"]]);
    const table = el(c,"details");
    el(table,"summary","Browse counter readings");
    const pick = select(table,"counter-table","Reading table",families().map(({family,referent})=>[family,`${family} · ${referent}`]));
    const grid = el(table,"table",null,{class:"preview-practice-table"});
    function show() {
      grid.replaceChildren();
      const header = el(grid,"tr");
      for (const text of ["Form","Reading"]) el(header,"th",text,{scope:"col"});
      for (const i of counter.items.filter(x=>x.family === pick.value)) {
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
    return counter.items.filter(i=>(family === "all" || i.family === family) && (sound === "all" || i.sound === sound))
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
      answers(c,families().map(i=>i.family),"Counter family",v=>finish(gradeCounter(i,v)));
    }
  },
  review(c,i) { reading(c,i.audio); }
};
