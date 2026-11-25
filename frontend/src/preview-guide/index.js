import { audioHTML, japaneseHTML, sentenceHTML } from "../study-controls.js";
import { fetchItems } from "../api.js";
const typeNames = {
  "sound-imitation": "Audible",
  "non-audible-mimetic": "Non-audible"
};
const usageNames = [
  ["adv", "Adverb (〜と)"],
  ["vs", "Suru verb (〜する)"],
  ["adj", "Adjective (〜な / 〜の)"],
  ["n", "Noun"],
  ["int", "Interjection"]
];
const usageLabel = Object.fromEntries(usageNames);
import "./style.css";

const esc = v => String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c]);
const plain = markup => markup.replace(/\{([^{}|]+)\|[^{}]+\}/g,"$1");
const options = (values, all) => `<option value="">${esc(all)}</option>${values.map(([value,label]) => `<option value="${esc(value)}">${esc(label)}</option>`).join("")}`;
const filters = ["q","scene","usage","frequency"];
const fields = ["sense","compare","entry"];
const allowedParams = new Set(["collection","page",...filters,...fields]);

export function mountGuide(container) {
  const root = document.createElement("section");
  root.className = "preview-guide";
  container.replaceChildren(root);
  root.innerHTML = `<form aria-label="Search guide">
    <div class="pg-search"><label>Find an expression<input id="guideQuery" type="search" name="q" placeholder="Try rain, dokidoki, ゆっくり, or ザーザー"></label>
      <label>Collection<select id="guideCollection" name="collection" aria-label="Collection"><option value="all">All expressions</option><option value="examples">With examples</option><option value="draft">Curated guides</option></select></label></div>
    <div class="pg-filters">
      <label>Scene<select id="guideScene" name="scene" aria-label="Scene"><option value="">All scenes</option></select></label>
      <label>Grammar<select id="guideUsage" name="usage" aria-label="Grammar">${options(usageNames,"Any grammar")}</select></label>
      <label>Commonness<select id="guideFrequency" name="frequency" aria-label="Commonness">${options([["marked","Common in JMdict"],["unmarked","Less common"]],"Any frequency")}</select></label>
    </div>
    <div class="pg-actions"><button type="button" class="pg-reset" hidden>Clear filters</button></div></form><div class="pg-body"></div>`;
  const form = root.querySelector("form"), body = root.querySelector(".pg-body"), resetButton = root.querySelector(".pg-reset");
  const state = () => {
    const raw = new URLSearchParams(location.hash.slice(1) || history.state?.guide || "");
    const clean = new URLSearchParams();
    for (const [k, v] of raw) if (allowedParams.has(k) && v) clean.set(k, v);
    return clean;
  };
  const collection = p => {
    const value = p.get("collection");
    return ["all","draft","examples","approved"].includes(value) ? value : "all";
  };
  const link = (p, changes = {}) => {
    const next = new URLSearchParams(p);
    for (const key of fields) next.delete(key);
    for (const [k,v] of Object.entries(changes)) v ? next.set(k,v) : next.delete(k);
    if (next.get("collection") === "all") next.delete("collection");
    return next.toString();
  };
  const hrefFor = params => `${location.pathname}${location.search}${params ? `#${params}` : ""}`;
  const anchor = (params,text) => `<a href="${esc(hrefFor(params))}" data-guide="${esc(params)}">${text}</a>`;
  const heading = text => `<h2 tabindex="-1">${text}</h2>`;
  const metaLine = c => {
    const parts = [c.scene];
    if (typeNames[c.type]) parts.push(typeNames[c.type]);
    else if (c.usage?.length) parts.push(c.usage.slice(0, 2).map(u => usageLabel[u] || u).join(" · "));
    if (c.register) parts.push(c.register);
    return parts.filter(Boolean).join(" · ");
  };
  function exampleBlock(c) {
    if (!c.markup) return "";
    const label = c.exampleSource ? `Example (${esc(c.exampleSource)})` : "Draft example";
    const credit = c.exampleSource
      ? `<p class="pg-example-meta">${esc(c.exampleSource)}${c.exampleLicense ? ` · ${esc(c.exampleLicense)}` : ""}${c.exampleOwner ? ` · by ${esc(c.exampleOwner)}` : ""}</p>`
      : "";
    return `<h4>${label}</h4><p class="pg-example">${sentenceHTML(plain(c.markup),c.markup)}</p><p>${esc(c.translation)}</p>${credit}`;
  }
  function card(c,p) {
    const aliases = (c.aliases || []).slice(0, 8);
    return `<article class="pg-card"><div class="pg-term"><h3>${japaneseHTML(c.form,c.form)}</h3>${audioHTML(c.form)}</div>
      <p class="pg-meta">${esc(metaLine(c))}</p>
      <p>${esc(c.meaning)}</p>
      ${exampleBlock(c)}
      <footer><p>${c.common ? "Marked common" : "Not marked common"} in JMdict${aliases.length ? ` · Other entry forms: <span lang="ja">${aliases.map(esc).join("、")}</span>` : ""}.</p>
      ${anchor(link(p,{entry:c.entry}),`JMdict entry ${esc(c.entry)}`)} · ${anchor(link(p,{sense:c.id}),"Sense link")}</footer></article>`;
  }
  let generation = 0, timer, controller, metaKey = "", hasRendered = false;
  function syncMeta(catalog, p) {
    const selectedScene = p.get("scene") || "";
    const selectedUsage = p.get("usage") || "";
    const selectedFreq = p.get("frequency") || "";
    const selectedCol = collection(p) === "approved" ? "all" : collection(p);
    const nextKey = JSON.stringify([catalog.scene, catalog.sceneCounts, catalog.usageCounts, catalog.frequencyCounts, catalog.counts, selectedScene, selectedUsage, selectedFreq, selectedCol]);
    if (nextKey !== metaKey) {
      metaKey = nextKey;
      const sceneOptions = (catalog.scene || [])
        .filter(v => !catalog.sceneCounts || catalog.sceneCounts[v] > 0 || v === selectedScene)
        .map(v => [v, catalog.sceneCounts && v in catalog.sceneCounts ? `${v} (${catalog.sceneCounts[v]})` : v]);
      form.elements.scene.innerHTML = options(sceneOptions, "All scenes");

      const usageOptions = usageNames
        .filter(([v]) => !catalog.usageCounts || catalog.usageCounts[v] > 0 || v === selectedUsage)
        .map(([v, label]) => [v, catalog.usageCounts && v in catalog.usageCounts ? `${label} (${catalog.usageCounts[v]})` : label]);
      form.elements.usage.innerHTML = options(usageOptions, "Any grammar");

      const freqDefs = [["marked", "Common in JMdict"], ["unmarked", "Less common"]];
      const freqOptions = freqDefs
        .filter(([v]) => !catalog.frequencyCounts || catalog.frequencyCounts[v] > 0 || v === selectedFreq)
        .map(([v, label]) => [v, catalog.frequencyCounts && v in catalog.frequencyCounts ? `${label} (${catalog.frequencyCounts[v]})` : label]);
      form.elements.frequency.innerHTML = options(freqOptions, "Any frequency");

      if (catalog.counts) {
        const colDefs = [
          ["all", "All expressions"],
          ["examples", "With examples"],
          ["draft", "Curated guides"]
        ];
        const colOptions = colDefs
          .filter(([v]) => v === "all" || catalog.counts[v] > 0 || v === selectedCol)
          .map(([v, label]) => `<option value="${esc(v)}">${esc(`${label} (${catalog.counts[v]})`)}</option>`)
          .join("");
        form.elements.collection.innerHTML = colOptions;
      }
    }
    form.elements.collection.value = selectedCol;
    form.elements.scene.value = selectedScene;
    form.elements.usage.value = selectedUsage;
    form.elements.frequency.value = selectedFreq;
  }
  async function draw(moveFocus = false) {
    const request = ++generation;
    controller?.abort();
    controller = new AbortController();
    const p = state(), group = collection(p), browsing = !fields.some(key => p.has(key));
    form.elements.collection.value = group === "approved" ? "all" : group;
    for (const key of filters) form.elements[key].value = p.get(key) || "";
    resetButton.hidden = !(group !== "all" || filters.some(key => Boolean(p.get(key))));
    root.setAttribute("aria-busy", "true");
    if (!hasRendered) body.innerHTML = `<p role="status">Loading guide…</p>`;
    let catalog;
    try {
      [catalog] = await fetchItems("/api/study/guide",{...Object.fromEntries(p),collection:group},{signal:controller.signal});
    } catch (error) {
      if (error?.name === "AbortError" || request !== generation) return;
      root.setAttribute("aria-busy", "false");
      body.innerHTML = `<p role="alert">The guide couldn’t be loaded.</p><button type="button" data-retry>Try again</button>`;
      return;
    }
    if (request !== generation) return;
    hasRendered = true;
    root.setAttribute("aria-busy", "false");
    syncMeta(catalog, p);
    const record = id => catalog.cards.find(c => c.id === id);
    const back = anchor(link(p),"Back to results");
    const reset = anchor(link(new URLSearchParams(),{collection:group}),"Clear search and filters");
    let html;
    if (group === "approved") {
      html = heading("No approved senses yet") + `<p>The local collection has no reviewed guide cards. Switch to All expressions or Curated guides to browse available entries.</p>`;
    } else if (!browsing) {
      const sense = record(p.get("sense")), ids = (p.get("compare") || "").split(",");
      const pair = ids.map(record), e = catalog.dictionary.find(d => d.entry === p.get("entry"));
      html = `<p>${back}</p>`;
      if (sense) {
        html += heading("Sense detail") + card(sense,p) + `<label class="pg-pair">Compare with<select id="guideCompareWith" aria-label="Compare with" data-compare-first="${esc(sense.id)}">${options(catalog.choices.map(c => [c.id,c.scene ? `${c.form} · ${c.scene}` : c.form]),"Choose another sense")}</select></label>`;
      } else if (ids.length === 2 && ids[0] !== ids[1] && pair.every(Boolean)) {
        const contrast = catalog.contrasts.find(n => ids.every(id => n.ids.includes(id)));
        html += heading("Compare senses") + `<p class="pg-note">${esc(contrast?.note ?? "There is no draft contrast note for this pair. Compare the two uses and examples below.")}</p>
          <div class="pg-parallel">${pair.map(c => card(c,p)).join("")}</div>`;
      } else if (e) {
        html += heading(`Dictionary entry · ${esc(e.entry)}`) + `<p class="pg-headword">${japaneseHTML(e.form,e.reading)}</p>
          <p>Entry forms: <span lang="ja">${e.forms.map(esc).join("、")}</span></p><ol class="pg-dictionary">` +
          e.senses.map(s => `<li>${s.meanings.map(esc).join("; ")}${s.umbrellaTag ? " · Tagged on-mim" : ""}
          ${[...s.appliesToKana,...s.appliesToKanji].some(f => f !== "*") ? ` · Restricted to ${[...s.appliesToKana,...s.appliesToKanji].filter(f => f !== "*").map(esc).join("、")}` : ""}
          ${catalog.cards.filter(c => c.entry === e.entry && c.fingerprint === s.fingerprint).map(c => anchor(link(p,{sense:c.id}),"View sense")).join("")}</li>`).join("") +
          "</ol><p>The dictionary tag covers both sound and sensation. It does not decide which use applies.</p>";
      } else html += heading("Link not found") + "<p>This local edition does not contain the linked sense, entry or comparison.</p>";
    } else {
      const rows = catalog.cards;
      const total = Number.isFinite(catalog.total) ? catalog.total : rows.length;
      const pageSize = catalog.pageSize || 24;
      const start = rows.length ? (catalog.page - 1) * pageSize + 1 : 0;
      const end = start ? start + rows.length - 1 : 0;
      const totalPages = Math.max(1, Math.ceil(total / pageSize));
      const titleText = group === "draft" ? "Curated guides" : group === "examples" ? "Expressions with examples" : "Expressions";
      const statusText = rows.length
        ? `Showing ${start}–${end} of ${total}`
        : `0 results`;
      html = `<div class="pg-list-title">${heading(titleText)}<span role="status">${esc(statusText)}</span></div>`;
      if (!rows.length) html += `<p>No expression matches these filters. ${reset}.</p>`;
      else {
        const suggested = catalog.contrasts.find(n => n.ids.every(id => rows.some(c => c.id === id)));
        if (suggested) {
          const [a,b] = suggested.ids.map(record);
          html += `<aside class="pg-prompt">${anchor(link(p,{compare:suggested.ids.join(",")}),`Compare <span lang="ja">${esc(a.form)}</span> and <span lang="ja">${esc(b.form)}</span>`)}<span>${a.scene === b.scene ? esc(a.scene) : "Across scenes"}</span></aside>`;
        }
        html += `<ul class="pg-index">${rows.map(c => `<li>
          <div class="pg-row">${anchor(link(p,{sense:c.id}),`<span class="pg-word">${japaneseHTML(c.form,c.form)}</span><span>${esc(c.meaning)}</span>`)}${audioHTML(c.form)}</div>
          <span class="pg-meta">${esc(metaLine(c))}${c.common ? ` <span class="pg-badge">Common</span>` : ""}</span>
        </li>`).join("")}</ul>`;
        if (catalog.page > 1 || catalog.more) {
          html += `<nav class="pg-pagination" aria-label="Guide pages">${catalog.page > 1 ? anchor(link(p,{page:catalog.page-1}),"Previous page") : `<span class="pg-page-disabled" aria-disabled="true">Previous page</span>`}<span>Page ${catalog.page} of ${totalPages}</span>${catalog.more ? anchor(link(p,{page:catalog.page+1}),"Next page") : `<span class="pg-page-disabled" aria-disabled="true">Next page</span>`}</nav>`;
        }
      }
    }
    body.innerHTML = html + `<p class="pg-credit">Local edition ${esc(catalog.manifest.edition)}. Curated examples and notes: NihongoToolkit, unreviewed. Dictionary: ${esc(catalog.manifest.dictionary.credit)} Release ${esc(catalog.manifest.dictionary.release)}. Linked sentences: Tatoeba (CC BY 2.0 FR). <a href="./data-sources" target="_blank" rel="noopener">Source credits (new tab)</a></p>`;
    if (moveFocus) body.querySelector("h2")?.focus();
  }
  function navigate(params,replace = false,focus = true) {
    history[replace ? "replaceState" : "pushState"]({...history.state,guide:params},"",hrefFor(params));
    clearTimeout(timer);
    if (replace) { generation++; timer = setTimeout(() => draw(focus),180); } else draw(focus);
  }
  form.addEventListener("submit",e => e.preventDefault());
  resetButton.addEventListener("click",() => navigate("",false,false));
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
  window.addEventListener("hashchange",restore);
  draw();
  return () => { generation++; controller?.abort(); clearTimeout(timer); window.removeEventListener("popstate",restore); window.removeEventListener("hashchange",restore); root.remove(); };
}
