import test from "node:test";
import assert from "node:assert/strict";
import { isPracticeKanji, practiceMeanings } from "../src/practice-kanji.js";
import { createHandler } from "../src/app.js";
import { createServer } from "node:http";
import { once } from "node:events";
import { openDatabase } from "../src/database.js";

test("quiz eligibility rejects radical forms and component-only entries, not real kanji that are also radicals", () => {
  for (const char of ["⼀", "⽊", "⺅", "abc", "あ", "日月"]) {
    assert.equal(isPracticeKanji(char, ["モク"], ["き"], ["tree"]), false, char);
  }
  for (const char of ["氵", "忄", "亠", "丶"]) {
    assert.equal(isPracticeKanji(char, ["モク"], ["き"], ["left-side radical"]), false, char);
  }
  assert.equal(isPracticeKanji("丶", ["チュ"], [], ["dot"]), true, "Eligibility follows source meanings, not a character blacklist");
  assert.equal(isPracticeKanji("木", ["モク"], ["き"], ["tree"]), true);
  assert.equal(isPracticeKanji("一", ["イチ"], ["ひと.つ"], ["one", "one radical (no.1)"]), true);
  assert.equal(isPracticeKanji("禾", ["カ"], [], ["two-branch tree radical (no. 115)"]), false);
  assert.equal(isPracticeKanji("漢", [], [], ["Han"]), false);
  assert.deepEqual(practiceMeanings(["one", "one radical (no.1)"]), ["one"]);
});

test("both quiz modes filter before sampling at every JLPT level", async () => {
  const db = openDatabase();
  const server = createServer(createHandler({ database: db }));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    for (const mode of ["meaning", "reading"]) {
      for (const level of ["all", "1", "2", "3", "4", "5", "unrated"]) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/kanji/batch?mode=${mode}&level=${level}&limit=100`);
        assert.equal(response.status, 200);
        const { items } = await response.json();
        assert.ok(items.length > 0 && items.length <= 100);
        for (const item of items) assert.ok(isPracticeKanji(item.kanji, item.on_readings, item.kun_readings, item.meanings), item.kanji);
      }
    }
    for (const reading of ["on", "kun"]) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/kanji/batch?mode=reading&reading=${reading}&limit=100`);
      assert.equal(response.status, 200);
      const { items } = await response.json();
      assert.ok(items.length > 0);
      assert.ok(items.every((item) => item[`${reading}_readings`].length > 0));
    }
    assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/kanji/batch?reading=invalid`)).status, 400);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    db.close();
  }
});
