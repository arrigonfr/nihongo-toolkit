import { studyPool } from "../study-pool.js";
import { study } from "../study-controls.js";
import { speakLocalJapanese } from "../local-speech.js";
import { el, ja, button, root, setupNote, silence, status, playButton } from "./dom.js";
import { deal, karutaCategory, karutaResult, validateKaruta } from "./karuta-data.js";
import { createCluePlayer } from "./clue-player.js";
import { picture } from "./pictures.js";
import { audioIcon } from "../audio-icon.js";

function makeSelect(id, labelText, options) {
  const label = el("label");
  label.append(el("span", labelText));
  const select = el("select");
  select.id = id;
  for (const [value, text] of options) {
    const option = el("option", text);
    option.value = value;
    select.append(option);
  }
  label.append(select);
  return label;
}

function shortcutBadge(key) {
  const kbd = el("kbd", key, "particle-shortcut");
  kbd.setAttribute("aria-hidden", "true");
  return kbd;
}

function reviewFigure(card, heading) {
  const figure = el("figure", undefined, "pg-karuta-card");
  figure.append(el("span", heading, "pg-karuta-tag"), picture(card), el("figcaption", card.description));
  return figure;
}

export const karuta = {
  ...studyPool("karuta", validateKaruta),
  setup(container) {
    setupNote(container, `Listen to a description and pick one of six cards across ${karuta.items.length.toLocaleString()} clues and 102 pictures. Replay freely, slow down playback, or switch to a text clue at any time.`);
    const counts = {};
    for (const item of karuta.items) {
      const group = karutaCategory(item);
      counts[group] = (counts[group] || 0) + 1;
    }
    const labelWithCount = (label, n) => `${label} (${n})`;
    container.append(
      makeSelect("karuta-category", "Topic", [
        ["all", labelWithCount("All topics", karuta.items.length)],
        ["everyday", labelWithCount("Everyday objects", counts.everyday || 0)],
        ["animals", labelWithCount("Animals", counts.animals || 0)],
        ["nature", labelWithCount("Nature & outdoors", counts.nature || 0)],
        ["places", labelWithCount("Places & activities", counts.places || 0)],
        ["vehicles", labelWithCount("Vehicles", counts.vehicles || 0)],
        ["food", labelWithCount("Food & drink", counts.food || 0)],
        ["kitchen", labelWithCount("Kitchen & dining", counts.kitchen || 0)],
        ["home", labelWithCount("Home & furniture", counts.home || 0)],
        ["tech", labelWithCount("Tech & home", counts.tech || 0)],
        ["weather", labelWithCount("Weather & sky", counts.weather || 0)],
        ["clothing", labelWithCount("Clothing & wear", counts.clothing || 0)],
        ["music", labelWithCount("Music & hobbies", counts.music || 0)],
        ["sports", labelWithCount("Sports & travel", counts.sports || 0)]
      ]),
      makeSelect("karuta-labels", "Card display", [
        ["show", "Pictures with captions"],
        ["hide", "Pictures only"],
        ["captions", "Captions only"]
      ])
    );
  },
  pool(filters) {
    const category = filters.querySelector("#karuta-category")?.value || "all";
    return category === "all" ? karuta.items : karuta.items.filter(item => karutaCategory(item) === category);
  },
  render(container, item, finish) {
    const board = root(container), controls = el("div", undefined, "pg-actions"), notice = status();
    const grid = el("div", undefined, "pg-hand"), transcript = el("p", undefined, "pg-instruction");
    const displayMode = document.getElementById("karuta-labels")?.value || "show";
    const showPictures = displayMode !== "captions";
    const showCaptions = displayMode !== "hide";
    if (!showPictures) grid.classList.add("is-captions-only");
    let mode = "", ended = false, slow = false, japaneseCaptions = false;
    const unlock = () => { for (const tile of grid.children) tile.disabled = false; };
    const hearLabel = el("span", "Play clue");
    const player = createCluePlayer({
      synth: window.speechSynthesis,
      Utterance: window.SpeechSynthesisUtterance,
      silence,
      enabled: () => study.audio,
      fallback: speakLocalJapanese,
      onState(state) {
        if (ended) return;
        if (mode !== "text") {
          if (state === "playing" || state === "heard") {
            mode = "listening";
            unlock();
          }
          notice.textContent = {
            loading: "Preparing Japanese audio. You can switch to text instead.",
            playing: "Listening… pick the matching card at any time.",
            heard: "Choose the card that matches the clue.",
            unavailable: "Audio unavailable. Retry playback or use the text clue."
          }[state];
        }
        if (state === "playing" || state === "heard") {
          hearLabel.textContent = "Replay clue";
          hear.setAttribute("aria-label", "Replay clue");
        }
      }
    });
    const currentRate = () => (slow ? 0.6 : 1);
    const hear = button("", () => {
      if (!ended && study.audio) player.play(item.reading, { rate: currentRate() });
    });
    hear.className = "pg-play-btn";
    hear.setAttribute("aria-label", "Play clue");
    hear.setAttribute("aria-keyshortcuts", "P");
    hear.append(el("span", audioIcon), " ", hearLabel, shortcutBadge("P"));

    const speed = button("Slow ", () => {
      if (ended) return;
      slow = !slow;
      speed.setAttribute("aria-pressed", String(slow));
      if (study.audio) {
        if (slow || mode) player.play(item.reading, { rate: currentRate() });
        else notice.textContent = "Normal playback speed.";
      }
    });
    speed.setAttribute("aria-pressed", "false");
    speed.setAttribute("aria-keyshortcuts", "S");
    speed.append(shortcutBadge("S"));

    const read = button("Use text clue ", () => {
      if (ended || mode === "text") return;
      mode = "text";
      read.disabled = true;
      transcript.hidden = false;
      transcript.replaceChildren(ja(item.clue, item.reading));
      notice.textContent = "Text-clue round. Choose the matching card (you can still replay audio).";
      unlock();
    });
    read.setAttribute("aria-keyshortcuts", "T");
    read.append(shortcutBadge("T"));

    const captionEntries = [];
    function renderCaptions() {
      for (const { caption, card } of captionEntries) {
        if (japaneseCaptions) caption.replaceChildren(ja(card.word, card.kana));
        else caption.textContent = card.description;
      }
    }
    const langToggle = showCaptions ? button("Japanese captions ", () => {
      if (ended) return;
      japaneseCaptions = !japaneseCaptions;
      langToggle.setAttribute("aria-pressed", String(japaneseCaptions));
      renderCaptions();
    }) : null;
    if (langToggle) {
      langToggle.setAttribute("aria-pressed", "false");
      langToggle.setAttribute("aria-keyshortcuts", "J");
      langToggle.append(shortcutBadge("J"));
    }

    const tiles = deal(item, karuta.items).map((card, index) => {
      const tile = button("", () => {
        if (ended || !mode) return;
        ended = true;
        player.stop();
        finish(karutaResult(item, card, mode));
      });
      tile.dataset.picture = card.id;
      tile.setAttribute("aria-label", card.description);
      tile.setAttribute("aria-keyshortcuts", String(index + 1));
      tile.disabled = true;
      tile.append(shortcutBadge(String(index + 1)));
      if (showPictures) tile.append(picture(card));
      if (showCaptions) {
        const caption = el("span", card.description, "karuta-caption");
        captionEntries.push({ caption, card });
        tile.append(caption);
      }
      grid.append(tile);
      return tile;
    });
    transcript.hidden = true;
    controls.append(hear, speed, read, ...(langToggle ? [langToggle] : []));
    board.append(el("h3", showPictures ? "Which picture fits the clue?" : "Which card fits the clue?"), controls, transcript, notice, grid);
    function syncAudio() {
      if (ended) return;
      hear.disabled = !study.audio;
      speed.disabled = !study.audio;
      if (!study.audio) {
        player.stop();
        if (mode !== "text") notice.textContent = "Audio is off. Use a text clue or turn on Audio to listen.";
      }
    }
    const audioObserver = new MutationObserver(syncAudio);
    audioObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-study-audio"] });
    syncAudio();
    const keydown = event => {
      if (!matchMedia("(min-width: 761px) and (hover: hover)").matches || event.repeat || event.isComposing ||
          event.ctrlKey || event.altKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable=true]") ||
          document.querySelector("dialog[open]")) return;
      const key = event.key.toLowerCase();
      const target = /^[1-6]$/.test(event.key) ? tiles[Number(event.key) - 1]
        : key === "p" ? hear
        : key === "s" ? speed
        : key === "t" ? read
        : key === "j" ? langToggle
        : null;
      if (target && !target.disabled) { event.preventDefault(); target.click(); }
    };
    document.addEventListener("keydown", keydown);
    window.addEventListener("pagehide", player.stop);
    return () => {
      ended = true;
      audioObserver.disconnect();
      document.removeEventListener("keydown", keydown);
      window.removeEventListener("pagehide", player.stop);
      player.stop();
    };
  },
  review(container, item, result) {
    const promptField = container.querySelector('[data-field="prompt"] dd');
    if (promptField) promptField.replaceChildren(ja(item.clue, item.reading));
    const answerField = container.querySelector('[data-field="answer"] dd');
    if (answerField) {
      const link = el("a");
      link.href = `https://jisho.org/search/${encodeURIComponent(item.word)}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.append(ja(item.word, item.kana));
      answerField.replaceChildren(link);
    }
    const visuals = el("div", undefined, "pg-karuta-review");
    const targetCard = karuta.items.find(pic => pic.id === (item.pictureId ?? item.id)) || item;
    visuals.append(reviewFigure(targetCard, "Matching picture"));
    if (result && !result.correct && result.chosenId) {
      const chosenCard = karuta.items.find(pic => pic.id === result.chosenId);
      if (chosenCard) visuals.append(reviewFigure(chosenCard, "Your pick"));
    }
    const audioRow = el("div", undefined, "pg-review-audio");
    const notice = status();
    audioRow.append(playButton("Replay description", item.reading, notice), notice);
    container.append(visuals, audioRow);
  },
  credits(container) {
    const p = el("p");
    p.innerHTML = 'Original line drawings and draft clues by NihongoToolkit. Additional object icons from <a href="https://tabler.io/icons" target="_blank" rel="noopener noreferrer">Tabler Icons</a> (MIT License).';
    container.append(p);
  }
};
