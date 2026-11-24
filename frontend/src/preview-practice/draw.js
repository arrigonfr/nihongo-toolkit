import { button, el, select, setting } from "./ui.js";
import { compareDrawing, loadModel, models, parseList } from "./stroke-model.js";

const modes = [["trace","Trace the next stroke"],["copy","Copy beside a model"],["memory","Draw from memory"],["study","Study stroke order without drawing"]];
const choices = [["starter","Start with 一・日・語"],["custom","One character or a custom list"],...["5","4","3","2","1"].map(n=>[n,`JLPT N${n} estimate`]),["0","No JLPT estimate"],...[1,2,3,4,5,6].map(n=>[`grade${n}`,`School grade ${n}`]),["all","All supported kanji"]];
function checkbox(c,id,text,checked=true) {
  const label = el(c,"label",null,{class:"check-label"});
  const field = el(label,"input",null,{id,name:id,"data-setting":id,type:"checkbox"});
  field.checked = checked;
  label.append(text);
}
function svg(parent,tag,attrs={}) {
  const node = parent.ownerDocument.createElementNS("http://www.w3.org/2000/svg",tag);
  for (const [k,v] of Object.entries(attrs)) node.setAttribute(k,v);
  parent.append(node);
  return node;
}
function board(c,label,grid) {
  const s = svg(c,"svg",{viewBox:"0 0 109 109",role:"img","aria-label":label,class:"draw-square"});
  if (grid) svg(s,"path",{d:"M54.5 0v109 M0 54.5h109",class:"draw-guides"});
  return s;
}
function mount(c,item,finish,[paths,numbers],signal) {
  const mode = item.practice || "trace";
  let studying = mode === "memory", self = mode === "study", assisted = mode !== "memory";
  let overlay = false, inspected = false, complete = false, replayIndex = 0, timer, animation;
  let active = null, current = [], livePath;
  const lines = [];
  const title = el(c,"h2",`Study ${item.character}`);
  const hint = el(c,"p");
  const boards = el(c,"div",null,{class:"draw-boards"});
  const refBox = el(boards,"div");
  el(refBox,"strong","Stroke model");
  const ref = board(refBox,"Ordered stroke model",item.grid);
  const referencePaths = paths.map(d=>svg(ref,"path",{d,class:"draw-stroke"}));
  const expected = referencePaths.map(path=>{
    const length = path.getTotalLength();
    const count=Math.max(2,Math.ceil(length/1.5)+1);
    return Array.from({length:count},(_,i)=>{
      // getPointAtLength uses the same 109-unit coordinate frame as the pad.
      const p=path.getPointAtLength(length*i/(count-1));
      return [p.x,p.y];
    });
  });
  const numbersOn = (layer,index) => {
    if (!item.numbers) return;
    numbers.forEach(([x,y,n],i)=>{
      if (index == null || i === index) svg(layer,"text",{x,y,class:"draw-number"}).textContent=n;
    });
  };
  numbersOn(ref);
  const dot = svg(ref,"circle",{r:"2",class:"draw-origin"});
  const padBox = el(boards,"div");
  el(padBox,"strong","Your writing");
  const pad = board(padBox,"Writing pad; use stroke study for a keyboard alternative",item.grid);
  pad.classList.add("draw-pad");
  const guide = svg(pad,"g"), ink = svg(pad,"g");
  const msg = el(c,"p","",{role:"status","aria-live":"polite"});
  const actions = el(c,"div",null,{class:"answer-actions draw-actions"});
  const add = (name,fn)=>button(actions,name,fn);
  function stopReplay() {
    clearTimeout(timer);
    animation?.cancel(); animation=undefined;
  }
  function step(index,animate=false) {
    stopReplay();
    replayIndex=index;
    referencePaths.forEach((p,i)=>p.style.opacity=i===index?"1":".5");
    const p=referencePaths[index], [x,y]=expected[index][0];
    dot.setAttribute("cx",x); dot.setAttribute("cy",y);
    if (animate && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const len=p.getTotalLength();
      animation=p.animate([{strokeDasharray:`${len} ${len}`,strokeDashoffset:len},{strokeDasharray:`${len} ${len}`,strokeDashoffset:0}],{duration:560});
    }
    const [,second] = expected[index], dx=second[0]-x,dy=second[1]-y;
    const direction=Math.abs(dx)>Math.abs(dy) ? dx>0?"right":"left" : dy>0?"down":"up";
    msg.textContent=`Stroke ${index+1} of ${paths.length}. Start at the dot and move ${direction}.`;
  }
  const reduced = ()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
  const replay=add("Replay strokes",()=>{
    let i=0;
    const next=()=>{
      step(i++,true);
      if (i<paths.length && !reduced()) timer=setTimeout(next,740);
    };
    next();
    if (reduced()) msg.textContent+=" Use Next stroke to step through the model.";
  });
  const nextStep=add("Next stroke",()=>step((replayIndex+1)%paths.length,true));
  const begin=add("Hide model and draw",()=>{stopReplay();studying=false;msg.textContent="";sync();});
  const undo=add("Undo last stroke",()=>{discard();lines.pop();ink.lastElementChild?.remove();mismatch="";msg.textContent="";sync();});
  const clear=add("Clear drawing",()=>{discard();lines.length=0;ink.replaceChildren();mismatch="";msg.textContent="";sync();});
  const reveal=add("Show overlay",()=>{
    assisted=true; inspected=true; overlay=!overlay; sync();
  });
  const check=add("Compare with model",()=>{
    if (active !== null) return;
    const difference=compareDrawing(lines,expected);
    if (!difference) return end(true,assisted?"Assisted match":"Unassisted match","The strokes match the shown model within the preview tolerances.");
    inspected=true; assisted=true; overlay=true;
    msg.textContent=`${difference} Undo and try again, or self-review. A different trace does not mean the kanji is invalid.`;
    mismatch=difference;
    sync();
  });
  const study=add("Self-review without grading",()=>{
    discard();self=true;inspected=true;assisted=true;overlay=true;
    msg.textContent="Compare the model with your attempt, or follow the strokes without drawing.";
    sync(); keep.focus();
  });
  let mismatch="";
  const record=add("Save for retry",()=>end(false,"Model differs",mismatch));
  const keep=add("Finish self-review",()=>end(null,"Self-review","Stroke study completed without automatic scoring."));
  add("Skip target",()=>end(null,"Skipped","Skipped without scoring."));
  function end(correct,kind,explanation) {
    if (complete) return;
    complete=true; stopReplay();discard();
    finish({correct,mode:kind,...(correct===null ? {} : {points:kind === "Unassisted match" ? 1 : 0}),prompt:`Write ${item.character}`,answer:`${item.character} · ${paths.length} strokes`,
      response:`${kind} · ${lines.length} strokes drawn`,explanation});
  }
  function sync() {
    const blind=mode === "memory" && !studying && !inspected && !self;
    refBox.hidden=blind; padBox.hidden=studying || (self && !lines.length);
    title.textContent=blind?"Draw the character from memory":`${self || studying ? "Study" : "Draw"} ${item.character}`;
    hint.textContent=self?"Follow each stroke from its starting dot. Finish when you’re ready; this review is not scored.":
      studying?"Study the model, then hide it before drawing.":mode==="trace"?"Trace the highlighted stroke from its starting dot.":"Draw each stroke in order. Compare when you’re ready.";
    guide.replaceChildren();
    if (!blind && !studying && (overlay || mode==="trace")) {
      paths.forEach((d,i)=>{
        if (!overlay && i!==lines.length) return;
        svg(guide,"path",{d,class:"draw-stroke draw-template"});
      });
      if (mode==="trace" && expected[lines.length]) {
        const [x,y]=expected[lines.length][0];
        svg(guide,"circle",{cx:x,cy:y,r:1.7,class:"draw-origin"});
        numbersOn(guide,lines.length);
      }
    }
    replay.hidden=nextStep.hidden=blind;
    begin.hidden=!studying || self;
    undo.hidden=clear.hidden=check.hidden=reveal.hidden=self || studying;
    clear.disabled=undo.disabled=check.disabled=!lines.length;
    reveal.textContent=overlay?"Hide overlay":blind?"Reveal model and overlay":"Show overlay";
    keep.hidden=!self;
    record.hidden=self || !mismatch;
    study.hidden=self;
  }
  function release() {
    const id=active;
    active=null;
    if (id !== null && pad.hasPointerCapture(id)) pad.releasePointerCapture(id);
  }
  function discard() {
    if (active===null) return;
    release(); livePath?.remove();current=[];
  }
  function point(e) {
    const transform=pad.getScreenCTM();
    if (!transform) return null;
    const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(transform.inverse());
    return [p.x,p.y];
  }
  const pathOf=line=>line.map(([x,y],i)=>`${i?"L":"M"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  function extend(e) {
    if (e.pointerId!==active) return;
    for (const move of e.getCoalescedEvents?.() || []) {
      const p=point(move); if (p) current.push(p);
    }
    const p=point(e);if (p) current.push(p);
    livePath.setAttribute("d",pathOf(current));
  }
  pad.onpointerdown=e=>{
    if (!e.isPrimary || e.button!==0 || active!==null || self || studying || complete) return;
    const p=point(e);if (!p) return;
    pad.setPointerCapture(e.pointerId);active=e.pointerId;
    current=[p];livePath=svg(ink,"path",{d:pathOf(current),class:"draw-stroke"});
  };
  pad.onpointermove=extend;
  pad.onpointerup=e=>{
    if (active!==e.pointerId) return;
    extend(e);release();lines.push(current);current=[];mismatch="";
    msg.textContent=`${lines.length} ${lines.length===1?"stroke":"strokes"} drawn.`;sync();
  };
  pad.onpointercancel=pad.onlostpointercapture=e=>{if(e.pointerId===active) discard();};
  signal.addEventListener("abort",()=>{stopReplay();discard();},{once:true});
  step(0);sync();
}
function credit(c) {
  const p=el(c,"p",null,{class:"muted small"});
  el(p,"a","KanjiVG",{href:"https://kanjivg.tagaini.net/",target:"_blank",rel:"noopener"});
  p.append(" · Ulrich Apel and contributors · repacked ordered paths · ");
  el(p,"a","CC BY-SA 3.0",{href:"https://creativecommons.org/licenses/by-sa/3.0/",target:"_blank",rel:"noopener"});
  p.append(". School grades: KANJIDIC2, EDRG · ");
  el(p,"a","CC BY-SA 4.0",{href:"https://creativecommons.org/licenses/by-sa/4.0/",target:"_blank",rel:"noopener"});
}
export const draw = {
  items:models,
  setup(c) {
    select(c,"draw-mode","Practice",modes);
    const collection=select(c,"draw-collection","Character collection",choices);
    const label=el(c,"label","Custom characters (choose the custom collection)");
    const input=el(label,"input",null,{type:"text",id:"draw-list",lang:"ja",maxlength:"250",placeholder:"一日語",autocomplete:"off"});
    const note=el(c,"p",null,{id:"draw-list-status",role:"status"});
    const sync=()=>{
      const custom=collection.value==="custom";
      label.hidden=!custom;note.hidden=!custom;
      if (custom) {
        const parsed=parseList(c.querySelector("#draw-list").value);
        note.textContent=`${parsed.items.length} supported. Duplicates: ${parsed.duplicates.join(" ") || "none"}. Unsupported: ${parsed.unsupported.join(" ") || "none"}.`;
      }
    };
    collection.addEventListener("change",sync); label.addEventListener("input",sync);
    // The shell restores validated selects after setup; sync dependent UI then, too.
    const linked=new URLSearchParams(c.ownerDocument.location.search).get("kanji");
    queueMicrotask(()=>{
      if (linked) {
        collection.value="custom";input.value=[...linked].slice(0,250).join("");
        input.dispatchEvent(new Event("input",{bubbles:true}));
      }
      sync();
    });sync();
    checkbox(c,"draw-grid","Show grid");checkbox(c,"draw-numbers","Show stroke numbers");
    credit(c);
  },
  pool(c) {
    const source=setting(c,"draw-collection","starter");
    const list=source==="custom" ? parseList(c.querySelector("#draw-list").value).items : source==="starter" ? parseList("一日語").items :
      source==="all" ? models : models.filter(i=>i.level===source || `grade${i.grade}`===source);
    return list.map(i=>({...i,practice:setting(c,"draw-mode","trace"),grid:c.querySelector("#draw-grid")?.checked ?? true,numbers:c.querySelector("#draw-numbers")?.checked ?? true}));
  },
  render(c,item,finish) {
    const controller=new AbortController(), region=el(c,"section",null,{class:"draw-practice"});
    async function load() {
      region.replaceChildren();
      el(region,"p",`Loading the stroke model for ${item.character}…`,{role:"status"});
      try {
        const [data]=await Promise.all([loadModel(item,controller.signal),import("./draw.css")]);
        if (controller.signal.aborted) return;
        region.replaceChildren();
        mount(region,item,finish,data,controller.signal);
      } catch {
        if (controller.signal.aborted) return;
        region.replaceChildren();
        el(region,"p","The stroke model could not be opened. Retry, or stop the session to change targets. This is not a missed answer.",{role:"alert"});
        button(region,"Retry model",load);
      }
    }
    void load();
    return ()=>controller.abort();
  },
  review(c,i) {
    el(c,"a",`Explore ${i.character} in the Kanji Atlas`,{href:`/kanji-chizucho?kanji=${encodeURIComponent(i.character)}`,target:"_blank",rel:"noopener"});
    c.append(" · ");
    el(c,"a",`Open a handwriting worksheet for ${i.character}`,{href:`/shiryo?kanji=${encodeURIComponent(i.character)}#worksheet`,target:"_blank",rel:"noopener"});
    credit(c);
  }
};
