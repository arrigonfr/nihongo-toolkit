import { gameCredits as draft } from "./credits.js";

const stations = {
  hill: ["丘","おか"], pine: ["松原","まつばら"], mill: ["水車","すいしゃ"], lake: ["湖","みずうみ"],
  gate: ["北門","きたもん"], well: ["井戸","いど"], grove: ["林","はやし"], falls: ["滝","たき"],
  peak: ["山頂","さんちょう"], inn: ["宿","やど"], bridge: ["石橋","いしばし"], port: ["港","みなと"],
  sand: ["砂浜","すなはま"], bay: ["入江","いりえ"], park: ["公園","こうえん"], tower: ["塔","とう"], market: ["市場","いちば"]
};

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
const ride = (service, dir, start, end, rule, arg) => ({
  service, dir, start, end, rule, arg, action: "ride", endService: service
});
const transfer = (service, dir, start, line, nextDir) => ({
  service, dir, start, end: start, rule: "transfer", arg: line, action: "transfer", endService: line, nextDir
});

const journeysOn = (network, entries) => entries.map(([id,...legs]) => ({ ...draft, id: `${network}-${id}`, network, legs }));
const O = (s,d,a,b,n) => ride(s,d,a,b,"ordinal",n);
const B = (s,d,a,b,ref) => ride(s,d,a,b,"before",ref);
const A = (s,d,a,b,ref) => ride(s,d,a,b,"after",ref);
const journeys = [
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

export const items = journeys.map(journey => {
  const net = networks[journey.network];
  const stops = new Set(Object.values(net.services).flatMap(line => line.stops));
  return { ...journey, net: { ...net, stations: Object.fromEntries([...stops].map(id => [id, stations[id]])) } };
});
