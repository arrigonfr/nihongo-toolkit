import test from "node:test";
import assert from "node:assert/strict";

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
    await cancelled;
    assert.equal(sources.length, 2);
    assert.ok(sources.every((source) => source.stopped));
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});