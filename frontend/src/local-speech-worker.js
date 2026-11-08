import { KokoroJP } from "kokoro-js-jp";

let enginePromise;
let queue = Promise.resolve();
const clips = new Map();

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const engine = await KokoroJP.load({ device: "wasm", dtype: "q8" });
      return engine;
    })().catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
}

self.onmessage = ({ data: { id, text } }) => {
  queue = queue.then(async () => {
    try {
      const engine = await loadEngine();
      if (!text) {
        self.postMessage({ id });
        return;
      }
      let clip = clips.get(text);
      if (!clip) {
        clip = await engine.speak(text, "jf_alpha");
        if (clips.size >= 32) clips.delete(clips.keys().next().value);
        clips.set(text, clip);
      }
      self.postMessage({ id, audio: clip.audio, sampling_rate: clip.sampling_rate });
    } catch (error) {
      self.postMessage({ id, error: error.message || String(error) });
    }
  });
};
