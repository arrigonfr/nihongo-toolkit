import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { createServer } from "node:http";
import { once } from "node:events";
import { createHandler } from "../src/app.js";
import { findPracticeEntries } from "../src/conjugation-practice.js";

test("practice endpoint uses dictionary senses and exact JLPT links, with no fallback", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE words (id INTEGER PRIMARY KEY, word TEXT, reading TEXT, is_common INTEGER, kanji_forms TEXT, kana_forms TEXT, senses TEXT);
    CREATE TABLE vocabulary (word_id INTEGER, word TEXT, reading TEXT, jlpt INTEGER);
    CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT);`);
  const server = createServer(createHandler({ database: db }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/conjugation-practice`;
  try {
    assert.deepEqual((await (await fetch(base)).json()).entries, []);
    const senses = [{ partOfSpeech: ["v1"], appliesToKanji: ["*"], appliesToKana: ["*"],
      gloss: [{ lang: "eng", text: "dictionary gloss" }] }];
    db.prepare("INSERT INTO words VALUES (?, ?, ?, ?, ?, ?, ?)").run(42, "食べる", "たべる", 1,
      JSON.stringify([{ text: "食べる" }]), JSON.stringify([{ text: "たべる", appliesToKanji: ["*"] }]), JSON.stringify(senses));
    db.prepare("INSERT INTO vocabulary VALUES (42, ?, ?, 5)").run("別", "たべる");
    assert.deepEqual((await findPracticeEntries(db)).entries, [], "unmatched spelling levels are excluded");
    db.prepare("INSERT INTO vocabulary VALUES (42, ?, ?, 5)").run("食べる", "たべる");
    const response = await fetch(`${base}?level=5`);
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.entries.length, 1);
    assert.equal(data.entries[0].wordId, 42);
    assert.equal(data.entries[0].tag, "v1");
    assert.deepEqual(data.entries[0].meanings, ["dictionary gloss"]);
    assert.deepEqual(Object.keys(data).sort(), ["entries", "source"]);
    assert.deepEqual((await (await fetch(`${base}?level=4`)).json()).entries, []);
    assert.equal((await fetch(`${base}?level=invalid`)).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
