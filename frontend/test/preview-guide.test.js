import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { catalog, classify, findCards, normalize } from "../src/preview-guide/model.js";
import { activate, collect, fingerprint, install, lookupInstalled } from "../../backend/scripts/preview-guide-inventory.mjs";
import { drafts } from "../../backend/scripts/preview-guide-input.mjs";
import { provision } from "../../backend/scripts/provision-study-guide.mjs";
import { studyGuide } from "../../backend/src/study-guide.js";

const find = opts => findCards({collection:"draft",...opts}).map(c => c.id);
const editorial = {editorial:true};
test("browse by scene, gloss and entry forms without merging meaningful variants", () => {
  assert.deepEqual(find({scene:"Rain"}),["quiet-rain","driving-rain"]);
  assert.deepEqual(find({q:"ｻﾞｰｻﾞｰ",type:"sound-imitation",frequency:"unmarked"}),["driving-rain"]);
  assert.deepEqual(find({q:"springy chew"}),["springy-bite"]);
  assert.deepEqual(find({register:"Sound effect"}),["single-bang"]);
  assert.deepEqual(find({q:"もっちり"}),["yielding-dough"]);
  assert.notEqual(normalize("もっちり"),normalize("もちり"));
  for (const miss of ["ざざ","ざあざあ！","ドーン"]) assert.deepEqual(find({q:miss}),[]);
});

test("editorial dispositions are sense-specific; neither ordinary nor unknown becomes a guide card", () => {
  const types = form => classify(form,editorial).matches.map(m => m.proposed);
  assert.deepEqual(types("さくさく"),["non-audible-mimetic","sound-imitation"]);
  assert.deepEqual(types("ドン"),["sound-imitation","ordinary"]);
  assert.deepEqual(types("雨"),["ordinary"]);
  assert.deepEqual(types("日々"),["ordinary"]);
  assert.deepEqual(types("もちもち"),["non-audible-mimetic"]);
  assert.deepEqual(types("もっちり"),["non-audible-mimetic"]);
  assert.deepEqual(classify("雨",{...editorial,reading:"う"}).matches,[]);
  assert.equal(classify("さくさく",{...editorial,sense:"snow-steps"}).matches.length,1);
  assert.deepEqual(find({q:"日々"}),[]);
  assert.deepEqual(classify("unseen",editorial),{status:"unknown",matches:[]});
  assert.deepEqual(classify("もちもち"),classify("unseen"));
  assert.deepEqual(findCards({q:"rain"}),[]);
});

const source = new URL("../../backend/data/nihon.sqlite",import.meta.url);
test("offline export agrees with pinned SQLite; installs are atomic, repeatable and reversible", {skip:!existsSync(source)}, () => {
  const db = new DatabaseSync(fileURLToPath(source),{readOnly:true});
  const dest = new DatabaseSync(":memory:");
  try {
    const batch = collect(db);
    assert.deepEqual(batch.catalog,catalog);
    const report = JSON.parse(readFileSync(new URL("../../backend/scripts/preview-guide-coverage.json",import.meta.url)));
    assert.deepEqual(report,{version:batch.version,...batch.report});
    assert.equal(report.dictionaryEntriesWithTag,db.prepare(`SELECT count(*) n FROM words w
      WHERE EXISTS(SELECT 1 FROM json_each(w.senses) s,json_each(s.value,'$.misc') m WHERE m.value='on-mim')`).get().n);
    assert.equal(report.baselineKeysReconciled,0);
    assert.equal(report.publishedSenses,0);
    install(dest,batch);
    assert.deepEqual(lookupInstalled(dest,"どん"),{status:"unknown",matches:[]});
    assert.deepEqual(lookupInstalled(dest,"しとしと",editorial).matches.map(s => s.proposed),["non-audible-mimetic","unknown"]);
    assert.ok(lookupInstalled(dest,"こつこつ",editorial).matches.every(s => s.proposed === "unknown" && s.evidence === "on-mim"));
    const again = install(dest,batch);
    assert.deepEqual(again.removedOrChanged,[]);
    assert.equal(dest.prepare("SELECT count(*) n FROM guide_versions").get().n,1);
    const w = batch.evidence.filter(s => s.entry === "1005130").reverse();
    assert.equal(w.find(s => fingerprint(s.sense) === drafts.find(d => d.id === "snow-steps").fingerprint).tagged,true);
    const refreshed = collect(db,drafts.map(n => n.id === "snow-steps" ? {...n,meaning:"Revised editorial note."} : n));
    assert.notEqual(refreshed.version,batch.version);
    install(dest,refreshed);
    activate(dest,batch.version);
    const active = () => dest.prepare("SELECT version FROM guide_active").get().version;
    assert.equal(active(),batch.version);
    assert.throws(() => activate(dest,"missing"),/No such/);
    assert.throws(() => collect(db,drafts.map(n => ({...n,source:"unlicensed"}))),/Only original/);
    assert.throws(() => collect(db,drafts.map(n => ({...n,status:"approved"}))),/unreviewed/);
    assert.throws(() => collect(db,drafts.map(n => ({...n,fingerprint:"removed"}))),/Changed, removed/);
    assert.throws(() => install(dest,{...refreshed,version:"broken",evidence:[w[0],w[0]]}),/UNIQUE/);
    assert.equal(active(),batch.version);
  } finally {dest.close();db.close();}
});

test("localhost browse → comparison → example, dictionary, history and approved collection", {
  skip:process.env.GUIDE_BROWSER_TEST !== "1",timeout:90000
}, async () => {
  const {createServer} = await import("vite"), {chromium} = await import("playwright");
  const oldGate = process.env.EDITORIAL_PREVIEWS;
  process.env.EDITORIAL_PREVIEWS = "1";
  let server, browser;
  const guideDb = new DatabaseSync(":memory:");
  try {
    provision(guideDb,catalog);
    server = await createServer({root:fileURLToPath(new URL("../",import.meta.url)),logLevel:"error",server:{host:"127.0.0.1",port:5481,strictPort:false,watch:null}});
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({viewport:{width:1100,height:900}});
    const upstream = [], errors = [];
    await page.route("**/*",r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.route("**/api/study/guide?*",async r => r.fulfill({json:await studyGuide(guideDb,new URL(r.request().url()))}));
    page.on("pageerror",e => errors.push(e.message));
    await page.goto(origin+"/onomatope-jiten");
    await page.getByRole("heading",{name:"Draft senses"}).waitFor();
    page.on("request",r => {
      // The shared support button requests this image on reload; it is still
      // blocked by the route above. The guide API is served from the fixture.
      if (new URL(r.url()).pathname === "/api/study/guide") return;
      if (r.resourceType() === "image" && r.url() === "https://www.paypalobjects.com/paypal-ui/logos/svg/paypal-mark-color.svg") return;
      if (new URL(r.url()).origin !== origin) upstream.push(r.url());
    });
    await page.getByLabel("Scene",{exact:true}).selectOption("Rain");
    await page.getByRole("link",{name:/Compare しとしと/}).click();
    const compare = page.url();
    assert.equal(compare,origin+"/onomatope-jiten");
    await page.getByText("Rain is making a rushing sound on the roof.",{exact:true}).waitFor();
    const cards = page.locator(".pg-parallel article");
    const bounds = async () => Promise.all([cards.nth(0).boundingBox(),cards.nth(1).boundingBox()]);
    let [a,b] = await bounds();
    assert.ok(b.x >= a.x+a.width-1);
    await page.setViewportSize({width:360,height:800});
    [a,b] = await bounds();
    assert.ok(b.y >= a.y+a.height-1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth+1));
    await page.getByRole("link",{name:"JMdict entry 1058910"}).click();
    await page.getByText(/with white noise/).waitFor();
    assert.equal(page.url(),compare);
    await page.goBack();
    assert.equal(page.url(),compare);
    await page.reload();
    await page.getByRole("link",{name:"Sense link"}).last().click();
    await page.getByLabel("Compare with",{exact:true}).selectOption("snow-steps");
    await page.getByText(/no draft contrast note/).waitFor();
    await page.getByRole("link",{name:"Back to results"}).click();
    assert.equal(await page.getByLabel("Scene",{exact:true}).inputValue(),"Rain");
    await page.getByLabel("Find an expression").fill("ｻﾞｰｻﾞｰ");
    await page.waitForFunction(() => document.querySelectorAll(".pg-index li").length === 1);
    assert.equal(await page.locator(".pg-index li").count(),1);
    await page.getByLabel("Collection",{exact:true}).selectOption("approved");
    await page.getByRole("heading",{name:"No approved senses yet"}).waitFor();
    assert.equal(await page.locator(".pg-index li,.pg-card").count(),0);
    assert.deepEqual(upstream,[]);
    assert.deepEqual(errors,[]);
  } finally {
    await browser?.close(); await server?.close();
    guideDb.close();
    if (oldGate === undefined) delete process.env.EDITORIAL_PREVIEWS; else process.env.EDITORIAL_PREVIEWS = oldGate;
  }
});
