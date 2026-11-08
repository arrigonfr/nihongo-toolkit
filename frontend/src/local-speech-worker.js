import { KokoroJP } from "kokoro-js-jp";

let enginePromise;
let queue = Promise.resolve();
const clips = new Map();
let cancelledThrough = 0;

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const engine = await KokoroJP.load({ device: "wasm", dtype: "q8" });
      clips.set("こんにちは", await engine.speak("こんにちは", "jf_alpha"));
      return engine;
    })().catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
}

self.onmessage = ({ data: { id, text, cancelThrough } }) => {
  if (cancelThrough !== undefined) {
    cancelledThrough = Math.max(cancelledThrough, cancelThrough);
    return;
  }
  queue = queue.then(async () => {
    try {
      if (text && id <= cancelledThrough) {
        self.postMessage({ id, cancelled: true });
        return;
      }
      const engine = await loadEngine();
      if (text && id <= cancelledThrough) {
        self.postMessage({ id, cancelled: true });
        return;
      }
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
