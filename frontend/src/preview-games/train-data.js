import { draft, distinct, requireDeck } from "./content.js";

const stations = {
  hill: ["丘","おか"], pine: ["松原","まつばら"], mill: ["水車","すいしゃ"], lake: ["湖","みずうみ"],
  gate: ["北門","きたもん"], well: ["井戸","いど"], grove: ["林","はやし"], falls: ["滝","たき"],
  peak: ["山頂","さんちょう"], inn: ["宿","やど"], bridge: ["石橋","いしばし"], port: ["港","みなと"],
  sand: ["砂浜","すなはま"], bay: ["入江","いりえ"], park: ["公園","こうえん"], tower: ["塔","とう"], market: ["市場","いちば"]
};
export const station = id => stations[id];
const service = (code, name, kana, stops) => ({ code, name, kana, stops: stops.split(" ") });
export const networks = {
  lake: { title: "Lakeside Railway", services: {
    L: service("L","湖線","みずうみせん","hill pine mill lake")
  }, transfers: [] },
  mountain: { title: "Mountain Fork Railway", services: {
    F: service("F","滝線","たきせん","gate well grove falls"),
    P: service("P","山頂線","さんちょうせん","gate well grove inn peak")
  }, transfers: [] },
  coast: { title: "Harbour Interchange", services: {
    H: service("H","港線","みなとせん","sand port bridge bay"),
    M: service("M","市場線","いちばせん","park bridge tower market")
  }, transfers: [["bridge","H","M"], ["bridge","M","H"]] }
};
const number = ["","一","二","三","四"], kanaNumber = ["","ひと","ふた","みっ","よっ"];

// A leg has its own platform state, even when the previous guess was wrong.
const ride = (service, dir, start, end, rule, arg) => ({
  service, dir, start, end, rule, arg, action: "ride", endService: service
});
const transfer = (service, dir, start, line, nextDir) => ({
  service, dir, start, end: start, rule: "transfer", arg: line, action: "transfer", endService: line, nextDir
});

export function solveLeg(net, leg) {
  const line = net.services[leg.service];
  requireDeck(line && [1,-1].includes(leg.dir), "unknown service/direction");
  const stops = leg.dir === 1 ? line.stops : [...line.stops].reverse();
  const start = stops.indexOf(leg.start);
  requireDeck(start >= 0 && distinct(stops) && stops.every(station), "invalid station order");
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
    const [name, kana] = station(leg.arg);
    const before = leg.rule === "before";
    clue = `${name}の${before ? "一つ手前" : "次"}の駅で降りてください。`;
    reading = `${kana}の${before ? "ひとつてまえ" : "つぎ"}のえきでおりてください。`;
    translation = `Get off one stop ${before ? "before" : "after"} ${name}.`;
  }
  return { clue, reading, translation };
}
export function routeFor(net, leg) {
  if (leg.action === "transfer") return `${station(leg.start)[0]}: ${leg.service} → ${leg.endService} (same station)`;
  const stops = [...net.services[leg.service].stops];
  if (leg.dir === -1) stops.reverse();
  return stops.slice(stops.indexOf(leg.start), stops.indexOf(leg.end) + 1).map(id => station(id)[0]).join(" → ");
}
export function validateJourney({ id, network, legs }) {
  const net = networks[network];
  requireDeck(net && legs.length, id);
  legs.forEach((leg,i) => {
    const answers = solveLeg(net, leg);
    requireDeck(answers.length === 1 && ["action","end","endService"].every(k => answers[0][k] === leg[k]), `${id}: unreachable or ambiguous leg ${i + 1}`);
    const previous = legs[i - 1];
    if (previous) requireDeck(previous.end === leg.start && previous.endService === leg.service &&
      (previous.nextDir ?? previous.dir) === leg.dir, `${id}: discontinuous route`);
  });
}
const journeysOn = (network, entries) => entries.map(([id,...legs]) => ({ ...draft, id: `${network}-${id}`, network, legs }));
const O = (s,d,a,b,n) => ride(s,d,a,b,"ordinal",n);
const B = (s,d,a,b,ref) => ride(s,d,a,b,"before",ref);
const A = (s,d,a,b,ref) => ride(s,d,a,b,"after",ref);
export const journeys = [
  ...journeysOn("lake", [
    ["pine", O("L",1,"hill","pine",1)], ["mill", O("L",1,"hill","mill",2)],
    ["hill", O("L",-1,"lake","hill",3)], ["east", A("L",1,"pine","lake","mill")],
    ["west", A("L",-1,"mill","hill","pine")], ["before-lake", B("L",1,"hill","mill","lake")],
    ["before-hill", B("L",-1,"lake","pine","hill")], ["from-mill", O("L",-1,"mill","pine",1)],
    ["outbound", O("L",1,"hill","pine",1), A("L",1,"pine","lake","mill")],
    ["inbound", B("L",-1,"lake","mill","pine"), O("L",-1,"mill","hill",2)]
  ]),
  ...journeysOn("mountain", [
    ["falls", O("F",1,"grove","falls",1)], ["inn", O("P",1,"grove","inn",1)],
    ["junction", B("P",1,"gate","grove","inn")], ["summit", A("P",1,"grove","peak","inn")],
    ["downhill", O("P",-1,"peak","grove",2)], ["return", O("F",-1,"falls","well",2)],
    ["before-falls", B("F",1,"gate","grove","falls")], ["after-well", A("P",-1,"grove","gate","well")],
    ["long-climb", O("P",1,"gate","grove",2), A("P",1,"grove","peak","inn")],
    ["waterfall-run", O("F",1,"gate","well",1), O("F",1,"well","falls",2)]
  ]),
  ...journeysOn("coast", [
    ["bridge", O("H",1,"sand","bridge",2)], ["toward-sand", B("H",-1,"bay","port","sand")],
    ["after-port", A("H",1,"sand","bridge","port")], ["toward-market", O("M",1,"park","market",3)],
    ["toward-park", A("M",-1,"market","park","bridge")], ["change-h", transfer("M",1,"bridge","H",-1)],
    ["change-m", transfer("H",-1,"bridge","M",1)],
    ["to-tower", O("H",1,"port","bridge",1), transfer("H",1,"bridge","M",1), O("M",1,"bridge","tower",1)],
    ["to-sand", B("M",-1,"market","bridge","park"), transfer("M",-1,"bridge","H",-1), O("H",-1,"bridge","sand",2)],
    ["to-bay", O("M",1,"park","bridge",1), transfer("M",1,"bridge","H",1), O("H",1,"bridge","bay",1)]
  ])
];
