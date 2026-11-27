import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer, preview } from "vite";
import { firefox } from "playwright";

const root = fileURLToPath(new URL("../frontend", import.meta.url));
const dev = process.argv.includes("--dev");
const server = dev
  ? await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false } })
  : await preview({ root, preview: { host: "127.0.0.1", port: 0, strictPort: false } });
if (dev) await server.listen();
let browser;
try {
  browser = await firefox.launch();
  const context = await browser.newContext();
  await context.route(/googletagmanager\.com/, (route) => route.fulfill({ body: "" }));
  const page = await context.newPage();
  const errors = [];
  const pendingRequests = new Set();
  page.on("request", (request) => pendingRequests.add(request.url()));
  page.on("requestfinished", (request) => pendingRequests.delete(request.url()));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("requestfailed", (request) => errors.push(`${request.url()}: ${request.failure()?.errorText}`));
  await page.addInitScript(() => {
    Object.defineProperty(speechSynthesis, "getVoices", { value: () => [{ lang: "zh-CN", name: "Natural" }] });
    window.speechBuffers = [];
    window.speechStarts = [];
    window.speechEvents = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (time) {
      window.speechStarts.push({ time, duration: this.buffer.duration });
      return start.call(this, time);
    };
    const WorkerClass = window.Worker;
    window.Worker = class extends WorkerClass {
      constructor(...args) {
        super(...args);
        this.addEventListener("message", ({ data }) => window.speechEvents.push({ id: data.id, error: data.error, samples: data.audio?.length }));
      }
    };
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = function () {
      window.speechEvents.push({ resume: this.state });
      this.addEventListener("statechange", () => window.speechEvents.push({ state: this.state }));
      return resume.call(this);
    };
    const createBuffer = AudioContext.prototype.createBuffer;
    AudioContext.prototype.createBuffer = function (...args) {
      const buffer = createBuffer.apply(this, args);
      const copy = buffer.copyToChannel.bind(buffer);
      buffer.copyToChannel = (samples, ...rest) => {
        window.speechBuffers.push({ length: samples.length, peak: samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0) });
        return copy(samples, ...rest);
      };
      return buffer;
    };
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/kana.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#audioQuickToggle");
  await page.evaluate(() => {
    speechSynthesis.speak = () => { throw new Error("Chinese voices must not read Japanese."); };
    const button = document.createElement("button");
    button.id = "testSpeech";
    button.dataset.studySpeak = "こんにちは";
    button.textContent = "Speak";
    document.body.prepend(button);
  });
  await page.click("#testSpeech");
  await page.locator('[data-local-speech-optin="accept"]').waitFor();
  await page.click('[data-local-speech-optin="accept"]');
  await page.click("#audioQuickToggle");
  await page.click("#audioQuickToggle");
  await page.click("#testSpeech");
  await page.waitForFunction(() => window.speechBuffers.length > 0 || document.querySelector(".study-speech-status")?.textContent.includes("could not"), null, { timeout: 180000 }).catch(async (error) => {
    const resources = await Promise.all(page.workers().map((worker) => worker.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name))));
    const events = await page.evaluate(() => window.speechEvents);
    throw new Error(`${error.message}\n${errors.join("\n")}\nPending requests:\n${[...pendingRequests].join("\n")}\nWorker resources: ${JSON.stringify(resources)}\nSpeech events: ${JSON.stringify(events)}`, { cause: error });
  });
  const status = await page.locator(".study-speech-status").textContent();
  assert.ok(!status.includes("could not"), `${status}\n${errors.join("\n")}`);
  const [audio] = await page.evaluate(() => window.speechBuffers);
  assert.ok(audio.length > 1000 && audio.peak > 0.01, JSON.stringify(audio));
  assert.equal(await page.evaluate(() => window.speechBuffers.length), 1, "cancelled speech must not play");
  const cachedStart = Date.now();
  await page.click("#testSpeech");
  await page.waitForFunction(() => window.speechBuffers.length === 2);
  assert.ok(Date.now() - cachedStart < 1500, "a warmed cached word should be scheduled within 1.5 seconds");
  await page.evaluate(() => {
    const button = document.querySelector("#testSpeech");
    button.dataset.studySpeak = "ありがとう";
    button.click();
    button.dataset.studySpeak = "こんにちは";
    button.click();
  });
  // The first word in this pair requires uncached WASM synthesis, not just playback.
  await page.waitForFunction(() => window.speechBuffers.length === 4 || document.querySelector(".study-speech-status")?.textContent.includes("could not"), null, { timeout: 180000 });
  assert.equal(await page.evaluate(() => window.speechBuffers.length), 4, await page.locator(".study-speech-status").textContent());
  const starts = await page.evaluate(() => window.speechStarts);
  assert.equal(starts.length, 4, "every successive word must be scheduled");
  for (let index = 1; index < starts.length; index++) {
    assert.ok(starts[index].time >= starts[index - 1].time + starts[index - 1].duration, "successive words must not overlap");
  }
  await page.click("#audioQuickToggle");
  await page.click("#testSpeech");
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.speechBuffers.length), 4);
  await page.click("#audioQuickToggle");
  let repeatedDownloads = 0;
  const assetPattern = /\/Kokoro-82M-v1\.0-ONNX\//;
  await page.route(assetPattern, (route) => {
    repeatedDownloads++;
    return route.abort();
  });
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/imi.html`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#audioQuickToggle");
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "testSpeech";
    button.dataset.studySpeak = "こんにちは";
    button.textContent = "Speak";
    document.body.prepend(button);
  });
  await page.click("#testSpeech");
  await page.waitForFunction(() => window.speechBuffers.length > 0 || document.querySelector(".study-speech-status")?.textContent.includes("could not"), null, { timeout: 180000 });
  const cachedStatus = await page.locator(".study-speech-status").textContent();
  assert.ok(!cachedStatus.includes("could not"), `${cachedStatus}\n${errors.join("\n")}`);
  assert.equal(repeatedDownloads, 0, "changing pages must reuse the cached model and voice");
  await page.unroute(assetPattern);
  const failurePage = await browser.newPage();
  await failurePage.addInitScript(() => Object.defineProperty(speechSynthesis, "getVoices", { value: () => [] }));
  await failurePage.route(/googletagmanager\.com/, (route) => route.fulfill({ body: "" }));
  await failurePage.route(assetPattern, (route) => route.abort());
  await failurePage.goto(`http://127.0.0.1:${server.httpServer.address().port}/kana.html`, { waitUntil: "domcontentloaded" });
  await failurePage.waitForSelector("#audioQuickToggle");
  await failurePage.evaluate(() => {
    const button = document.createElement("button");
    button.id = "testSpeech";
    button.dataset.studySpeak = "こんにちは";
    button.textContent = "Speak";
    document.body.prepend(button);
  });
  await failurePage.click("#testSpeech");
  await failurePage.getByRole("status").getByText("Japanese audio could not be played.", { exact: false }).waitFor({ timeout: 30000 });
  const offPage = await browser.newPage();
  await offPage.route(/googletagmanager\.com/, (route) => route.fulfill({ body: "" }));
  await offPage.addInitScript(() => localStorage.setItem("nihon:study-controls-v1", JSON.stringify({ audio: false })));
  let offRequests = 0;
  offPage.on("request", (request) => {
    if (request.url().includes("/Kokoro-82M-v1.0-ONNX/")) offRequests++;
  });
  await offPage.goto(`http://127.0.0.1:${server.httpServer.address().port}/kana.html`, { waitUntil: "domcontentloaded" });
  await offPage.waitForSelector("#audioQuickToggle");
  await offPage.waitForTimeout(1000);
  assert.equal(offRequests, 0, "Audio Off must not preload the voice");
  await offPage.click("#audioQuickToggle");
  await offPage.waitForTimeout(500);
  assert.equal(offRequests, 0, "Audio On must not download a model before playback");
  console.log("Japanese fallback, caching, scheduling and Audio toggle checks passed.");
} finally {
  await browser?.close();
  if (dev) await server.close();
  else await new Promise((resolve) => server.httpServer.close(resolve));
}
