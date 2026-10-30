import { API_BASE } from "./api.js";
import { rememberControls } from "./settings-storage.js";
import { sentencesHTML, loadSentences } from "./examples.js";
import { mountStudyControls, japaneseHTML, audioHTML, readingsHTML } from "./study-controls.js";
import { toHiragana } from "wanakana";
(() => {
  "use strict";
  const WORDS_API = `${API_BASE}/api/words?keyword=`;
  const KANJI_API = `${API_BASE}/api/kanji/`;
  const HISTORY_KEY = "kotoba-history-v1";
  const CACHE_KEY = `kotoba-sqlite-cache-v10:${API_BASE}`;
  const COMPOUND_OPTIONS_KEY = "kotoba-compound-options-v1";
  const DEBOUNCE_MS = 350;
  const MAX_HISTORY = 20;
  const $ = (selector) => document.querySelector(selector);
  const input = $("#query"), results = $("#results"), searchButton = $("#searchButton");
  const resultLabel = $("#resultLabel"), kanjiMode = $("#kanjiMode");
  let debounceTimer, activeController, activeSearchKey, requestNumber = 0, selectedIndex = -1;

  function readStorage(key, fallback) {
    try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
    catch (error) { console.warn("Could not read local storage:", error); return fallback; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (error) { console.warn("Could not save local data:", error); }
  }
  let cache = readStorage(CACHE_KEY, {});
  const savedCompoundOptions = readStorage(COMPOUND_OPTIONS_KEY, {});
  let showMeaning = savedCompoundOptions?.meaning !== false;
  mountStudyControls();
  const searchSettings = rememberControls("nihon:kotoba-settings-v1", ["kanjiMode"],
    (message) => showMessage("Settings could not be saved or restored", message, true));
  if (!cache || typeof cache !== "object" || Array.isArray(cache)) cache = {};
  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]));
  }
  function renderHistory() {
    const history = readStorage(HISTORY_KEY, []);
    const list = $("#historyList");
    if (!Array.isArray(history) || !history.length) {
      list.innerHTML = '<span class="history-empty">Your recent lookups will appear here.</span>';
      return;
    }
    list.innerHTML = history.map((item, index) => `<button class="history-item" type="button" data-history-index="${index}" title="${escapeHTML(item.query)}"><span class="history-query">${escapeHTML(item.query)}</span>${item.kanji ? '<span class="history-mode">KANJI</span>' : ""}</button>`).join("");
  }
  function saveHistory(query, isKanji) {
    let history = readStorage(HISTORY_KEY, []);
    if (!Array.isArray(history)) history = [];
    history = history.filter((item) => !(item.query === query && item.kanji === isKanji));
    history.unshift({ query, kanji: isKanji, time: Date.now() });
    writeStorage(HISTORY_KEY, history.slice(0, MAX_HISTORY));
    renderHistory();
  }
  function setIdle() { results.setAttribute("aria-busy", "false"); searchButton.disabled = false; }
  function setLoading(message) {
    results.setAttribute("aria-busy", "true");
    results.innerHTML = `<div class="loading"><span class="spinner" aria-hidden="true"></span>${escapeHTML(message)}</div>`;
    searchButton.disabled = true;
  }
  function showMessage(title, message, isError = false) {
    setIdle();
    resultLabel.textContent = "";
    results.innerHTML = `<div class="empty-state${isError ? " error-state" : ""}"><div class="empty-symbol" aria-hidden="true">${isError ? "!" : "辞"}</div><strong>${escapeHTML(title)}</strong><p>${escapeHTML(message)}</p></div>`;
  }
  function cacheRead(key) {
    const item = cache[key];
    if (!item || Date.now() - item.savedAt > 30 * 24 * 60 * 60 * 1000) return null;
    return item.value;
  }
  function cacheWrite(key, value) {
    cache[key] = { savedAt: Date.now(), value };
    cache = Object.fromEntries(Object.entries(cache).sort((a,b) => b[1].savedAt - a[1].savedAt).slice(0,40));
    writeStorage(CACHE_KEY, cache);
  }
  async function fetchJSON(url, signal) {
    const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!response.ok) {
      const detail = response.status === 400 ? await response.json() : null;
      const error = new Error(response.status === 404
        ? "We couldn’t find that character in our dictionary."
        : detail?.error || "We couldn’t reach the dictionary right now. Please try again in a moment.");
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  function formatPos(tags) {
    return [...new Set((tags || []).filter((tag) => tag && !/^(Usually written using|Expressions \(phrases|Wikipedia definition|Other forms)$/.test(tag)))];
  }
  function audioURL(item) {
    for (const value of [item.audio_url,item.audio,item.audio_file,item.pronunciation?.audio]) {
      if (typeof value !== "string") continue;
      try { const url = new URL(value, "https://jisho.org"); if (url.protocol === "https:" || url.protocol === "http:") return url.href; } catch {}
    }
    return "";
  }
  function matchingExamples(sentenceData, item) {
    if (item.examples?.length) return item.examples;
    if (!Array.isArray(sentenceData)) return [];
    const terms = (item.japanese || []).map((entry) => entry.word || entry.reading).filter(Boolean);
    return sentenceData.filter((sentence) => terms.some((term) => (sentence.text || "").includes(term))).slice(0,2)
      .map((item) => {
        const translation = item.translations?.find((entry) => entry.lang === "eng");
        return { id: item.id, japanese: item.text, furigana: item.furigana, english: translation?.text ?? "",
          owner: item.owner, translationOwner: translation?.owner, translationId: translation?.id, license: item.license };
      });
  }
  function missingExamples(term) {
    return `<div class="example-empty" data-sentence-term="${escapeHTML(term)}" aria-live="polite">Looking for example sentences…</div>`;
  }
  async function fillMissingExamples(token, signal) {
    const pending = [...results.querySelectorAll("[data-sentence-term]")];
    const requests = new Map();
    async function worker() {
      while (pending.length && token === requestNumber && !signal.aborted) {
        const element = pending.shift();
        const term = element.dataset.sentenceTerm;
        try {
          const key = `live-examples:${term}`;
          if (!requests.has(term)) requests.set(term, Promise.resolve(cacheRead(key) || loadSentences(term, signal)));
          const examples = await requests.get(term);
          if (token !== requestNumber || !element.isConnected) return;
          if (examples.length) cacheWrite(key, examples);
          element.innerHTML = sentencesHTML(examples, term);
        } catch (error) {
          if (signal.aborted || token !== requestNumber) return;
          console.warn("Example sentence lookup failed:", error);
          element.innerHTML = sentencesHTML([], term);
          element.querySelector(".sentence-status").textContent = "Example sentences could not be loaded. Try again.";
        }
      }
    }
    await Promise.all([worker(), worker()]);
  }
  function renderWordResults(items, sentenceData, query, fromCache = false) {
    if (!items.length) {
      resultLabel.textContent = `No results for “${query}”`;
      showMessage("No matches found", "Try another Japanese spelling, kana, or romaji.");
      return;
    }
    resultLabel.textContent = `${items.length} ${items.length === 1 ? "match" : "matches"}${fromCache ? " · cached for offline use" : ""}`;
    results.innerHTML = items.map((item,index) => {
      const forms = item.japanese || [];
      const word = forms.find((form) => form.word)?.word || forms[0]?.reading || item.slug || "";
      const readings = [...new Set(forms.map((form) => form.reading).filter((reading) => reading && reading !== word))];
      const parts = formatPos((item.senses || []).flatMap((sense) => sense.parts_of_speech || []));
      const meanings = [...new Set((item.senses || []).flatMap((sense) => sense.english_definitions || []))].slice(0,8);
      const jlpt = (item.jlpt || []).filter(Boolean).map((level) => String(level).toUpperCase());
      const examples = matchingExamples(sentenceData,item), audio = audioURL(item);
      return `<article class="result-card" data-result-index="${index}" style="animation-delay:${Math.min(index*35,210)}ms">
        <div class="entry-head"><div><button class="word-button" type="button" data-search-word="${escapeHTML(word)}" aria-label="Search ${escapeHTML(word)}">${japaneseHTML(word, readings[0] || word)}</button>${audioHTML(readings[0] || word)}</div>
        ${audio ? `<button class="audio-button" type="button" data-audio="${escapeHTML(audio)}" aria-label="Play pronunciation"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4v16l14-8Z"/></svg></button>` : item.is_common ? '<span class="common-badge">COMMON</span>' : ""}</div>
        <div class="tags">${parts.map((part) => `<span class="tag">${escapeHTML(part)}</span>`).join("")}${jlpt.map((level) => `<span class="tag jlpt">${escapeHTML(level)}</span>`).join("")}</div>
        ${meanings.length ? `<ol class="meanings">${meanings.map((meaning) => `<li>${escapeHTML(meaning)}</li>`).join("")}</ol>` : '<p class="example-empty">No English definitions provided.</p>'}
        <div class="examples"><h3 class="section-label">Example sentences</h3>${examples.length ? sentencesHTML(examples, word) : missingExamples(word)}</div>
      </article>`;
    }).join("");
    setIdle();
  }
  function pickKanji(query) { return [...query].find((char) => /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(char)); }
  function radicalHTML(data) {
    const entries = (data.radicals || []).map(({ type, value, character, name, meaning }) => {
      const glyph = character || (Number.isInteger(value) && value >= 1 && value <= 214
        ? String.fromCodePoint(0x2f00 + value - 1).normalize("NFKC") : "");
      const system = type === "classical" ? `Radical #${value}` : type === "nelson_c" ? `Nelson #${value}` : `${type} #${value}`;
      const details = [name, meaning, system].filter(Boolean).map(escapeHTML).join(" · ");
      return `<span class="reading-chip">${glyph ? `<strong lang="ja">${escapeHTML(glyph)}</strong>` : ""}${glyph && details ? " · " : ""}${details}</span>`;
    });
    return entries.join("") || '<span class="example-empty">No radical classification listed.</span>';
  }
  function componentsHTML(data) {
    const radicalChars = new Set((data.radicals || []).map((item) => item.character).filter(Boolean));
    const list = (data.components || []).filter((item) => item?.character);
    if (!list.length) return "";
    const chips = list.map(({ character, original, name, meaning }) => {
      const label = [original ? `from ${original}` : "", name && !radicalChars.has(character) ? name : "", meaning]
        .filter(Boolean).map(escapeHTML).join(" · ");
      return `<button class="reading-chip component-chip" type="button" data-search-kanji="${escapeHTML(character)}" title="Inspect ${escapeHTML(character)} in Kanji mode"><strong lang="ja">${escapeHTML(character)}</strong>${label ? ` · ${label}` : ""}</button>`;
    }).join("");
    return `<section class="kanji-section" id="kanjiComponents"><h3 class="section-label">Components (構成要素)</h3><div class="reading-list">${chips}</div><p class="example-empty">All visual building blocks that make up this character (click a component to inspect it).</p></section>`;
  }
  async function searchKanji(query, token, signal) {
    const character = pickKanji(query);
    if (!character) {
      resultLabel.textContent = "Kanji mode";
      showMessage("No kanji found in your search", "Enter a word or phrase containing a kanji character, or turn off Kanji mode to search in kana or romaji.");
      return;
    }
    const key = `kanji:${character}`;
    let data = cacheRead(key);
    if (!data) { data = await fetchJSON(KANJI_API + encodeURIComponent(character),signal); cacheWrite(key,data); }
    if (token !== requestNumber) return;
    resultLabel.textContent = `Kanji: ${character}${cacheRead(key) ? " · saved locally" : ""}`;
    let compounds = cacheRead(`compounds:${character}`);
    if (!compounds) {
      const response = await fetchJSON(KANJI_API + encodeURIComponent(character) + "/words",signal);
      compounds = response.items || [];
      cacheWrite(`compounds:${character}`,compounds);
    }
    if (token !== requestNumber) return;
    const words = compounds.filter((item) => (item.japanese || []).some((form) => form.word?.includes(character)));
    const examples = words.map((item) => {
      const forms = [...new Map((item.japanese || []).filter((form) => form.word?.includes(character))
        .map((form) => [`${form.word}\0${form.reading}`, form])).values()];
      const meanings = [...new Set((item.senses || []).flatMap((sense) => sense.english_definitions || []))];
      const sentences = (item.examples || []).filter((example) => example.japanese && example.english
        && forms.some((form) => example.japanese.includes(form.word)));
      return `<li><div class="compound-forms">${forms.map((form) =>
        `<button class="history-item compound-variant" type="button" data-search-word="${escapeHTML(form.word)}">
          ${japaneseHTML(form.word, form.reading)}
        </button>${audioHTML(form.reading || form.word)}`).join("")}</div>
        <div class="compound-meaning"${showMeaning ? "" : " hidden"}>${meanings.slice(0, 3).map(escapeHTML).join("; ")}</div>
        <div class="compound-examples"><h4 class="section-label">Example sentences</h4>
          ${sentences.length ? sentencesHTML(sentences, forms[0].word) : missingExamples(forms[0].word)}
        </div></li>`;
    }).join("");
    results.innerHTML = `<article class="kanji-card">
      <div class="kanji-title"><div class="kanji-glyph" lang="ja">${escapeHTML(character)}</div><div class="kanji-meta">Stroke count: ${Number.isFinite(data.stroke_count) ? escapeHTML(data.stroke_count) : "—"}<br>JLPT: ${data.jlpt ? `N${escapeHTML(data.jlpt)}` : "Not listed"}${data.grade ? `<br>Grade: ${escapeHTML(data.grade)}` : ""}</div></div>
      <section class="kanji-section"><h3 class="section-label">Meanings</h3><div>${(data.meanings || []).length ? data.meanings.map(escapeHTML).join(" · ") : "No meanings listed."}</div></section>
      <section class="kanji-section"><h3 class="section-label">On readings</h3><div class="reading-list">${(data.on_readings || []).length ? readingsHTML(data.on_readings) : '<span class="example-empty">None listed</span>'}</div></section>
      <section class="kanji-section"><h3 class="section-label">Kun readings</h3><div class="reading-list">${(data.kun_readings || []).length ? readingsHTML(data.kun_readings) : '<span class="example-empty">None listed</span>'}</div></section>
      ${(data.nanori || []).length ? `<section class="kanji-section"><h3 class="section-label">Name readings (nanori)</h3><div class="reading-list">${readingsHTML(data.nanori)}</div></section>` : ""}
      <section class="kanji-section" id="kanjiRadicals"><h3 class="section-label">Dictionary radical (部首)</h3><div class="reading-list">${radicalHTML(data)}</div>${data.radical_names?.length ? `<p class="example-empty">Radical readings: ${data.radical_names.map(escapeHTML).join(" · ")}</p>` : ""}<p class="example-empty">Each kanji has 1 primary dictionary radical (from the classic 214-radical index, plus Nelson’s look-up radical when different) used to classify it in Japanese dictionaries.</p></section>
      ${componentsHTML(data)}
      <section class="kanji-section"><h3 class="section-label">Example compounds</h3>
        <div class="compound-options">
          <label><input id="compoundMeaning" type="checkbox"${showMeaning ? " checked" : ""}> Meaning</label>
        </div>
        <p class="example-empty">Examples favor varied readings where available. Some readings may have no example; whole-word readings are not an exact per-kanji pronunciation guide.</p>
        ${examples ? `<ul class="compound-list" id="compoundList">${examples}</ul>` : '<p class="example-empty">No compounds found.</p>'}
      </section>
    </article>`;
    setIdle();
    await fillMissingExamples(token, signal);
  }
  async function search(requestedQuery = null, requestedMode = null) {
    clearTimeout(debounceTimer);
    const query = toHiragana((requestedQuery ?? input.value).trim());
    const isKanji = requestedMode ?? kanjiMode.checked;
    const searchKey = `${isKanji}:${query}`;
    if (activeSearchKey === searchKey) return;
    activeController?.abort();
    activeSearchKey = null;
    const token = ++requestNumber;
    if (!query) {
      resultLabel.textContent = "Ready when you are";
      showMessage("Your next discovery starts here","Search a word, paste a sentence, or switch on Kanji mode to explore a character.");
      return;
    }
    input.value = query;
    if (!isKanji && query.length > 100) {
      showMessage("Search is too long", "Use up to 100 characters. Shorten your search to a word or phrase; use Fumitoki to analyze longer Japanese text.", true);
      return;
    }
    if (/[a-z]/i.test(query)) {
      showMessage("Finish your romaji", "Enter a complete Japanese spelling in kana, kanji, or romaji.");
      setIdle();
      return;
    }
    const controller = new AbortController(); activeController = controller; activeSearchKey = searchKey;
    saveHistory(query,isKanji); setLoading(isKanji ? "Looking up kanji…" : "Searching the dictionary…");
    resultLabel.textContent = "Searching…";
    try {
      if (isKanji) { await searchKanji(query,token,controller.signal); return; }
      const key = `words:${query}`;
      const cached = cacheRead(key);
      let words;
      if (cached) words = cached;
      else {
        const response = await fetchJSON(WORDS_API + encodeURIComponent(query),controller.signal);
        words = response.data || []; cacheWrite(key,words);
      }
      if (token !== requestNumber) return;
      renderWordResults(words, [], query, Boolean(cached));
      await fillMissingExamples(token, controller.signal);
    } catch (error) {
      if (error.name === "AbortError" || token !== requestNumber) return;
      console.error("Search failed:",error);
      const cached = isKanji ? cacheRead(`kanji:${pickKanji(query)}`) : cacheRead(`words:${query}`);
      if (cached && !isKanji) {
        renderWordResults(cached,cacheRead(`sentences:${query}`) || [],query,true);
        resultLabel.textContent += " · offline mode";
      } else {
        showMessage(
          error.status === 400 ? "Check your search" : error.status === 404 ? "Character not found" : "Couldn’t complete your search",
          error.status === 404
            ? "We couldn’t find details for that kanji. Try searching for another character."
            : error.status === 400 ? error.message
            : "We’re having trouble reaching the dictionary right now. Please check your connection and try again.",
          true
        );
      }
    } finally { if (token === requestNumber) { activeSearchKey = null; setIdle(); } }
  }
  function scheduleSearch() {
    clearTimeout(debounceTimer);
    if (input.value.trim()) debounceTimer = setTimeout(() => search(),DEBOUNCE_MS);
  }
  input.addEventListener("input", (event) => {
    if (event.isComposing) return;
    const position = input.selectionStart;
    const before = toHiragana(input.value.slice(0, position), { IMEMode: true });
    input.value = before + toHiragana(input.value.slice(position), { IMEMode: true });
    input.setSelectionRange(before.length, before.length);
    scheduleSearch();
  });
  input.addEventListener("compositionend", scheduleSearch);
  input.addEventListener("keydown",(event) => {
    if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); search(); return; }
    if (event.key === "Escape") {
      event.preventDefault(); input.value = ""; activeController?.abort(); activeSearchKey = null; requestNumber++;
      resultLabel.textContent = "Ready when you are";
      showMessage("Your next discovery starts here","Search a word, paste a sentence, or switch on Kanji mode to explore a character."); input.focus(); return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const cards = [...results.querySelectorAll(".result-card,.kanji-card")]; if (!cards.length) return;
      event.preventDefault();
      selectedIndex = event.key === "ArrowDown" ? Math.min(selectedIndex+1,cards.length-1) : Math.max(selectedIndex-1,0);
      cards.forEach((card,index) => card.style.outline = index === selectedIndex ? "2px solid var(--accent)" : "");
      cards[selectedIndex].scrollIntoView({block:"nearest",behavior:"smooth"});
    }
  });
  $("#searchButton").addEventListener("click",() => search());
  results.addEventListener("change", (event) => {
    if (event.target.id !== "compoundMeaning") return;
    showMeaning = $("#compoundMeaning").checked;
    results.querySelectorAll(".compound-meaning").forEach((element) => { element.hidden = !showMeaning; });
    writeStorage(COMPOUND_OPTIONS_KEY, { meaning: showMeaning });
  });
  kanjiMode.addEventListener("change",() => { if (input.value.trim()) search(); });
  $("#clearButton").addEventListener("click",() => {
    input.value = ""; activeController?.abort(); activeSearchKey = null; requestNumber++;
    resultLabel.textContent = "Ready when you are";
    showMessage("Your next discovery starts here","Search a word, paste a sentence, or switch on Kanji mode to explore a character."); input.focus();
  });
  $("#clearHistory").addEventListener("click",() => { writeStorage(HISTORY_KEY,[]); renderHistory(); });
  $("#historyList").addEventListener("click",(event) => {
    const button = event.target.closest("[data-history-index]"); if (!button) return;
    const item = readStorage(HISTORY_KEY,[])[Number(button.dataset.historyIndex)]; if (!item) return;
    kanjiMode.checked = Boolean(item.kanji); searchSettings.save(); input.value = item.query; search(item.query,Boolean(item.kanji));
  });
  results.addEventListener("click",(event) => {
    const kanjiButton = event.target.closest("[data-search-kanji]");
    if (kanjiButton) {
      const kanji = kanjiButton.dataset.searchKanji; input.value = kanji; kanjiMode.checked = true;
      searchSettings.save();
      search(kanji,true); input.focus(); return;
    }
    const wordButton = event.target.closest("[data-search-word]");
    if (wordButton) {
      const word = wordButton.dataset.searchWord; input.value = word; kanjiMode.checked = false;
      searchSettings.save();
      search(word,false); input.focus(); return;
    }
    const audioButton = event.target.closest("[data-audio]");
    if (audioButton) new Audio(audioButton.dataset.audio).play().catch((error) => { console.warn("Audio playback failed:",error); resultLabel.textContent = "Audio playback is unavailable"; });
  });
  renderHistory();
})();
