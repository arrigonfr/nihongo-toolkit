import { API_BASE } from "./api.js";
import { mountStudyControls, japaneseHTML, audioHTML, readingsHTML } from "./study-controls.js";
import { wordsHTML, mountSentenceExamples } from "./examples.js";
(() => {
  "use strict";
  const API = API_BASE;
  const HISTORY_KEY = "nihon:kanji-atlas:history";
  const CACHE_PREFIX = "nihon:kanji-atlas:cache:v2:";
  const STROKE_CACHE_PREFIX = "nihon:kanji-atlas:stroke:";
  const elements = {
    query: document.getElementById("query"),
    form: document.getElementById("searchForm"),
    searchButton: document.getElementById("searchButton"),
    randomButton: document.getElementById("randomButton"),
    themeButton: document.getElementById("themeButton"),
    notice: document.getElementById("notice"),
    loading: document.getElementById("loading"),
    loadingText: document.getElementById("loadingText"),
    results: document.getElementById("results"),
    detail: document.getElementById("detail"),
    historyList: document.getElementById("historyList"),
    clearHistory: document.getElementById("clearHistory")
  };
  let requestNumber = 0;

  function readStorage(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      console.warn(`Could not read ${key} from local storage.`, error);
      return fallback;
    }
  }

  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Could not save ${key} in local storage.`, error);
      return false;
    }
  }

  function setNotice(message = "", isError = false) {
    elements.notice.textContent = message;
    elements.notice.classList.toggle("show", Boolean(message));
    elements.notice.classList.toggle("error", Boolean(message) && isError);
  }

  function setLoading(loading, text = "Looking up kanji…") {
    elements.loading.hidden = !loading;
    elements.loadingText.textContent = text;
    elements.searchButton.disabled = loading;
    elements.randomButton.disabled = loading;
  }

  async function fetchJson(url, { persist = true } = {}) {
    const cacheKey = CACHE_PREFIX + url;
    let cached = null;
    try {
      const raw = localStorage.getItem(cacheKey);
      cached = raw === null ? null : JSON.parse(raw);
    } catch (error) {
      console.warn("Could not read cached Kanji API data.", error);
    }
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) {
        const error = new Error(response.status === 404
          ? "We couldn’t find that character in our dictionary."
          : "We couldn’t load the dictionary data right now. Please try again in a moment.");
        error.status = response.status;
        throw error;
      }
      const data = await response.json();
      window.dispatchEvent(new CustomEvent("kanji-network", { detail: { online: true } }));
      if (persist) {
        const serialized = JSON.stringify(data);
        if (serialized.length < 450000) {
          try {
            localStorage.setItem(cacheKey, serialized);
          } catch (error) {
            console.warn("Could not cache Kanji API data.", error);
          }
        }
      }
      return data;
    } catch (error) {
      if (cached !== null) {
        window.dispatchEvent(new CustomEvent("kanji-network", { detail: { online: false, cached: true } }));
        return cached;
      }
      window.dispatchEvent(new CustomEvent("kanji-network", { detail: { online: false, cached: false } }));
      throw error;
    }
  }

  function encode(value) {
    return encodeURIComponent(value);
  }

  function isSingleKanji(value) {
    const characters = Array.from(value);
    return characters.length === 1 && /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u{20000}-\u{3134f}]/u.test(value);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function readings(values) {
    return Array.isArray(values) && values.length ? values.join("、") : "Not listed in KANJIDIC2";
  }

  function meanings(record) {
    return Array.isArray(record?.meanings) ? record.meanings.join(", ") : "";
  }

  function radicalContent(record) {
    const radicals = record?.radicals ?? record?.radical;
    if (!radicals) return '<span class="radical-note">Radical data is not included in this dictionary record.</span>';
    const items = Array.isArray(radicals) ? radicals : [radicals];
    const chips = items.map((item) => {
      if (typeof item === "string") return `<span class="atlas-chip">${escapeHtml(item)}</span>`;
      const glyph = item.character ?? item.kanji ?? item.radical ?? (
        Number.isInteger(item.value) && item.value >= 1 && item.value <= 214
          ? String.fromCodePoint(0x2f00 + item.value - 1).normalize("NFKC") : ""
      );
      const system = item.type === "classical" ? `Radical #${item.value}` : item.type === "nelson_c" ? `Nelson #${item.value}` : `${item.type} #${item.value}`;
      const meaning = Array.isArray(item.meanings) ? item.meanings.join(", ") : (item.meaning ?? "");
      const details = [item.name, meaning, system].filter(Boolean).map(escapeHtml).join(" · ");
      return `<span class="atlas-chip">${glyph ? `<strong lang="ja">${escapeHtml(glyph)}</strong>` : ""}${glyph && details ? " · " : ""}${details}</span>`;
    }).join("");
    const names = record?.radical_names?.length
      ? `<span class="radical-note">Radical readings: ${record.radical_names.map(escapeHtml).join(" · ")}</span>` : "";
    return `<div class="chip-list">${chips}</div>${names}<span class="radical-note">Official indexing radical (from the classic 214-radical system, plus Nelson’s look-up radical when different).</span>`;
  }

  function componentsContent(record) {
    const radicalChars = new Set((record?.radicals || []).map((item) => item?.character).filter(Boolean));
    const list = (record?.components || []).filter((item) => item?.character);
    if (!list.length) return "";
    const chips = list.map(({ character, original, name, meaning }) => {
      const details = [original ? `from ${original}` : "", name && !radicalChars.has(character) ? name : "", meaning]
        .filter(Boolean).map(escapeHtml).join(" · ");
      return `<button class="atlas-chip" type="button" data-kanji="${escapeHtml(character)}" title="Inspect ${escapeHtml(character)}"><strong lang="ja">${escapeHtml(character)}</strong>${details ? ` · ${details}` : ""}</button>`;
    }).join("");
    return textBlock("Components · 構成要素", `<div class="chip-list">${chips}</div><span class="radical-note">All visual building blocks that make up this character (click any component to inspect it).</span>`, "compounds");
  }

  function renderResults(title, records, total = records.length) {
    elements.detail.replaceChildren();
    const heading = document.createElement("h2");
    heading.className = "result-heading";
    const label = document.createElement("span");
    label.textContent = title;
    const count = document.createElement("span");
    count.className = "result-count";
    count.textContent = `${total} found${total > records.length ? ` · showing ${records.length}` : ""}`;
    heading.append(label, count);

    const grid = document.createElement("div");
    grid.className = "result-grid";
    records.forEach((record) => {
      const character = typeof record === "string" ? record : record.kanji;
      if (!character) return;
      const button = document.createElement("button");
      button.className = "result-card";
      button.type = "button";
      button.dataset.kanji = character;
      button.setAttribute("aria-label", `View ${character}${meanings(record) ? `, ${meanings(record)}` : ""}`);
      const glyph = document.createElement("span");
      glyph.className = "result-kanji";
      glyph.textContent = character;
      const meaning = document.createElement("span");
      meaning.className = "result-meaning";
      meaning.textContent = meanings(record) || "View details";
      button.append(glyph, meaning);
      grid.append(button);
    });
    elements.results.replaceChildren(heading, grid);
  }

  function textBlock(label, value, className = "") {
    return `<section class="data-block ${className}"><h3 class="data-label">${escapeHtml(label)}</h3><div class="data-value">${value}</div></section>`;
  }

  function renderDetail(record, words) {
    const character = record.kanji;
    const compounds = [];
    const seen = new Set();
    (Array.isArray(words) ? words : []).forEach((entry) => {
      const selected = entry.japanese?.find((variant) => variant.word?.includes(character));
      if (!selected || seen.has(selected.word)) return;
      seen.add(selected.word);
      const glosses = (entry.senses || []).flatMap((sense) => sense.english_definitions || []);
      compounds.push({ written: selected.word, reading: selected.reading || "—", gloss: glosses.slice(0, 3).join("; ") || "Meaning unavailable" });
    });
    const compoundMarkup = compounds.length
      ? `<div class="compound-list">${compounds.slice(0, 10).map((item) => `<div class="compound"><span class="compound-word">${japaneseHTML(item.written, item.reading)}</span>${audioHTML(item.reading)}<span class="compound-meaning">${escapeHtml(item.gloss)}</span></div>`).join("")}</div>`
      : '<span class="radical-note">No example compounds were found for this character.</span>';
    const jlpt = record.jlpt ? `JLPT N${record.jlpt}` : "No JLPT level";
    const frequency = record.freq_mainichi_shinbun ? `#${record.freq_mainichi_shinbun}` : "Not ranked";
    const radicalValue = radicalContent(record);
    const detail = document.createElement("div");
    detail.className = "detail-inner";
    detail.innerHTML = `
      <div class="detail-top">
        <button class="hero-kanji" id="strokeOrderButton" type="button" aria-label="Show stroke order for ${escapeHtml(character)}" title="Click to see stroke order">
          <span class="hero-kanji-character">${escapeHtml(character)}</span>
          <span class="stroke-caption" aria-live="polite">Click to see stroke order</span>
        </button>
        <div class="hero-info">
          <div class="hero-title"><h2>${escapeHtml(character)}</h2><span class="tag">${escapeHtml(jlpt)}</span></div>
          <p class="meanings">${escapeHtml(meanings(record) || "No English meanings listed.")}</p>
          <button class="button copy-button" id="copyKanji" type="button" data-kanji="${escapeHtml(character)}">Copy kanji</button>
        </div>
      </div>
      <div class="detail-grid">
        ${textBlock("On-yomi · 音読み", readingsHTML(record.on_readings))}
        ${textBlock("Kun-yomi · 訓読み", readingsHTML(record.kun_readings))}
        ${record.nanori?.length ? textBlock("Name readings", readingsHTML(record.nanori)) : ""}
        ${textBlock("Stroke count", escapeHtml(record.stroke_count ?? "—"))}
        ${textBlock("Frequency rank", escapeHtml(frequency))}
        ${textBlock("Radical(s) · 部首", radicalValue)}
        ${textBlock("Grade", escapeHtml(record.grade ? `School grade ${record.grade}` : "Not specified"))}
        ${componentsContent(record)}
        ${textBlock("Example words", record.examples?.length ? wordsHTML(record.examples) : "No example words listed.", "compounds")}
        ${textBlock("Example compounds", compoundMarkup, "compounds")}
        ${textBlock("Example sentences", `<div id="kanjiSentences"></div>`, "compounds")}
      </div>`;
    elements.detail.replaceChildren(detail);
    mountSentenceExamples(document.getElementById("kanjiSentences"), character, record.sentences);
    document.getElementById("strokeOrderButton").addEventListener("click", (event) => {
      animateStrokeOrder(event.currentTarget, character);
    });
    document.getElementById("copyKanji").addEventListener("click", async (event) => {
      try {
        await navigator.clipboard.writeText(character);
        event.currentTarget.textContent = "Copied";
        window.setTimeout(() => { event.currentTarget.textContent = "Copy kanji"; }, 1400);
      } catch (error) {
        setNotice("Clipboard access is unavailable. Select and copy the kanji directly.", true);
      }
    });
  }

  async function getStrokeSvg(url, cacheKey) {
    let cached = null;
    try {
      cached = localStorage.getItem(cacheKey);
    } catch (error) {
      console.warn("Could not read cached stroke order data.", error);
    }
    try {
      const response = await fetch(url);
      if (!response.ok) {
        const error = new Error("Stroke order diagram is unavailable for this character.");
        error.status = response.status;
        throw error;
      }
      const svg = await response.text();
      try {
        localStorage.setItem(cacheKey, svg);
      } catch (error) {
        console.warn("Could not cache stroke order data.", error);
      }
      return svg;
    } catch (error) {
      if (cached) return cached;
      throw error;
    }
  }

  function parseStrokeData(svgText) {
    const source = new DOMParser().parseFromString(svgText, "image/svg+xml");
    if (source.querySelector("parsererror") || source.documentElement.localName !== "svg") {
      throw new Error("The SVG could not be read.");
    }
    const paths = [...source.querySelectorAll('path[id]')]
      .map((path) => ({ id: path.id, d: path.getAttribute("d") }))
      .filter((path) => /-s\d+$/.test(path.id) && path.d)
      .sort((a, b) => Number(a.id.match(/-s(\d+)$/)[1]) - Number(b.id.match(/-s(\d+)$/)[1]));
    return { viewBox: source.documentElement.getAttribute("viewBox") || "0 0 109 109", paths };
  }

  async function getStrokeData(character) {
    const svgText = await getStrokeSvg(
      `${API}/api/kanji/${encode(character)}/strokes`,
      STROKE_CACHE_PREFIX + API + character
    );
    const data = parseStrokeData(svgText);
    if (!data.paths.length) throw new Error("No local stroke paths for this kanji.");
    return { source: "kanjivg", ...data };
  }

  async function animateStrokeOrder(button, character) {
    const caption = button.querySelector(".stroke-caption");
    const originalGlyph = button.querySelector(".hero-kanji-character");
    button.querySelector(".hero-strokes")?.remove();
    originalGlyph.hidden = false;
    button.disabled = true;
    caption.textContent = "Loading stroke order…";
    try {
      const strokeData = await getStrokeData(character);
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "hero-strokes");
      svg.setAttribute("viewBox", strokeData.viewBox);
      svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", `Stroke order for ${character}`);
      strokeData.paths.forEach(({ d }) => {
        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
        path.setAttribute("d", d);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "currentColor");
        path.setAttribute("stroke-width", "3");
        path.setAttribute("stroke-linecap", "round");
        path.setAttribute("stroke-linejoin", "round");
        svg.append(path);
      });
      originalGlyph.hidden = true;
      button.insertBefore(svg, caption);

      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        caption.textContent = `${strokeData.paths.length} strokes · reduced motion`;
        return;
      }
      const paths = [...svg.querySelectorAll("path")];
      for (let index = 0; index < paths.length; index += 1) {
        if (!button.isConnected) return;
        const path = paths[index];
        const length = path.getTotalLength();
        path.style.strokeDasharray = String(length);
        path.style.strokeDashoffset = String(length);
        caption.textContent = `Stroke ${index + 1} of ${paths.length}`;
        const animation = path.animate(
          [{ strokeDashoffset: length }, { strokeDashoffset: 0 }],
          { duration: 420, fill: "forwards", easing: "ease-in-out" }
        );
        await animation.finished;
        await new Promise((resolve) => window.setTimeout(resolve, 90));
      }
      if (button.isConnected) caption.textContent = `${paths.length} strokes · click to replay`;
    } catch (error) {
      if (button.isConnected) {
        button.querySelector(".hero-strokes")?.remove();
        originalGlyph.hidden = false;
        caption.textContent = "Stroke order unavailable";
        setNotice(`We couldn’t load the stroke order diagram for ${character} right now. Please try again in a moment.`, true);
      }
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function getKanji(character) {
    return fetchJson(`${API}/api/kanji/${encode(character)}`);
  }

  async function getWords(character) {
    try {
      return (await fetchJson(`${API}/api/kanji/${encode(character)}/words`)).items;
    } catch (error) {
      console.warn(`Could not load example compounds for ${character}.`, error);
      setNotice("Example compounds couldn’t be loaded right now.", true);
      return [];
    }
  }

  function saveHistory(record) {
    const storedHistory = readStorage(HISTORY_KEY, []);
    const history = Array.isArray(storedHistory) ? storedHistory : [];
    const updated = [{ kanji: record.kanji, meaning: meanings(record), viewedAt: Date.now() },
      ...history.filter((item) => item.kanji !== record.kanji)].slice(0, 20);
    writeStorage(HISTORY_KEY, updated);
    renderHistory();
  }

  function renderHistory() {
    const storedHistory = readStorage(HISTORY_KEY, []);
    const history = Array.isArray(storedHistory) ? storedHistory : [];
    elements.historyList.replaceChildren();
    history.slice(0, 20).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.dataset.kanji = item.kanji;
      button.setAttribute("aria-label", `View ${item.kanji}, ${item.meaning || "kanji"}`);
      const glyph = document.createElement("span");
      glyph.className = "history-glyph";
      glyph.textContent = item.kanji;
      const meta = document.createElement("span");
      meta.className = "history-meta";
      const meaning = document.createElement("span");
      meaning.className = "history-meaning";
      meaning.textContent = item.meaning || "Kanji";
      meaning.title = item.meaning || "Kanji";
      const date = document.createElement("span");
      date.className = "history-date";
      date.textContent = new Date(item.viewedAt).toLocaleDateString();
      meta.append(meaning, date);
      button.append(glyph, meta);
      elements.historyList.append(button);
    });
  }

  async function showKanji(character, token = ++requestNumber) {
    setLoading(true, `Looking up ${character}…`);
    elements.results.replaceChildren();
    setNotice("");
    try {
      const record = await getKanji(character);
      if (token !== requestNumber) return;
      if (!record || typeof record !== "object" || !record.kanji) throw new Error("No kanji details were returned.");
      const words = await getWords(character);
      if (token !== requestNumber) return;
      renderDetail(record, words);
      saveHistory(record);
    } catch (error) {
      if (token !== requestNumber) return;
      elements.detail.replaceChildren();
      setNotice(
        error.status === 404
          ? `We couldn’t find details for “${character}”. Try searching for another character.`
          : `We couldn’t load details for “${character}” right now. Please check your connection and try again.`,
        true
      );
    } finally {
      if (token === requestNumber) setLoading(false);
    }
  }

  async function getJlptKanji(level) {
    const digit = level.match(/[1-5]/)[0];
    return (await fetchJson(`${API}/api/kanji?level=${digit}&limit=3000`)).items;
  }

  async function searchMeaning(keyword) {
    return (await fetchJson(`${API}/api/kanji?q=${encode(keyword)}&limit=3000`)).items;
  }

  async function getRandomKanji() {
    return (await fetchJson(`${API}/api/kanji/batch?limit=1`, { persist: false })).items[0].kanji;
  }

  async function runSearch(query) {
    const token = ++requestNumber;
    const term = query.trim();
    setNotice("");
    elements.detail.replaceChildren();
    elements.results.replaceChildren();
    if (!term) {
      setNotice("Enter a kanji, JLPT level, or English meaning to search.", true);
      return;
    }
    if (isSingleKanji(term)) {
      await showKanji(term, token);
      return;
    }
    setLoading(true, "Searching kanji…");
    try {
      if (/^(?:jlpt\s*)?n[1-5]$/i.test(term)) {
        const response = await getJlptKanji(term.toUpperCase().replace(/^JLPT\s*/, ""));
        if (token !== requestNumber) return;
        const records = Array.isArray(response) ? response : [];
        if (!records.length) {
          setNotice(`No kanji were found for ${term.toUpperCase()}.`, true);
          return;
        }
        renderResults(`${term.toUpperCase()} kanji`, records.map((item) => typeof item === "string" ? item : item.kanji).filter(Boolean));
      } else {
        const response = await searchMeaning(term);
        if (token !== requestNumber) return;
        const records = Array.isArray(response) ? response : [];
        const matches = records.filter((record) => typeof record === "string" || record.kanji);
        if (!matches.length) {
          setNotice(`No kanji matched “${term}”. Try a broader English keyword.`, true);
          return;
        }
        renderResults(`Matches for “${term}”`, matches.slice(0, 100), matches.length);
      }
    } catch (error) {
      if (token !== requestNumber) return;
      setNotice("We couldn’t complete your search right now. Please check your connection and try again.", true);
    } finally {
      if (token === requestNumber) setLoading(false);
    }
  }

  async function showRandom() {
    const token = ++requestNumber;
    elements.detail.replaceChildren();
    elements.results.replaceChildren();
    setNotice("");
    setLoading(true, "Finding a random kanji…");
    try {
      const character = await getRandomKanji();
      if (!character) throw new Error("No random kanji available.");
      await showKanji(character, token);
    } catch (error) {
      if (token !== requestNumber) return;
      setNotice("We couldn’t load a random kanji right now. Please check your connection and try again.", true);
      setLoading(false);
    }
  }


  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    runSearch(elements.query.value);
  });
  elements.randomButton.addEventListener("click", showRandom);
  elements.results.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kanji]");
    if (button) showKanji(button.dataset.kanji);
  });
  elements.detail.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kanji]:not(#copyKanji)");
    if (button) {
      elements.query.value = button.dataset.kanji;
      showKanji(button.dataset.kanji);
    }
  });
  elements.historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-kanji]");
    if (button) showKanji(button.dataset.kanji);
  });
  elements.clearHistory.addEventListener("click", () => {
    writeStorage(HISTORY_KEY, []);
    renderHistory();
  });
  document.addEventListener("keydown", (event) => {
    const editable = event.target instanceof HTMLElement && (
      event.target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(event.target.tagName)
    );
    if (event.key.toLowerCase() === "r" && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      showRandom();
    } else if (event.key === "Backspace" && !editable && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      elements.query.value = "";
      elements.query.focus();
      setNotice("");
    }
  });
  window.addEventListener("kanji-network", (event) => {
    if (event.detail.online) {
      if (elements.notice.textContent.startsWith("Offline")) setNotice("");
    } else if (event.detail.cached) {
      setNotice("Offline — showing saved data.", false);
    }
  });
  renderHistory();
})();
mountStudyControls();
