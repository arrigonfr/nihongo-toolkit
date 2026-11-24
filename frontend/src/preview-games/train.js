import { el, ja, root, button, setupNote, playButton, silence, status } from "./dom.js";
import { networks, station, journeys, validateJourney, routeFor, clueFor } from "./train-data.js";

journeys.forEach(validateJourney);
export const train = {
  items: journeys,
  setup(container) {
    setupNote(container, "Count stops ahead, not your starting station. A transfer changes lines without moving.");
  },
  render(container, item, finish) {
    const net = networks[item.network], board = root(container), results = [];
    let index = 0, map = true, locked = false, ended = false;
    function summary() {
      if (!results.length) return null;
      return { correct: results.every(r => r.correct), points: results.filter(r => r.correct).length,
        legs: results.slice(), ...Object.fromEntries(["prompt","answer","response","explanation"]
          .map(k => [k, results.map((r,i) => `${i+1}. ${r[k]}`).join(" / ")])) };
    }
    function draw(focus = false) {
      const leg = item.legs[index], line = net.services[leg.service];
      const terminal = line.stops.at(leg.dir === 1 ? -1 : 0);
      const { clue, reading, translation } = clueFor(net, leg);
      const heading = el("h3", `${net.title} · Leg ${index + 1} of ${item.legs.length}`);
      heading.tabIndex = -1;
      const platform = el("p", `Now at `);
      platform.append(ja(...station(leg.start)), ` · ${line.code} `, ja(line.name,line.kana), ` toward `, ja(...station(terminal)));
      const instruction = el("p", undefined, "pg-instruction");
      instruction.append(ja(clue, reading));
      const feedback = status(), routes = el("div"), controls = el("div", undefined, "pg-actions");
      const toggle = button(map ? "Show ordered list" : "Show route map", () => {
        map = !map; draw(); board.querySelector(".pg-actions button:last-child").focus();
      });
      controls.append(playButton("Hear instruction", reading, feedback), toggle);
      function choose(action, end, endService) {
        if (locked || ended) return;
        locked = true;
        silence();
        const correct = action === leg.action && end === leg.end && endService === leg.endService;
        const response = action === "ride" ? station(end)[0] : `Transfer ${leg.service} → ${endService}`;
        const answer = routeFor(net, leg);
        results.push({ correct, prompt: `${station(leg.start)[0]} (${line.code} → ${station(terminal)[0]}): ${clue}`,
          answer, response, explanation: `${translation} Route: ${answer}.` });
        for (const control of routes.querySelectorAll("button")) control.disabled = true;
        toggle.disabled = true;
        feedback.textContent = `${correct ? "Correct." : "Not this time."} ${translation} Route: ${answer}.`;
        const next = button(index + 1 === item.legs.length ? "Finish journey" : "Continue from this station", () => {
          if (ended || !locked) return;
          if (++index === item.legs.length) {
            ended = true;
            finish(summary());
          } else { locked = false; draw(true); }
        });
        board.append(next);
        next.focus();
      }
      for (const svc of Object.values(net.services)) {
        const active = svc === line;
        const title = el("h4", `${svc.code} · `);
        title.append(ja(svc.name, svc.kana), active ? " · current service" : "");
        routes.append(title);
        const stops = el("ol", undefined, map ? "pg-line" : "pg-stations");
        const order = [...svc.stops];
        if (active && leg.dir === -1) order.reverse();
        for (const id of order) {
          const li = el("li");
          const here = id === leg.start;
          const stop = active && !here ? button("", () => choose("ride",id,svc.code)) : el("span");
          if (active && !here) {
            stop.dataset.station = id;
            stop.dataset.service = svc.code;
          }
          stop.append(ja(...station(id)));
          if (here && active) stop.append(" · here");
          li.append(stop);
          stops.append(li);
        }
        routes.append(stops);
      }
      for (const [id,from,to] of net.transfers) if (id === leg.start && from === leg.service) {
        const change = button(`Transfer here to ${to} · `, () => choose("transfer",id,to));
        change.dataset.transfer = to;
        change.append(ja(net.services[to].name, net.services[to].kana));
        routes.append(change);
      }
      board.replaceChildren(heading, platform, instruction, controls, routes, feedback);
      if (focus) heading.focus();
    }
    draw();
    const cleanup = () => { ended = true; silence(); };
    cleanup.partial = summary;
    return cleanup;
  }
};
