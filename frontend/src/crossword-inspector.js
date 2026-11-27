import { hasKanji } from "./crossword-engine.js";
import { mountSentenceExamples } from "./examples.js";
import { alignFuriganaRuby } from "./furigana.js";
import { html, raw, setHTML } from "./html.js";
import { romanizeKana } from "./romanize.js";

export function renderStudyInspector(state) {
  const body = document.getElementById("studyInspectorBody");
  if (!state.puzzle) {
    setHTML(body, "");
    return;
  }

  if (state.roundEnded) {
    setHTML(
      body,
      html`<ul class="cw-review-list">${state.puzzle.entries.map((entry) => {
        const answered = entry.completed && !entry.revealed;
        const item = entry.item;
        const reading = item.furigana || item.word;
        const word = state.settings.furigana ? raw(alignFuriganaRuby(item.word, reading)) : item.word;
        return raw(html`<li class="cw-review-word ${answered ? "answered" : "unanswered"}" data-review-entry="${entry.id}">
          <div class="cw-review-heading"><strong lang="ja">${word}</strong><span data-i18n-scope>${answered ? "Answered" : entry.revealed ? "Revealed" : "Not answered"}</span></div>
          <p><span lang="ja">${reading}</span>${state.settings.romanization ? ` · ${romanizeKana(reading)}` : ""}</p>
          <p>${item.meaning}</p><button class="cw-btn" type="button" data-speak-ja="${reading}" aria-label="Pronounce ${item.word}" data-i18n-scope>▶</button>
        </li>`);
      })}</ul>`,
    );
    return;
  }

  const entry =
    state.puzzle.entries.find((e) => e.id === state.inspectedEntryId && e.completed) ||
    state.puzzle.entries.find((e) => e.completed);

  if (!entry) {
    setHTML(
      body,
      html`
        <div class="cw-word-card" data-i18n style="color:var(--muted);text-align:center;padding:22px">
          Complete any word in the crossword (or hover/tap a completed answer) to unlock its full vocabulary card, random example sentence, audio pronunciation, and individual kanji breakdown.
        </div>
      `,
    );
    return;
  }

  const item = entry.item;
  const word = item.word;
  const reading = item.furigana || word;
  const romaji = item.romaji || romanizeKana(reading);
  const examples = item.examples?.length
    ? item.examples
    : item.example
      ? [
          {
            ja: item.example,
            furigana: item.exampleFurigana,
            en: item.exampleMeaning,
            tatoeba_id: item.exampleSourceId,
          },
        ]
      : [];

  const wordDisplay =
    state.settings.furigana && hasKanji(word) && reading ? raw(alignFuriganaRuby(word, reading)) : word;

  const kanjiChars = [...new Set([...word].filter((ch) => hasKanji(ch)))];
  const activeKanji =
    state.inspectedKanjiChar && kanjiChars.includes(state.inspectedKanjiChar)
      ? state.inspectedKanjiChar
      : kanjiChars[0] || null;

  const kanjiData = activeKanji
    ? state.kanjiCache.get(activeKanji) || (item.kanjiDetails || []).find((k) => k.kanji === activeKanji)
    : null;

  setHTML(
    body,
    html`
      <div class="cw-study-grid">
        <div class="cw-word-card" id="completedWordCard">
          <div class="cw-word-head">
            <div>
              <div class="cw-word-title" lang="ja">${wordDisplay}</div>
              <div class="cw-word-reading">
                <span class="cw-reading-label" data-i18n-scope>Reading:</span> <strong lang="ja">${reading}</strong>
                ${state.settings.romanization ? raw(html` · <span>${romaji}</span>`) : ""}
                · <span class="cw-badge">JLPT N${item.level}</span>
              </div>
            </div>
            <button class="cw-btn" type="button" data-speak-ja="${reading}" aria-label="Pronounce word" data-i18n-scope>▶</button>
          </div>

          <div><strong data-i18n>Definition:</strong> ${item.meaning}</div>
          ${item.partOfSpeech ? raw(html`<div class="cw-part-of-speech" data-i18n-scope style="margin-top:4px;font-size:12px;color:var(--muted)">Part of speech: ${item.partOfSpeech}</div>`) : ""}

          <div class="cw-example-box"><strong data-i18n>Example sentences</strong><div id="cwSentenceExamples"></div></div>

          ${
            kanjiChars.length
              ? raw(html`
            <div style="margin-top:10px">
              <span class="cw-kanji-heading" data-i18n-scope style="font-size:11px;font-weight:700;color:var(--muted)">KANJI IN THIS WORD (Hover or tap to inspect):</span>
              <div class="cw-kanji-Chips">
                ${kanjiChars.map((ch) =>
                  raw(html`
                  <button class="cw-kanji-chip${ch === activeKanji ? " active" : ""}" type="button" data-inspect-kanji="${ch}" lang="ja">
                    ${ch}
                  </button>
                `),
                )}
              </div>
            </div>
          `)
              : ""
          }
        </div>

        <div class="cw-kanji-card" id="completedKanjiCard">
          ${
            kanjiData
              ? raw(html`
            <div class="cw-kanji-head">
              <div style="display:flex;align-items:center;gap:12px">
                <span class="cw-kanji-glyph" lang="ja">${kanjiData.kanji}</span>
                <div>
                  <div style="font-weight:800;font-size:15px">${(kanjiData.meanings || []).join(", ") || "Kanji"}</div>
                  <div style="font-size:12px;color:var(--muted)">
                    ${kanjiData.jlpt ? `JLPT N${kanjiData.jlpt}` : raw('<span class="cw-unrated" data-i18n-scope>Unrated</span>')}
                    ${kanjiData.stroke_count ? ` · ${kanjiData.stroke_count} strokes` : ""}
                  </div>
                </div>
              </div>
              <button class="cw-btn" type="button" data-speak-ja="${(kanjiData.kun_readings?.[0] || kanjiData.on_readings?.[0] || kanjiData.kanji).replace(/[.-]/g, "")}" aria-label="Pronounce reading" data-i18n-scope>▶</button>
            </div>

            <div style="font-size:13px;line-height:1.6">
              <div><strong data-i18n-scope>On’yomi (音読み):</strong> <span lang="ja">${(kanjiData.on_readings || []).join("、") || "Unlisted"}</span>
                ${state.settings.romanization && kanjiData.on_readings?.length ? ` (${kanjiData.on_readings.map(romanizeKana).join(", ")})` : ""}
              </div>
              <div><strong data-i18n-scope>Kun’yomi (訓読み):</strong> <span lang="ja">${(kanjiData.kun_readings || []).join("、") || "Unlisted"}</span>
                ${state.settings.romanization && kanjiData.kun_readings?.length ? ` (${kanjiData.kun_readings.map((r) => romanizeKana(r.replace(/[.-]/g, ""))).join(", ")})` : ""}
              </div>
            </div>

            <div style="margin-top:8px">
              <strong data-i18n-scope style="font-size:12px">Example words containing ${kanjiData.kanji}:</strong>
              ${
                kanjiData.examples?.length
                  ? raw(html`
                <ul class="cw-compound-list">
                  ${kanjiData.examples.slice(0, 5).map((cw) => {
                    const wDisp =
                      state.settings.furigana && hasKanji(cw.word) && cw.reading
                        ? raw(alignFuriganaRuby(cw.word, cw.reading))
                        : cw.word;
                    const rom = state.settings.romanization ? ` · ${romanizeKana(cw.reading)}` : "";
                    return raw(
                      html`<li><strong lang="ja">${wDisp}</strong> (${cw.reading}${rom}) — ${(cw.meanings || []).join("; ")}</li>`,
                    );
                  })}
                </ul>
              `)
                  : raw(
                      '<div class="cw-no-compounds" data-i18n-scope style="font-size:12px;color:var(--muted);margin-top:4px">No compound examples listed.</div>',
                    )
              }
            </div>
          `)
              : raw(html`
            <div data-i18n style="color:var(--muted);padding:16px;text-align:center">
              ${kanjiChars.length ? "Loading kanji details…" : "This completed word is written in kana without kanji."}
            </div>
          `)
          }
        </div>
      </div>
    `,
  );
  mountSentenceExamples(
    document.getElementById("cwSentenceExamples"),
    word,
    examples.map((example) => ({
      ...example,
      id: example.tatoeba_id || example.id,
      japanese: example.ja || example.japanese,
      english: example.en || example.english,
      furigana: example.furigana,
      license: example.license || "CC BY 2.0 FR",
    })),
  );
}
