import { audioHTML, japaneseHTML, sentenceHTML } from "../study-controls.js";
import { fetchItems } from "../api.js";
const typeNames = { "sound-imitation":"Audible", "non-audible-mimetic":"Non-audible" };
import "./style.css";

const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const plain = markup => markup.replace(/\{([^{}|]+)\|[^{}]+\}/g,"$1");
const options = (values, all) => `<option value="">${esc(all)}</option>${values.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}`;
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
      <label>Scene<select name="scene" aria-label="Scene"><option value="">All scenes</option></select></label>
      <label>Type of use<select name="type" aria-label="Type of use">${options(Object.entries(typeNames),"All uses")}</select></label>
      <label>Dictionary frequency<select name="frequency" aria-label="Dictionary frequency">${options([["marked","Marked common"],["unmarked","Not marked common"]],"Any frequency")}</select></label>
      <label>Register<select name="register" aria-label="Register"><option value="">Any register</option></select></label>
    </div></form><div class="pg-body"></div>`;
  const form = root.querySelector("form"), body = root.querySelector(".pg-body");
  const state = () => new URLSearchParams(history.state?.guide ?? location.hash.slice(1));
  const collection = p => p.has("collection") && p.get("collection") !== "draft" ? "approved" : "draft";
  const link = (p, changes = {}) => {
    const next = new URLSearchParams(p);
    for (const key of fields) next.delete(key);
    for (const [k,v] of Object.entries(changes)) v ? next.set(k,v) : next.delete(k);
    return next.toString();
  };
  const anchor = (params,text) => `<a href="${esc(location.href)}" data-guide="${esc(params)}">${text}</a>`;
  const heading = text => `<h2 tabindex="-1">${text}</h2>`;
  function card(c,p) {
    return `<article class="pg-card"><div class="pg-term"><h3>${japaneseHTML(c.form,c.form)}</h3>${audioHTML(c.form)}</div>
      <p class="pg-meta">${esc(c.scene)} · ${typeNames[c.type]} · ${esc(c.register)}</p>
      <p>${esc(c.meaning)}</p>
      <h4>Draft example</h4><p class="pg-example">${sentenceHTML(plain(c.markup),c.markup)}</p><p>${esc(c.translation)}</p>
      <footer><p>${c.common ? "Marked common" : "Not marked common"} in JMdict${c.aliases.length ? ` · Other entry forms: <span lang="ja">${c.aliases.map(esc).join("、")}</span>` : ""}.</p>
      ${anchor(link(p,{entry:c.entry}),`JMdict entry ${esc(c.entry)}`)} · ${anchor(link(p,{sense:c.id}),"Sense link")}</footer></article>`;
  }
  let generation = 0, timer;
  async function draw(moveFocus = false) {
    const request = ++generation;
    const p = state(), group = collection(p), browsing = !fields.some(key => p.has(key));
    form.hidden = !browsing && group === "draft";
    form.elements.collection.value = group;
    for (const key of filters) form.elements[key].value = p.get(key) || "";
    body.innerHTML = `<p role="status">Loading guide…</p>`;
    let catalog;
    try {
      [catalog] = await fetchItems("/api/study/guide",{...Object.fromEntries(p),collection:group});
    } catch {
      if (request === generation) body.innerHTML = `<p role="alert">The guide couldn’t be loaded.</p><button type="button" data-retry>Try again</button>`;
      return;
    }
    if (request !== generation) return;
    for (const [key,label] of [["scene","All scenes"],["register","Any register"]]) {
      form.elements[key].innerHTML = options(catalog[key].map(v => [v,v]),label);
      form.elements[key].value = p.get(key) || "";
    }
    const record = id => catalog.cards.find(c => c.id === id);
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
        html += heading("Sense detail") + card(sense,p) + `<label class="pg-pair">Compare with<select aria-label="Compare with" data-compare-first="${esc(sense.id)}">${options(catalog.choices.map(c => [c.id,`${c.form} · ${c.scene}`]),"Choose another sense")}</select></label>`;
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
      const rows = catalog.cards;
      html = `<div class="pg-list-title">${heading(`Draft senses`)}<span role="status">${rows.length} ${rows.length === 1 ? "result" : "results"} on page ${catalog.page}</span></div>`;
      if (!rows.length) html += `<p>No local draft matches these filters. ${reset}.</p>`;
      else {
        const suggested = catalog.contrasts.find(n => n.ids.every(id => rows.some(c => c.id === id)));
        if (suggested) {
          const [a,b] = suggested.ids.map(record);
          html += `<aside class="pg-prompt">${anchor(link(p,{compare:suggested.ids.join(",")}),`Compare <span lang="ja">${esc(a.form)}</span> and <span lang="ja">${esc(b.form)}</span>`)}<span>${a.scene === b.scene ? esc(a.scene) : "Across scenes"}</span></aside>`;
          if (catalog.page > 1 || catalog.more) html += `<nav aria-label="Guide pages">${catalog.page > 1 ? anchor(link(p,{page:catalog.page-1}),"Previous page") : ""} ${catalog.more ? anchor(link(p,{page:catalog.page+1}),"Next page") : ""}</nav>`;
        }
        html += `<ul class="pg-index">${rows.map(c => `<li>${anchor(link(p,{sense:c.id}),`<span class="pg-word">${japaneseHTML(c.form,c.form)}</span><span>${esc(c.meaning)}</span>`)}<span class="pg-meta">${esc(c.scene)} · ${typeNames[c.type]}</span></li>`).join("")}</ul>`;
      }
    }
    body.innerHTML = html + `<p class="pg-credit">Local edition ${esc(catalog.manifest.edition)}. Examples and notes: NihongoToolkit, unreviewed. Dictionary: ${esc(catalog.manifest.dictionary.credit)} Release ${esc(catalog.manifest.dictionary.release)}. <a href="./data-sources" target="_blank" rel="noopener">Source credits (new tab)</a></p>`;
    if (moveFocus) body.querySelector("h2")?.focus();
  }
  function navigate(params,replace = false,focus = true) {
    history[replace ? "replaceState" : "pushState"]({...history.state,guide:params},"");
    clearTimeout(timer);
    if (replace) { generation++; timer = setTimeout(draw,180); } else draw(focus);
  }
  form.addEventListener("submit",e => e.preventDefault());
  body.addEventListener("click",e => {
    const action = e.target.closest("[data-guide]");
    if (action) { e.preventDefault(); navigate(action.dataset.guide); }
    else if (e.target.closest("[data-retry]")) draw(true);
  });
  form.addEventListener("input",e => { if (e.target.name === "q") navigate(link(state(),{q:e.target.value,page:null}),true,false); });
  form.addEventListener("change",e => { if (e.target.name !== "q") navigate(link(state(),{[e.target.name]:e.target.value,page:null}),false,false); });
  body.addEventListener("change",e => {
    if (e.target.dataset.compareFirst && e.target.value) navigate(link(state(),{compare:`${e.target.dataset.compareFirst},${e.target.value}`}));
  });
  const restore = () => { clearTimeout(timer); draw(true); };
  window.addEventListener("popstate",restore);
  draw();
  return () => { generation++; clearTimeout(timer); window.removeEventListener("popstate",restore); root.remove(); };
}
