// Scoring needs the end/error events that the shared fire-and-forget
// pronunciation button doesn't expose. Non-scored review uses that button.
export function createCluePlayer({ synth, Utterance, silence, enabled, onState, timeout = 15000 }) {
  let generation = 0, timer, pending;
  function stop() {
    generation++;
    clearTimeout(timer);
    pending?.();
    pending = null;
    silence();
  }
  function play(text) {
    stop();
    if (!enabled() || !synth || !Utterance) { onState("unavailable"); return; }
    const id = generation;
    function finish(state) {
      if (id !== generation) return;
      stop();
      onState(state);
    }
    onState("loading");
    timer = setTimeout(() => finish("unavailable"), timeout);
    function start() {
      if (id !== generation) return;
      try {
        const voice = synth.getVoices().find(v => /^ja(?:[-_]|$)/i.test(v.lang));
        if (!voice) return;
        pending?.();
        pending = null;
        const u = new Utterance(text);
        u.voice = voice;
        u.lang = "ja-JP";
        u.rate = 0.9;
        u.onend = () => finish(enabled() ? "heard" : "unavailable");
        u.onerror = () => finish("unavailable");
        synth.speak(u);
      } catch { finish("unavailable"); }
    }
    synth.addEventListener("voiceschanged", start);
    pending = () => synth.removeEventListener("voiceschanged", start);
    start();
  }
  return { play, stop };
}
