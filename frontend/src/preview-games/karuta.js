import { studyPool } from "../study-pool.js";
import { study } from "../study-controls.js";
import { el, ja, button, root, setupNote, silence, status, playButton } from "./dom.js";
import { deal, karutaResult } from "./karuta-data.js";
import { createCluePlayer } from "./clue-player.js";
import { picture } from "./pictures.js";

export const karuta = {
  ...studyPool("karuta"),
  setup(container) {
    setupNote(container, "Listen to a description and pick one of six pictures. You can switch to a text clue at any time.");
  },
  render(container, item, finish) {
    const board = root(container), controls = el("div", undefined, "pg-actions"), notice = status();
    const grid = el("div", undefined, "pg-hand"), transcript = el("p", undefined, "pg-instruction");
    let mode = "", ended = false;
    const unlock = () => { for (const tile of grid.children) tile.disabled = false; };
    const player = createCluePlayer({
      synth: window.speechSynthesis, Utterance: window.SpeechSynthesisUtterance, silence, enabled: () => study.audio,
      onState(state) {
        if (ended || mode === "text") return;
        if (state === "heard") { mode = "listening"; unlock(); }
        notice.textContent = { loading: "Preparing Japanese audio. You can switch to text instead.",
          heard: "Choose the picture that matches the clue.", unavailable: "Audio unavailable. Retry playback or use the text clue." }[state];
        hear.textContent = "Replay clue";
      }
    });
    const hear = button("Play clue", () => { if (!ended) player.play(item.reading); });
    const read = button("Use text clue", () => {
      if (ended) return;
      player.stop();
      mode = "text";
      read.disabled = hear.disabled = true;
      transcript.hidden = false;
      transcript.append(ja(item.clue,item.reading));
      notice.textContent = "Text-clue round. Choose the matching picture.";
      unlock();
    });
    for (const card of deal(item, karuta.items)) {
      const tile = button("", () => {
        if (ended || !mode) return;
        ended = true;
        player.stop();
        finish(karutaResult(item,card,mode));
      });
      tile.dataset.picture = card.id;
      tile.disabled = true;
      tile.append(picture(card), el("span",card.description));
      grid.append(tile);
    }
    transcript.hidden = true;
    controls.append(hear,read);
    board.append(el("h3","Which picture fits the clue?"), controls, transcript, notice, grid);
    function syncAudio() {
      if (mode === "text" || ended) return;
      hear.disabled = !study.audio;
      if (!study.audio) {
        player.stop();
        notice.textContent = "Audio is off. Use a text clue or turn on Audio to listen.";
      }
    }
    const audioObserver = new MutationObserver(syncAudio);
    audioObserver.observe(document.documentElement, { attributes:true, attributeFilter:["data-study-audio"] });
    syncAudio();
    window.addEventListener("pagehide",player.stop);
    return () => {
      ended = true;
      audioObserver.disconnect();
      window.removeEventListener("pagehide",player.stop);
      player.stop();
    };
  },
  review(container, item) {
    const notice = status(), word = el("p");
    word.append(ja(item.word,item.kana), " — ", item.description);
    container.append(word, ja(item.clue,item.reading), el("p",item.translation),
      playButton("Replay description",item.reading,notice), notice);
  }
};
