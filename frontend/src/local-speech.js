let enginePromise;
let context;
let source;
let requestId = 0;
let status;

function showStatus(message) {
  if (!status) {
    status = document.createElement("div");
    status.className = "study-speech-status";
    status.setAttribute("role", "status");
    document.body.append(status);
  }
  status.textContent = message;
  status.hidden = !message;
}

async function loadEngine() {
  if (!enginePromise) {
    enginePromise = (async () => {
      const { KokoroJP } = await import("kokoro-js-jp");
      const engine = await KokoroJP.load({ device: "wasm", dtype: "q8" });
      await engine.speak("こんにちは", "jf_alpha");
      return engine;
    })().catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
}

export function preloadLocalSpeech() {
  void loadEngine().catch((error) => {
    console.warn("Could not preload Japanese audio; playback will retry.", error);
  });
}

export function cancelLocalSpeech() {
  requestId++;
  if (source) {
    source.stop();
    source.disconnect();
    source = undefined;
  }
  if (status) showStatus("");
}

export async function speakLocalJapanese(text) {
  cancelLocalSpeech();
  const id = requestId;
  try {
    context ||= new AudioContext();
    const resumed = context.resume().then(() => null, (error) => error);
    showStatus("Loading Japanese audio; the first download may take a while...");
    const engine = await loadEngine();
    if (id !== requestId) return;
    const audio = await engine.speak(text, "jf_alpha");
    const resumeError = await resumed;
    if (id !== requestId) return;
    if (resumeError) throw resumeError;
    if (context.state !== "running") throw new Error("Audio playback was blocked by the browser.");
    const buffer = context.createBuffer(1, audio.audio.length, audio.sampling_rate);
    buffer.copyToChannel(audio.audio, 0);
    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    const playing = source;
    source.onended = () => {
      playing.disconnect();
      if (source === playing) source = undefined;
    };
    source.start();
    showStatus("");
  } catch (error) {
    if (id !== requestId) return;
    console.error("Local Japanese speech playback failed.", error);
    showStatus("Japanese audio could not be played. Please check your connection and try again.");
  }
}
