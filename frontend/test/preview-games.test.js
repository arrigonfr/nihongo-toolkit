import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { frame, crossResult, validatePuzzle } from "../src/preview-games/crossroads-data.js";
import { validateJourney, solveLeg, routeFor, clueFor } from "../src/preview-games/train-data.js";
import { deal, karutaResult } from "../src/preview-games/karuta-data.js";
import { loadDeck } from "./support/study-decks.js";
const [puzzles, journeys, pictures] = await Promise.all(["crossroads","train","karuta"].map(loadDeck));
const networks = Object.fromEntries(journeys.map(j => [j.network, j.net]));
import { drawings } from "../src/preview-games/pictures.js";
import { createCluePlayer } from "../src/preview-games/clue-player.js";

test("crossroads rejects broken banks; guesses and reveals have a fixed hint cost", () => {
  puzzles.forEach(validatePuzzle);
  const p = puzzles[0];
  assert.deepEqual([0,1,2,3].map(h => crossResult(p,"曜",h).points), [3,2,1,1]);
  assert.equal(crossResult(p,"",0).points, 0);
  assert.equal(crossResult(p,"星",0).correct, false);
  assert.match(crossResult(p,"星",0).prompt, /days of the week/);
  assert.throws(() => validatePuzzle({...p, bank:["星","星"]}));
  assert.throws(() => validatePuzzle({...p, compounds:[p.compounds[0],...p.compounds.slice(0,2)]}));
});

const sqlite = new URL("../../backend/data/nihon.sqlite",import.meta.url);
test("local dictionary agrees with every frozen reading and candidate intersection", { skip: !existsSync(sqlite) }, () => {
  const db = new DatabaseSync(sqlite, { readOnly:true });
  try {
    const forms = db.prepare("SELECT DISTINCT form FROM word_forms WHERE kind=0 AND form LIKE ?");
    const reading = db.prepare("SELECT 1 FROM words WHERE word=? AND reading=? LIMIT 1");
    for (const p of puzzles) {
      const options = p.compounds.map(c => {
        assert.ok(reading.get(c.spelling,c.reading),c.spelling);
        return forms.all(frame(c).replace("□","_")).map(row => [...row.form][c.gap]);
      });
      const intersection = options[0].filter(c => options.every(o => o.includes(c)));
      assert.deepEqual(intersection.sort(), [...p.alternatives,...p.accepted].sort(),p.id);
    }
  } finally { db.close(); }
});

test("each journey resolves uniquely and resumes from the last intended platform", () => {
  journeys.forEach(validateJourney);
  const j = journeys.find(x => x.id === "coast-to-tower");
  const [first, change, last] = j.legs;
  assert.deepEqual(solveLeg(networks.coast, change), [{ action:"transfer",end:"bridge",endService:"M" }]);
  assert.match(routeFor(networks.coast, change), /same station/);
  assert.throws(() => validateJourney({...j,legs:[first,change,{...last,dir:-1}]}));
  assert.throws(() => validateJourney({...j,legs:[{...change,start:"port"}]}));
  assert.match(clueFor(networks.coast,first).translation, /1 ahead/);
  const step = { rule:"ordinal", arg:1, service:"P", dir:1, start:"grove" };
  assert.equal(solveLeg(networks.mountain,step)[0].end,"inn");
  assert.equal(solveLeg(networks.mountain,{...step,service:"F"})[0].end,"falls");
  assert.equal(solveLeg(networks.mountain,{...step,dir:-1})[0].end,"well");
  assert.deepEqual(solveLeg(networks.mountain,{...step,start:"peak"}),[]);
});

test("every karuta deal has unique, illustrated and named cards, and retains the answer mode", () => {
  for (const item of pictures) {
    const cards = deal(item, pictures);
    assert.equal(new Set(cards.map(c => c.description)).size,6);
    assert.equal(cards.filter(c => karutaResult(item,c,"listening").correct).length,1);
    assert.ok(cards.every(c => drawings[c.id] || existsSync(new URL(`../public/karuta/tabler/${c.id}.svg`, import.meta.url))));
    assert.equal(karutaResult(item,item,"text").mode,"text");
    assert.match(item.reading,/^[ぁ-ゖー、。]+$/u);
    assert.throws(() => deal({...item,distractors:Array(5).fill("clock")}, pictures));
  }
});

test("stable draft IDs and provenance across all three pools", () => {
  for (const pool of [puzzles, journeys, pictures]) {
    assert.equal(new Set(pool.map(c => c.id)).size,pool.length);
    pool.forEach(item => assert.ok(item.source && item.license && item.contentVersion && /pending/i.test(item.reviewStatus)));
  }
});

test("clue playback waits for a Japanese voice, ignores stale completions and reports failure", () => {
  const synth = new EventTarget(), spoken = [], states = [];
  let voices = [], enabled = true;
  synth.getVoices = () => voices;
  synth.speak = u => spoken.push(u);
  const player = createCluePlayer({ synth, Utterance: class {}, silence() {}, enabled:() => enabled, onState:s => states.push(s) });
  player.play("ひとつ");
  assert.deepEqual(states,["loading"]);
  voices = [{lang:"ja-JP"}];
  synth.dispatchEvent(new Event("voiceschanged"));
  assert.equal(spoken.length,1);
  player.play("ふたつ");
  spoken[0].onend();
  assert.equal(states.at(-1),"loading");
  spoken[1].onerror();
  assert.equal(states.at(-1),"unavailable");
  player.play("みっつ");
  spoken[2].onend();
  assert.equal(states.at(-1),"heard");
  enabled = false;
  player.play("みっつ");
  assert.equal(states.at(-1),"unavailable");
  assert.equal(spoken.length,3);
  player.stop();
});
