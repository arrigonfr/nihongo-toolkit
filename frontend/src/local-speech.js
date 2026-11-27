const OPTIN_KEY = "nihon:local-speech-optin-v1";
let enginePromise;
let context;
const sources = new Set();
let nextStart = 0;
let requestId = 0;
let status;
let worker;
let jobId = 0;
let optInPromise = null;
const pending = new Map();

function hasLocalSpeechOptIn() {
  if (typeof localStorage === "undefined") return true;
  try {
    return localStorage.getItem(OPTIN_KEY) === "granted";
  } catch {
    return false;
  }
}

function saveLocalSpeechOptIn() {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(OPTIN_KEY, "granted");
  } catch {
    /* allow for current session */
  }
}

function ensureStatus() {
  if (!status) {
    status = document.createElement("div");
    status.className = "study-speech-status";
    status.setAttribute("role", "status");
    document.body.append(status);
  }
  return status;
}

function requestLocalSpeechOptIn() {
  if (hasLocalSpeechOptIn()) return Promise.resolve(true);
  const el = ensureStatus();
  if (typeof el.addEventListener !== "function") return Promise.resolve(true);
  if (optInPromise) return optInPromise;
  optInPromise = new Promise((resolve) => {
    el.hidden = false;
    el.textContent = "";
    const text = document.createElement("span");
    text.textContent = "No Japanese browser voice found. Download offline Japanese voice (~90 MB, cached locally)? ";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.className = "study-speech-action study-speech-action-primary";
    accept.dataset.localSpeechOptin = "accept";
    accept.textContent = "Download (~90 MB)";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "study-speech-action";
    dismiss.dataset.localSpeechOptin = "dismiss";
    dismiss.textContent = "Not now";
    const finish = (granted) => {
      optInPromise = null;
      if (granted) saveLocalSpeechOptIn();
      else showStatus("");
      resolve(granted);
    };
    accept.addEventListener("click", () => finish(true), { once: true });
    dismiss.addEventListener("click", () => finish(false), { once: true });
    el.append(text, accept, dismiss);
  });
  return optInPromise;
}

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
  const el = ensureStatus();
  el.textContent = message;
  el.hidden = !message;
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
  if (!hasLocalSpeechOptIn()) return;
  void loadEngine().catch((error) => {
    console.warn("Could not preload Japanese audio; playback will retry.", error);
  });
}

export function cancelLocalSpeech() {
  requestId++;
  worker?.postMessage({ cancelThrough: jobId });
  for (const source of sources) {
    source.stop();
    source.disconnect();
  }
  sources.clear();
  nextStart = 0;
  if (status) showStatus("");
}

export async function speakLocalJapanese(
  text,
  { rate = 1, onStart = undefined, onEnd = undefined, onError = undefined } = {},
) {
  const id = requestId;
  try {
    const allowed = await requestLocalSpeechOptIn();
    if (!allowed || id !== requestId) return;
    context ||= new AudioContext();
    const resumed = context.resume().then(
      () => null,
      (error) => error,
    );
    showStatus("Preparing Japanese audio (~90 MB first download)...");
    await loadEngine();
    if (id !== requestId) return;
    const audio = await speechJob(text);
    const resumeError = await resumed;
    if (id !== requestId || audio.cancelled) return;
    if (resumeError) throw resumeError;
    if (context.state !== "running") throw new Error("Audio playback was blocked by the browser.");
    const buffer = context.createBuffer(1, audio.audio.length, audio.sampling_rate);
    buffer.copyToChannel(audio.audio, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    if (Number.isFinite(rate) && rate > 0) source.playbackRate.value = rate;
    source.connect(context.destination);
    sources.add(source);
    source.onended = () => {
      source.disconnect();
      sources.delete(source);
      if (id === requestId) onEnd?.();
    };
    const start = Math.max(context.currentTime, nextStart);
    nextStart = start + buffer.duration / (source.playbackRate.value || 1);
    onStart?.();
    source.start(start);
    showStatus("");
  } catch (error) {
    if (id !== requestId) return;
    console.error("Local Japanese speech playback failed.", error);
    showStatus("Japanese audio could not be played. Please check your connection and try again.");
    onError?.(error);
  }
}
