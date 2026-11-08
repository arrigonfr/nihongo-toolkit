let enginePromise;
let context;
const sources = new Set();
let nextStart = 0;
let requestId = 0;
let status;
let worker;
let jobId = 0;
const pending = new Map();

function speechJob(text) {
  if (!worker) {
    worker = new Worker(new URL("./local-speech-worker.js", import.meta.url), { type: "module" });
    worker.onmessage = ({ data }) => {
      const job = pending.get(data.id);
      if (!job) return;
      pending.delete(data.id);
      if (data.error) job.reject(new Error(data.error));
      else job.resolve(data);
    };
    worker.onerror = (event) => {
      const error = new Error(event.message || "Japanese speech worker failed.");
      worker.terminate();
      worker = undefined;
      enginePromise = undefined;
      for (const job of pending.values()) job.reject(error);
      pending.clear();
    };
  }
  return new Promise((resolve, reject) => {
    const id = ++jobId;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, text });
  });
}

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
      await speechJob();
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
  for (const source of sources) {
    source.stop();
    source.disconnect();
  }
  sources.clear();
  nextStart = 0;
  if (status) showStatus("");
}

export async function speakLocalJapanese(text) {
  const id = requestId;
  try {
    context ||= new AudioContext();
    const resumed = context.resume().then(() => null, (error) => error);
    showStatus("Loading Japanese audio; the first download may take a while...");
    await loadEngine();
    if (id !== requestId) return;
    const audio = await speechJob(text);
    const resumeError = await resumed;
    if (id !== requestId) return;
    if (resumeError) throw resumeError;
    if (context.state !== "running") throw new Error("Audio playback was blocked by the browser.");
    const buffer = context.createBuffer(1, audio.audio.length, audio.sampling_rate);
    buffer.copyToChannel(audio.audio, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    sources.add(source);
    source.onended = () => {
      source.disconnect();
      sources.delete(source);
    };
    const start = Math.max(context.currentTime, nextStart);
    nextStart = start + buffer.duration;
    source.start(start);
    showStatus("");
  } catch (error) {
    if (id !== requestId) return;
    console.error("Local Japanese speech playback failed.", error);
    showStatus("Japanese audio could not be played. Please check your connection and try again.");
  }
}
