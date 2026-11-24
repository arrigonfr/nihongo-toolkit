import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { studyGuide } from "../src/study-guide.js";
import { provision } from "../scripts/provision-study-guide.mjs";
import catalog from "../../frontend/src/preview-guide/catalog.json" with { type:"json" };

test("guide serves bounded pages, normalized search and targeted details", async () => {
  const db = new DatabaseSync(":memory:");
  const get = async q => (await studyGuide(db,new URL(`https://example.test/?${q}`))).items[0];
  try {
    await assert.rejects(get(""));
    provision(db,catalog);
    const first = await get(""), next = await get("page=2");
    assert.equal(first.more,true);
    assert.deepEqual([...first.cards,...next.cards],catalog.cards);
    assert.deepEqual((await get("q=ｻﾞｰｻﾞｰ&scene=Rain")).cards.map(c=>c.id),["driving-rain"]);
    assert.equal((await get("collection=approved&sense=driving-rain")).cards.length,0);
    assert.equal((await get("q=%25")).cards.length,0);
    const detail = await get("sense=quiet-rain");
    assert.equal(detail.cards.length,1);
    assert.ok(detail.choices.some(c=>c.id==="driving-rain"));
    assert.equal((await get("compare=quiet-rain,driving-rain")).contrasts.length,1);
    assert.equal((await get(`entry=${detail.cards[0].entry}`)).dictionary.length,1);
  } finally { db.close(); }
});
