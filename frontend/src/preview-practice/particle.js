import { studyPool } from "../study-pool.js";
import { el, kana, reading } from "./ui.js";
import { particleFurigana, particleReadings } from "./particle-furigana.js";
import { romanizeKana } from "../romanize.js";

export function gradeParticle(item, value) {
  const selected = [...new Set((Array.isArray(value) ? value : [value]).map(kana).filter(Boolean))];
  const right = selected.filter(p => item.accepted.includes(p));
  const wrong = selected.length - right.length;
  const complete = right.length === item.accepted.length;
  const correct = complete && !wrong;
  const assessment = correct ? "Correct" : !right.length ? "Wrong"
    : wrong ? (complete && item.accepted.length > 1 ? "Partially right" : "Partially wrong") : "Partially correct";
  const examples = item.accepted.map(p =>
    `${item.sentence.replace("|",p)} (${item.pronunciation.replace("|",p)})${item.nuances?.[p] ? ` — ${item.nuances[p].trim()}` : ""}`
  ).join(" / ");
  const missing = item.accepted.filter(p => !selected.includes(p));
  const incorrect = selected.filter(p => !item.accepted.includes(p));
  const details = [
    right.length && `Correctly selected: ${right.join(" / ")}.`,
    incorrect.length && `Incorrectly selected: ${incorrect.join(" / ")}.`,
    missing.length && `Not selected: ${missing.join(" / ")}.`
  ].filter(Boolean).join(" ");
  return { correct, assessment, prompt: `${item.context} ${item.sentence.replace("|", "□")}`, response: selected.join(" / "), answer: item.accepted.join(" / "),
    explanation: `${details} ${examples} — ${item.translation} ${item.explanation}`, mode: item.roleLabel };
}
const pool = studyPool("particle");
export const particle = {
  ...pool,
  async prepare(load) {
    await pool.prepare.call(this, load);
    this.readings = particleReadings(this.items);
  },
  setup(c) {
    el(c, "p", `Choose all particles that fit each sentence across ${particle.items.length.toLocaleString()} context-based prompts. Comparisons appear after answering.`);
  },
  render(c,i,finish) {
    el(c,"p",i.context);
    const parts=i.sentence.split("|"), sounds=i.pronunciation.split("|");
    const h=el(c,"h2",null,{lang:"ja",class:"study-japanese"});
    h.innerHTML=parts.map((part,j)=>particleFurigana(part,sounds[j],this.readings)).join(" □ ");
    const kanjiCount = text => [...text].filter(char => /[\p{Script=Han}々ヶヵ]/u.test(char)).length;
    const annotated = [...h.querySelectorAll("ruby")].reduce((count,ruby)=>count + kanjiCount(ruby.firstChild.textContent),0);
    if (annotated < kanjiCount(i.sentence)) {
      el(c,"p",`Reading: ${sounds.join(" □ ")}`,{lang:"ja",class:"particle-reading-fallback"});
    }
    el(c,"p",sounds.map(romanizeKana).join(" □ "),{class:"study-romaji"});
    el(c,"p","Select all correct particles.");
    const group = el(c,"div",null,{class:"answer-actions preview-practice-options",role:"group","aria-label":"Select all correct particles"});
    const selected = new Set();
    const check = el(c,"button","Check answers ",{type:"button",class:"primary particle-check","aria-keyshortcuts":"C"});
    check.disabled = true;
    el(check,"kbd","C",{class:"particle-shortcut","aria-hidden":"true"});
    const choices = i.choices.map((choice,index) => {
      const option = el(group,"button",null,{type:"button","aria-pressed":"false","aria-keyshortcuts":String(index+1)});
      el(option,"span",choice,{lang:"ja"});
      el(option,"kbd",String(index+1),{class:"particle-shortcut","aria-hidden":"true"});
      option.onclick = () => {
        if (selected.has(choice)) selected.delete(choice); else selected.add(choice);
        option.setAttribute("aria-pressed",String(selected.has(choice)));
        check.disabled = !selected.size;
      };
      return option;
    });
    check.onclick = () => finish(gradeParticle(i,[...selected]));
    const keydown = event => {
      if (!matchMedia("(min-width: 761px) and (hover: hover)").matches || event.repeat || event.isComposing ||
          event.ctrlKey || event.altKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable=true]") ||
          document.querySelector("dialog[open]")) return;
      const option = /^[1-9]$/.test(event.key) ? choices[Number(event.key)-1] : event.key.toLowerCase() === "c" ? check : null;
      if (option && !option.disabled) { event.preventDefault(); option.click(); }
    };
    document.addEventListener("keydown",keydown);
    return () => document.removeEventListener("keydown",keydown);
  },
  review(c,i,result) {
    for (const p of i.accepted) reading(c,i.pronunciation.replace("|",p));
    const partner = particle.items.find(x=>x.id === i.partner);
    if (partner) {
      const details = el(c,"details");
      el(details,"summary","Compare the paired context");
      el(details,"p",partner.context);
      el(details,"p",partner.sentence.replace("|",partner.accepted[0]),{lang:"ja"});
      el(details,"p",partner.explanation);
    }
  }
};
