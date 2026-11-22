import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer as createVite } from "vite";
import { chromium } from "playwright";

const vocabulary = [
  ["日本", "にほん"], ["本屋", "ほんや"], ["毎日", "まいにち"], ["休日", "きゅうじつ"],
  ["休む", "やすむ"], ["楽しむ", "たのしむ"], ["楽しい", "たのしい"], ["新しい", "あたらしい"],
  ["新年", "しんねん"], ["来年", "らいねん"], ["来る", "くる"], ["食べる", "たべる"],
  ["食べ物", "たべもの"], ["飲み物", "のみもの"], ["飲む", "のむ"], ["テーブル", "テーブル"],
  ["テープ", "テープ"], ["スープ", "スープ"], ["スプーン", "スプーン"], ["コート", "コート"],
  ["ノート", "ノート"], ["レコード", "レコード"]
].map(([word, reading], index) => ({
  id: `language-test-${index}`, word, reading, furigana: reading,
  meaning: "Practice", level: 5, partOfSpeech: "noun", source: "JMdict"
}));
const kanji = ["日", "本", "水", "火", "山", "川", "木", "月"].map((character, index) => ({
  kanji: character, meanings: ["Practice"],
  on_readings: [["ニチ", "ホン", "スイ", "カ", "サン", "セン", "モク", "ゲツ"][index]],
  kun_readings: [["ひ", "もと", "みず", "ひと", "やま", "かわ", "き", "つき"][index]],
  examples: []
}));

let vite, browser;
process.env.VITE_LANGUAGE_SELECTION = "true";
try {
  vite = await createVite({
    root: fileURLToPath(new URL("../frontend", import.meta.url)),
    server: { host: "127.0.0.1", port: 0, strictPort: false }
  });
  await vite.listen();
  const base = `http://127.0.0.1:${vite.httpServer.address().port}`;
  browser = await chromium.launch();
  const context = await browser.newContext({ locale: "es-ES", viewport: { width: 375, height: 800 } });
  await context.route("**/*", (route) => new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort());
  const page = await context.newPage();
  const trigger = page.locator(".study-language > summary");
  const option = (name) => page.locator(".study-language").getByRole("button", { name, exact: true });
  const chooseLanguage = async (name) => { await trigger.click(); await option(name).click(); };
  const checkDescriptions = async (container, expected) => {
    const descriptions = await page.locator(`${container} .helper-description`).allTextContents();
    assert.ok(descriptions.length > 0);
    for (const description of descriptions) assert.doesNotMatch(description.trim(), /^\(.*\)$/s);
    assert.equal(await page.locator(`${container} [data-file="kana.html"] .helper-description`).textContent(), expected);
  };

  await page.goto(`${base}/contact.html`);
  await trigger.waitFor();
  assert.equal(await page.getAttribute("html", "data-interface-language"), "es");
  assert.equal(await trigger.getAttribute("aria-label"), "Idioma de la interfaz: Español");
  assert.equal(await option("Español").isVisible(), false, "Flags are collapsed by default");
  await page.getByRole("heading", { name: "Ayúdanos a mejorar el aprendizaje" }).waitFor();
  assert.equal(await page.title(), "Contacto | NihongoToolkit");
  await checkDescriptions("#helperMenu", "Práctica de hiragana y katakana");
  await page.locator('#contactForm select[name="subject"]').selectOption("Feature Request");

  await trigger.press("Enter");
  assert.equal(await option("Español").getAttribute("aria-pressed"), "true", "Browser language is selected on first visit");
  const panel = await page.locator(".study-language-options").boundingBox();
  assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= 375, "The flag panel fits on a mobile viewport");
  await option("Português").press("Escape");
  assert.equal(await option("Português").isVisible(), false);
  assert.equal(await trigger.evaluate((node) => node === document.activeElement), true);

  await chooseLanguage("Português");
  assert.equal(await option("Português").isVisible(), false, "Picking a flag closes the panel");
  assert.equal(await trigger.getAttribute("aria-label"), "Idioma da interface: Português");
  await page.getByRole("heading", { name: "Ajude-nos a melhorar o aprendizado" }).waitFor();
  assert.equal(await page.title(), "Contato | NihongoToolkit");
  await checkDescriptions("#helperMenu", "Prática de hiragana e katakana");
  assert.equal(await page.locator('#contactForm select[name="subject"]').inputValue(), "Feature Request", "Translated labels do not change submitted values");
  assert.equal(await page.evaluate(() => localStorage.getItem("nihon:language-v1")), "pt", "Selection is saved");
  await page.reload();
  assert.equal(await trigger.getAttribute("aria-label"), "Idioma da interface: Português", "Selection survives reload");
  await page.goto(`${base}/`);
  assert.equal(await trigger.getAttribute("aria-label"), "Idioma da interface: Português", "Selection is shared with the dashboard");
  await checkDescriptions("#helperMenu", "Prática de hiragana e katakana");
  await checkDescriptions(".dashboard", "Prática de hiragana e katakana");
  await chooseLanguage("Español");
  await checkDescriptions("#helperMenu", "Práctica de hiragana y katakana");
  await checkDescriptions(".dashboard", "Práctica de hiragana y katakana");
  await chooseLanguage("Português");
  await trigger.click();
  await page.locator(".study-palette > summary").click();
  assert.equal(await option("Português").isVisible(), false, "Opening the palette dismisses the flag panel");

  const otherPage = await context.newPage();
  await otherPage.goto(`${base}/contact.html`);
  await chooseLanguage("English");
  await checkDescriptions("#helperMenu", "Hiragana and katakana practice");
  await checkDescriptions(".dashboard", "Hiragana and katakana practice");
  const otherTrigger = otherPage.locator('.study-language > summary[aria-label="Interface language: English"]');
  await otherTrigger.waitFor();
  assert.equal(await otherPage.title(), "Contact | NihongoToolkit", "Tab titles synchronize and return to their source language");

  await page.goto(`${base}/kana.html`);
  assert.equal(await page.title(), "Hiragana and Katakana Practice | NihongoToolkit");
  assert.equal(await page.locator(".study-header-description").textContent(), "Hiragana and katakana practice");
  await page.locator("#startSessionButton").click();
  await page.locator("#answerInput").fill("draft");
  const glyph = await page.locator("#glyph").textContent();
  await page.evaluate(() => {
    const example = document.createElement("p");
    example.id = "dictionary-example";
    example.textContent = "Practice";
    document.getElementById("questionSection").append(example);
  });
  await chooseLanguage("Español");
  assert.equal(await page.title(), "Práctica de hiragana y katakana | NihongoToolkit");
  assert.equal(await page.locator(".study-header-description").textContent(), "Práctica de hiragana y katakana");
  assert.equal(await page.locator("#answerInput").inputValue(), "draft", "Switching language preserves an active answer");
  assert.equal(await page.locator("#glyph").textContent(), glyph, "Switching language preserves the active question");
  assert.equal(await page.locator("#dictionary-example").textContent(), "Practice", "Study data is not translated even when it matches UI copy");
  assert.equal(await page.locator("#checkButton").textContent(), "Comprobar");
  assert.equal(await page.locator("#promptText").textContent(), "Escribe la lectura en romaji");
  await page.locator("#checkButton").click();
  const feedback = await page.locator("#incorrectCaption").textContent();
  assert.match(feedback, /^Respuesta: .+ · Pulsa Enter para continuar$/, "Dynamic answer feedback is localized");
  const answer = feedback.match(/^Respuesta: (.+) · Pulsa Enter para continuar$/)[1];
  await chooseLanguage("Português");
  assert.equal(await page.title(), "Prática de hiragana e katakana | NihongoToolkit");
  assert.equal(await page.locator(".study-header-description").textContent(), "Prática de hiragana e katakana");
  assert.equal(await page.locator("#incorrectCaption").textContent(), `Resposta: ${answer} · Pressione Enter para continuar`, "Language switching preserves the displayed answer");

  await page.locator("#stopSessionButton").click();
  await page.getByText("Sessão encerrada.", { exact: true }).waitFor();
  assert.equal(await page.locator("#sessionResults .missed-terms li").count(), 1, "Session review keeps its missed study item");
  await chooseLanguage("Español");
  await page.getByText("Sesión detenida.", { exact: true }).waitFor();
  assert.equal(await page.locator("#sessionResults .missed-terms li").count(), 1, "Switching language preserves review data");

  await page.evaluate(() => localStorage.setItem("kotoba-history-v1", JSON.stringify([{ query: "Practice", kanji: false }])));
  let wordRequests = 0;
  await page.route(/\/api\/words\?/, (route) => {
    wordRequests++;
    return route.fulfill({ json: { data: [{
      japanese: [{ word: "練習", reading: "れんしゅう" }],
      senses: [
        { english_definitions: ["Practice"], translations: { es: { definitions: ["Práctica"], machine: true } } },
        { english_definitions: ["Search"] }
      ],
      examples: [{ id: 7, japanese: "練習する。", english: "Practice", translationId: 8, translationOwner: "en-owner",
        translations_by_language: { es: { text: "Practicar.", machine: false, translationId: 9, translationOwner: "es-owner" } } }]
    }] } });
  });
  await page.goto(`${base}/kotoba.html`);
  assert.equal(await page.locator("#historyList .history-query").textContent(), "Practice", "Saved searches are not translated");
  await page.locator("#query").fill("練習");
  await page.locator("#searchButton").click();
  await page.locator(".result-card").waitFor();
  await page.getByText("Frases de ejemplo", { exact: true }).waitFor();
  const definitions = page.locator(".result-card .localized-definitions");
  const sentenceTranslation = page.locator(".sentence-translation [data-i18n-study]");
  assert.deepEqual(await definitions.locator("li").allTextContents(), ["Práctica", "Search"], "Definitions follow the interface language");
  assert.deepEqual(await definitions.locator("li").evaluateAll((items) => items.map((item) => item.lang)), ["es", "en"]);
  assert.equal(await definitions.locator(".translation-note").textContent(), "Traducción automática · Parcialmente en inglés (sin traducción)");
  assert.equal(await sentenceTranslation.textContent(), "Practicar.", "Example translations follow the interface language");
  assert.equal(await page.locator(".sentence-translation .translation-note").count(), 0, "Human translations are not labeled as machine output");
  assert.match(await page.locator(".sentence-translation-credit a.sentence-credit").getAttribute("href"), /\/9$/, "The shown translation is credited");
  await chooseLanguage("Português");
  await page.getByText("Frases de exemplo", { exact: true }).waitFor();
  assert.deepEqual(await definitions.locator("li").allTextContents(), ["Practice", "Search"], "Untranslated definitions fall back to English");
  assert.equal(await definitions.locator(".translation-note").textContent(), "Em inglês (sem tradução)");
  assert.equal(await sentenceTranslation.textContent(), "Practice");
  assert.equal(await sentenceTranslation.getAttribute("lang"), "en");
  assert.equal(await page.locator(".sentence-translation .translation-note").textContent(), "Em inglês (sem tradução)");
  assert.equal(await page.locator("#historyList .history-query").first().textContent(), "練習");
  assert.equal(await page.locator("#historyList .history-query").nth(1).textContent(), "Practice");
  await chooseLanguage("English");
  assert.deepEqual(await definitions.locator("li").allTextContents(), ["Practice", "Search"]);
  assert.equal(await definitions.locator(".translation-note").count(), 0, "English needs no translation labels");
  assert.match(await page.locator(".sentence-translation-credit a.sentence-credit").getAttribute("href"), /\/8$/);
  assert.equal(wordRequests, 1, "Switching languages re-renders definitions without a new lookup");
  await chooseLanguage("Português");
  await page.unroute(/\/api\/words\?/);

  const kanjiDetailRoute = /\/api\/kanji\/[^/?]+(?:\?.*)?$/;
  let kanjiDetailRequests = 0;
  await page.route(kanjiDetailRoute, (route) => {
    kanjiDetailRequests++;
    return route.fulfill({ json: { ...kanji[0], meanings_by_language: { es: ["día"] } } });
  });
  const compoundsRoute = /\/api\/kanji\/[^/?]+\/words(?:\?.*)?$/;
  await page.route(compoundsRoute, (route) => route.fulfill({ json: { items: [] } }));
  const meanings = page.locator("#kanjiMeanings [data-i18n-study]");
  assert.equal(await page.locator("#kanjiMeaningLanguage").count(), 0, "Kanji meanings have no separate language selector");
  await page.locator("#kanjiMode").check();
  await page.locator("#query").fill("日");
  await page.locator("#searchButton").click();
  await page.getByText("Em inglês (sem tradução)", { exact: true }).waitFor();
  assert.equal(await meanings.getAttribute("lang"), "en", "Missing Portuguese meanings fall back to English");
  assert.equal(await meanings.textContent(), "Practice");
  await chooseLanguage("Español");
  await meanings.filter({ hasText: "día" }).waitFor();
  assert.equal(await meanings.getAttribute("lang"), "es", "Kanji meanings follow the interface language");
  assert.equal(await page.locator("#kanjiMeanings").getByText("En inglés (sin traducción)").count(), 0);
  await chooseLanguage("English");
  await meanings.filter({ hasText: "Practice" }).waitFor();
  assert.equal(kanjiDetailRequests, 1, "Switching languages does not repeat a dictionary lookup");
  await chooseLanguage("Español");
  await page.reload();
  await page.locator("#query").fill("日");
  await page.locator("#searchButton").click();
  await meanings.filter({ hasText: "día" }).waitFor();
  await page.unroute(kanjiDetailRoute);

  await page.evaluate(async ({ legacyKanji }) => {
    const { API_BASE } = await import("/src/api.js");
    const key = `kotoba-sqlite-cache-v10:${API_BASE}`;
    const cache = JSON.parse(localStorage.getItem(key) || "{}");
    for (const [character, value] of Object.entries(legacyKanji)) {
      cache[`kanji:${character}`] = { savedAt: Date.now(), value };
      cache[`compounds:${character}`] = { savedAt: Date.now(), value: [] };
    }
    localStorage.setItem(key, JSON.stringify(cache));
  }, { legacyKanji: { "本": kanji[1], "水": kanji[2] } });
  await page.reload();
  await page.route(kanjiDetailRoute, (route) => route.fulfill({ status: 404 }));
  await page.locator("#query").fill("水");
  await page.locator("#searchButton").click();
  await page.locator(".error-state").waitFor();
  assert.equal(await page.locator(".kanji-card").count(), 0, "A not-found response does not use stale data");
  await page.unroute(kanjiDetailRoute);

  await page.route(kanjiDetailRoute, (route) => route.fulfill({ status: 503 }));
  await page.locator("#query").fill("本");
  await page.locator("#searchButton").click();
  await meanings.filter({ hasText: "Practice" }).waitFor();
  assert.equal(await meanings.getAttribute("lang"), "en");
  await page.getByText("En inglés (sin traducción)", { exact: true }).waitFor();
  await page.getByText("Datos de kanji guardados; vuelve a conectarte para cargar los significados traducidos.", { exact: true }).waitFor();
  await page.unroute(kanjiDetailRoute);

  await page.route(kanjiDetailRoute, (route) => route.fulfill({
    json: { ...kanji[1], meanings_by_language: { es: ["libro"] } }
  }));
  await page.waitForFunction(() => !document.querySelector("#searchButton").disabled);
  await page.locator("#searchButton").click();
  await meanings.filter({ hasText: "libro" }).waitFor();
  assert.equal(await meanings.getAttribute("lang"), "es", "A later online search refreshes legacy data");
  await page.unroute(kanjiDetailRoute);

  await page.evaluate(() => {
    window.testOriginalFetch = window.fetch;
    window.fetch = (url, options) => {
      if (new URL(url, location.href).pathname === `/api/kanji/${encodeURIComponent("水")}`) {
        window.testKanjiFetchStarted = true;
        return new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => {
            window.testKanjiFetchAborted = true;
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      }
      return window.testOriginalFetch(url, options);
    };
  });
  await page.waitForFunction(() => !document.querySelector("#searchButton").disabled);
  await page.locator("#query").fill("水");
  await page.locator("#searchButton").click();
  await page.waitForFunction(() => window.testKanjiFetchStarted);
  await page.locator("#clearButton").click();
  await page.waitForFunction(() => window.testKanjiFetchAborted);
  assert.equal(await page.locator(".kanji-card, .error-state").count(), 0, "An aborted lookup does not display cached data or an error");
  await page.evaluate(() => { window.fetch = window.testOriginalFetch; });
  await page.unroute(compoundsRoute);
  await chooseLanguage("Português");

  for (const [file, selector, expected] of [
    ["katsuyo-renshuu.html", "#setup h2", "Sua prática, no seu ritmo"],
    ["eawase.html", "#startButton", "Começar a combinar →"],
    ["pazuru.html", ".cw-intro h1", "Cruze caminhos com palavras japonesas."],
    ["kanji-kuizu.html", "#reviewList", "Lista de revisão (0)"]
  ]) {
    await page.goto(`${base}/${file}`);
    await page.locator(selector).filter({ hasText: expected }).waitFor();
    const directText = await page.locator(selector).evaluate((element) =>
      [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join("").trim());
    assert.equal(directText, expected);
  }
  await page.goto(`${base}/katsuyo-renshuu.html`);
  assert.equal(await page.locator("#quickSettings .study-pills").getAttribute("aria-label"), "Modo de prática", "Mode group has a localized accessible label");

  await page.goto(`${base}/eawase.html`);
  const classic = page.locator('#settingsForm .chip-option[data-value="classic"]');
  await classic.scrollIntoViewIfNeeded();
  await classic.hover();
  await page.getByRole("tooltip").filter({ hasText: "Encontre todos os pares no seu ritmo." }).waitFor();
  await chooseLanguage("Español");
  await classic.scrollIntoViewIfNeeded();
  await classic.hover();
  await page.getByRole("tooltip").filter({ hasText: "Encuentra todas las parejas a tu ritmo." }).waitFor();

  await page.evaluate(async () => {
    const label = document.createElement("label");
    label.id = "languageChipFixture";
    label.setAttribute("data-i18n-scope", "");
    label.innerHTML = 'Practice mode<select id="languageFixtureSelect"><option value="classic">Classic</option><option value="relaxed">Relaxed</option></select>';
    document.body.append(label);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { mountChips } = await import("/src/chips.js");
    mountChips(document.getElementById("languageFixtureSelect"));
  });
  await page.locator("#languageChipFixture .chip-label").filter({ hasText: "Clásico" }).waitFor();
  await chooseLanguage("Português");
  await page.locator("#languageChipFixture .chip-label").filter({ hasText: "Clássico" }).waitFor();
  await chooseLanguage("English");
  await page.locator("#languageChipFixture .chip-label").filter({ hasText: "Classic" }).waitFor();

  await page.route(/\/api\/(?:word-search\/vocabulary|words\/batch|shiritori\/words)\?/, (route) => route.fulfill({ json: { items: vocabulary } }));
  await page.route(/\/api\/kanji\/batch\?/, (route) => route.fulfill({ json: { items: kanji } }));
  await page.route(/\/api\/sentences\?/, (route) => route.fulfill({ json: { data: [] } }));
  await page.route(/\/api\/kanji\/(?!batch(?:\?|$))[^/?]+(?:\/words)?(?:\?|$)/, (route) =>
    route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/words") ? { items: [] } : kanji[0] }));
  await page.route(/\/api\/conjugation-practice(?:\?|$)/, (route) => route.fulfill({ json: {
    entries: [["食べる", "たべる"], ["見る", "みる"], ["起きる", "おきる"], ["寝る", "ねる"]]
      .map(([word, reading], id) => ({ id, word, reading, type: "ichidan", tag: "v1", level: 5, meanings: ["Practice"] }))
  } }));

  await chooseLanguage("Español");
  await page.goto(`${base}/eawase.html`);
  await page.getByText("Parejas personalizadas", { exact: true }).waitFor();
  await page.locator("#setting-content").selectOption("kana", { force: true });
  await page.locator("#startButton").click();
  await page.locator("#board [data-card]").first().waitFor();
  await page.locator("#stats").getByText("Movimientos", { exact: true }).waitFor();
  assert.equal(await page.locator("#roundLabel").textContent(), "Silabarios");
  assert.equal(await page.locator("#streak").textContent(), "0 tableros completados");
  assert.match(await page.locator("#board [data-card]").first().getAttribute("aria-label"), /^Carta \d+: boca abajo$/);
  await chooseLanguage("Português");
  await page.locator("#stats").getByText("Movimentos", { exact: true }).waitFor();
  assert.match(await page.locator("#board [data-card]").first().getAttribute("aria-label"), /^Carta \d+: virada para baixo$/);
  await page.waitForFunction(() => !document.getElementById("startButton").disabled);
  await page.locator("#revealButton").click();
  await page.locator("#feedback").filter({ hasText: "Par revelado:" }).waitFor();
  await page.locator("#endButton").click();
  await page.locator(".study-confirm-dialog").getByRole("button", { name: "Salvar e continuar" }).click();
  await page.locator("#results").getByText("Cada tentativa é prática").waitFor();

  await chooseLanguage("Español");
  await page.goto(`${base}/kotoba-sagashi.html`);
  await page.locator("#startButton").click();
  await page.locator("#grid [data-cell]").first().waitFor();
  await page.waitForFunction(() => !document.getElementById("startButton").disabled);
  assert.equal(await page.locator("#directionLabel").textContent(), "Las ocho direcciones");
  assert.match(await page.locator("#grid [data-cell]").first().getAttribute("aria-label"), /^Fila 1, columna 1: /);
  await page.locator("#progressText").filter({ hasText: "0 de 8 palabras encontradas" }).waitFor();
  await page.locator("#hintType").selectOption("meaning");
  await page.locator("#hintButton").click();
  await page.locator("#selectionStatus").filter({ hasText: "Pista para la palabra 1: Practice" }).waitFor();
  assert.equal(await page.locator("#selectionStatus > span").first().getAttribute("lang"), "es");
  assert.equal(await page.locator("#selectionStatus [data-i18n-study]").textContent(), "Practice", "Meaning hints remain in English even when they match interface copy");
  await chooseLanguage("Português");
  await page.locator("#selectionStatus").filter({ hasText: "Dica para a palavra 1: Practice" }).waitFor();
  assert.equal(await page.locator("#selectionStatus [data-i18n-study]").textContent(), "Practice");
  await chooseLanguage("Español");
  await page.locator("#revealButton").click();
  await page.locator("#wordList .word-status").filter({ hasText: "Revelada · guardada para repasar" }).waitFor();
  assert.equal(await page.locator("#wordDetails > p:not(.small):not(.detail-reading)").textContent(), "Practice", "Word-search definitions remain in English");
  await chooseLanguage("Português");
  await page.locator("#progressText").filter({ hasText: "1 de 8 palavras encontradas" }).waitFor();
  assert.equal(await page.locator("#wordDetails > p:not(.small):not(.detail-reading)").textContent(), "Practice");
  await page.locator("#exportPuzzle").click();
  await page.locator(".game-export-dialog").getByText("Incluir respostas", { exact: true }).waitFor();
  assert.equal(await page.locator(".game-export-preview").getAttribute("alt"), "Prévia da exportação");
  await page.keyboard.press("Escape");
  await page.locator("#endButton").click();
  await page.locator(".study-confirm-dialog").getByRole("button", { name: "Salvar e continuar" }).click();
  await page.locator("#results").getByText("Cada tentativa é prática").waitFor();

  await chooseLanguage("Español");
  await page.goto(`${base}/pazuru.html`);
  assert.equal(await page.locator("#newPuzzleBtn").textContent(), "Nuevo crucigrama");
  await page.locator("#newPuzzleBtn").click();
  await page.locator("#crosswordGrid .cw-cell:not(.block)").first().click();
  await page.locator(".cw-popover-length-label").filter({ hasText: "Longitud:" }).waitFor();
  assert.match(await page.locator("#crosswordGrid .cw-cell:not(.block)").first().getAttribute("aria-label"), /^Fila \d+, columna \d+/);
  await page.locator("#revealWordBtn").click();
  await page.locator("#completedWordCard").waitFor();
  assert.equal(await page.locator("#completedWordCard > div").filter({ hasText: "Practice" }).last().textContent(), "Definición: Practice", "Crossword definitions remain in English");
  await chooseLanguage("Português");
  await page.locator("#completedWordCard .cw-reading-label").filter({ hasText: "Leitura:" }).waitFor();
  assert.equal(await page.locator("#completedWordCard > div").filter({ hasText: "Practice" }).last().textContent(), "Definição: Practice");

  await chooseLanguage("Español");
  await page.goto(`${base}/shiritori.html`);
  assert.equal(await page.locator("#newGame").textContent(), "Empezar partida →");
  await page.locator("#newGame").click();
  await page.waitForFunction(() => !document.getElementById("wordInput").disabled);
  await page.locator("#newGame").filter({ hasText: "Nueva partida →" }).waitFor({ state: "attached" });
  await page.locator("#turnLabel").filter({ hasText: "Tu turno" }).waitFor();
  assert.match(await page.locator("#scores .score-row").first().textContent(), /→ Tú/);
  await page.locator("#hintButton").click();
  await page.locator("#hintPanel").filter({ hasText: "Primer kana:" }).waitFor();
  assert.equal(await page.locator("#detailBody > p").first().textContent(), "Practice", "Shiritori meanings remain in English");
  await chooseLanguage("Português");
  assert.equal(await page.locator("#newGame").textContent(), "Novo jogo →");
  await page.locator("#hintPanel").filter({ hasText: "Primeiro kana:" }).waitFor();
  assert.equal(await page.locator("#detailBody > p").first().textContent(), "Practice");
  await page.locator("#stopGame").click();
  await page.locator("#results").getByText("Uma cadeia para lembrar").waitFor();

  await chooseLanguage("Español");
  await page.goto(`${base}/kanji-kuizu.html`);
  await page.evaluate(() => {
    const variants = document.getElementById("variants");
    variants.value = "kanji-reading";
    variants.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#start").click();
  await page.locator("#choices [data-choice]").first().waitFor();
  await page.locator("#promptLabel").filter({ hasText: "Selecciona todas las lecturas" }).waitFor();
  await page.locator("#reveal").click();
  const choiceStatus = page.locator(".choice-result").first();
  await choiceStatus.filter({ hasText: "Correcta, no seleccionada" }).waitFor();
  assert.equal(await choiceStatus.getAttribute("lang"), "es", "Localized choice feedback declares its language");
  assert.equal(await page.locator(".imposters-feedback-item > p").last().textContent(), "Practice", "Quiz meanings remain in English");
  await chooseLanguage("Português");
  assert.equal(await choiceStatus.textContent(), "Correta, não selecionada");
  assert.equal(await choiceStatus.getAttribute("lang"), "pt");
  assert.equal(await page.locator(".imposters-feedback-item > p").last().textContent(), "Practice");
  await page.locator("#stop").click();
  await page.locator("#results > h2").filter({ hasText: "Resultados da sessão" }).waitFor();
  assert.match(await page.locator("#results > p").first().textContent(), /^Corretas: 0 · Erros: 1 · Acertos: 0%$/);
  assert.match(await page.locator("#results li").first().textContent(), /Practice/, "Review definitions remain unchanged");

  await chooseLanguage("Español");
  await page.goto(`${base}/goi.html`);
  await page.locator("#startButton").click();
  await page.locator("#questionContent").waitFor();
  await page.locator(".review-option").filter({ hasText: "Mostrar ejemplo y definición" }).waitFor();
  assert.equal(await page.locator('label[for="answerInput"]').textContent(), "Escribe la palabra japonesa");

  await page.goto(`${base}/katsuyo-renshuu.html`);
  await page.getByText("Verbos ru", { exact: true }).waitFor();
  await page.locator("#startButton").click();
  await page.locator("#practice:visible").waitFor();
  await page.locator("#answerLabel").filter({ hasText: "答え · Tu respuesta" }).waitFor();
  assert.match(await page.locator("#inputHelp").textContent(), /^Escribe japonés o romaji/);
  assert.equal(await page.locator(".meaning-hint").textContent(), "Practice", "Conjugation meanings remain in English");
  await chooseLanguage("Português");
  assert.equal(await page.locator("#answerLabel").textContent(), "答え · Sua resposta");
  assert.equal(await page.locator(".meaning-hint").textContent(), "Practice");

  await page.route(/\/api\/kanji\/batch\?/, (route) => route.fulfill({ status: 503, json: { error: "Unavailable" } }));
  await chooseLanguage("Español");
  await page.goto(`${base}/kanji-kuizu.html`);
  await page.locator("#start").click();
  await page.locator("#error").filter({ hasText: "No se pudieron cargar los kanji. Vuelve a intentarlo." }).waitFor();
  await chooseLanguage("Português");
  await page.locator("#error").filter({ hasText: "Não foi possível carregar os kanji. Tente novamente." }).waitFor();

  await page.route(/\/api\/word-search\/vocabulary\?/, (route) => route.fulfill({ status: 503, json: { error: "Backend unavailable" } }));
  await page.goto(`${base}/kotoba-sagashi.html`);
  await page.locator("#startButton").click();
  await page.locator("#toolbarError").filter({ hasText: "Não foi possível carregar o próximo conjunto de exercícios" }).waitFor();

  await page.route(/\/api\/kanji\?/, (route) => route.fulfill({ json: { items: [kanji[0]] } }));
  await page.evaluate(() => localStorage.removeItem("nihon:kanji-atlas:history"));
  await chooseLanguage("Español");
  await page.goto(`${base}/kanji-chizucho.html`);
  await page.locator("#historyList .history-empty").filter({ hasText: "Los kanji consultados aparecerán aquí." }).waitFor();
  await page.locator("#query").fill("Practice");
  await page.locator("#searchButton").click();
  await page.locator("#results .result-heading").filter({ hasText: "Coincidencias para “Practice”" }).waitFor();
  assert.equal(await page.locator("#results .result-meaning").textContent(), "Practice", "Atlas search meanings remain in English");
  assert.equal(await page.locator("#results [data-kanji]").getAttribute("aria-label"), "Ver 日, Practice");
  await page.locator("#results [data-kanji]").click();
  await page.locator("#detail .data-label").filter({ hasText: "Número de trazos" }).waitFor();
  assert.equal(await page.locator("#detail .meanings").textContent(), "Practice");
  assert.equal(await page.locator("#strokeOrderButton").getAttribute("aria-label"), "Mostrar el orden de trazos de 日");
  assert.equal(await page.locator("#detail .stroke-caption").textContent(), "Haz clic para ver el orden de trazos");
  await chooseLanguage("Português");
  await page.locator("#detail .data-label").filter({ hasText: "Número de traços" }).waitFor();
  assert.equal(await page.locator("#detail .meanings").textContent(), "Practice");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("kanji-network", { detail: { online: false, cached: true } })));
  await page.locator("#notice").filter({ hasText: "Sem conexão: exibindo dados salvos." }).waitFor();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("kanji-network", { detail: { online: true } })));
  assert.equal(await page.locator("#notice").textContent(), "", "Reconnecting clears the translated offline notice");

  const analysisToken = {
    text: "練習", type: "word", reading: "れんしゅう", base: "練習",
    result: { id: 1, jlpt: ["jlpt-n5"], japanese: [{ word: "練習", reading: "れんしゅう" }], senses: [{ english_definitions: ["Practice"] }] }
  };
  await page.route(/\/api\/analyze\?/, (route) => route.fulfill({ json: {
    tokens: [analysisToken], translation: "Practice", kanji: [{ character: "練", jlpt: 5 }]
  } }));
  await chooseLanguage("Español");
  await page.goto(`${base}/fumitoki.html`);
  await page.locator("#parsedText .empty").filter({ hasText: "Tu frase analizada aparecerá aquí." }).waitFor();
  assert.equal(await page.locator("#parsedText .empty").getAttribute("lang"), "es", "Interface copy inside Japanese content declares its own language");
  await page.locator("#translationToggle").check({ force: true });
  await page.locator("#sourceText").fill("練習");
  await page.locator("#parseButton").click();
  await page.locator("#status").filter({ hasText: "Se analizó 1 palabra." }).waitFor();
  assert.equal(await page.locator("#tokenCount").textContent(), "1 palabra");
  assert.equal(await page.locator("#parsedText .token").getAttribute("title"), "Buscar 練習");
  assert.equal(await page.locator(".analysis-stats h3").first().textContent(), "1 palabra distinta");
  assert.equal(await page.locator(".analysis-stats section").first().getAttribute("aria-label"), "Distribución JLPT de palabras distintas");
  assert.equal(await page.locator("#translationText").textContent(), "Practice", "Sentence translations remain unchanged even when they match interface copy");
  await page.locator("#parsedText .token").click();
  await page.locator("#detailContent .section-label").filter({ hasText: "Frases de ejemplo" }).waitFor();
  assert.equal(await page.locator("#detailContent .meanings li").textContent(), "Practice");
  await chooseLanguage("Português");
  assert.equal(await page.locator("#tokenCount").textContent(), "1 palavra");
  assert.equal(await page.locator(".analysis-stats h3").first().textContent(), "1 palavra distinta");
  assert.equal(await page.locator("#translationText").textContent(), "Practice");
  assert.equal(await page.locator("#detailContent .meanings li").textContent(), "Practice");

  await page.route(/\/api\/analyze\?/, (route) => route.fulfill({ json: { tokens: [analysisToken], kanji: [] } }));
  await page.waitForFunction(() => !document.getElementById("parseButton").disabled);
  await page.locator("#sourceText").fill("日本");
  await page.locator("#parseButton").click();
  await page.locator("#translationText").filter({ hasText: "Não há tradução disponível para esta frase." }).waitFor();
  await chooseLanguage("Español");
  await page.locator("#translationText").filter({ hasText: "No hay traducción disponible para esta frase." }).waitFor();
  await chooseLanguage("English");
  assert.equal(await page.locator("#translationText").textContent(), "Translation unavailable for this sentence.");
  await chooseLanguage("Español");
  await page.route(/\/api\/analyze\?/, (route) => route.fulfill({ status: 503, json: { error: "Backend unavailable" } }));
  await page.waitForFunction(() => !document.getElementById("parseButton").disabled);
  await page.locator("#parseButton").click();
  await page.locator("#status").filter({ hasText: "No se pudo analizar la frase." }).waitFor();

  await page.route(/\/api\/conjugator\?/, (route) => route.fulfill({ json: { items: [{
    word: "食べる", reading: "たべる", type: "ichidan", tag: "v1", level: 5, meanings: ["Practice"]
  }] } }));
  await page.goto(`${base}/katsuyo.html`);
  await page.locator("#wordInput").fill("たべる");
  await page.locator("#searchForm button[type=submit]").click();
  await page.locator("#tables [data-form=basic-plain] th").filter({ hasText: "No pasado afirmativo" }).waitFor();
  assert.equal(await page.locator("#wordSummary [data-i18n-study]").textContent(), "Practice");
  assert.equal(await page.locator("#formCount").textContent().then((text) => text.startsWith("Se muestran ")), true);
  assert.equal(await page.locator("#tables [data-form=basic-plain] [data-copy]").getAttribute("aria-label"), "Copiar No pasado afirmativo informal");
  assert.match(await page.locator("#tables [data-form=basic-plain] .form-note p").textContent(), /keep the dictionary form/, "Grammar study notes remain unchanged");
  await page.locator("#wordInfo > summary").click();
  assert.equal(await page.locator("#wordInfoContent > p").nth(1).textContent(), "Significados: Practice");
  await chooseLanguage("Português");
  await page.locator("#tables [data-form=basic-plain] th").filter({ hasText: "Não passado afirmativo" }).waitFor();
  assert.equal(await page.locator("#wordSummary [data-i18n-study]").textContent(), "Practice");
  assert.match(await page.locator("#tables [data-form=basic-plain] .form-note p").textContent(), /keep the dictionary form/);
  await chooseLanguage("English");
  await page.locator("#tables [data-form=basic-plain] th").filter({ hasText: "Non-past affirmative" }).waitFor();
  assert.equal(await page.locator("#wordSummary [data-i18n-study]").textContent(), "Practice");

  await page.route(/\/api\/words\/batch\?/, (route) => route.fulfill({ status: 503, json: { error: "Backend unavailable" } }));
  await chooseLanguage("Español");
  await page.goto(`${base}/goi.html`);
  await page.locator("#startButton").click();
  await page.locator("#warning").filter({ hasText: "No se pudieron cargar las palabras de vocabulario" }).waitFor();
  assert.match(await page.locator("#warning").textContent(), /No se pudo cargar el siguiente grupo de ejercicios/);
  await chooseLanguage("Português");
  await page.locator("#warning").filter({ hasText: "Não foi possível carregar as palavras de vocabulário" }).waitFor();

  await chooseLanguage("Português");
  await page.goto(`${base}/shiryo.html`);
  await page.getByRole("heading", { name: "Folhas de referência para imprimir" }).waitFor();
  await page.locator('[data-sheet="particles"]').click();
  await page.locator("#sheetTitle").filter({ hasText: "Partículas japonesas" }).waitFor();
  assert.equal(await page.locator('[data-format="png"] strong').textContent(), "Imagem PNG");
  await page.locator('[data-sheet="worksheet"]').click();
  await chooseLanguage("Español");
  await page.locator('[data-sheet="kana"]').click();
  const note = page.locator('[data-format="png"] small');
  await note.filter({ hasText: "Imagen nítida, 1985 × 2808 px" }).waitFor();
  const sheet = await page.locator("#sheetPreview").innerHTML();
  await chooseLanguage("English");
  await note.filter({ hasText: "Sharp image, 1985 × 2808 px" }).waitFor();
  assert.equal(await page.locator("#sheetPreview").innerHTML(), sheet, "Changing interface language does not alter the study sheet");

  await chooseLanguage("Español");
  await page.goto(`${base}/kanji/`);
  await page.getByRole("heading", { name: "Catálogo de kanji japoneses" }).waitFor();
  await page.goto(`${base}/kanji-of-the-day`);
  await page.getByRole("heading", { name: "Kanji de hoy" }).waitFor();
  const dailyMeaning = await page.locator(".daily-meanings").textContent();
  await chooseLanguage("Português");
  await page.getByRole("heading", { name: "Kanji de hoje" }).waitFor();
  assert.equal(await page.locator(".daily-meanings").textContent(), dailyMeaning, "Daily kanji meanings remain in English");
  assert.match(await page.locator(".daily-kanji time").textContent(), / de /, "Daily date uses the interface language");
  await page.goto(`${base}/embed/kanji-of-the-day`);
  await page.getByRole("heading", { name: "Kanji do dia" }).waitFor();
  assert.equal(await page.locator(".daily-meanings").textContent(), dailyMeaning, "Embedded kanji meanings remain unchanged");
  await context.close();
} finally {
  await browser?.close();
  await vite?.close();
}

console.log("Language preference browser tests passed.");
