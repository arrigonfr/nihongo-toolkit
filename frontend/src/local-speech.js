const assetBase = "https://huggingface.co/fragappstore/nihongo-toolkit-speech/resolve/12b92299b884003dbd07f59e6676e6641567f9fc/";
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
      const [{ PiperPlus }, ort, phonemizer] = await Promise.all([
        import("piper-plus"),
        import("onnxruntime-web/wasm"),
        import("piper-plus/wasm/multilingual")
      ]);
      ort.env.wasm.numThreads = 1;
      await phonemizer.default({ module_or_path: `${assetBase}piper_plus_wasm_bg.wasm` });
      return PiperPlus.initialize({
        model: `${assetBase}mera-multilingual.onnx`,
        ort,
        wasmLoader: async () => phonemizer
      });
    })().catch((error) => {
      enginePromise = undefined;
      throw error;
    });
  }
  return enginePromise;
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
    const audio = await engine.synthesize(text, { language: "ja", ssml: false });
    const resumeError = await resumed;
    if (id !== requestId) return;
    if (resumeError) throw resumeError;
    if (context.state !== "running") throw new Error("Audio playback was blocked by the browser.");
    const buffer = context.createBuffer(1, audio.samples.length, audio.sampleRate);
    buffer.copyToChannel(audio.samples, 0);
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
