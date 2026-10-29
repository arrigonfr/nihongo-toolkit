import { API_BASE } from "./api.js";
import { rememberControls } from "./settings-storage.js";
import { mountStudyControls, japaneseHTML, audioHTML } from "./study-controls.js";
import { mountSentenceExamples } from "./examples.js";
(() => {
  "use strict";
  const API_URL = `${API_BASE}/api/words?keyword=`;
  const ANALYZE_URL = `${API_BASE}/api/analyze?text=`;
  const HISTORY_KEY = "fumitoki-analysis-history-v2";
  const $ = (selector) => document.querySelector(selector);
  const textInput = $("#sourceText"), parsedText = $("#parsedText"), detailPanel = $("#detailPanel");
  const detailWord = $("#detailWord"), detailContent = $("#detailContent"), lookupInput = $("#lookupInput");
  const status = $("#status"), historyList = $("#historyList"), tokenCount = $("#tokenCount");
  const translationBox = $("#translationBox"), translationLabel = $("#translationLabel"), translationText = $("#translationText");
  let tokens = [], currentTranslation = "", currentTranslationSource = "", selectedTokenIndex = -1, requestId = 0, parseRequestId = 0, activeController = null, history = [];
  rememberControls("nihon:fumitoki-settings-v1", ["translationToggle"], (message) => setStatus(message, true));

  function readJSON(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      console.warn(`Could not read ${key} from local storage.`, error);
      return fallback;
    }
  }
  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 10)));
      return true;
    } catch (error) {
      console.warn("Could not save analysis history.", error);
      return false;
    }
  }
  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle("error", isError);
  }
  function saveCurrentAnalysis() {
    const value = textInput.value.trim();
    if (!value || !tokens.length) return true;
    history = history.filter((entry) => entry.text !== value);
    history.unshift({
      text: value,
      tokens: tokens.map((token) => ({
        text: token.text,
        type: token.type,
        reading: token.reading || "",
        base: token.base || token.text,
        result: token.result || null
      })),
      translation: currentTranslation,
      translationSource: currentTranslationSource,
      updatedAt: new Date().toISOString()
    });
    history = history.slice(0, 10);
    const saved = saveHistory();
    renderHistory();
    return saved;
  }
  function isPunctuation(value) {
    return /^[\p{P}\p{S}]+$/u.test(value);
  }
  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("span");
      empty.className = "muted";
      empty.textContent = "No saved analyses yet.";
      historyList.append(empty);
      return;
    }
    history.forEach((entry, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.dataset.historyIndex = String(index);
      button.title = entry.text;
      button.textContent = entry.text.replace(/\s+/gu, " ");
      historyList.append(button);
    });
  }
  function createRubyToken(token, index) {
    if (token.type === "punctuation") {
      const span = document.createElement("span");
      span.className = "token punctuation";
      span.textContent = token.text;
      return span;
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "token";
    const parts = (token.result?.senses || []).flatMap((sense) => sense.parts_of_speech || []).join(" ");
    button.dataset.tokenType = token.type === "particle" ? "particle"
      : /\bverb\b/i.test(parts) ? "verb" : /\badjectiv/i.test(parts) ? "adjective" : token.type;
    button.dataset.tokenIndex = String(index);
    button.setAttribute("aria-pressed", String(index === selectedTokenIndex));
    button.title = token.type === "particle" ? `Particle · ${token.text}` : `Look up ${token.text}`;
    button.innerHTML = japaneseHTML(token.text, token.reading);
    return button;
  }
  function renderTranslation() {
    const show = $("#translationToggle").checked && tokens.length > 0;
    translationBox.hidden = !show;
    if (!show) return;
    translationLabel.textContent = "Sentence translation";
    translationText.textContent = currentTranslation || "Translating sentence…";
  }
  function renderTokens() {
    parsedText.replaceChildren();
    let count = 0;
    tokens.forEach((token, index) => {
      if (token.type === "space") {
        parsedText.append(document.createTextNode(token.text));
        return;
      }
      if (token.type !== "punctuation") count++;
      parsedText.append(createRubyToken(token, index));
    });
    tokenCount.textContent = tokens.length ? `${count} ${count === 1 ? "word" : "words"}` : "";
    $("#copyButton").disabled = !tokens.length;
    let speech = document.getElementById("sentenceSpeech");
    if (!speech) {
      speech = document.createElement("span");
      speech.id = "sentenceSpeech";
      $("#copyButton").after(speech);
    }
    speech.innerHTML = tokens.length ? audioHTML(tokens.map((token) => token.text).join("")) : "";
    if (!tokens.length) {
      const empty = document.createElement("div");
      empty.className = "empty";
      empty.textContent = "Your parsed sentence will appear here. Click any word or particle to look it up.";
      parsedText.append(empty);
    }
    renderTranslation();
  }
  async function runParse(text = textInput.value, options = {}) {
    const value = text.trim();
    if (!value) {
      setStatus("Enter some Japanese text before parsing.", true);
      textInput.focus();
      return;
    }
    textInput.value = text;
    tokens = [];
    currentTranslation = "";
    currentTranslationSource = "";
    selectedTokenIndex = -1;
    detailPanel.hidden = true;
    renderTokens();
    setStatus("Analyzing Japanese words and readings…");

    const currentParse = ++parseRequestId;
    try {
      const response = await fetch(ANALYZE_URL + encodeURIComponent(value), {
        signal: AbortSignal.timeout(20000),
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("Sentence analysis is unavailable. Please try again.");
      const payload = await response.json();
      if (currentParse !== parseRequestId) return;
      if (!Array.isArray(payload.tokens) || !payload.tokens.length) throw new Error("No sentence analysis returned.");
      if (Array.isArray(payload.tokens) && payload.tokens.length) {
        tokens = payload.tokens.map((token) => ({
          text: String(token.text ?? ""),
          type: ["space", "particle", "punctuation", "word"].includes(token.type) ? token.type : "word",
          reading: typeof token.reading === "string" ? token.reading : "",
          base: typeof token.base === "string" ? token.base : String(token.text ?? ""),
          result: token.result && typeof token.result === "object" ? token.result : null,
          results: Array.isArray(token.results) ? token.results : (token.result ? [token.result] : [])
        }));
      }
      currentTranslation = payload.translation || "Translation unavailable for this sentence.";
      currentTranslationSource = payload.translationSource || "";
      renderTokens();
      if (selectedTokenIndex >= 0 && tokens[selectedTokenIndex]?.results?.length) {
        renderEntry(tokens[selectedTokenIndex].text, tokens[selectedTokenIndex].results);
      }
      const saved = options.skipHistory || saveCurrentAnalysis();
      const count = tokens.filter((token) => token.type === "word" || token.type === "particle").length;
      setStatus(saved ? `Parsed ${count} words. Click any word or particle to see its definition.`
        : "Parsed sentence, though recent history could not be saved in this browser.", !saved);
    } catch (error) {
      if (currentParse !== parseRequestId) return;
      console.warn("Sentence analysis failed:", error);
      setStatus("The sentence could not be analyzed. Please check your connection and try again.", true);
    }
  }
  function addText(parent, tagName, text, className) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }
  function getAudioURL(item) {
    const candidates = [
      item.audio_url,
      typeof item.audio === "string" ? item.audio : item.audio?.uri,
      item.audio_file,
      item.pronunciation?.audio
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== "string") continue;
      try {
        const url = new URL(candidate, "https://jisho.org");
        if (url.protocol === "https:" || url.protocol === "http:") return url.href;
      } catch (error) {
        console.warn("Ignoring invalid audio URL from Jisho.", error);
      }
    }
    return "";
  }
  function findExamples(item) {
    if (Array.isArray(item.examples)) return item.examples;
    if (Array.isArray(item.sentences)) return item.sentences;
    return [];
  }
  function renderEntry(query, items) {
    detailContent.replaceChildren();
    if (!items.length) {
      addText(detailContent, "p", `No results for “${query}”. Try another spelling or enter a different word above.`, "small-note");
      return;
    }
    const item = items.find((candidate) =>
      (candidate.japanese || []).some((form) => form.word === query || form.reading === query)
    ) || items[0];
    const forms = Array.isArray(item.japanese) ? item.japanese : [];
    const matchedForm = forms.find((form) => form.word === query || form.reading === query) || forms[0] || {};
    detailWord.innerHTML = japaneseHTML(matchedForm.word || matchedForm.reading || query, matchedForm.reading)
      + audioHTML(matchedForm.reading || query);

    const tags = document.createElement("div");
    tags.className = "tags";
    const parts = [...new Set((item.senses || []).flatMap((sense) => sense.parts_of_speech || []))];
    parts.forEach((part) => addText(tags, "span", part, "tag"));
    (item.jlpt || []).filter(Boolean).forEach((level) => addText(tags, "span", String(level).toUpperCase(), "tag jlpt"));
    if (tags.childElementCount) detailContent.append(tags);

    const meanings = [...new Set((item.senses || []).flatMap((sense) => sense.english_definitions || []))];
    if (meanings.length) {
      const list = document.createElement("ol");
      list.className = "meanings";
      meanings.slice(0, 12).forEach((meaning) => addText(list, "li", meaning));
      detailContent.append(list);
    } else {
      addText(detailContent, "p", "No English definitions are listed for this entry.", "small-note");
    }
    const audio = getAudioURL(item);
    if (audio) {
      const section = document.createElement("div");
      section.className = "detail-section study-audio";
      const link = addText(section, "a", "▶ Play pronunciation", "audio-link");
      link.href = audio;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      detailContent.append(section);
    }

    const examples = findExamples(item);
    const exampleSection = document.createElement("section");
    exampleSection.className = "detail-section";
    addText(exampleSection, "h3", "Example sentences", "section-label");
    const exampleBody = document.createElement("div");
    exampleSection.append(exampleBody);
    detailContent.append(exampleSection);
    const exampleQuery = forms.find((form) => form.word === query || form.reading === query)?.word
      || forms[0]?.word || forms[0]?.reading || query;
    mountSentenceExamples(exampleBody, exampleQuery, examples);

    const link = document.createElement("a");
    link.className = "jisho-link";
    link.href = `https://jisho.org/search/${encodeURIComponent(query)}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = "Open this search on Jisho.org ↗";
    detailContent.append(link);

    const token = tokens[selectedTokenIndex];
    if (token) {
      const form = forms.find((entry) => entry.word === token.text || entry.reading === token.text);
      if (!token.reading && form) token.reading = form.reading || "";
      token.result = item;
      renderTokens();
    }
  }
  async function lookup(query, tokenIndex = -1) {
    const term = String(query || "").trim();
    if (!term || isPunctuation(term)) {
      detailPanel.hidden = false;
      detailWord.textContent = "Lookup";
      detailContent.replaceChildren();
      addText(detailContent, "p", "Enter a word or particle to search.", "small-note");
      lookupInput.focus();
      return;
    }
    selectedTokenIndex = tokenIndex;
    activeController?.abort();
    ++requestId;
    if (tokenIndex >= 0) {
      lookupInput.value = term;
    }
    renderTokens();
    detailPanel.hidden = false;
    detailWord.textContent = term;
    detailContent.replaceChildren();
    const preloadedToken = tokenIndex >= 0 ? tokens[tokenIndex] : null;
    if (preloadedToken?.results?.length) {
      renderEntry(term, preloadedToken.results);
      setStatus(`Dictionary results for “${term}”.`, false);
      return;
    }
    const loading = document.createElement("div");
    loading.className = "loading";
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    spinner.setAttribute("aria-hidden", "true");
    loading.append(spinner, document.createTextNode("Looking up word…"));
    detailContent.append(loading);
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const currentRequest = ++requestId;
    try {
      const response = await fetch(API_URL + encodeURIComponent(term), {
        signal: controller.signal,
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("We couldn’t look up that word right now.");
      const payload = await response.json();
      if (currentRequest !== requestId) return;
      const results = Array.isArray(payload.data) ? payload.data : [];
      renderEntry(term, results);
      setStatus(results.length ? `Dictionary results for “${term}”.` : `No dictionary results for “${term}”.`, !results.length);
    } catch (error) {
      if (error.name === "AbortError" || currentRequest !== requestId) return;
      console.error("Dictionary lookup failed.", error);
      detailContent.replaceChildren();
      addText(detailContent, "p", "We couldn’t look up this word right now. Please check your connection and try again.", "small-note");
      setStatus(`Couldn’t look up “${term}” right now. Please try again in a moment.`, true);
    }
  }
  async function copyAnalysis() {
    if (!tokens.length) return;
    const text = JSON.stringify({
      text: textInput.value,
      translation: currentTranslation || null,
      parsedAt: new Date().toISOString(),
      tokens: tokens.map((token) => ({ text: token.text, type: token.type, reading: token.reading || "", dictionary: token.result || null }))
    }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Analysis copied.");
    } catch (error) {
      console.warn("Clipboard API unavailable; trying the selection fallback.", error);
      const temporary = document.createElement("textarea");
      temporary.value = text;
      temporary.setAttribute("readonly", "");
      temporary.style.position = "fixed";
      temporary.style.opacity = "0";
      document.body.append(temporary);
      temporary.select();
      const copied = document.execCommand("copy");
      temporary.remove();
      setStatus(copied ? "Analysis copied." : "Could not copy automatically; your browser may block clipboard access.", !copied);
    }
  }

  $("#parseButton").addEventListener("click", () => runParse());
  textInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      runParse();
    }
  });
  parsedText.addEventListener("click", (event) => {
    const button = event.target.closest("[data-token-index]");
    if (!button) return;
    const index = Number(button.dataset.tokenIndex);
    const token = tokens[index];
    if (token && token.type !== "punctuation") lookup(token.text, index);
  });
  $("#translationToggle").addEventListener("change", renderTranslation);
  $("#closePanel").addEventListener("click", () => {
    activeController?.abort();
    requestId++;
    detailPanel.hidden = true;
    selectedTokenIndex = -1;
    renderTokens();
  });
  $("#lookupForm").addEventListener("submit", (event) => {
    event.preventDefault();
    lookup(lookupInput.value);
  });
  historyList.addEventListener("click", (event) => {
    const button = event.target.closest("[data-history-index]");
    if (!button) return;
    const entry = history[Number(button.dataset.historyIndex)];
    if (entry) {
      runParse(entry.text, {
        tokens: entry.tokens,
        translation: entry.translation,
        translationSource: entry.translationSource,
        skipHistory: true
      });
    }
  });
  $("#copyButton").addEventListener("click", copyAnalysis);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !detailPanel.hidden) {
      activeController?.abort();
      requestId++;
      detailPanel.hidden = true;
      selectedTokenIndex = -1;
      renderTokens();
    }
  });

  history = readJSON(HISTORY_KEY, []);
  if (!Array.isArray(history)) history = [];
  history = history.filter((entry) =>
    entry && typeof entry.text === "string" && entry.text.trim() &&
    Array.isArray(entry.tokens) && entry.tokens.every((token) => token && typeof token.text === "string")
  ).slice(0, 10);
  renderHistory();
})();
mountStudyControls();
