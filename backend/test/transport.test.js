import test from "node:test";
import assert from "node:assert/strict";
import { gunzipSync } from "node:zlib";
import { sendBody } from "../src/transport.js";

async function response(body, encoding, enabled) {
  const headers = {};
  let bytes;
  await sendBody({ headers: { "accept-encoding": encoding } },
    { setHeader: (name, value) => { headers[name] = value; }, end: (value) => { bytes = value; } },
    body, "application/json", enabled);
  return { headers, bytes };
}
test("gzip reduces JSON bytes by at least 50% and roundtrips without changing Japanese content", async () => {
  const body = JSON.stringify({ items: Array.from({ length: 40 }, (_, id) =>
    ({ id, kanji: "生", on_readings: ["セイ", "ショウ"], kun_readings: ["い.きる", "う.まれる"], meanings: ["life", "birth"] })) });
  const compressed = await response(body, "gzip, br", true);
  assert.equal(compressed.headers["Content-Encoding"], "gzip");
  assert.equal(gunzipSync(compressed.bytes).toString(), body);
  assert.ok(compressed.bytes.length < Buffer.byteLength(body) / 2);
  for (const [encoding, enabled] of [["gzip", false], ["gzip;q=0, br", true], ["identity", true]]) {
    const raw = await response(body, encoding, enabled);
    assert.equal(raw.headers["Content-Encoding"], undefined);
    assert.equal(raw.bytes.toString(), body);
  }
});

test("HEAD requests keep Content-Type, skip gzip, and send no body", async () => {
  const headers = {};
  let bytes = "sentinel";
  await sendBody(
    { method: "HEAD", headers: { "accept-encoding": "gzip" } },
    { setHeader: (name, value) => { headers[name] = value; }, end: (value) => { bytes = value; } },
    "x".repeat(4096),
    "application/json; charset=utf-8",
    true
  );
  assert.equal(headers["Content-Type"], "application/json; charset=utf-8");
  assert.equal(headers["Content-Encoding"], undefined);
  assert.equal(bytes, undefined);
});
