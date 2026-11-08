import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("local speech queues every clip without overlap and Audio Off cancels pending and playing clips", async () => {
  const originals = { Worker: globalThis.Worker, AudioContext: globalThis.AudioContext, document: globalThis.document };
  const jobs = [], sources = [];
  let worker;
  globalThis.Worker = class {
    constructor() { worker = this; }
    postMessage(job) { jobs.push(job); }
  };
  globalThis.AudioContext = class {
    currentTime = 10;
    state = "running";
    resume() { return Promise.resolve(); }
    createBuffer() { return { duration: 2, copyToChannel() {} }; }
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(time) { this.time = time; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    }
  };
  globalThis.document = { createElement: () => ({ setAttribute() {} }), body: { append() {} } };
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  const complete = (job) => worker.onmessage({ data: { id: job.id, audio: new Float32Array(2), sampling_rate: 1 } });
  try {
    const speech = await import("../src/local-speech.js");
    const first = speech.speakLocalJapanese("first");
    const second = speech.speakLocalJapanese("second");
    await flush();
    complete(jobs.shift());
    await flush();
    assert.deepEqual(jobs.map((job) => job.text), ["first", "second"]);
    complete(jobs.shift()); complete(jobs.shift());
    await Promise.all([first, second]);
    assert.deepEqual(sources.map((source) => source.time), [10, 12]);
    const cancelled = speech.speakLocalJapanese("cancelled");
    await flush();
    speech.cancelLocalSpeech();
    complete(jobs.shift());
    assert.deepEqual(jobs.shift(), { cancelThrough: 4 });
    await cancelled;
    assert.equal(sources.length, 2);
    assert.ok(sources.every((source) => source.stopped));
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});

test("worker warms Japanese synthesis and skips cancelled queued words", async () => {
  const source = await readFile(new URL("../src/local-speech-worker.js", import.meta.url), "utf8");
  const spoken = [], replies = [];
  let finishWarmup;
  const warmup = new Promise((resolve) => { finishWarmup = resolve; });
  const self = { postMessage: (message) => replies.push(message) };
  vm.runInNewContext(source.replace('import { KokoroJP } from "kokoro-js-jp";', ""), {
    self,
    KokoroJP: {
      async load() {
        return {
          async speak(text) {
            spoken.push(text);
            if (text === "こんにちは") await warmup;
            return { audio: new Float32Array([0.5]), sampling_rate: 24000 };
          }
        };
      }
    }
  });
  const send = (data) => self.onmessage({ data });
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  send({ id: 1 });
  await flush();
  assert.deepEqual(spoken, ["こんにちは"]);
  assert.equal(replies.length, 0, "preload must await Japanese voice and dictionary initialization");
  send({ id: 2, text: "old first" });
  send({ id: 3, text: "old second" });
  send({ cancelThrough: 3 });
  send({ id: 4, text: "first" });
  send({ id: 5, text: "second" });
  send({ id: 6, text: "こんにちは" });
  finishWarmup();
  await flush();
  assert.deepEqual(spoken, ["こんにちは", "first", "second"]);
  assert.deepEqual(replies.map((reply) => reply.id), [1, 2, 3, 4, 5, 6]);
  assert.ok(replies[1].cancelled && replies[2].cancelled);
  assert.ok(replies.slice(3).every((reply) => reply.audio?.length === 1));
});