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
  assert.equal(solveLeg(networks.river,{ rule:"terminal", service:"R", dir:1, start:"shrine" })[0].end,"east");
  assert.equal(solveLeg(networks.river,{ rule:"nextNext", service:"R", dir:1, start:"west" })[0].end,"river");
  assert.equal(solveLeg(networks.river,{ rule:"stationsAhead", arg:3, service:"R", dir:1, start:"west" })[0].end,"castle");
  assert.match(clueFor(networks.river,{ rule:"terminal", service:"R", dir:1, start:"shrine" }).clue, /終点/);
  assert.match(clueFor(networks.river,{ rule:"nextNext", service:"R", dir:1, start:"west" }).clue, /次の次/);
  assert.match(clueFor(networks.river,{ rule:"stationsAhead", arg:3, service:"R", dir:1, start:"west" }).clue, /三駅先/);
  const netNames = Object.keys(networks);
  assert.ok(netNames.length >= 8);
  assert.ok(journeys.length >= 400);
  for (const name of netNames) {
    const netJourneys = journeys.filter(x => x.network === name);
    assert.ok(netJourneys.filter(x => x.legs.length === 1).length >= 20, `${name} single-leg variety`);
    assert.ok(netJourneys.filter(x => x.legs.length > 1).length >= 20, `${name} multi-leg variety`);
    if (networks[name].transfers.length) {
      assert.ok(netJourneys.filter(x => x.legs.some(l => l.rule === "transfer")).length >= 12, `${name} transfer variety`);
    }
  }
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

test("kanji anaume uses numeric session length, centered desktop/mobile input, and jisho explanation list", async () => {
  const { createServer } = await import("vite");
  const { chromium } = await import("playwright");
  const root = new URL("../", import.meta.url).pathname;
  const previous = process.env.EDITORIAL_PREVIEWS;
  process.env.EDITORIAL_PREVIEWS = "1";
  let server, browser;
  try {
    server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false, watch: null }, logLevel: "error" });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch();

    const desktop = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    const errors = [];
    desktop.on("pageerror", error => errors.push(error.message));
    await desktop.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await desktop.route("**/api/study/deck/crossroads*", route => route.fulfill({ json: { items: puzzles } }));

    await desktop.goto(`${origin}/kanji-anaume`);
    await desktop.locator("#startButton").waitFor();
    assert.deepEqual(await desktop.locator("#editorialLength option").allInnerTexts(), ["5", "10", "20", "50", "100"]);
    assert.equal(await desktop.locator("#poolCount").count(), 0);
    assert.equal(await desktop.locator("#editorialLength").locator("..").locator("[data-study-help]").count(), 0);

    await desktop.locator("#startButton").click();
    await desktop.locator("#roundBody .pg-bank button").first().waitFor();
    assert.equal(await desktop.locator("#roundBody").evaluate(el => getComputedStyle(el).alignItems), "center");

    const choices = desktop.locator("#roundBody .pg-bank button");
    const check = desktop.locator("#roundBody .pg-actions").getByRole("button", { name: /Check answer/ });
    const hint = desktop.locator("#roundBody .pg-actions").getByRole("button", { name: /Reveal a meaning/ });
    assert.equal(await choices.count(), 4);
    assert.equal(await desktop.locator("#roundBody").getByRole("button", { name: /Reveal answer/ }).count(), 0);
    assert.equal(await check.isDisabled(), true);
    assert.equal(await choices.first().locator("kbd.particle-shortcut").isVisible(), true);
    assert.equal(await check.locator("kbd.particle-shortcut").isVisible(), true);
    assert.equal(await hint.locator("kbd.particle-shortcut").isVisible(), true);
    const [checkBox, hintBox] = await Promise.all([check.boundingBox(), hint.boundingBox()]);
    assert.ok(Math.abs(checkBox.y - hintBox.y) <= 2);

    await desktop.keyboard.press("r");
    assert.match(await desktop.locator('#roundBody [role="status"]').innerText(), /^Meaning 1:/);

    await desktop.keyboard.press("1");
    assert.equal(await choices.nth(0).getAttribute("aria-pressed"), "true");
    assert.equal(await check.isDisabled(), false);
    assert.equal(await desktop.locator("#roundFeedback").isVisible(), false);

    await desktop.keyboard.press("2");
    assert.equal(await choices.nth(0).getAttribute("aria-pressed"), "false");
    assert.equal(await choices.nth(1).getAttribute("aria-pressed"), "true");

    await desktop.keyboard.press("c");
    await desktop.locator("#roundFeedback").waitFor({ state: "visible" });
    const links = desktop.locator('#roundFeedback [data-field="explanation"] dd ul li a');
    assert.equal(await links.count(), 3);
    for (let i = 0; i < 3; i++) {
      assert.match(await links.nth(i).getAttribute("href"), /^https:\/\/jisho\.org\/search\//);
      assert.equal(await links.nth(i).getAttribute("target"), "_blank");
    }
    assert.equal(await desktop.locator("#roundFeedback > ul").count(), 0);
    await desktop.close();

    const mobileContext = await browser.newContext({ viewport: { width: 360, height: 840 }, hasTouch: true });
    await mobileContext.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await mobileContext.route("**/api/study/deck/crossroads*", route => route.fulfill({ json: { items: puzzles } }));
    const mobile = await mobileContext.newPage();
    mobile.on("pageerror", error => errors.push(error.message));
    await mobile.goto(`${origin}/kanji-anaume`);
    await mobile.locator("#startButton").tap();
    await mobile.locator("#roundBody .pg-bank button").first().waitFor();
    const mobileCheck = mobile.locator("#roundBody .pg-actions").getByRole("button", { name: /Check answer/ });
    const mobileHint = mobile.locator("#roundBody .pg-actions").getByRole("button", { name: /Reveal a meaning/ });
    assert.equal(await mobile.locator("#roundBody .pg-bank button kbd.particle-shortcut").first().isVisible(), false);
    assert.equal(await mobileCheck.locator("kbd.particle-shortcut").isVisible(), false);
    assert.equal(await mobileHint.locator("kbd.particle-shortcut").isVisible(), false);
    await mobile.keyboard.press("r");
    assert.equal(await mobile.locator('#roundBody [role="status"]').innerText(), "");
    await mobile.keyboard.press("1");
    assert.equal(await mobile.locator("#roundBody .pg-bank button").first().getAttribute("aria-pressed"), "false");
    assert.equal(await mobileCheck.isDisabled(), true);
    await mobile.locator("#roundBody .pg-bank button").first().tap();
    assert.equal(await mobile.locator("#roundBody .pg-bank button").first().getAttribute("aria-pressed"), "true");
    await mobileCheck.tap();
    await mobile.locator("#roundFeedback").waitFor({ state: "visible" });
    assert.equal(await mobile.locator('#roundFeedback [data-field="explanation"] dd ul li a').count(), 3);
    assert.equal(await mobile.locator("#roundFeedback > ul").count(), 0);
    await mobileContext.close();

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server?.close();
    if (previous === undefined) delete process.env.EDITORIAL_PREVIEWS;
    else process.env.EDITORIAL_PREVIEWS = previous;
  }
});

test("shuden filters, persists view, confirms selections, recovers on multi-leg transfers, and renders rich review", async () => {
  const { createServer } = await import("vite");
  const { chromium } = await import("playwright");
  const root = new URL("../", import.meta.url).pathname;
  const previous = process.env.EDITORIAL_PREVIEWS;
  process.env.EDITORIAL_PREVIEWS = "1";
  let server, browser;
  try {
    server = await createServer({ root, server: { host: "127.0.0.1", port: 0, strictPort: false, watch: null }, logLevel: "error" });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch();
    const errors = [];

    const coastTransfer = journeys.find(x => x.id === "coast-to-tower");
    const singleTerminal = journeys.find(x => x.id === "lake-terminal-lake");

    const desktop = await browser.newPage({ viewport: { width: 1200, height: 840 } });
    desktop.on("pageerror", error => errors.push(error.message));
    await desktop.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await desktop.route("**/api/study/deck/train*", route => route.fulfill({ json: { items: [coastTransfer, singleTerminal] } }));

    await desktop.goto(`${origin}/shuden`);
    await desktop.locator("#startButton").waitFor();
    assert.deepEqual(await desktop.locator("#editorialLength option").allInnerTexts(), ["5", "10", "20", "50", "100"]);

    // Incompatible filter combination disables Start with helpful message
    await desktop.locator("#train-network").selectOption("lake");
    await desktop.locator("#train-rule").selectOption("transfer");
    assert.equal(await desktop.locator("#startButton").isDisabled(), true);
    assert.match(await desktop.locator("#poolError").innerText(), /No eligible journeys/);

    // Single-leg journey goes directly to #roundFeedback on confirm
    await desktop.locator("#train-rule").selectOption("terminal");
    assert.equal(await desktop.locator("#startButton").isDisabled(), false);
    await desktop.locator("#startButton").click();
    await desktop.locator("#roundBody .pg-service.is-active").waitFor();
    const confirm = desktop.locator("#roundBody .pg-actions").getByRole("button", { name: /Confirm choice/ });
    assert.equal(await confirm.isDisabled(), true);
    await desktop.locator('#roundBody [data-station="lake"]').click();
    assert.equal(await desktop.locator('#roundBody [data-station="lake"]').getAttribute("aria-pressed"), "true");
    assert.equal(await confirm.isDisabled(), false);
    await confirm.click();
    await desktop.locator("#roundFeedback").waitFor({ state: "visible" });
    assert.equal(await desktop.locator("#roundFeedback .journey-leg").count(), 1);
    assert.ok(await desktop.locator('#roundFeedback [data-field="prompt"] dd ruby').count() >= 1);
    assert.equal(await desktop.locator('#roundFeedback button[aria-label="Replay instruction"]').count(), 1);

    // Multi-leg transfer journey: wrong pick -> explicit recovery -> view toggle persistence -> transfer -> finish
    await desktop.locator("#stopSessionButton").click();
    await desktop.getByRole("button", { name: "Practice again" }).click();
    await desktop.locator("#train-network").selectOption("coast");
    await desktop.locator("#train-rule").selectOption("transfer");
    await desktop.locator("#startButton").click();
    await desktop.locator("#roundBody .pg-service.is-active").waitFor();

    // Audio toggle syncs disabled state live
    const hear = desktop.locator('#roundBody button[aria-label="Hear instruction"]');
    assert.equal(await hear.isDisabled(), false);
    await desktop.locator("#audioQuickToggle").click();
    assert.equal(await hear.isDisabled(), true);
    await desktop.locator("#audioQuickToggle").click();
    assert.equal(await hear.isDisabled(), false);

    // Leg 1: wrong stop (bay instead of bridge)
    await desktop.locator('#roundBody [data-station="bay"]').click();
    await desktop.locator("#roundBody .pg-actions").getByRole("button", { name: /Confirm choice/ }).click();
    assert.ok(await desktop.locator('#roundBody [data-station="bay"].is-wrong').isVisible());
    assert.ok(await desktop.locator('#roundBody [data-station="bridge"].is-correct').isVisible());
    const cont1 = desktop.locator("#roundBody").getByRole("button", { name: "Continue from 石橋" });
    await cont1.waitFor();
    await cont1.click();

    // Leg 2: toggle to ordered list, verify persisted preference, then transfer to M
    await desktop.locator("#roundBody .pg-toggle-view").click();
    assert.equal(await desktop.locator("#roundBody ol.pg-stations").count(), 2);
    assert.equal(await desktop.locator("#train-view").inputValue(), "list");
    await desktop.locator('#roundBody .pg-transfers [data-transfer="M"]').click();
    await desktop.locator("#roundBody .pg-actions").getByRole("button", { name: /Confirm choice/ }).click();
    await desktop.locator("#roundBody").getByRole("button", { name: "Continue from 石橋" }).click();

    // Leg 3: still in ordered list view; pick tower and confirm -> straight to #roundFeedback
    assert.equal(await desktop.locator("#roundBody ol.pg-stations").count(), 2);
    await desktop.locator('#roundBody [data-station="tower"]').click();
    await desktop.locator("#roundBody .pg-actions").getByRole("button", { name: /Confirm choice/ }).click();
    await desktop.locator("#roundFeedback").waitFor({ state: "visible" });
    assert.equal(await desktop.locator("#roundFeedback .journey-leg").count(), 3);
    assert.equal(await desktop.locator('#roundFeedback button[aria-label="Replay instruction"]').count(), 3);

    // Reload preserves Route display = list
    await desktop.reload();
    await desktop.locator("#startButton").waitFor();
    assert.equal(await desktop.locator("#train-view").inputValue(), "list");
    await desktop.close();

    // Mobile layout check: no horizontal overflow, keyboard shortcuts hidden
    const mobileContext = await browser.newContext({ viewport: { width: 360, height: 840 }, hasTouch: true });
    await mobileContext.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await mobileContext.route("**/api/study/deck/train*", route => route.fulfill({ json: { items: [coastTransfer] } }));
    const mobile = await mobileContext.newPage();
    mobile.on("pageerror", error => errors.push(error.message));
    await mobile.goto(`${origin}/shuden`);
    await mobile.locator("#startButton").tap();
    await mobile.locator("#roundBody .pg-service.is-active").waitFor();
    assert.equal(await mobile.locator("#roundBody kbd.particle-shortcut").first().isVisible(), false);
    assert.ok(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await mobileContext.close();

    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server?.close();
    if (previous === undefined) delete process.env.EDITORIAL_PREVIEWS;
    else process.env.EDITORIAL_PREVIEWS = previous;
  }
});
