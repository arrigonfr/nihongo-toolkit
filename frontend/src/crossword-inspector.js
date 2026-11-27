import { escapeHTML } from "./html.js";
import { alignFuriganaRuby } from "./furigana.js";
import { romanizeKana } from "./romanize.js";
import { mountSentenceExamples } from "./examples.js";
import { hasKanji } from "./crossword-engine.js";

export function renderStudyInspector(state) {
  const body = document.getElementById("studyInspectorBody");
  if (!state.puzzle) {
    body.innerHTML = "";
    return;
  }

  if (state.roundEnded) {
    body.innerHTML = `<ul class="cw-review-list">${state.puzzle.entries.map((entry) => {
      const answered = entry.completed && !entry.revealed;
      const item = entry.item;
      const reading = item.furigana || item.word;
      const word = state.settings.furigana ? alignFuriganaRuby(item.word, reading) : escapeHTML(item.word);
      return `<li class="cw-review-word ${answered ? "answered" : "unanswered"}" data-review-entry="${escapeHTML(entry.id)}">
          <div class="cw-review-heading"><strong lang="ja">${word}</strong><span>${answered ? "Answered" : entry.revealed ? "Revealed" : "Not answered"}</span></div>
          <p><span lang="ja">${escapeHTML(reading)}</span>${state.settings.romanization ? ` · ${escapeHTML(romanizeKana(reading))}` : ""}</p>
          <p>${escapeHTML(item.meaning)}</p><button class="cw-btn" type="button" data-speak-ja="${escapeHTML(reading)}" aria-label="Pronounce ${escapeHTML(item.word)}">▶</button>
        </li>`;
    }).join("")}</ul>`;
    return;
  }

  const entry = state.puzzle.entries.find((e) => e.id === state.inspectedEntryId && e.completed)
    || state.puzzle.entries.find((e) => e.completed);

  if (!entry) {
    body.innerHTML = `
        <div class="cw-word-card" data-i18n style="color:var(--muted);text-align:center;padding:22px">
          Complete any word in the crossword (or hover/tap a completed answer) to unlock its full vocabulary card, random example sentence, audio pronunciation, and individual kanji breakdown.
        </div>
      `;
    return;
  }

  const item = entry.item;
  const word = item.word;
  const reading = item.furigana || word;
  const romaji = item.romaji || romanizeKana(reading);
  const examples = item.examples?.length
    ? item.examples
    : item.example
      ? [{ ja: item.example, furigana: item.exampleFurigana, en: item.exampleMeaning, tatoeba_id: item.exampleSourceId }]
      : [];

  const wordDisplayHTML = state.settings.furigana && hasKanji(word) && reading
    ? alignFuriganaRuby(word, reading)
    : escapeHTML(word);

  const kanjiChars = [...new Set([...word].filter((ch) => hasKanji(ch)))];
  const activeKanji = state.inspectedKanjiChar && kanjiChars.includes(state.inspectedKanjiChar)
    ? state.inspectedKanjiChar
    : kanjiChars[0] || null;

  const kanjiData = activeKanji
    ? (state.kanjiCache.get(activeKanji) || (item.kanjiDetails || []).find((k) => k.kanji === activeKanji))
    : null;

  body.innerHTML = `
      <div class="cw-study-grid">
        <div class="cw-word-card" id="completedWordCard">
          <div class="cw-word-head">
            <div>
              <div class="cw-word-title" lang="ja">${wordDisplayHTML}</div>
              <div class="cw-word-reading">
                <span class="cw-reading-label">Reading:</span> <strong lang="ja">${escapeHTML(reading)}</strong>
                ${state.settings.romanization ? ` · <span>${escapeHTML(romaji)}</span>` : ""}
                · <span class="cw-badge">JLPT N${escapeHTML(item.level)}</span>
              </div>
            </div>
            <button class="cw-btn" type="button" data-speak-ja="${escapeHTML(reading)}" aria-label="Pronounce word">▶</button>
          </div>

          <div><strong data-i18n>Definition:</strong> ${escapeHTML(item.meaning)}</div>
          ${item.partOfSpeech ? `<div class="cw-part-of-speech" style="margin-top:4px;font-size:12px;color:var(--muted)">Part of speech: ${escapeHTML(item.partOfSpeech)}</div>` : ""}

          <div class="cw-example-box"><strong data-i18n>Example sentences</strong><div id="cwSentenceExamples"></div></div>

          ${kanjiChars.length ? `
            <div style="margin-top:10px">
              <span class="cw-kanji-heading" style="font-size:11px;font-weight:700;color:var(--muted)">KANJI IN THIS WORD (Hover or tap to inspect):</span>
              <div class="cw-kanji-Chips">
                ${kanjiChars.map((ch) => `
                  <button class="cw-kanji-chip${ch === activeKanji ? " active" : ""}" type="button" data-inspect-kanji="${escapeHTML(ch)}" lang="ja">
                    ${escapeHTML(ch)}
                  </button>
                `).join("")}
              </div>
            </div>
          ` : ""}
        </div>

        <div class="cw-kanji-card" id="completedKanjiCard">
          ${kanjiData ? `
            <div class="cw-kanji-head">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="cw-kanji-glyph" lang="ja">${escapeHTML(kanjiData.kanji)}</span>
                <div>
                  <div style="font-weight:800;font-size:15px">${escapeHTML((kanjiData.meanings || []).join(", ") || "Kanji")}</div>
                  <div style="font-size:12px;color:var(--muted)">
                    ${kanjiData.jlpt ? `JLPT N${kanjiData.jlpt}` : '<span class="cw-unrated">Unrated</span>'}
                    ${kanjiData.stroke_count ? ` · ${kanjiData.stroke_count} strokes` : ""}
                  </div>
                </div>
              </div>
              <button class="cw-btn" type="button" data-speak-ja="${escapeHTML((kanjiData.kun_readings?.[0] || kanjiData.on_readings?.[0] || kanjiData.kanji).replace(/[.-]/g, ""))}" aria-label="Pronounce reading">▶</button>
            </div>

            <div style="font-size:13px;line-height:1.6">
              <div><strong>On’yomi (音読み):</strong> <span lang="ja">${escapeHTML((kanjiData.on_readings || []).join("、") || "Unlisted")}</span>
                ${state.settings.romanization && kanjiData.on_readings?.length ? ` (${escapeHTML(kanjiData.on_readings.map(romanizeKana).join(", "))})` : ""}
              </div>
              <div><strong>Kun’yomi (訓読み):</strong> <span lang="ja">${escapeHTML((kanjiData.kun_readings || []).join("、") || "Unlisted")}</span>
                ${state.settings.romanization && kanjiData.kun_readings?.length ? ` (${escapeHTML(kanjiData.kun_readings.map((r) => romanizeKana(r.replace(/[.-]/g, ""))).join(", "))})` : ""}
              </div>
            </div>

            <div style="margin-top:8px">
              <strong style="font-size:12px">Example words containing ${escapeHTML(kanjiData.kanji)}:</strong>
              ${kanjiData.examples?.length ? `
                <ul class="cw-compound-list">
                  ${kanjiData.examples.slice(0, 5).map((cw) => {
                    const wDisp = state.settings.furigana && hasKanji(cw.word) && cw.reading
                      ? alignFuriganaRuby(cw.word, cw.reading)
                      : escapeHTML(cw.word);
                    const rom = state.settings.romanization ? ` · ${escapeHTML(romanizeKana(cw.reading))}` : "";
                    return `<li><strong lang="ja">${wDisp}</strong> (${escapeHTML(cw.reading)}${rom}) — ${escapeHTML((cw.meanings || []).join("; "))}</li>`;
                  }).join("")}
                </ul>
              ` : `<div class="cw-no-compounds" style="font-size:12px;color:var(--muted);margin-top:4px">No compound examples listed.</div>`}
            </div>
          ` : `
            <div data-i18n style="color:var(--muted);padding:16px;text-align:center">
              ${kanjiChars.length ? "Loading kanji details…" : "This completed word is written in kana without kanji."}
            </div>
          `}
        </div>
      </div>
    `;
  mountSentenceExamples(document.getElementById("cwSentenceExamples"), word, examples.map((example) => ({
    ...example,
    id: example.tatoeba_id || example.id,
    japanese: example.ja || example.japanese,
    english: example.en || example.english,
    furigana: example.furigana,
    license: example.license || "CC BY 2.0 FR"
  })));
}
