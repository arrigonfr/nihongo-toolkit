import { audioIcon } from "../audio-icon.js";
import { study } from "../study-controls.js";
import { studyPool } from "../study-pool.js";
import { createCluePlayer } from "./clue-player.js";
import { button, el, ja, playButton, root, setupNote, silence, status } from "./dom.js";
import { clueFor, routeFor, validateJourney } from "./train-data.js";

const lineTone = {
  L: "blue",
  F: "blue",
  P: "plum",
  H: "blue",
  M: "warm",
  R: "accent",
  S: "plum",
  V: "warm",
  K: "accent",
  C: "blue",
  N: "warm",
  T: "plum",
  B: "accent",
  E: "blue",
  U: "warm",
};
const countingRules = new Set(["ordinal", "stationsAhead", "nextNext"]);
const relativeRules = new Set(["before", "after"]);

function makeSelect(id, labelText, options) {
  const label = el("label");
  label.append(el("span", labelText));
  const select = el("select");
  select.id = id;
  for (const [value, text] of options) {
    const option = el("option", text);
    option.value = value;
    option.dataset.baseLabel = text;
    select.append(option);
  }
  label.append(select);
  return label;
}

function matchesFilter(item, { network, rule, legs }) {
  if (network !== "all" && item.network !== network) return false;
  if (legs === "single" && item.legs.length !== 1) return false;
  if (legs === "multi" && item.legs.length < 2) return false;
  if (rule === "counting" && !item.legs.some((l) => countingRules.has(l.rule))) return false;
  if (rule === "relative" && !item.legs.some((l) => relativeRules.has(l.rule))) return false;
  if (rule === "transfer" && !item.legs.some((l) => l.rule === "transfer")) return false;
  if (rule === "terminal" && !item.legs.some((l) => l.rule === "terminal")) return false;
  return true;
}

function shortcutBadge(key) {
  const kbd = el("kbd", key, "particle-shortcut");
  kbd.setAttribute("aria-hidden", "true");
  return kbd;
}

function syncViewPreference(isMap) {
  const select = document.getElementById("train-view");
  if (!select) return;
  const next = isMap ? "map" : "list";
  if (select.value === next) return;
  select.value = next;
  const chips = select.nextElementSibling;
  if (chips?.classList.contains("chips")) {
    for (const chip of chips.querySelectorAll("[data-value]")) {
      chip.setAttribute("aria-pressed", String(chip.dataset.value === next));
    }
  }
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function connectedServices(net, stationId, currentCode) {
  return Object.values(net.services)
    .filter((svc) => svc.code !== currentCode && svc.stops.includes(stationId))
    .map((svc) => svc.code);
}

export const train = {
  ...studyPool("train", validateJourney),
  setup(container) {
    setupNote(
      container,
      `Count stops ahead, not your starting station. A transfer changes lines without moving. Explore ${train.items.length.toLocaleString()} journeys across 8 railway networks.`,
    );
    container.append(
      makeSelect("train-network", "Railway network", [
        ["all", "All networks"],
        ["lake", "Lakeside Railway (linear)"],
        ["mountain", "Mountain Fork Railway (branching)"],
        ["coast", "Harbour Interchange (transfers)"],
        ["river", "Riverside Metro (double interchange)"],
        ["valley", "Sakura Valley Line (scenic transfer)"],
        ["capital", "Capital Cross (city interchange)"],
        ["oldtown", "Old Town Tramway (historic transfer)"],
        ["peninsula", "Peninsula Express (coastal transfer)"],
      ]),
      makeSelect("train-rule", "Instruction focus", [
        ["all", "All instructions"],
        ["counting", "Counting stops"],
        ["relative", "Before & after"],
        ["transfer", "Transfers"],
        ["terminal", "Terminal stops"],
      ]),
      makeSelect("train-legs", "Journey length", [
        ["all", "All"],
        ["single", "Single-leg"],
        ["multi", "Multi-leg"],
      ]),
      makeSelect("train-view", "Route display", [
        ["map", "Route map"],
        ["list", "Ordered list"],
      ]),
    );
  },
  pool(filters) {
    const network = filters.querySelector("#train-network")?.value || "all";
    const legs = filters.querySelector("#train-legs")?.value || "all";
    const rule = filters.querySelector("#train-rule")?.value || "all";
    return train.items.filter((item) => matchesFilter(item, { network, rule, legs }));
  },
  onSettingsChange(filters) {
    const active = {
      network: filters.querySelector("#train-network")?.value || "all",
      rule: filters.querySelector("#train-rule")?.value || "all",
      legs: filters.querySelector("#train-legs")?.value || "all",
    };
    const controls = [
      ["#train-network", "network"],
      ["#train-rule", "rule"],
      ["#train-legs", "legs"],
    ];
    for (const [selector, field] of controls) {
      const select = filters.querySelector(selector);
      if (!select) continue;
      for (const option of select.options) {
        const base = option.dataset.baseLabel || option.textContent;
        const count = train.items.filter((item) => matchesFilter(item, { ...active, [field]: option.value })).length;
        const nextLabel = field === "legs" && option.value === "all" ? base : `${base} (${count})`;
        option.textContent = nextLabel;
        const chipLabel = select.chipsApi?.group?.querySelector(
          `.chip-option[data-value="${CSS.escape(option.value)}"] .chip-label`,
        );
        if (chipLabel) chipLabel.textContent = nextLabel;
      }
    }
  },
  render(container, item, finish) {
    const net = item.net,
      board = root(container),
      results = [];
    const station = (id) => net.stations[id];
    let index = 0,
      locked = false,
      ended = false,
      selected = null;
    let map = (document.getElementById("train-view")?.value || "map") !== "list";
    let activePlayer = null,
      audioObserver = null,
      keyHandler = null;

    function detachLegListeners() {
      activePlayer?.stop();
      activePlayer = null;
      audioObserver?.disconnect();
      audioObserver = null;
      if (keyHandler) {
        document.removeEventListener("keydown", keyHandler);
        keyHandler = null;
      }
    }

    function summary() {
      if (!results.length) return null;
      return {
        correct: results.every((r) => r.correct),
        points: results.filter((r) => r.correct).length,
        legs: results.slice(),
        prompt: net.title,
      };
    }

    function draw(focus = false) {
      detachLegListeners();
      selected = null;
      const leg = item.legs[index],
        line = net.services[leg.service];
      const terminal = line.stops.at(leg.dir === 1 ? -1 : 0);
      const { clue, reading, translation } = clueFor(net, leg);
      const heading = el("h3", `${net.title} · Leg ${index + 1} of ${item.legs.length}`);
      heading.tabIndex = -1;

      const platform = el("div", undefined, "pg-platform");
      const atLine = el("p", "Now at ");
      const atStation = el("strong");
      atStation.append(ja(...station(leg.start)));
      atLine.append(atStation);
      const lineRow = el("p", undefined, "pg-platform-line");
      const badge = el("span", line.code, `pg-line-badge pg-tone-${lineTone[line.code] || "blue"}`);
      lineRow.append(badge, " ", ja(line.name, line.kana), " · toward ", ja(...station(terminal)));
      platform.append(atLine, lineRow);

      const instruction = el("p", undefined, "pg-instruction");
      instruction.append(ja(clue, reading));

      const feedback = status();
      const routes = el("div", undefined, "pg-routes");
      const controls = el("div", undefined, "pg-actions");

      const hear = button(audioIcon, () => {
        if (!ended) activePlayer?.play(reading);
      });
      hear.setAttribute("aria-label", "Hear instruction");
      hear.setAttribute("aria-keyshortcuts", "H");
      hear.append(shortcutBadge("H"));

      activePlayer = createCluePlayer({
        synth: window.speechSynthesis,
        Utterance: window.SpeechSynthesisUtterance,
        silence,
        fallback: undefined,
        enabled: () => study.audio,
        onState(state) {
          if (ended) return;
          if (state === "loading") feedback.textContent = "Preparing Japanese audio…";
          else if (state === "unavailable")
            feedback.textContent = "Audio unavailable. Turn on Audio or read the instruction above.";
          else if (state === "heard" && !locked) feedback.textContent = "";
        },
      });

      const syncAudio = () => {
        if (ended) return;
        hear.disabled = !study.audio;
        if (!study.audio) activePlayer?.stop();
      };
      audioObserver = new MutationObserver(syncAudio);
      audioObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-study-audio"] });
      syncAudio();

      const toggle = button(map ? "Show ordered list " : "Show route map ", () => {
        map = !map;
        syncViewPreference(map);
        draw();
        board.querySelector(".pg-toggle-view")?.focus();
      });
      toggle.className = "pg-toggle-view";
      toggle.setAttribute("aria-keyshortcuts", "V");
      toggle.append(shortcutBadge("V"));

      const confirm = el("button", "Confirm choice ", "primary");
      confirm.type = "button";
      confirm.disabled = true;
      confirm.setAttribute("aria-keyshortcuts", "C");
      confirm.append(shortcutBadge("C"));

      const choiceButtons = [];
      function selectChoice(choice, btn) {
        if (locked || ended) return;
        const same = selected && selected.btn === btn;
        selected = same ? null : { ...choice, btn };
        for (const other of choiceButtons) {
          other.setAttribute("aria-pressed", String(!same && other === btn));
        }
        confirm.disabled = !selected;
      }

      function submit() {
        if (!selected || locked || ended) return;
        const { action, end, endService, btn } = selected;
        locked = true;
        activePlayer?.stop();
        silence();
        const correct = action === leg.action && end === leg.end && endService === leg.endService;
        const response = action === "ride" ? station(end)[0] : `Transfer ${leg.service} → ${endService}`;
        const answer = routeFor(net, leg);
        results.push({
          correct,
          prompt: `${station(leg.start)[0]} (${line.code} → ${station(terminal)[0]}): ${clue}`,
          answer,
          response,
          explanation: `${translation} Route: ${answer}.`,
          clue,
          reading,
          translation,
          startName: station(leg.start)[0],
          lineCode: line.code,
          terminalName: station(terminal)[0],
        });

        if (index + 1 === item.legs.length) {
          ended = true;
          detachLegListeners();
          finish(summary());
          return;
        }

        for (const control of routes.querySelectorAll("button")) control.disabled = true;
        toggle.disabled = true;
        confirm.disabled = true;

        btn.classList.add(correct ? "is-correct" : "is-wrong");
        const correctBtn =
          leg.action === "transfer"
            ? routes.querySelector(`[data-transfer="${leg.endService}"]`)
            : routes.querySelector(`[data-station="${leg.end}"][data-service="${leg.endService}"]`);
        if (correctBtn) correctBtn.classList.add("is-correct");

        if (leg.action === "ride") {
          const orderedStops = leg.dir === 1 ? line.stops : [...line.stops].reverse();
          const fromIdx = orderedStops.indexOf(leg.start);
          const toIdx = orderedStops.indexOf(leg.end);
          for (let i = fromIdx + 1; i < toIdx; i++) {
            routes
              .querySelector(`[data-station="${orderedStops[i]}"][data-service="${leg.service}"]`)
              ?.closest("li")
              ?.classList.add("is-path");
          }
        }

        const nextLeg = item.legs[index + 1];
        const nextStationName = station(nextLeg.start)[0];
        feedback.textContent = `${correct ? "Correct." : "Not this time."} ${translation} Route: ${answer}.`;
        const next = el("button", `Continue from ${nextStationName}`, "primary");
        next.type = "button";
        next.addEventListener("click", () => {
          if (ended || !locked) return;
          ++index;
          locked = false;
          draw(true);
        });
        board.append(next);
        next.focus();
      }

      confirm.addEventListener("click", submit);
      controls.append(confirm, hear, toggle);

      const availableTransfers = net.transfers.filter(([id, from]) => id === leg.start && from === leg.service);
      const services = Object.values(net.services).sort((a, b) => Number(b === line) - Number(a === line));

      for (const svc of services) {
        const active = svc === line;
        const card = el(
          "section",
          undefined,
          `pg-service${active ? " is-active" : " is-inactive"} pg-tone-${lineTone[svc.code] || "blue"}`,
        );
        const title = el("h4");
        const svcBadge = el("span", svc.code, `pg-line-badge pg-tone-${lineTone[svc.code] || "blue"}`);
        title.append(svcBadge, " ", ja(svc.name, svc.kana));
        if (active) {
          const dirTag = el("span", undefined, "pg-service-status");
          dirTag.append("Current · toward ", ja(...station(terminal)));
          title.append(" ", dirTag);
        }
        card.append(title);

        const stops = el("ol", undefined, map ? "pg-line" : "pg-stations");
        if (map) stops.setAttribute("role", "list");
        const order = [...svc.stops];
        if (active && leg.dir === -1) order.reverse();
        const startPos = active ? order.indexOf(leg.start) : -1;

        for (const [pos, id] of order.entries()) {
          const li = el("li");
          const here = id === leg.start;
          if (active && here) li.classList.add("is-here");
          else if (active && pos < startPos) li.classList.add("is-passed");
          const others = connectedServices(net, id, svc.code);
          if (others.length) li.classList.add("is-interchange");

          const stop =
            active && !here
              ? button("", () => selectChoice({ action: "ride", end: id, endService: svc.code }, stop))
              : el("span");
          if (active && !here) {
            stop.dataset.station = id;
            stop.dataset.service = svc.code;
            stop.setAttribute("aria-pressed", "false");
            const num = choiceButtons.length + 1;
            if (num <= 9) {
              stop.setAttribute("aria-keyshortcuts", String(num));
            }
            choiceButtons.push(stop);
          }
          stop.append(ja(...station(id)));
          if (here && active) {
            stop.append(" ", el("span", "Here", "pg-here-tag"));
          }
          if (others.length) {
            const xfer = el("span", `⇄ ${others.join("/")}`, "pg-connect-tag");
            xfer.setAttribute("aria-label", `Connects with line ${others.join(", ")}`);
            stop.append(" ", xfer);
          }
          if (active && !here && choiceButtons.length <= 9) {
            stop.append(shortcutBadge(String(choiceButtons.length)));
          }
          li.append(stop);
          stops.append(li);
        }
        card.append(stops);

        if (active && availableTransfers.length) {
          const transferBar = el("div", undefined, "pg-transfers");
          for (const [id, , to] of availableTransfers) {
            const target = net.services[to];
            const change = button("", () => selectChoice({ action: "transfer", end: id, endService: to }, change));
            change.dataset.transfer = to;
            change.setAttribute("aria-pressed", "false");
            const num = choiceButtons.length + 1;
            if (num <= 9) change.setAttribute("aria-keyshortcuts", String(num));
            choiceButtons.push(change);
            const targetBadge = el("span", to, `pg-line-badge pg-tone-${lineTone[to] || "blue"}`);
            change.append("⇄ Transfer here to ", targetBadge, " ", ja(target.name, target.kana));
            if (num <= 9) change.append(shortcutBadge(String(num)));
            transferBar.append(change);
          }
          card.append(transferBar);
        }
        routes.append(card);
      }

      keyHandler = (event) => {
        if (
          !matchMedia("(min-width: 761px) and (hover: hover)").matches ||
          event.repeat ||
          event.isComposing ||
          event.ctrlKey ||
          event.altKey ||
          event.metaKey ||
          event.target.closest("input, textarea, select, [contenteditable=true]") ||
          document.querySelector("dialog[open]")
        )
          return;
        const k = event.key.toLowerCase();
        if (/^[1-9]$/.test(event.key)) {
          const option = choiceButtons[Number(event.key) - 1];
          if (option && !option.disabled) {
            event.preventDefault();
            option.click();
          }
        } else if (k === "c" && !confirm.disabled) {
          event.preventDefault();
          confirm.click();
        } else if (k === "h" && !hear.disabled) {
          event.preventDefault();
          hear.click();
        } else if (k === "v" && !toggle.disabled) {
          event.preventDefault();
          toggle.click();
        }
      };
      document.addEventListener("keydown", keyHandler);

      board.replaceChildren(heading, platform, instruction, routes, controls, feedback);
      if (focus) heading.focus();
    }

    draw();
    const cleanup = () => {
      ended = true;
      detachLegListeners();
      silence();
    };
    cleanup.partial = summary;
    return cleanup;
  },
  review(container, _item, result) {
    const sections = container.querySelectorAll(".journey-leg");
    (result.legs || []).forEach((leg, i) => {
      const section = sections[i];
      if (!section || !leg.clue || !leg.reading) return;
      const promptField = section.querySelector('[data-field="prompt"] dd');
      if (promptField) {
        promptField.replaceChildren(
          `${leg.startName} (${leg.lineCode} → ${leg.terminalName}): `,
          ja(leg.clue, leg.reading),
        );
      }
      const notice = status();
      const replay = playButton("Replay instruction", leg.reading, notice);
      const bar = el("div", undefined, "pg-review-audio");
      bar.append(replay, notice);
      section.append(bar);
    });
  },
};
