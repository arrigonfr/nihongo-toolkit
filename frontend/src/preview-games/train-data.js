import { distinct, requireDeck } from "./content.js";

const number = ["","一","二","三","四"], kanaNumber = ["","ひと","ふた","みっ","よっ"];

export function solveLeg(net, leg) {
  const line = net.services[leg.service];
  requireDeck(line && [1,-1].includes(leg.dir), "unknown service/direction");
  const stops = leg.dir === 1 ? line.stops : [...line.stops].reverse();
  const start = stops.indexOf(leg.start);
  requireDeck(start >= 0 && distinct(stops) && stops.every(id => net.stations[id]), "invalid station order");
  if (leg.rule === "transfer") {
    return net.transfers.filter(([s,from,to]) => s === leg.start && from === leg.service && to === leg.arg &&
      net.services[to]?.stops.includes(s)).map(([, ,to]) => ({ action: "transfer", end: leg.start, endService: to }));
  }
  let dest;
  if (leg.rule === "ordinal" && Number.isInteger(leg.arg) && number[leg.arg]) dest = start + leg.arg;
  if (["before","after"].includes(leg.rule)) {
    const landmark = stops.indexOf(leg.arg);
    if (landmark < start) return [];
    dest = landmark + (leg.rule === "before" ? -1 : 1);
  }
  return dest > start && dest < stops.length ?
    [{ action: "ride", end: stops[dest], endService: leg.service }] : [];
}

export function clueFor(net, leg) {
  let clue, reading, translation;
  if (leg.rule === "transfer") {
    const target = net.services[leg.arg];
    clue = `${target.name}に乗り換えてください。`;
    reading = `${target.kana}にのりかえてください。`;
    translation = `Transfer to ${target.code} · ${target.name} at the current station.`;
  } else if (leg.rule === "ordinal") {
    clue = `${number[leg.arg]}つ目の駅で降りてください。`;
    reading = `${kanaNumber[leg.arg]}つめのえきでおりてください。`;
    translation = `Get off at stop ${leg.arg} ahead.`;
  } else {
    const [name, kana] = net.stations[leg.arg];
    const before = leg.rule === "before";
    clue = `${name}の${before ? "一つ手前" : "次"}の駅で降りてください。`;
    reading = `${kana}の${before ? "ひとつてまえ" : "つぎ"}のえきでおりてください。`;
    translation = `Get off one stop ${before ? "before" : "after"} ${name}.`;
  }
  return { clue, reading, translation };
}
export function routeFor(net, leg) {
  if (leg.action === "transfer") return `${net.stations[leg.start][0]}: ${leg.service} → ${leg.endService} (same station)`;
  const stops = [...net.services[leg.service].stops];
  if (leg.dir === -1) stops.reverse();
  return stops.slice(stops.indexOf(leg.start), stops.indexOf(leg.end) + 1).map(id => net.stations[id][0]).join(" → ");
}
export function validateJourney({ id, net, legs }) {
  requireDeck(net && legs.length, id);
  legs.forEach((leg,i) => {
    const answers = solveLeg(net, leg);
    requireDeck(answers.length === 1 && ["action","end","endService"].every(k => answers[0][k] === leg[k]), `${id}: unreachable or ambiguous leg ${i + 1}`);
    const previous = legs[i - 1];
    if (previous) requireDeck(previous.end === leg.start && previous.endService === leg.service &&
      (previous.nextDir ?? previous.dir) === leg.dir, `${id}: discontinuous route`);
  });
}
