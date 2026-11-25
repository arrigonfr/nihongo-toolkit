import { practiceCredits as draft } from "./credits.js";
import { counterContexts } from "./counter-contexts.js";

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
const cells = rows.flatMap(([family, referent, sense, cells]) => cells.split(" ").map((cell,n) => ({
  ...draft,id:`counter-${family}-${n === 11 ? 20 : n+1}`,family,referent,sense,quantity:n === 11 ? 20 : n+1,
  written: numbers[n] + (family === "つ" && n === 9 ? "" : family), readings:cell.split("/"), audio:cell.split("/")[0],
  sound: family === "つ" || family === "人" && n < 2 ? "native" : cell.includes("っ") ? "small-tsu" : /[びぼば]/.test(cell) ? "voicing" : "regular"
})));
const irregular = {
  die:"dice", mouse:"mice", goose:"geese", calf:"calves", wolf:"wolves", deer:"deer", elk:"elk", moose:"moose",
  goldfish:"goldfish", carp:"carp", salmon:"salmon", trout:"trout", tuna:"tuna",
  squid:"squid", shrimp:"shrimp", octopus:"octopuses", rhinoceros:"rhinoceroses",
  "lump of clay":"lumps of clay", "piece of string":"pieces of string", "piece of rope":"pieces of rope"
};
function plural(noun) {
  if (irregular[noun]) return irregular[noun];
  if (/[^aeiou]y$/.test(noun)) return `${noun.slice(0,-1)}ies`;
  if (/(s|sh|ch|x)$/.test(noun)) return `${noun}es`;
  if (/(tomato|potato)$/.test(noun)) return `${noun}es`;
  return `${noun}s`;
}
export const items = cells.flatMap(item => [
  item,
  ...counterContexts[item.family].split("|").map(noun => ({
    ...item,
    id: `${item.id}-${encodeURIComponent(noun)}`,
    referent: item.family === "杯" ? `cupfuls of ${noun}` : plural(noun),
    referentSingular: item.family === "杯" ? `cupful of ${noun}` : noun
  }))
]);
