import test from "node:test";
import assert from "node:assert/strict";
import { BatchQueue } from "../src/batch-queue.js";

const tick = () => new Promise((resolve) => setImmediate(resolve));
test("40-item batches refill at 10 remaining, not once per question", async () => {
  let calls = 0;
  const queue = new BatchQueue(async (key, limit, exclude) => {
    assert.equal(limit, 40);
    assert.ok(exclude.length <= 80);
    const batch = calls++;
    return Array.from({ length: limit }, (_, i) => ({ id: `${key}-${batch * 40 + i}` }));
  });
  const ids = [];
  for (let i = 0; i < 29; i++) ids.push((await queue.take("N5")).id);
  assert.equal(calls, 1);
  ids.push((await queue.take("N5")).id);
  await tick();
  assert.equal(calls, 2);
  for (let i = 30; i < 60; i++) ids.push((await queue.take("N5")).id);
  assert.equal(calls, 2);
  assert.equal(new Set(ids).size, 60);
});

test("concurrent consumers share requests and filter buckets do not mix", async () => {
  let calls = 0;
  const queue = new BatchQueue(async (key) => {
    calls++;
    await tick();
    return Array.from({ length: 40 }, (_, i) => ({ id: `${key}-${i}` }));
  });
  const results = await Promise.all(Array.from({ length: 20 }, () => queue.take("N5")));
  assert.equal(calls, 1);
  assert.equal(new Set(results.map((r) => r.id)).size, 20);
  assert.match((await queue.take("N1")).id, /^N1-/);
  assert.equal(calls, 2);
  assert.match((await queue.take("N5")).id, /^N5-/);
});

test("refill failures are surfaced while buffered items stay usable and retries recover", async () => {
  let calls = 0;
  let offline = false;
  const errors = [];
  const queue = new BatchQueue(async () => {
    calls++;
    if (offline) throw new Error("offline");
    return Array.from({ length: 40 }, (_, i) => ({ id: `${calls}-${i}` }));
  }, { onError: (error) => errors.push(error.message) });
  await queue.take("reading");
  offline = true;
  for (let i = 1; i < 40; i++) { await queue.take("reading"); await tick(); }
  assert.ok(errors.includes("offline"));
  await assert.rejects(queue.take("reading"), /offline/);
  offline = false;
  assert.ok((await queue.take("reading")).id);
});

test("malformed or empty batches fail explicitly", async () => {
  for (const value of [[], null, [{}]]) {
    const queue = new BatchQueue(async () => value);
    await assert.rejects(queue.take("N5"), /Invalid practice batch/);
  }
});
