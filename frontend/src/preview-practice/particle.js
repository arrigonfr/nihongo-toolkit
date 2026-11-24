import { studyPool } from "../study-pool.js";
import { answers, el, kana, reading, select, setting } from "./ui.js";
import { alignFuriganaRuby } from "../furigana.js";
import { romanizeKana } from "../romanize.js";

export function gradeParticle(item, value) {
  const p = kana(value), correct = item.accepted.includes(p), key = correct ? p : item.accepted[0];
  const nuance = item.nuances?.[key] || "";
  return { correct, prompt: `${item.context} ${item.sentence.replace("|", "□")}`, response: value, answer: item.accepted.join(" / "),
    explanation: `${item.sentence.replace("|",key)} (${item.pronunciation.replace("|",key)}) — ${item.translation} ${nuance}${item.explanation}`, mode: item.roleLabel };
}
export const particle = {
  ...studyPool("particle"),
  setup(c) {
    select(c,"particle-role","Particle role",[["all","All roles"],...new Map(particle.items.map(i => [i.role, i.roleLabel]))]);
    select(c,"particle-task","Practice", [["mixed","Mixed review"],["contrast","Contrast pairs"],["blank","Sentence blanks"]]);
    select(c,"particle-input","Answer with",[["choice","Particle choices"],["typed","Typed particle"]]);
  },
  pool(c) {
    const role = setting(c,"particle-role","all"), task = setting(c,"particle-task","mixed");
    return particle.items.filter(i => (role === "all" || role === i.role) && (task === "mixed" || i.taskType === task))
      .map(i => ({...i, input: setting(c,"particle-input","choice")}));
  },
  render(c,i,finish) {
    el(c,"p",i.context);
    const parts=i.sentence.split("|"), sounds=i.pronunciation.split("|");
    const h=el(c,"h2",null,{lang:"ja",class:"study-japanese"});
    h.innerHTML=parts.map((part,j)=>alignFuriganaRuby(part,sounds[j])).join(" □ ");
    el(c,"p",sounds.map(romanizeKana).join(" □ "),{class:"study-romaji"});
    const options = i.choices;
    answers(c,i.input === "typed" ? null : options,i.input === "typed" ? "Type the particle in kana" : "Your particle",v => finish(gradeParticle(i,v)));
  },
  review(c,i,result) {
    const p = result.correct ? kana(result.response) : i.accepted[0];
    reading(c,i.pronunciation.replace("|",p));
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
