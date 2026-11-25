import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { provision } from "../../backend/scripts/provision-study-drawing.mjs";
import { studyDrawing } from "../../backend/src/study-drawing.js";
import { counter,draw,particle } from "../src/preview-practice/index.js";
import { gradeParticle } from "../src/preview-practice/particle.js";
import { gradeCounter } from "../src/preview-practice/counter.js";
import { compareDrawing,compareStroke,parseList,resample } from "../src/preview-practice/stroke-model.js";
import { loadDeck } from "./support/study-decks.js";

await Promise.all([particle.prepare(loadDeck), counter.prepare(loadDeck)]);

const fields = values => ({querySelector:selector=>Object.hasOwn(values,selector) ? {value:values[selector]} : null});
test("particle contrasts are reciprocal; each role has nonempty, graded blank and contrast prompts",()=>{
  const groups=Map.groupBy(particle.items,i=>i.role);
  assert.equal(groups.size,5);
  assert.equal(new Set(particle.items.map(i=>i.id)).size,particle.items.length);
  assert.ok(particle.items.length >= 5000);
  const expanded = particle.items.filter(i=>i.id.startsWith("expanded-"));
  assert.equal(new Set(expanded.map(i=>`${i.sentence}|${i.context}`)).size, expanded.length);
  for (const [role,items] of groups) {
    assert.ok(items.length>=29,role);
    for (const task of ["contrast","blank"]) {
      assert.ok(items.some(i=>i.taskType===task));
    }
    for (const i of items) {
      if (i.partner) assert.equal(particle.items.find(x=>x.id===i.partner)?.partner,i.id);
      const blank=i.sentence.split("|");
      assert.equal(blank.length,2);assert.equal(i.pronunciation.split("|").length,2);
      for (const key of i.accepted) {
        assert.ok(i.choices.includes(key), `${i.id}: missing choice ${key}`);
      }
      const r=gradeParticle(i,i.accepted);
      assert.ok(r.correct);assert.ok(r.prompt.includes("□"));
      for (const key of i.accepted) assert.ok(r.explanation.includes(blank.join(key)));
      assert.ok(!gradeParticle(i,"").correct);
    }
  }
  const go=particle.items.find(i=>i.id==="school-go"),study=particle.items.find(i=>i.id==="school-study");
  assert.ok(gradeParticle(go,["に"," ﾍ "]).correct);
  assert.ok(!gradeParticle(go,"で").correct);assert.ok(gradeParticle(study,"で").correct);assert.ok(!gradeParticle(study,"に").correct);
  for (const [item, selection, expected] of [
    [study,["で"],"Correct"], [study,["に"],"Wrong"], [study,["で","に"],"Partially wrong"],
    [go,["に","へ"],"Correct"], [go,["に"],"Partially correct"],
    [go,["に","で"],"Partially wrong"], [go,["に","へ","で"],"Partially right"], [go,["で"],"Wrong"]
  ]) assert.equal(gradeParticle(item,selection).assessment,expected);
});

test("particle settings use the full pool and retain answer selection", async () => {
  const { createServer } = await import("vite");
  const { chromium } = await import("playwright");
  const root = new URL("../", import.meta.url).pathname;
  const previous = process.env.EDITORIAL_PREVIEWS;
  process.env.EDITORIAL_PREVIEWS = "1";
  let server, browser;
  try {
    server = await createServer({ root, server: { host: "127.0.0.1", port: 17892, strictPort: false }, logLevel: "error" });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.route("**/api/study/deck/particle", route => route.fulfill({ json: { items: particle.items } }));
    await page.addInitScript(() => {
      if (!localStorage.getItem("nihon:editorial:particle-lab:v1")) {
        localStorage.setItem("nihon:editorial:particle-lab:v1", JSON.stringify({ "particle-task": "contrast" }));
      }
    });
    await page.goto(`${origin}/joshi-renshuu`);
    await page.locator("#startButton").waitFor();
    assert.equal(await page.locator("#particle-role").count(), 0);
    assert.equal(await page.locator("#particle-task").count(), 0);
    assert.equal(await page.locator("#poolCount, #particle-input").count(), 0);
    for (const id of ["editorialLength"]) {
      assert.equal(await page.locator(`#${id}`).locator("..").locator(".chips-title[data-study-help]").count(), 0);
    }
    await page.locator('#editorialLength + .chips [data-value="100"]').click();
    await page.reload();
    assert.equal(await page.locator("#editorialLength").inputValue(), "100");
    for (const width of [360, 1200]) {
      await page.setViewportSize({ width, height: 800 });
      const widths = await page.locator(".session-setup").evaluate(el => [
        el.getBoundingClientRect().width, el.querySelector("summary").getBoundingClientRect().width
      ]);
      assert.ok(Math.abs(widths[0] - widths[1]) <= 2);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    }
    await page.locator("#startButton").click();
    assert.equal(await page.locator("#roundLabel").innerText(), "Round 1 of 100");
    assert.ok(await page.locator(".particle-check").isDisabled());
    await page.keyboard.press("1");
    assert.equal(await page.locator(".preview-practice-options button").first().getAttribute("aria-pressed"), "true");
    await page.keyboard.press("c");
    assert.ok(await page.locator("#roundFeedback").isVisible());
    const mobile = await browser.newPage({ viewport: { width: 360, height: 800 }, hasTouch: true });
    await mobile.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    const go = particle.items.find(i => i.id === "school-go");
    await mobile.route("**/api/study/deck/particle", route => route.fulfill({ json: { items: Array(5).fill(go) } }));
    await mobile.goto(`${origin}/joshi-renshuu`);
    await mobile.locator("#startButton").waitFor();
    await mobile.locator('#editorialLength + .chips [data-value="10"]').tap();
    assert.ok(await mobile.locator("#startButton").isDisabled());
    assert.match(await mobile.locator("#poolError").innerText(), /Not enough questions/);
    await mobile.locator('#editorialLength + .chips [data-value="short"]').tap();
    await mobile.locator("#startButton").tap();
    const first = mobile.locator(".preview-practice-options button").first();
    assert.equal(await first.locator("kbd").isVisible(), false);
    await mobile.keyboard.press("1");
    assert.equal(await first.getAttribute("aria-pressed"), "false");
    await first.tap();
    await mobile.locator(".particle-check").tap();
    assert.equal(await mobile.locator("#roundFeedback h3").innerText(), "Partially correct");
    const examplePage = await browser.newPage();
    await examplePage.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    let example;
    await examplePage.route("**/api/study/deck/particle", route => route.fulfill({ json: { items: Array(5).fill(example) } }));
    for (const [sentence, expected] of [
      ["大学|昨日行きました。", [["大学","だいがく"],["昨日","きのう"],["行","い"]]],
      ["映画館|昨日友達と会いました。", [["映画館","えいがかん"],["昨日","きのう"],["友達","ともだち"],["会","あ"]]]
    ]) {
      example = particle.items.find(item => item.sentence === sentence);
      assert.ok(example, sentence);
      await examplePage.goto(`${origin}/joshi-renshuu`);
      await examplePage.locator("#startButton").click();
      const ruby = await examplePage.locator("#roundBody h2 ruby").evaluateAll(nodes =>
        nodes.map(node => [node.firstChild.textContent, node.querySelector("rt").textContent]));
      assert.deepEqual(ruby, expected);
    }
    const counterPage = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    await counterPage.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await counterPage.route("**/api/study/deck/counter", route => route.fulfill({ json: { items: counter.items } }));
    await counterPage.addInitScript(() => {
      if (!localStorage.getItem("nihon:editorial:counter-practice:v1"))
        localStorage.setItem("nihon:editorial:counter-practice:v1", JSON.stringify({ "counter-sound": "native" }));
    });
    await counterPage.goto(`${origin}/josushi-renshuu`);
    await counterPage.locator("#startButton").waitFor();
    assert.equal(await counterPage.locator("#counter-family, #poolCount").count(), 0);
    assert.equal(await counterPage.locator("#counter-sound").count(), 0);
    assert.equal(await counterPage.locator("#counter-table").locator("..").locator("span").count(), 0);
    await counterPage.locator("summary").filter({hasText:"Browse counter readings"}).click();
    assert.equal(await counterPage.locator(".preview-practice-table tr").count(), 13);
    await counterPage.locator('#editorialLength + .chips [data-value="100"]').click();
    await counterPage.reload();
    assert.equal(await counterPage.locator("#editorialLength").inputValue(), "100");
    assert.ok(await counterPage.locator("#startButton").isEnabled());
    await counterPage.locator('#editorialLength + .chips [data-value="short"]').click();
    await counterPage.locator('#counter-mode + .chips [data-value="family"]').click();
    await counterPage.locator("#startButton").click();
    assert.equal(await counterPage.locator(".preview-practice-options button").count(), 6);
    await counterPage.keyboard.press("1");
    assert.ok(await counterPage.locator("#roundFeedback").isVisible());
    assert.equal(await counterPage.locator('#roundFeedback [data-field="answer"] .study-romaji').count(), 1);
    assert.equal(await counterPage.locator('#roundFeedback [data-field="answer"] [data-study-speak]').count(), 1);
    const listen = counterPage.locator('#roundFeedback [data-field="answer"] [data-study-speak]');
    assert.equal(await listen.innerText(), "▶");
    assert.ok(await listen.evaluate(node => parseFloat(getComputedStyle(node).marginInlineStart) > 0));
  } finally {
    await browser?.close();
    await server?.close();
    if (previous === undefined) delete process.env.EDITORIAL_PREVIEWS;
    else process.env.EDITORIAL_PREVIEWS = previous;
  }
});

test("counter matrix explicitly supports each 1–10 cell, never native teens or invented cells",()=>{
  assert.ok(counter.items.length >= 10000);
  assert.equal(new Set(counter.items.map(i=>i.id)).size,counter.items.length);
  assert.equal(new Set(counter.items.map(i=>`${i.family}|${i.quantity}|${i.referent}`)).size,counter.items.length);
  const groups=Map.groupBy(counter.items.filter(i=>!i.referentSingular),i=>i.family);
  assert.equal(groups.size,12);
  for (const [family,group] of groups) {
    assert.deepEqual(group.map(i=>i.quantity),[1,2,3,4,5,6,7,8,9,10,...(family==="つ"?[]:[11,20])]);
    for (const i of group) {
      assert.ok(gradeCounter(i,family).correct);
      for (const v of i.readings) assert.ok(gradeCounter({...i,input:"reading"},v).correct);
    }
  }
  const cell=(f,n)=>({...counter.items.find(i=>i.family===f && i.quantity===n),input:"reading"});
  for (const [family,n,word] of [["本",1,"ｲｯﾎﾟﾝ"],["本",2,"に ほん"],["本",3,"サンボン"],["人",1,"ひとり"],["人",2,"ふたり"],["つ",10,"とお"],["本",10,"じっぽん"]]) {
    assert.ok(gradeCounter(cell(family,n),word).correct);
  }
  for (const [f,n,bad] of [["本",3,"三本"],["本",1,"いぽん"],["本",3,"さんほん"],["本",1,"ippon"],["つ",10,"とう"]]) {
    assert.ok(!gradeCounter(cell(f,n),bad).correct);
  }
  const pool=counter.pool(fields({"#counter-sound":"voicing","#counter-mode":"reading"}));
  assert.equal(pool.length,counter.items.length);
  assert.ok(pool.every(i=>i.input === "reading"));
  for (const i of counter.items.filter(i=>i.referentSingular)) {
    const original = counter.items.find(base=>base.family===i.family && base.quantity===i.quantity && !base.referentSingular);
    assert.deepEqual(i.readings,original.readings);
    assert.equal(i.written,original.written);
    assert.equal(i.sound,original.sound);
  }
  for (const [singular,plural] of [["mouse","mice"],["calf","calves"],["piece of rope","pieces of rope"],["berry","berries"]]) {
    assert.equal(counter.items.find(i=>i.referentSingular===singular).referent,plural);
  }
});

test("drawing requests preserve worksheet coverage, ordered models and custom selection",async t=>{
  const src=JSON.parse(readFileSync(new URL("../src/worksheet-strokes.json",import.meta.url)));
  const db=new DatabaseSync(":memory:");
  t.after(()=>db.close());
  db.exec("CREATE TABLE kanjis(character TEXT,grade INTEGER); INSERT INTO kanjis VALUES('日',1)");
  provision(db);
  const request=async params=>(await studyDrawing(db,new URL(`http://test/api/study/drawing?${new URLSearchParams(params)}`))).items;
  await draw.prepare(request);
  const keys=Object.keys(src).filter(k=>/^\p{Script=Han}$/u.test(k) && /^\p{Ideographic}$/u.test(k));
  assert.deepEqual(draw.items.map(i=>i.character),keys);
  for (const character of ["日","語",keys.at(-1)]) assert.deepEqual(await request({character}),[src[character]]);
  assert.deepEqual(await request({character:"☀"}),[]);
  assert.deepEqual(draw.pool(fields({"#draw-collection":"grade1"})).map(i=>i.character),["日"]);
  assert.deepEqual(draw.pool(fields({"#draw-collection":"custom","#draw-list":"語あ日語"})).map(i=>i.character),["語","日"]);
  assert.deepEqual(parseList(" 日語、一 日☀☀").items.map(i=>i.character),["日","語","一"]);
  assert.deepEqual(parseList(" 日語、一 日☀☀").duplicates,["日","☀"]);
  assert.deepEqual(parseList("☀").unsupported,["☀"]);
});

test("known-target comparison preserves grid placement, order, direction and relative stroke length",()=>{
  // Synthetic tolerance fixtures, not a claim of calibration on real handwriting.
  const horizontal=[[11,54.25],[20.73,54.75],[50,52],[89,49.51],[96.88,50]];
  const vertical=[[31.5,24.5],[33.24,29.25],[33.15,82.75],[33.24,89.5]];
  const turn=[[33.48,26],[74.25,22.75],[79.25,27],[79.02,83],[79.02,89]];
  const middle=[[34.22,55.25],[78.28,52.5]],bottom=[[33.24,87],[78.5,84]];
  const day=[vertical,turn,middle,bottom];
  assert.equal(compareDrawing([resample(horizontal,75)],[horizontal]),"");
  assert.equal(compareDrawing(day.map(line=>line.map(([x,y])=>[x+2,y-2])),day),"");
  assert.match(compareDrawing([horizontal.toReversed()],[horizontal]),/right/);
  assert.match(compareDrawing([horizontal.map(([x,y])=>[x+20,y])],[horizontal]),/left/);
  assert.match(compareDrawing([horizontal.slice(0,2)],[horizontal]),/extends/);
  assert.match(compareDrawing([[horizontal[0],[50,80],horizontal.at(-1)]],[horizontal]),/bend/);
  assert.match(compareDrawing([turn,vertical,middle,bottom],day),/Stroke 1/);
  assert.match(compareDrawing(day.slice(0,3),day),/drew 3/);
  assert.match(compareDrawing([...day,bottom],day),/drew 5/);
  const dot=[[24,23],[27,25],[30,28]];
  assert.equal(compareStroke([[25,24],[30,29]],dot),"");assert.notEqual(compareStroke([[20,30],[25,36]],dot),"");
  assert.notEqual(compareStroke([dot[0],dot[0]],dot),"");
});

// Set PRACTICE_BROWSER_BASE to a running, local EDITORIAL_PREVIEWS=1 Vite server.
const base=process.env.PRACTICE_BROWSER_BASE;
test("gated particle and counter modes accept alternatives without exposing the key",{skip:!base},async()=>{
  const { chromium }=await import("playwright"), browser=await chromium.launch();
  try {
    const page=await browser.newPage({viewport:{width:320,height:740},hasTouch:true});
    page.setDefaultTimeout(8000);
    await page.route("**/*",route=>new URL(route.request().url()).origin===new URL(base).origin ? route.continue() : route.abort());
    await page.route("**/api/study/deck/particle", route => route.fulfill({ json: { items: Array.from({length:5}, () => particle.items.find(i => i.id === "school-go")) } }));
    await page.goto(`${base}/joshi-renshuu`);
    await page.locator("#startButton").tap();
    for (let n=0;n<5;n++) {
      assert.equal(await page.locator("#roundBody [data-study-speak]").count(),0);
      await page.locator("#roundBody button").filter({hasText:"に"}).click();
      await page.locator("#roundBody button").filter({hasText:"へ"}).click();
      await page.locator(".particle-check").click();
      await page.locator("#roundFeedback").waitFor();
      assert.match(await page.locator("#roundFeedback h3").innerText(),/Correct/);
      assert.equal(await page.locator("#roundFeedback [data-study-speak]").count(),2);
      await page.locator("#nextButton").click();
    }
    assert.match(await page.locator("#resultSummary").innerText(),/5 correct/);
    await page.goto(`${base}/josushi-renshuu`);
    await page.locator('#counter-mode + .chips [data-value="reading"]').click();
    await page.route("**/api/study/deck/counter", route => route.fulfill({ json: { items: Array(5).fill(counter.items.find(i=>i.family==="本" && i.quantity===3)) } }));
    await page.reload();
    await page.locator("#startButton").tap();
    assert.equal(await page.locator("#roundBody [data-study-speak]").count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
    await page.locator("#roundBody input").fill("三本");
    await page.locator("#roundBody button[type=submit]").click();
    await page.locator("#stopSessionButton").click();
    await page.locator("#retryMissed").click();
    await page.locator("#roundBody input").pressSequentially("sanbon");
    await page.locator("#roundBody input").press("Enter");
    assert.equal(await page.locator("#roundFeedback [data-study-speak]").getAttribute("data-study-speak"),"さんぼん");
    assert.match(await page.locator("#roundFeedback h3").innerText(),/Correct/);
  } finally { await browser.close(); }
});

test("actual gated draw rounds: capture, interruption, resize, ordered models, self-study and asset retry",{skip:!base},async()=>{
  const { chromium }=await import("playwright"), browser=await chromium.launch();
  try {
    const page=await browser.newPage({reducedMotion:"reduce",viewport:{width:390,height:844}});
    page.setDefaultTimeout(8000);
    const errors=[];
    page.on("pageerror",error=>errors.push(error.message));
    await page.route("**/*",route=>{
      const url=new URL(route.request().url());
      return url.origin===new URL(base).origin || url.pathname==="/api/study/drawing" ? route.continue() : route.abort();
    });
    const start=async(char,mode)=>{
      await page.goto(`${base}/kanji-kaki?kanji=${encodeURIComponent(char)}`);
      await page.locator(`#draw-mode + .chips [data-value="${mode}"]`).click();
      await page.getByRole("button",{name:"Start session",exact:true}).click();
    };
    for (const [char,mode] of [["一","memory"],["日","trace"],["語","copy"]]) {
      await start(char,mode);
      const pad=page.locator(".draw-pad"), reference=page.locator(".draw-boards > div").first();
      const model=reference.locator(".draw-stroke");
      await model.first().waitFor();
      const paths=await model.evaluateAll(nodes=>nodes.map(path=>Array.from({length:12},(_,i)=>{
        const p=path.getPointAtLength(path.getTotalLength()*i/11);return [p.x,p.y];
      })));
      if (mode==="memory") {
        await page.getByRole("button",{name:"Hide model and draw"}).click();
        assert.ok(await reference.isHidden());assert.ok(await page.getByRole("button",{name:"Replay strokes"}).count()===0);
      }
      await pad.scrollIntoViewIfNeeded();
      const box=await pad.boundingBox();
      await page.mouse.move(box.x+30,box.y+30);await page.mouse.down();
      await pad.dispatchEvent("pointercancel",{pointerId:1});
      await page.mouse.up();
      assert.ok(await page.getByRole("button",{name:"Undo last stroke"}).isDisabled());
      const trace=async line=>{
        await pad.scrollIntoViewIfNeeded();
        const points=await pad.evaluate((s,line)=>line.map(([x,y])=>{
          const p=new DOMPoint(x,y).matrixTransform(s.getScreenCTM());return [p.x,p.y];
        }),line);
        await page.mouse.move(...points[0]);await page.mouse.down();
        for (const point of points.slice(1)) await page.mouse.move(...point);
        await page.mouse.up();
      };
      await trace(paths[0]);await page.getByRole("button",{name:"Undo last stroke"}).click();
      assert.ok(await page.getByRole("button",{name:"Undo last stroke"}).isDisabled());
      for (const [index,line] of paths.entries()) {
        await trace(line);
        if (index===0) await page.setViewportSize({width:850,height:580});
      }
      await page.getByRole("button",{name:"Compare with model"}).click();
      await page.locator("#roundFeedback").waitFor();
      assert.match(await page.locator("#roundFeedback").innerText(),mode==="memory"?/Unassisted match/:/Assisted match/);
      assert.equal(await page.locator("#roundFeedback a").first().getAttribute("href"),`/kanji-chizucho?kanji=${encodeURIComponent(char)}`);
      await page.setViewportSize({width:390,height:844});
    }
    await page.route("**/api/study/drawing?character=*",route=>route.fulfill({status:503}),{times:1});
    await start("日","study");
    await page.getByRole("button",{name:"Retry model"}).click();
    await page.getByRole("button",{name:"Next stroke"}).focus();
    await page.keyboard.press("Enter");
    assert.match(await page.locator(".draw-practice [role=status]").innerText(),/Stroke 2 of 4/);
    await page.getByRole("button",{name:"Finish self-review"}).click();
    assert.match(await page.locator("#roundFeedback").innerText(),/without automatic scoring/);
    assert.deepEqual(errors,[]);
  } finally { await browser.close(); }
});
