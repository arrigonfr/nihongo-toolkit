import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateRawSync } from "node:zlib";
import { counter,draw,particle } from "../src/preview-practice/index.js";
import { gradeParticle } from "../src/preview-practice/particle.js";
import { gradeCounter } from "../src/preview-practice/counter.js";
import { compareDrawing,compareStroke,parseList,resample } from "../src/preview-practice/stroke-model.js";

const fields = values => ({querySelector:selector=>Object.hasOwn(values,selector) ? {value:values[selector]} : null});
test("particle contrasts are reciprocal; each role has nonempty, graded blank and contrast prompts",()=>{
  const groups=Map.groupBy(particle.items,i=>i.role);
  assert.equal(groups.size,5);
  assert.equal(new Set(particle.items.map(i=>i.id)).size,particle.items.length);
  for (const [role,items] of groups) {
    assert.ok(items.length>=12,role);
    for (const task of ["contrast","blank"]) {
      const pool=particle.pool(fields({"#particle-role":role,"#particle-task":task,"#particle-input":"typed"}));
      assert.ok(pool.length);
      assert.ok(pool.every(i=>i.role===role && i.taskType===task && i.input==="typed"));
    }
    for (const i of items) {
      if (i.partner) assert.equal(particle.items.find(x=>x.id===i.partner)?.partner,i.id);
      const blank=i.sentence.split("|");
      assert.equal(blank.length,2);assert.equal(i.pronunciation.split("|").length,2);
      for (const key of i.accepted) {
        const r=gradeParticle(i,key);
        assert.ok(r.correct);assert.ok(r.explanation.includes(blank.join(key)));assert.ok(r.prompt.includes("□"));
      }
      assert.ok(!gradeParticle(i,"").correct);
    }
  }
  const go=particle.items.find(i=>i.id==="school-go"),study=particle.items.find(i=>i.id==="school-study");
  for (const a of ["に","へ"," ﾍ "]) assert.ok(gradeParticle(go,a).correct);
  assert.ok(!gradeParticle(go,"で").correct);assert.ok(gradeParticle(study,"で").correct);assert.ok(!gradeParticle(study,"に").correct);
});

test("counter matrix explicitly supports each 1–10 cell, never native teens or invented cells",()=>{
  const groups=Map.groupBy(counter.items,i=>i.family);
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
  const filtered=counter.pool(fields({"#counter-family":"本","#counter-sound":"voicing","#counter-mode":"reading"}));
  assert.deepEqual(filtered.map(i=>i.quantity),[3]);assert.equal(filtered[0].input,"reading");
});

test("stroke index exactly reproduces every ideographic Han entry in the worksheet",()=>{
  const src=JSON.parse(readFileSync(new URL("../src/worksheet-strokes.json",import.meta.url)));
  const archive=readFileSync(new URL("../src/preview-practice/stroke-models.bin",import.meta.url));
  const keys=Object.keys(src).filter(k=>/^\p{Script=Han}$/u.test(k) && /^\p{Ideographic}$/u.test(k));
  assert.deepEqual(draw.items.map(i=>i.character),keys);
  for (const item of draw.items) {
    assert.deepEqual(JSON.parse(inflateRawSync(archive.subarray(item.start,item.end+1))),src[item.character]);
  }
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
    await page.goto(`${base}/joshi-renshuu`);
    await page.locator("#particle-role").selectOption("place");
    await page.locator('#particle-task + .chips [data-value="contrast"]').click();
    await page.locator("#particle-input").selectOption("typed");
    await page.locator("#startButton").tap();
    for (let n=0;n<2;n++) {
      const go=(await page.locator("#roundBody").innerText()).includes("Either an endpoint");
      assert.equal(await page.locator("#roundBody [data-study-speak]").count(),0);
      const field=page.locator("#roundBody input");
      await field.pressSequentially(go?"he":"de");
      assert.equal(await field.inputValue(),go?"へ":"で");
      await field.press("Enter");
      await page.locator("#roundFeedback").waitFor();
      assert.match(await page.locator("#roundFeedback h3").innerText(),/Correct/);
      assert.equal(await page.locator("#roundFeedback [data-study-speak]").getAttribute("data-study-speak"),go?"がっこうへいく。":"がっこうでべんきょうする。");
      await page.locator("#nextButton").click();
    }
    assert.match(await page.locator("#resultSummary").innerText(),/2 correct/);
    await page.goto(`${base}/josushi-renshuu`);
    await page.locator('#counter-mode + .chips [data-value="reading"]').click();
    await page.locator("#counter-family").selectOption("本");
    await page.locator("#counter-sound").selectOption("voicing");
    await page.locator("#startButton").tap();
    assert.equal(await page.locator("#roundBody [data-study-speak]").count(),0);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),320);
    await page.locator("#roundBody input").fill("三本");
    await page.locator("#roundBody button[type=submit]").click();
    await page.locator("#nextButton").click();
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
    await page.route("**/*",route=>new URL(route.request().url()).origin===new URL(base).origin ? route.continue() : route.abort());
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
    await page.route("**/stroke-models.bin",route=>route.fulfill({status:503}),{times:1});
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
