import { audioHTML, japaneseHTML, sentenceHTML } from "../study-controls.js";
import { catalog, findCards, typeNames } from "./model.js";
import "./style.css";

const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const plain = markup => markup.replace(/\{([^{}|]+)\|[^{}]+\}/g,"$1");
const options = (values, all) => `<option value="">${esc(all)}</option>${values.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}`;
const uniqueOptions = key => [...new Set(catalog.cards.map(c => c[key]))].map(v => [v,v]);
const record = id => catalog.cards.find(c => c.id === id);
const filters = ["q","scene","type","frequency","register"];
const fields = ["sense","compare","entry"];

export function mountGuide(container) {
  const root = document.createElement("section");
  root.className = "preview-guide";
  container.replaceChildren(root);
  root.innerHTML = `<form aria-label="Search guide">
    <div class="pg-search"><label>Find an expression<input type="search" name="q" placeholder="Try rain, a springy bite, or ザーザー"></label>
      <label>Collection<select name="collection" aria-label="Collection"><option value="draft">Editorial drafts</option><option value="approved">Approved senses</option></select></label></div>
    <div class="pg-filters">
      <label>Scene<select name="scene" aria-label="Scene">${options(uniqueOptions("scene"),"All scenes")}</select></label>
      <label>Type of use<select name="type" aria-label="Type of use">${options(Object.entries(typeNames),"All uses")}</select></label>
      <label>Dictionary frequency<select name="frequency" aria-label="Dictionary frequency">${options([["marked","Marked common"],["unmarked","Not marked common"]],"Any frequency")}</select></label>
      <label>Register<select name="register" aria-label="Register">${options(uniqueOptions("register"),"Any register")}</select></label>
    </div></form><div class="pg-body"></div>`;
  const form = root.querySelector("form"), body = root.querySelector(".pg-body");
  const state = () => new URLSearchParams(location.hash.slice(1));
  const collection = p => p.has("collection") && p.get("collection") !== "draft" ? "approved" : "draft";
  const link = (p, changes = {}) => {
    const next = new URLSearchParams(p);
    for (const key of fields) next.delete(key);
    for (const [k,v] of Object.entries(changes)) v ? next.set(k,v) : next.delete(k);
    return `#${next}`;
  };
  const anchor = (url,text) => `<a href="${esc(url)}">${text}</a>`;
  const heading = text => `<h2 tabindex="-1">${text}</h2>`;
  function card(c,p) {
    return `<article class="pg-card"><div class="pg-term"><h3>${japaneseHTML(c.form,c.form)}</h3>${audioHTML(c.form)}</div>
      <p class="pg-meta">${esc(c.scene)} · ${typeNames[c.type]} · ${esc(c.register)}</p>
      <p>${esc(c.meaning)}</p>
      <h4>Draft example</h4><p class="pg-example">${sentenceHTML(plain(c.markup),c.markup)}</p><p>${esc(c.translation)}</p>
      <footer><p>${c.common ? "Marked common" : "Not marked common"} in JMdict${c.aliases.length ? ` · Other entry forms: <span lang="ja">${c.aliases.map(esc).join("、")}</span>` : ""}.</p>
      ${anchor(link(p,{entry:c.entry}),`JMdict entry ${esc(c.entry)}`)} · ${anchor(link(p,{sense:c.id}),"Sense link")}</footer></article>`;
  }
  function draw(moveFocus = false) {
    const p = state(), group = collection(p), browsing = !fields.some(key => p.has(key));
    form.hidden = !browsing && group === "draft";
    form.elements.collection.value = group;
    for (const key of filters) form.elements[key].value = p.get(key) || "";
    const back = anchor(link(p),"Back to results");
    const reset = anchor(link(new URLSearchParams(),{collection:group}),"Clear search and filters");
    let html;
    if (group === "approved") {
      html = heading("No approved senses yet") + `<p>The local collection has no reviewed guide cards. Switch to Editorial drafts to inspect the proposed uses.</p>`;
    } else if (!browsing) {
      const sense = record(p.get("sense")), ids = (p.get("compare") || "").split(",");
      const pair = ids.map(record), e = catalog.dictionary.find(d => d.entry === p.get("entry"));
      html = `<p>${back}</p>`;
      if (sense) {
        html += heading("Sense detail") + card(sense,p) + `<label class="pg-pair">Compare with<select aria-label="Compare with" data-compare-first="${esc(sense.id)}">${options(catalog.cards.filter(c => c.id !== sense.id).map(c => [c.id,`${c.form} · ${c.scene}`]),"Choose another sense")}</select></label>`;
      } else if (ids.length === 2 && ids[0] !== ids[1] && pair.every(Boolean)) {
        const contrast = catalog.contrasts.find(n => ids.every(id => n.ids.includes(id)));
        html += heading("Compare senses") + `<p class="pg-note">${esc(contrast?.note ?? "There is no draft contrast note for this pair. Compare the two uses and examples below.")}</p>
          <div class="pg-parallel">${pair.map(c => card(c,p)).join("")}</div>`;
      } else if (e) {
        html += heading(`Dictionary entry · ${esc(e.entry)}`) + `<p class="pg-headword">${japaneseHTML(e.form,e.reading)}</p>
          <p>Entry forms: <span lang="ja">${e.forms.map(esc).join("、")}</span></p><ol class="pg-dictionary">` +
          e.senses.map(s => `<li>${s.meanings.map(esc).join("; ")}${s.umbrellaTag ? " · Tagged on-mim" : ""}
          ${[...s.appliesToKana,...s.appliesToKanji].some(f => f !== "*") ? ` · Restricted to ${[...s.appliesToKana,...s.appliesToKanji].filter(f => f !== "*").map(esc).join("、")}` : ""}
          ${catalog.cards.filter(c => c.entry === e.entry && c.fingerprint === s.fingerprint).map(c => anchor(link(p,{sense:c.id}),"View draft sense")).join("")}</li>`).join("") +
          "</ol><p>The dictionary tag covers both sound and sensation. It does not decide which use applies.</p>";
      } else html += heading("Link not found") + "<p>This local edition does not contain the linked sense, entry or comparison.</p>";
    } else {
      const rows = findCards({...Object.fromEntries(p),collection:group});
      html = `<div class="pg-list-title">${heading(`Draft senses`)}<span role="status">${rows.length} ${rows.length === 1 ? "result" : "results"}</span></div>`;
      if (!rows.length) html += `<p>No local draft matches these filters. ${reset}.</p>`;
      else {
        const suggested = catalog.contrasts.find(n => n.ids.every(id => rows.some(c => c.id === id)));
        if (suggested) {
          const [a,b] = suggested.ids.map(record);
          html += `<aside class="pg-prompt">${anchor(link(p,{compare:suggested.ids.join(",")}),`Compare <span lang="ja">${esc(a.form)}</span> and <span lang="ja">${esc(b.form)}</span>`)}<span>${a.scene === b.scene ? esc(a.scene) : "Across scenes"}</span></aside>`;
        }
        html += `<ul class="pg-index">${rows.map(c => `<li>${anchor(link(p,{sense:c.id}),`<span class="pg-word">${japaneseHTML(c.form,c.form)}</span><span>${esc(c.meaning)}</span>`)}<span class="pg-meta">${esc(c.scene)} · ${typeNames[c.type]}</span></li>`).join("")}</ul>`;
      }
    }
    body.innerHTML = html + `<p class="pg-credit">Local edition ${esc(catalog.manifest.edition)}. Examples and notes: NihongoToolkit, unreviewed. Dictionary: ${esc(catalog.manifest.dictionary.credit)} Release ${esc(catalog.manifest.dictionary.release)}. <a href="./data-sources" target="_blank" rel="noopener">Source credits (new tab)</a></p>`;
    if (moveFocus) body.querySelector("h2")?.focus();
  }
  function update(key,value,replace = false) {
    const url = link(state(),{[key]:value});
    history[replace ? "replaceState" : "pushState"](null,"",url);
    draw();
  }
  form.addEventListener("submit",e => e.preventDefault());
  form.addEventListener("input",e => { if (e.target.name === "q") update("q",e.target.value,true); });
  form.addEventListener("change",e => { if (e.target.name !== "q") update(e.target.name,e.target.value); });
  body.addEventListener("change",e => {
    if (e.target.dataset.compareFirst && e.target.value) location.hash = link(state(),{compare:`${e.target.dataset.compareFirst},${e.target.value}`});
  });
  const navigate = () => draw(true);
  window.addEventListener("hashchange",navigate);
  draw();
  return () => { window.removeEventListener("hashchange",navigate); root.remove(); };
}
