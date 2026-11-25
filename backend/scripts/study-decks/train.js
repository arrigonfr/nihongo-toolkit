import { gameCredits as draft } from "./credits.js";

const stations = {
  hill: ["丘","おか"], pine: ["松原","まつばら"], mill: ["水車","すいしゃ"], lake: ["湖","みずうみ"],
  gate: ["北門","きたもん"], well: ["井戸","いど"], grove: ["林","はやし"], falls: ["滝","たき"],
  peak: ["山頂","さんちょう"], inn: ["宿","やど"], bridge: ["石橋","いしばし"], port: ["港","みなと"],
  sand: ["砂浜","すなはま"], bay: ["入江","いりえ"], park: ["公園","こうえん"], tower: ["塔","とう"], market: ["市場","いちば"],
  west: ["西口","にしぐち"], shrine: ["神社","じんじゃ"], river: ["川辺","かわべ"], castle: ["城前","しろまえ"],
  east: ["東町","ひがしまち"], garden: ["庭園","ていえん"], hall: ["公会堂","こうかいどう"], hillview: ["見晴台","みはらしだい"],
  south: ["南駅","みなみえき"],
  plum: ["梅林","ばいりん"], bamboo: ["竹林","ちくりん"], valley: ["桜谷","さくらだに"], temple: ["古寺","ふるでら"],
  onsen: ["温泉","おんせん"], ridge: ["尾根","おね"], creek: ["小川","おがわ"], cedar: ["杉並","すぎなみ"], gorge: ["渓谷","けいこく"],
  sakura_st: ["桜町","さくらまち"], museum: ["美術館","びじゅつかん"], central: ["中央","ちゅうおう"], theater: ["劇場","げきじょう"],
  plaza: ["広場","ひろば"], bayview: ["海見","うみみ"], north_gate: ["北口","きたぐち"], university: ["大学前","だいがくまえ"],
  station_s: ["南口","みなみぐち"], harbor_s: ["埠頭","ふとう"],
  warehouse: ["赤煉瓦","あかれんが"], canal: ["運河","うんが"], old_market: ["旧市場","きゅういちば"],
  lantern: ["提灯町","ちょうちんまち"], torii: ["鳥居前","とりいまえ"], slope: ["坂下","さかした"],
  library: ["図書館","としょかん"], clocktower: ["時計台","とけいだい"], lookout: ["展望台","てんぼうだい"],
  ferry: ["渡し場","わたしば"], lighthouse: ["灯台","とうだい"], cove: ["入り浜","いりはま"],
  cape: ["松岬","まつみさき"], cliff: ["断崖","だんがい"], salt_flat: ["塩浜","しおはま"],
  fishing_port: ["漁港","ぎょこう"], reef: ["岩場","いわば"]
};

const service = (code, name, kana, stops) => ({ code, name, kana, stops: stops.split(" ") });
export const networks = {
  lake: { title: "Lakeside Railway", services: {
    L: service("L","湖線","みずうみせん","hill pine mill lake")
  }, transfers: [] },
  mountain: { title: "Mountain Fork Railway", services: {
    F: service("F","滝線","たきせん","gate well grove falls"),
    P: service("P","山頂線","さんちょうせん","gate well grove inn peak")
  }, transfers: [["grove","F","P"], ["grove","P","F"]] },
  coast: { title: "Harbour Interchange", services: {
    H: service("H","港線","みなとせん","sand port bridge bay"),
    M: service("M","市場線","いちばせん","park bridge tower market")
  }, transfers: [["bridge","H","M"], ["bridge","M","H"]] },
  river: { title: "Riverside Metro", services: {
    R: service("R","川線","かわせん","west shrine river castle east"),
    S: service("S","城線","しろせん","garden river hall castle hillview south")
  }, transfers: [
    ["river","R","S"], ["river","S","R"],
    ["castle","R","S"], ["castle","S","R"]
  ] },
  valley: { title: "Sakura Valley Line", services: {
    V: service("V","桜線","さくらせん","plum bamboo valley temple onsen ridge"),
    K: service("K","渓谷線","けいこくせん","creek valley cedar gorge")
  }, transfers: [["valley","V","K"], ["valley","K","V"]] },
  capital: { title: "Capital Cross", services: {
    C: service("C","中央線","ちゅうおうせん","sakura_st museum central theater plaza bayview"),
    N: service("N","南北線","なんぼくせん","north_gate university central station_s harbor_s")
  }, transfers: [["central","C","N"], ["central","N","C"]] },
  oldtown: { title: "Old Town Tramway", services: {
    T: service("T","下町線","したまちせん","warehouse canal old_market lantern torii"),
    B: service("B","坂道線","さかみちせん","slope library old_market clocktower lookout")
  }, transfers: [["old_market","T","B"], ["old_market","B","T"]] },
  peninsula: { title: "Peninsula Express", services: {
    E: service("E","岬線","みさきせん","ferry lighthouse cove cape cliff"),
    U: service("U","海辺線","うみべせん","salt_flat cove fishing_port reef")
  }, transfers: [["cove","E","U"], ["cove","U","E"]] }
};
const ride = (service, dir, start, end, rule, arg) => ({
  service, dir, start, end, rule, arg, action: "ride", endService: service
});
const transfer = (service, dir, start, line, nextDir) => ({
  service, dir, start, end: start, rule: "transfer", arg: line, action: "transfer", endService: line, nextDir
});

const journeysOn = (network, entries) => entries.map(([id,...legs]) => ({ ...draft, id: `${network}-${id}`, network, legs }));
const O = (s,d,a,b,n) => ride(s,d,a,b,"ordinal",n);
const S = (s,d,a,b,n) => ride(s,d,a,b,"stationsAhead",n);
const N = (s,d,a,b) => ride(s,d,a,b,"nextNext");
const T = (s,d,a,b) => ride(s,d,a,b,"terminal");
const B = (s,d,a,b,ref) => ride(s,d,a,b,"before",ref);
const A = (s,d,a,b,ref) => ride(s,d,a,b,"after",ref);

const baseJourneys = [
  ...journeysOn("lake", [
    ["pine", O("L",1,"hill","pine",1)], ["mill", O("L",1,"hill","mill",2)],
    ["hill", O("L",-1,"lake","hill",3)], ["east", A("L",1,"pine","lake","mill")],
    ["west", A("L",-1,"mill","hill","pine")], ["before-lake", B("L",1,"hill","mill","lake")],
    ["before-hill", B("L",-1,"lake","pine","hill")], ["from-mill", O("L",-1,"mill","pine",1)],
    ["terminal-lake", T("L",1,"pine","lake")], ["next-next-mill", N("L",1,"hill","mill")],
    ["outbound", O("L",1,"hill","pine",1), A("L",1,"pine","lake","mill")],
    ["inbound", B("L",-1,"lake","mill","pine"), O("L",-1,"mill","hill",2)]
  ]),
  ...journeysOn("mountain", [
    ["falls", O("F",1,"grove","falls",1)], ["inn", O("P",1,"grove","inn",1)],
    ["junction", B("P",1,"gate","grove","inn")], ["summit", A("P",1,"grove","peak","inn")],
    ["downhill", O("P",-1,"peak","grove",2)], ["return", O("F",-1,"falls","well",2)],
    ["before-falls", B("F",1,"gate","grove","falls")], ["after-well", A("P",-1,"grove","gate","well")],
    ["terminal-peak", T("P",1,"well","peak")], ["ahead-three", S("P",1,"gate","inn",3)],
    ["long-climb", O("P",1,"gate","grove",2), A("P",1,"grove","peak","inn")],
    ["waterfall-run", O("F",1,"gate","well",1), O("F",1,"well","falls",2)],
    ["peak-return", N("P",-1,"peak","grove"), T("P",-1,"grove","gate")]
  ]),
  ...journeysOn("coast", [
    ["bridge", O("H",1,"sand","bridge",2)], ["toward-sand", B("H",-1,"bay","port","sand")],
    ["after-port", A("H",1,"sand","bridge","port")], ["toward-market", O("M",1,"park","market",3)],
    ["toward-park", A("M",-1,"market","park","bridge")], ["change-h", transfer("M",1,"bridge","H",-1)],
    ["change-m", transfer("H",-1,"bridge","M",1)], ["terminal-market", T("M",1,"bridge","market")],
    ["to-tower", O("H",1,"port","bridge",1), transfer("H",1,"bridge","M",1), O("M",1,"bridge","tower",1)],
    ["to-sand", B("M",-1,"market","bridge","park"), transfer("M",-1,"bridge","H",-1), O("H",-1,"bridge","sand",2)],
    ["to-bay", O("M",1,"park","bridge",1), transfer("M",1,"bridge","H",1), O("H",1,"bridge","bay",1)],
    ["to-market-end", N("H",1,"sand","bridge"), transfer("H",1,"bridge","M",1), T("M",1,"bridge","market")],
    ["to-park-end", S("H",-1,"bay","bridge",1), transfer("H",-1,"bridge","M",-1), T("M",-1,"bridge","park")]
  ]),
  ...journeysOn("river", [
    ["to-castle", S("R",1,"west","castle",3)],
    ["next-next-river", N("R",1,"west","river")],
    ["terminal-east", T("R",1,"shrine","east")],
    ["terminal-garden", T("S",-1,"castle","garden")],
    ["before-south", B("S",1,"river","hillview","south")],
    ["after-hall", A("S",-1,"hillview","river","hall")],
    ["river-to-hall", O("R",1,"shrine","river",1), transfer("R",1,"river","S",1), O("S",1,"river","hall",1)],
    ["river-to-south", N("R",1,"west","river"), transfer("R",1,"river","S",1), T("S",1,"river","south")],
    ["castle-to-east", N("S",1,"river","castle"), transfer("S",1,"castle","R",1), O("R",1,"castle","east",1)],
    ["castle-to-west", B("S",-1,"south","castle","hall"), transfer("S",-1,"castle","R",-1), T("R",-1,"castle","west")],
    ["garden-to-shrine", O("S",1,"garden","river",1), transfer("S",1,"river","R",-1), S("R",-1,"river","shrine",1)],
    ["east-to-hillview", O("R",-1,"east","castle",1), transfer("R",-1,"castle","S",1), O("S",1,"castle","hillview",1)]
  ])
];

function legSignature(leg) {
  return `${leg.service}:${leg.dir}:${leg.start}:${leg.end}:${leg.rule}:${leg.arg ?? ""}:${leg.endService}:${leg.nextDir ?? ""}`;
}
function journeySignature(network, legs) {
  return `${network}|${legs.map(legSignature).join(">")}`;
}

function possibleRideLegs(svc, dir) {
  const stops = dir === 1 ? svc.stops : [...svc.stops].reverse();
  const out = [];
  for (let i = 0; i < stops.length - 1; i++) {
    const start = stops[i];
    for (let step = 1; step <= Math.min(4, stops.length - 1 - i); step++) {
      const end = stops[i + step];
      out.push(O(svc.code, dir, start, end, step));
      out.push(S(svc.code, dir, start, end, step));
      if (step === 2) out.push(N(svc.code, dir, start, end));
      if (i + step === stops.length - 1) out.push(T(svc.code, dir, start, end));
      if (i + step + 1 < stops.length) out.push(B(svc.code, dir, start, end, stops[i + step + 1]));
      if (step >= 2) out.push(A(svc.code, dir, start, end, stops[i + step - 1]));
    }
  }
  return out;
}

function expandJourneys(existing) {
  const seen = new Set(existing.map(j => journeySignature(j.network, j.legs)));
  const all = [...existing];
  const ruleBucket = rule => ["ordinal", "stationsAhead", "nextNext"].includes(rule) ? "counting"
    : ["before", "after"].includes(rule) ? "relative" : rule;

  for (const [netKey, net] of Object.entries(networks)) {
    let seq = 1;
    const singleCounts = { counting: 0, relative: 0, terminal: 0, transfer: 0 };
    const multiCounts = { counting: 0, relative: 0, terminal: 0, transfer: 0 };
    for (const j of existing) {
      if (j.network !== netKey) continue;
      const buckets = new Set(j.legs.map(l => ruleBucket(l.rule)));
      const map = j.legs.length === 1 ? singleCounts : multiCounts;
      for (const b of buckets) map[b] = (map[b] || 0) + 1;
    }

    const add = (legs, capMap, bucket, limit) => {
      if (capMap[bucket] >= limit) return false;
      const sig = journeySignature(netKey, legs);
      if (seen.has(sig)) return false;
      seen.add(sig);
      all.push({ ...draft, id: `${netKey}-auto-${seq++}`, network: netKey, legs });
      for (const b of new Set(legs.map(l => ruleBucket(l.rule)))) capMap[b] = (capMap[b] || 0) + 1;
      return true;
    };

    const rideLegs = [];
    for (const svc of Object.values(net.services)) {
      for (const dir of [1, -1]) rideLegs.push(...possibleRideLegs(svc, dir));
    }
    const transferLegs = [];
    for (const [st, from, to] of net.transfers) {
      for (const dir of [1, -1]) {
        for (const nextDir of [1, -1]) {
          transferLegs.push(transfer(from, dir, st, to, nextDir));
        }
      }
    }

    // 1. Single-leg variety across all rules
    const singleTargets = { counting: 10, relative: 8, terminal: 6, transfer: 6 };
    for (const leg of rideLegs) {
      const b = ruleBucket(leg.rule);
      add([leg], singleCounts, b, singleTargets[b]);
    }
    for (const leg of transferLegs) {
      add([leg], singleCounts, "transfer", singleTargets.transfer);
    }

    // 2. Two-leg same-line journeys (counting, relative, terminal)
    const byStart = new Map();
    for (const leg of rideLegs) {
      const k = `${leg.service}:${leg.dir}:${leg.start}`;
      if (!byStart.has(k)) byStart.set(k, []);
      byStart.get(k).push(leg);
    }
    for (const first of rideLegs) {
      const nexts = byStart.get(`${first.service}:${first.dir}:${first.end}`) || [];
      for (const second of nexts) {
        if (first.rule === second.rule) continue;
        const b2 = ruleBucket(second.rule);
        if (add([first, second], multiCounts, b2, b2 === "terminal" ? 8 : 10)) break;
      }
    }

    // 3. Multi-leg transfer journeys (ride -> transfer -> ride)
    for (const [st, from, to] of net.transfers) {
      const arrivals = rideLegs.filter(l => l.service === from && l.end === st);
      const departures = rideLegs.filter(l => l.service === to && l.start === st);
      for (const first of arrivals) {
        for (const third of departures) {
          const xfer = transfer(from, first.dir, st, to, third.dir);
          if (add([first, xfer, third], multiCounts, "transfer", 12)) break;
        }
      }
    }
  }
  return all;
}

const journeys = expandJourneys(baseJourneys);

export const items = journeys.map(journey => {
  const net = networks[journey.network];
  const stops = new Set(Object.values(net.services).flatMap(line => line.stops));
  return { ...journey, net: { ...net, stations: Object.fromEntries([...stops].map(id => [id, stations[id]])) } };
});
