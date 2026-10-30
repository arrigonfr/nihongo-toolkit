import { bind, toHiragana } from "wanakana";
import { API_BASE } from "./api.js";
import { conjugate, filterForms, groups, typeNames, copyTable } from "./conjugation.js";
import { mountStudyControls, study, japaneseHTML, audioHTML } from "./study-controls.js";
import { romanizeKana } from "./romanize.js";
import { escape, mountSentenceExamples, wordsHTML } from "./examples.js";
import "./conjugator.css";
import { groupSettings, setSettingAvailability } from "./settings-panel.js";
import { practiceWords } from "./conjugation-practice-data.js";
import { exampleFor, familyOf, supportsExample } from "./conjugation-practice-engine.js";
import { selectedLevels } from "./jlpt-levels.js";
import { mountChips } from "./chips.js";
import { plainSelect, plainCheck, removeChipsTooltip } from "./plain-fields.js";
import { mountConjugationFilters } from "./conjugation-filters.js";
import { validFilter } from "./conjugation-filter-match.js";
import { mountGameExport } from "./game-export.js";

const $ = (id) => document.getElementById(id);
const key = "nihon:conjugator-v1";
const defaults = { politeness: "both", polarity: "both", tense: "both", groups: Object.keys(groups),
  compact: false, examples: true, kanji: true, contrast: false, fontSize: "25", level: "5", category: "all" };
const choices = {
  fontSize: ["22", "25", "30", "36"], level: ["all", "5", "4", "3", "2", "1"],
  category: ["all", "verb", "adjective"]
};
let settings = { ...defaults }, recent = [], saved = [], randomHistory = [];
let current, allForms = [], candidates = [], request = 0, timer, composing = false;
function status(message, error = false) {
  $("status").textContent = message;
  $("status").dataset.error = String(error);
}
function validSaved(item) {
  return item && typeof item.word === "string" && item.word.length > 0 && item.word.length <= 100
    && typeof item.reading === "string" && /^[ぁ-ゖー・]{1,100}$/.test(item.reading)
    && Object.hasOwn(typeNames, item.type)
    && (item.tag === undefined || typeof item.tag === "string" && item.tag.length < 20)
    && (item.manual === undefined || typeof item.manual === "boolean");
}
function cleanSaved(item) {
  return { word: item.word, reading: item.reading, type: item.type, ...(item.tag ? { tag: item.tag } : {}), manual: Boolean(item.manual) };
}
try {
  const stored = JSON.parse(localStorage.getItem(key) || "{}");
  for (const [name, value] of Object.entries(stored.settings || {})) {
    if (name === "level") { selectedLevels(value); settings.level = value; continue; }
    if (["politeness", "polarity", "tense"].includes(name) ? validFilter(name, value) : name === "category" ? /^(all|verb|adjective)$/.test(value) : choices[name]?.includes(value) || typeof defaults[name] === "boolean" && typeof value === "boolean") settings[name] = value;
  }
  if (Array.isArray(stored.settings?.groups)) settings.groups = stored.settings.groups.filter((group) => Object.hasOwn(groups, group));
  for (const name of ["recent", "saved", "randomHistory"]) if (stored[name] !== undefined && !Array.isArray(stored[name])) throw new Error("Invalid stored word list.");
  recent = (stored.recent || []).filter(validSaved).slice(0, 30).map(cleanSaved);
  saved = (stored.saved || []).filter(validSaved).slice(0, 500).map(cleanSaved);
  randomHistory = (stored.randomHistory || []).filter((word) => typeof word === "string" && word.length <= 100).slice(-80);
} catch (error) { console.warn("Could not restore conjugator preferences.", error); status("Saved settings could not be restored. Default settings are in use.", true); }
function persist() {
  try { localStorage.setItem(key, JSON.stringify({ settings, recent, saved, randomHistory })); }
  catch (error) { console.warn("Could not save conjugator data.", error); status("Your browser could not save these changes. Export saved words to keep a copy.", true); }
}
const select = (id, label, entries) => `<label for="setting-${id}">${label}<select id="setting-${id}" data-setting="${id}">${entries.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></label>`;
$("settings").innerHTML = [
  select("politeness", "Politeness", [["both", "Plain and polite"], ["plain", "Plain only"], ["polite", "Polite only"]]),
  select("polarity", "Polarity", [["both", "Affirmative and negative"], ["affirmative", "Affirmative only"], ["negative", "Negative only"]]),
  select("tense", "Tense", [["both", "Non-past and past"], ["non-past", "Non-past only"], ["past", "Past only"]]),
  plainSelect("fontSize", "Japanese font size", choices.fontSize.map((n) => [n, `${n}px`])),
  select("level", "Random word JLPT level", [["all", "All levels (including unrated)"], ...["5", "4", "3", "2", "1"].map((n) => [n, `N${n}`])]),
  select("category", "Random word category", [["all", "Verbs and adjectives"], ["verb", "Verbs"], ["adjective", "Adjectives"]]),
  plainCheck("compact", "Compact view (forms only)"), plainCheck("examples", "Show example sentences"), plainCheck("kanji", "Kanji information"), plainCheck("contrast", "High contrast")
].join("");
groupSettings($("settings"), [
  ["Form filters", ["setting-politeness", "setting-polarity", "setting-tense"]],
  ["Form groups", []],
  ["Random word selection", ["setting-level", "setting-category"]],
  ["Reading & learning support", ["field-examples", "field-kanji"]],
  ["Display & accessibility", ["field-fontSize"]]
]);
mountConjugationFilters();
mountChips($("setting-category"), {
  multiple: true, options: [{ value: "verb", label: "Verbs" }, { value: "adjective", label: "Adjectives" }], allValue: "all"
});
$("setting-category").closest(".settings-grid, .settings-section-grid")?.classList.add("level-row");
const groupsSection = [...$("settings").querySelectorAll(".settings-section")].find((section) => section.querySelector("legend").textContent === "Form groups");
const groupsGrid = groupsSection.querySelector(".settings-section-grid");
const groupsSelect = document.createElement("select");
groupsSelect.id = "list-groups"; groupsSelect.setAttribute("aria-label", "Form groups");
groupsSelect.add(new Option("none", "none"));
groupsGrid.append(groupsSelect);
const groupIds = Object.keys(groups);
mountChips(groupsSelect, {
  multiple: true, wrap: false, label: "Form groups", allValue: "all", emptyValue: "none",
  options: Object.entries(groups).map(([value, label]) => ({ value, label })),
  decode: (value) => value === "all" ? [...groupIds] : value === "none" ? [] : value.split(",").filter((item) => groupIds.includes(item)),
  encode: (list) => { const picked = groupIds.filter((item) => list.includes(item)); return !picked.length ? "none" : picked.length === groupIds.length ? "all" : picked.join(","); },
  actions: [{ label: "All", run: "all" }, { label: "Clear", run: "clear" }]
});
groupsGrid.insertAdjacentHTML("beforeend", '<p class="muted small groups-note">Connective forms without their own tense or politeness remain visible under either filter. Honorific alternatives are dictionary forms, not automatically polite sentences.</p>');
const displayGrid = [...$("settings").querySelectorAll(".settings-section")].find((section) => section.querySelector("legend").textContent === "Display & accessibility").querySelector(".settings-section-grid");
const viewOptions = document.createElement("fieldset");
viewOptions.className = "settings-section view-options";
viewOptions.innerHTML = "<legend>View options</legend>";
const viewGrid = document.createElement("div");
viewGrid.className = "settings-section-grid";
viewGrid.append($("field-compact"), $("field-contrast"));
viewOptions.append(viewGrid);
displayGrid.append(viewOptions);
$("manualType").insertAdjacentHTML("beforeend", Object.entries(typeNames).filter(([type]) => type !== "copula")
  .map(([type, name]) => `<option value="${type}">${name}</option>`).join(""));
function syncSettings() {
  for (const [name, value] of Object.entries({ ...settings, ...study })) {
    const control = $("setting-" + name);
    if (control) { if (control.type === "checkbox") control.checked = value; else { control.value = value; control.chipsApi?.sync(); } }
  }
  const groupValue = !settings.groups.length ? "none" : settings.groups.length === groupIds.length ? "all" : groupIds.filter((id) => settings.groups.includes(id)).join(",");
  if (![...groupsSelect.options].some((option) => option.value === groupValue)) groupsSelect.add(new Option(groupValue, groupValue));
  groupsSelect.value = groupValue; groupsSelect.chipsApi.sync();
  for (const name of ["politeness", "polarity", "tense"]) {
    setSettingAvailability($("setting-" + name), settings.groups.length ? "" : "Select a form group to filter its forms.");
  }
  setSettingAvailability($("setting-kanji"), current && !current.kanjiDetails?.length ? "This word has no kanji information." : "");
  document.documentElement.dataset.contrast = String(settings.contrast);
  document.documentElement.style.setProperty("--jp-size", settings.fontSize + "px");
}
mountStudyControls({ onChange: () => { syncSettings(); renderResult(); } });
for (const id of ["setting-level", "setting-category", "setting-politeness", "setting-polarity", "setting-tense"]) removeChipsTooltip($(id));
$("setting-level").closest(".chips-field")?.insertAdjacentHTML("beforeend", '<p class="level-note small muted">Levels are estimates; Non-JLPT means unrated.</p>');
syncSettings();
$("settings").addEventListener("change", (event) => {
  const name = event.target.dataset.setting;
  if (!name) return;
  const value = event.target.type === "checkbox" ? event.target.checked : event.target.value;
  settings[name] = value; syncSettings(); renderResult(); persist();
});
groupsSelect.addEventListener("change", () => {
  settings.groups = groupsSelect.chipsApi.current();
  syncSettings(); renderResult(); persist();
});
function japanese(word, reading, { compact = false } = {}) {
  if (compact) return `<span lang="ja">${escape(word)}</span>`;
  return japaneseHTML(word, reading) + `<span lang="ja" class="kana-reading">${escape(reading)}</span>`;
}
function markEndings(rows) {
  const base = current.word;
  for (const row of rows) {
    const cell = document.querySelector(`tr[data-form="${row.id}"] .conjugated`);
    if (!cell) continue;
    const form = row.word;
    let keep = 0;
    while (keep < base.length && keep < form.length && base[keep] === form[keep]) keep++;
    if (keep >= form.length) continue;
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    const nodes = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (!node.parentElement.closest("rt, rp, .study-romaji, .kana-reading")) nodes.push(node);
    }
    let seen = 0;
    for (const node of nodes) {
      const length = node.data.length, start = Math.max(keep - seen, 0);
      seen += length;
      if (start >= length) continue;
      const tail = node.splitText(start), mark = document.createElement("span");
      mark.className = "ending";
      tail.replaceWith(mark); mark.append(tail);
    }
  }
}
function visibleRows() { return filterForms(allForms, settings); }
function renderResult() {
  if (!current) return;
  $("result").hidden = false; $("emptyState").hidden = true;
  $("baseWord").innerHTML = japanese(current.word, current.reading) + audioHTML(current.reading);
  $("wordSummary").textContent = `${current.meanings?.join("; ") || "Meaning unknown"} · ${typeNames[current.type]} · ${current.level ? `N${current.level} (estimated)` : "JLPT unknown"}${current.manual ? " · User-confirmed classification" : ""}`;
  $("saveWord").textContent = saved.some((item) => sameWord(item, current)) ? "Word saved" : "Save word";
  const rows = visibleRows();
  $("formCount").textContent = `Showing ${rows.length} of ${allForms.length} forms`;
  $("tables").classList.toggle("compact", settings.compact);
  $("tables").innerHTML = rows.length ? Object.entries(groups).map(([id, name]) => {
    const selected = rows.filter((row) => row.group === id);
    if (!selected.length) return "";
    return `<section class="panel table-panel"><h3>${name}</h3><div class="table-wrap"><table>
      <caption class="sr-only">${escape(current.word)}: ${name}</caption><thead><tr><th scope="col">Form</th><th scope="col">Conjugation</th>${settings.compact ? "" : '<th scope="col">Meaning & usage</th>'}</tr></thead><tbody>
      ${selected.map((row) => `<tr data-form="${row.id}">
        <th scope="row">${row.label}<span class="register">${row.politeness === "neutral" ? "Shared / connective" : row.politeness}</span></th>
        <td><span class="conjugated">${japanese(row.word, row.reading, { compact: settings.compact })}</span>
          <div class="form-tools"><button type="button" data-copy="${row.id}" aria-label="Copy ${row.label} ${row.politeness}">Copy</button>${audioHTML(row.reading)}</div></td>
        ${settings.compact ? "" : `<td>${escape(row.gloss)}<details class="form-note"><summary>Rule & usage</summary><p>${escape(row.note)}</p>${settings.examples ? `<button type="button" data-example="${row.id}">Find sentence with this form</button><div class="form-examples"></div>` : ""}</details></td>`}
      </tr>`).join("")}</tbody></table></div></section>`;
  }).join("") : '<div class="panel">No forms match these filters. Enable a form group or broaden the filters.</div>';
  $("copyTable").disabled = !rows.length;
  $("exportConjugations").disabled = !rows.length;
  markEndings(rows);
  renderInformation();
}
function renderInformation() {
  const word = current;
  $("wordInfoContent").innerHTML = `<p><strong>Reading:</strong> <span lang="ja">${escape(word.reading)}</span></p>
    <p><strong>Meanings:</strong> ${escape(word.meanings?.join("; ") || "Unknown for this user-confirmed word.")}</p>
    <p><strong>Pattern:</strong> ${escape(typeNames[word.type])}. ${word.intransitive ? "Intransitive; passive forms can describe an affected person." : ""}</p>
    ${word.tag === "v5r-i" || ["ある", "有る", "在る"].includes(word.word) ? "<p>Existential ある has no ordinary productive ability/passive/causative paradigm; those rows are omitted. あり得る means “can exist / be possible,” not a regular ability conjugation.</p>" : ""}
    ${["できる", "出来る", "出きる", "出來る"].includes(word.word) ? "<p>できる already expresses ability or coming into existence; an additional potential ending is not shown.</p>" : ""}
    ${word.notes?.length ? `<p>${escape(word.notes.join(" "))}</p>` : ""}
    <p><strong>Related words / collocations:</strong> ${word.related?.length ? word.related.map(escape).join(" · ") : "None provided for this entry."}</p>
    ${settings.examples ? '<h3>Base-word examples</h3><p class="muted">Dictionary examples may contain inflected forms. Availability varies.</p><div id="baseExamples"></div>' : ""}
    ${settings.kanji ? `<h3>Kanji · tap or open a character</h3><div class="kanji-list">${word.kanjiDetails?.length ? word.kanjiDetails.map((kanji) => `<details class="kanji-card"><summary lang="ja">${escape(kanji.kanji)}</summary>
      <p>${kanji.meanings.map(escape).join("; ")}</p><p>On’yomi: ${kanji.on_readings.map(escape).join("・") || "Not listed"}</p><p>Kun’yomi: ${kanji.kun_readings.map(escape).join("・") || "Not listed"}</p>${wordsHTML(kanji.examples || [])}</details>`).join("") : '<p class="muted">No kanji information available for this entry.</p>'}</div>` : ""}`;
  if (settings.examples && $("wordInfo").open) mountBaseExamples();
}
function mountBaseExamples() {
  const target = $("baseExamples");
  if (target && !target.hasChildNodes()) mountSentenceExamples(target, current.word, current.examples || []);
}
$("wordInfo").addEventListener("toggle", () => { if ($("wordInfo").open && current && settings.examples) mountBaseExamples(); });
function sameWord(a, b) { return a.word === b.word && a.reading === b.reading && a.type === b.type; }
function showEntry(entry) {
  const normalized = { ...entry, reading: toHiragana(entry.reading), meanings: entry.meanings || [] };
  try {
    const forms = conjugate(normalized);
    current = normalized; allForms = forms; request++;
    $("wordInput").value = normalized.word; $("suggestions").replaceChildren(); $("manualPanel").hidden = true;
    recent = [cleanSaved(current), ...recent.filter((item) => !sameWord(item, current))].slice(0, 30);
    status(`${current.word}: ${forms.length} forms. Readings and usage notes are available in detailed view.`);
    syncSettings(); renderResult(); renderLists(); persist();
  } catch (error) { status(error.message, true); manualEntry(entry.word, entry.reading); }
}
async function load(params) {
  const query = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (Array.isArray(value)) for (const item of value) query.append(name, item);
    else query.set(name, value);
  }
  const response = await fetch(`${API_BASE}/api/conjugator?${query}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error("Word lookup is unavailable right now. Please retry, or confirm the reading and word type yourself.");
  const payload = await response.json();
  if (!Array.isArray(payload.items)) throw new Error("The dictionary returned an unreadable response. Please retry.");
  return payload.items;
}
const auxiliaries = {
  "だ": { word: "だ", reading: "だ", type: "copula", meanings: ["be (plain copula)"], notes: ["Attach the copula to a noun or na-adjective. This table shows the auxiliary alone."] },
  "です": { word: "です", reading: "です", type: "copula", meanings: ["be (polite copula)"], notes: ["The paired plain forms use だ. After i-adjectives, polite です does not replace the adjective's own inflections."] },
  "ない": { word: "ない", reading: "ない", type: "i-adjective", meanings: ["not exist; absent"], notes: ["As a negative auxiliary, attach ない to the appropriate verb stem; do not append it to a dictionary form."] },
  "たい": { word: "たい", reading: "たい", type: "i-adjective", meanings: ["want to (auxiliary)"], notes: ["Attach たい to a verb's ます-stem, e.g. 食べたい. It inflects like an i-adjective."] }
};
function manualEntry(word, reading = "") {
  $("manualPanel").hidden = false;
  $("manualWord").value = word;
  $("manualReading").value = reading || (/^[ぁ-ゖー]+$/.test(word) ? word : "");
  $("manualType").value = "";
}
async function lookup(value, { suggest = false, preferred } = {}) {
  const query = toHiragana(value.trim());
  if (!query || query.length > 100) { if (!suggest) status("Enter a dictionary-form verb or adjective (1–100 characters).", true); return; }
  const token = ++request;
  if (!suggest) { $("wordInput").value = query; status("Looking up word types and readings…"); }
  try {
    const items = await load({ q: query });
    if (token !== request) return;
    if (auxiliaries[query]) items.unshift(auxiliaries[query]);
    const seen = new Set();
    candidates = items.filter((item) => {
      const id = `${item.word}|${toHiragana(item.reading)}|${item.type}|${item.tag || ""}`;
      if (seen.has(id)) return false;
      seen.add(id); return true;
    });
    const exact = candidates.filter((entry) => entry.word === query || toHiragana(entry.reading) === query);
    const remembered = preferred && exact.find((entry) => sameWord(entry, preferred) && entry.tag === preferred.tag);
    if (!suggest && (remembered || exact.length === 1)) { showEntry(remembered || exact[0]); return; }
    $("suggestions").innerHTML = candidates.map((entry, index) => `<button type="button" class="suggestion" data-candidate="${index}">
      <strong lang="ja">${escape(entry.word)} <small>${escape(entry.reading)}</small></strong><small>${escape(typeNames[entry.type])} · ${escape(entry.meanings.slice(0, 3).join("; "))}</small></button>`).join("");
    if (!suggest) {
      status(exact.length > 1 ? "This spelling has several interpretations. Choose the meaning and word type before conjugating."
        : candidates.length ? "No exact conjugatable match. Choose a suggested dictionary form, or confirm the type below."
          : "No supported verb or adjective found. Check the spelling or dictionary form (e.g. 食べる, not 食べました). Nouns and particles do not conjugate on their own.");
      manualEntry(query);
    }
  } catch (error) {
    if (token !== request) return;
    status(error.message, true);
    if (auxiliaries[query] && !suggest) showEntry(auxiliaries[query]);
    else if (!suggest) manualEntry(query);
  }
}
bind($("wordInput"), { IMEMode: true });
$("wordInput").addEventListener("compositionstart", () => { composing = true; clearTimeout(timer); request++; });
$("wordInput").addEventListener("compositionend", () => { composing = false; scheduleSuggestions(); });
function scheduleSuggestions() {
  clearTimeout(timer); request++;
  $("suggestions").replaceChildren();
  if (composing || !$("wordInput").value.trim()) return;
  timer = setTimeout(() => lookup($("wordInput").value, { suggest: true }), 250);
}
$("wordInput").addEventListener("input", scheduleSuggestions);
$("searchForm").addEventListener("submit", (event) => {
  event.preventDefault(); if (composing) return; clearTimeout(timer); lookup($("wordInput").value);
});
$("suggestions").addEventListener("click", (event) => {
  const button = event.target.closest("[data-candidate]");
  if (button) { clearTimeout(timer); showEntry(candidates[Number(button.dataset.candidate)]); }
});
$("manualForm").addEventListener("submit", (event) => {
  event.preventDefault();
  showEntry({ word: $("manualWord").value.trim(), reading: toHiragana($("manualReading").value.trim()),
    type: $("manualType").value, manual: true, meanings: [], level: null });
});
$("randomButton").addEventListener("click", async () => {
  clearTimeout(timer);
  const token = ++request;
  $("randomButton").disabled = true; status("Finding a new word…");
  try {
    const items = await load({ random: "true", level: settings.level, category: settings.category, exclude: [...new Set([...randomHistory, ...(current ? [current.reading] : [])])].slice(-80) });
    if (token !== request) return;
    if (!items.length) throw new Error("No conjugatable words match this level and category. Broaden the random-word filters.");
    randomHistory = [...randomHistory, items[0].reading].slice(-80);
    showEntry(items[0]);
  } catch (error) { if (token === request) status(error.message, true); }
  finally { $("randomButton").disabled = false; }
});
function renderLists() {
  $("history").innerHTML = recent.length ? recent.map((entry, i) => `<button type="button" data-recent="${i}" lang="ja">${escape(entry.word)}</button>`).join("") : '<p class="muted">Your recent words will appear here.</p>';
  $("savedWords").innerHTML = saved.length ? saved.map((entry, i) => `<span class="saved-item"><button type="button" data-saved="${i}" lang="ja">${escape(entry.word)}</button><button type="button" data-remove="${i}" aria-label="Remove ${escape(entry.word)} from saved words">×</button></span>`).join("") : '<p class="muted">Save words to revisit them, or import a previously exported list.</p>';
}
document.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.query) { clearTimeout(timer); lookup(button.dataset.query); }
  if (button.dataset.recent !== undefined || button.dataset.saved !== undefined) {
    clearTimeout(timer);
    const entry = button.dataset.recent !== undefined ? recent[Number(button.dataset.recent)] : saved[Number(button.dataset.saved)];
    if (entry.manual) showEntry(entry); else lookup(entry.word, { preferred: entry });
  }
  if (button.dataset.remove !== undefined) { saved.splice(Number(button.dataset.remove), 1); renderLists(); renderResult(); persist(); }
});
$("clearHistory").addEventListener("click", () => { recent = []; renderLists(); persist(); });
$("saveWord").addEventListener("click", () => {
  if (!current || saved.some((item) => sameWord(item, current))) return;
  if (saved.length >= 500) { status("Saved list is full (500 words). Export or remove some words first.", true); return; }
  saved.push(cleanSaved(current)); renderLists(); renderResult(); persist();
});
async function copy(text) {
  try { await navigator.clipboard.writeText(text); status("Copied to clipboard."); }
  catch (error) { console.warn("Clipboard copy failed.", error); status("Copy was blocked by the browser. Select the table text and copy manually.", true); }
}
$("copyTable").addEventListener("click", () => copy(copyTable(visibleRows(), { ...settings, romaji: study.romaji }, romanizeKana)));
mountGameExport($("exportConjugations").parentElement, () => {
  const rows = visibleRows();
  if (!current || !rows.length) return null;
  const grouped = new Map();
  for (const row of rows) {
    let key = row.id;
    if (/^(desire-)?negative-(plain|polite)$/.test(key)) key = key.replace(/negative-(plain|polite)$/, "present-$1");
    else if (/^(desire-)?pastNegative-(plain|polite)$/.test(key)) key = key.replace(/pastNegative-(plain|polite)$/, "past-$1");
    else if (/(?:-plain|-polite)$/.test(key)) key = key.replace(/-negative(?=-(?:plain|polite)$)/, "");
    if (!grouped.has(key)) grouped.set(key, {});
    grouped.get(key)[row.polarity] = row;
  }
  const table = [...grouped.values()].map(({ affirmative, negative }) => {
    const row = affirmative || negative;
    const value = (form) => form ? `${form.word}${form.reading !== form.word ? ` (${form.reading})` : ""}\n${form.gloss}` : "";
    return { label: `${row.label.replace(/\s*(?:affirmative|negative)/gi, "").replace(/\s*·\s*$/, "")} · ${row.politeness}`, affirmative: value(affirmative), negative: value(negative) };
  });
  return { title: `${current.word} · Conjugations`, filename: `${current.word}-conjugations`, table };
}, { button: $("exportConjugations"), label: "Export conjugations", answers: false });
$("tables").addEventListener("click", (event) => {
  const button = event.target.closest("[data-copy], [data-example]");
  if (!button) return;
  const row = allForms.find((form) => form.id === (button.dataset.copy || button.dataset.example));
  if (button.dataset.copy) copy(settings.script === "kana" ? row.reading : row.word);
  else {
    const target = button.nextElementSibling;
    button.hidden = true;
    const entry = practiceWords.find((word) => word.word === current.word && word.reading === current.reading && word.type === current.type);
    const family = familyOf(row);
    if (!entry || !supportsExample(entry, family)) {
      target.textContent = "No verified example for this exact form is available. Base-word examples are available in Word information, but may use other forms.";
      return;
    }
    const example = exampleFor({ entry, row, family });
    target.innerHTML = `<p lang="ja">${escape(example.before)}${japaneseHTML(row.word, row.reading)}${escape(example.after)} ${audioHTML(example.japanese)}</p><p>${escape(example.english)}</p><p class="small muted">Original teaching example · ${escape(row.politeness)} · ${escape(row.polarity)} · ${escape(row.tense)}</p>`;
  }
});
$("exportWords").addEventListener("click", () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify({ version: 1, words: saved }, null, 2)], { type: "application/json" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = "nihon-saved-words.json";
  document.body.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
});
$("importWords").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    if (file.size > 250000) throw new Error("Import file is too large. Use a saved-word export under 250 KB.");
    const data = JSON.parse(await file.text());
    if (data.version !== 1 || !Array.isArray(data.words) || data.words.length > 500 || !data.words.every(validSaved)) throw new Error("Invalid saved-word file. Use a version 1 Nihon export with at most 500 words.");
    const combined = [...saved];
    for (const item of data.words) {
      conjugate(item);
      if (!combined.some((entry) => sameWord(item, entry))) combined.push(cleanSaved(item));
    }
    if (combined.length > 500) throw new Error("Import would exceed 500 saved words. Remove some words first.");
    saved = combined; renderLists(); renderResult(); status("Saved words imported."); persist();
  } catch (error) { status(`Import failed: ${error.message}`, true); }
  finally { event.target.value = ""; }
});
renderLists();
