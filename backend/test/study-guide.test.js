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
    const all = await get("");
    assert.equal(all.total,catalog.cards.length);
    assert.equal(all.more,false);
    assert.deepEqual(all.cards.map(c=>c.id),catalog.cards.map(c=>c.id));
    const first = await get("limit=8"), next = await get("limit=8&page=2");
    assert.equal(first.more,true);
    assert.equal(first.total,catalog.cards.length);
    assert.equal(next.more,false);
    assert.deepEqual([...first.cards,...next.cards].map(c=>c.id),catalog.cards.map(c=>c.id));
    assert.deepEqual((await get("q=ｻﾞｰｻﾞｰ&scene=Weather+%26+nature")).cards.map(c=>c.id),["driving-rain"]);
    assert.deepEqual((await get("q=zaazaa")).cards.map(c=>c.id),["driving-rain"]);
    assert.deepEqual((await get("q=z%C4%81z%C4%81")).cards.map(c=>c.id),["driving-rain"]);
    assert.deepEqual((await get("q=motchiri")).cards.map(c=>c.id),["yielding-dough"]);
    assert.equal((await get("collection=approved&sense=driving-rain")).cards.length,0);
    assert.equal((await get("collection=examples")).total,catalog.cards.length);
    assert.equal((await get("usage=adv")).total,catalog.cards.length);
    const weather = await get("scene=Weather+%26+nature");
    assert.equal(weather.total,3);
    assert.equal(weather.usageCounts.adv,3);
    assert.equal(weather.usageCounts.vs,0);
    assert.equal(weather.frequencyCounts.marked,1);
    assert.equal(weather.frequencyCounts.unmarked,2);
    assert.equal((await get("q=%25")).cards.length,0);
    const detail = await get("sense=quiet-rain");
    assert.equal(detail.cards.length,1);
    assert.ok(detail.choices.some(c=>c.id==="driving-rain"));
    assert.equal(detail.choices[0].id,"driving-rain");
    assert.equal((await get("compare=quiet-rain,driving-rain")).contrasts.length,1);
    assert.equal((await get(`entry=${detail.cards[0].entry}`)).dictionary.length,1);
  } finally { db.close(); }
});
