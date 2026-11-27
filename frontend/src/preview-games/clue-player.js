import { japaneseVoice } from "../japanese-voice.js";

// Scoring needs the start/end/error events that the shared fire-and-forget
// pronunciation button doesn't expose. Non-scored review uses that button.
export function createCluePlayer({ synth, Utterance, silence, enabled, onState, fallback, timeout = 15000 }) {
  let generation = 0,
    timer,
    pending;
  function stop() {
    generation++;
    clearTimeout(timer);
    pending?.();
    pending = null;
    silence();
  }
  function play(text, { rate = 0.9 } = {}) {
    stop();
    if (!enabled()) {
      onState("unavailable");
      return;
    }
    const id = generation;
    let usedFallback = false;
    function finish(state) {
      if (id !== generation) return;
      stop();
      onState(state);
    }
    function runFallback() {
      if (id !== generation) return;
      if (!fallback || usedFallback || !enabled()) {
        finish("unavailable");
        return;
      }
      usedFallback = true;
      clearTimeout(timer);
      pending?.();
      pending = null;
      fallback(text, {
        rate,
        onStart: () => {
          if (id === generation && enabled()) onState("playing");
        },
        onEnd: () => finish(enabled() ? "heard" : "unavailable"),
        onError: () => finish("unavailable"),
      });
    }
    if (!synth || !Utterance) {
      if (fallback) {
        onState("loading");
        runFallback();
      } else onState("unavailable");
      return;
    }
    onState("loading");
    timer = setTimeout(() => {
      if (fallback && !usedFallback) runFallback();
      else finish("unavailable");
    }, timeout);
    function start() {
      if (id !== generation) return;
      try {
        const voices = synth.getVoices();
        const voice = japaneseVoice(voices);
        if (!voice) {
          if (voices.length) runFallback();
          return;
        }
        pending?.();
        pending = null;
        const u = new Utterance(text);
        u.voice = voice;
        u.lang = "ja-JP";
        u.rate = rate;
        u.onstart = () => {
          if (id === generation && enabled()) onState("playing");
        };
        u.onend = () => finish(enabled() ? "heard" : "unavailable");
        u.onerror = () => runFallback();
        synth.speak(u);
      } catch {
        runFallback();
      }
    }
    synth.addEventListener("voiceschanged", start);
    pending = () => synth.removeEventListener("voiceschanged", start);
    start();
  }
  return { play, stop };
}
