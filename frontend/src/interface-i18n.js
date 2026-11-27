import { navigationPage } from "./routes.js";

const languageSelectionEnabled = typeof import.meta.env !== "undefined" && import.meta.env.VITE_LANGUAGE_SELECTION === "true";
let interfaceMessages = Object.create(null);
let messagesLoaded = false;
let messagesPromise = null;

export function loadInterfaceMessages() {
  if (!languageSelectionEnabled) return Promise.resolve(interfaceMessages);
  if (messagesLoaded) return Promise.resolve(interfaceMessages);
  if (!messagesPromise) {
    messagesPromise = import("./interface-messages.js").then((mod) => {
      interfaceMessages = mod.interfaceMessages || Object.create(null);
      messagesLoaded = true;
      return interfaceMessages;
    }).catch((error) => {
      messagesPromise = null;
      console.warn("Could not load interface translations.", error);
      return interfaceMessages;
    });
  }
  return messagesPromise;
}

const commonScopes = [
  ".navigation", ".dashboard", ".intro", ".cw-intro", ".brand-name", ".cw-brand-name",
  ".study-palette", ".study-theme", ".study-toolbar", ".study-support",
  ".study-help-dialog", ".study-setting-tooltip", ".study-confirm-dialog",
  ".game-export-open", ".game-export-dialog",
  "details#settingsPanel", "details#settingsDrawer", "#settings",
  ".session-stats", ".replay-actions", ".sentence-actions", ".sentence-status",
  ".sentence-results:not(:has(.sentence-list))", ".request-loading-status", ".start-error",
  ".translation-note", "footer", "[data-i18n-scope]", "[data-i18n]"
];
const attributeScopes = [
  ".brand", ".cw-brand", ".quiz-card", ".history-panel", ".main-column",
  ".search-panel", "#results", "#suggestions", "#choices", ".study-audio", ".kanji-tap",
  ".board-panel", ".board-card", ".board-scroll", "#board", "#grid", "#progress",
  "[data-card]", "[data-cell]", "#sessionProgress", "#answerOptions",
  ".cw-status-bar", ".cw-board-panel", ".cw-grid", ".cw-cell", ".cw-cell-input", ".cw-clues-panel",
  "#studyInspector", "#gridCluePopover", ".cw-clue-inline-input", "#detailBody [data-kanji]",
  "#wordDetails [data-kanji]", "#chain [data-word-index]", "#results [data-kanji]",
  "#historyList [data-kanji]", "#detail [data-kanji]", "#strokeOrderButton",
  "#strokeOrderButton svg[role=img]", "#parsedText .token", "#detailPanel", "#closePanel",
  "#result", "#tables [data-copy]", "#savedWords [data-remove]", "[data-i18n-attr]"
].join(", ");
const controlScopes = [
  "startButton", "startSessionButton", "stopSessionButton", "checkButton", "nextButton",
  "showButton", "skipButton", "hintButton", "revealButton", "endButton", "restartButton",
  "retryButton", "newPuzzleBtn", "newGame", "reviewButton", "exportReview", "importReview", "resetProgress",
  "searchButton", "parseButton", "correctCaption", "startError", "apiWarning", "settingsStorageError"
].map((id) => `#${id}`);
const practiceScopes = [
  "#questionCount", "#promptText", "#answerForm", "#sessionStatus"
];
const pageScopes = {
  "kana.html": practiceScopes,
  "imi.html": practiceScopes,
  "yomi.html": practiceScopes,
  "goi.html": [
    "#questionLabel", "#prompt", "#answerInput", "#incorrectCaption", "#warning", "#status",
    ".review-option", "label[for=answerInput]",
    "#resultsPanel > h2", "#resultsSummary", ".result-metrics", "#failedTerms > h3", "#failedTerms > p"
  ],
  "kotoba.html": [
    ".search-wrap", "#resultLabel", "#clearButton", "#results > .empty-state",
    ".history-heading", "#historyList > .history-empty", "#results .section-label",
    "#results .example-empty", "#results .common-badge", "#results .kanji-meta", "#results .compound-options"
  ],
  "kanji-chizucho.html": [
    "#searchForm", "#searchHint", "#historyTitle", "#clearHistory", "#historyList > .history-empty",
    "#loading", "#notice", "#results .result-heading", "#detail .data-label",
    "#detail .radical-note", "#detail .stroke-caption", "#detail .hero-info .tag",
    "#detail .hero-info a", "#copyKanji"
  ],
  "katsuyo.html": [
    "#searchForm", "#manualPanel", "#emptyState > h2", "#emptyState > p",
    "details.panel > summary", "#history > p.muted", "#savedWords > p.muted",
    "#clearHistory", "#exportWords", "label.file-button", "#status",
    "#saveWord", "#copyTable", "#exportConjugations", "#wordInfo > summary",
    "#wordInfoContent > p > strong", "#wordInfoContent > h3", "#wordInfoContent > p.muted",
    "#wordInfoContent .kanji-list > .muted",
    "#formCount", "#tables .table-panel > h3", "#tables thead th", "#tables tbody th",
    "#tables .form-tools > button[data-copy]", "#tables .form-note > summary",
    "#tables [data-example]", "#tables .form-examples:not(:has(.sentence-list))",
    "#tables > .panel:not(.table-panel)"
  ],
  "katsuyo-renshuu.html": [
    "#setup", "#practice > .session-bar", "#answerLabel", "#inputHelp",
    "#answerNotice", ".practice-shortcut", "#hintText", "#feedback", "#notice",
    "#questionBody .badge", "#resultContent .result-stats", "#resultContent > h3",
    "#resultContent > p.muted", "#ruleCard > summary",
    "#kanjiDialog form", "#kanjiContent h3", "#kanjiContent strong", "#kanjiContent:not(:has(*))",
    "#results > .eyebrow", "#resultsTitle", ".progress-panel > .eyebrow", ".progress-panel > h3",
    ".progress-panel > details > summary", "#lifetime", "#weakForms > .muted",
    "#missedWords > .empty-message", ".quiet-panel", "#resetButton"
  ],
  "fumitoki.html": [
    ".input-panel", "#status", "#copyButton", "#parsedTitle", "#translationLabel",
    "#parsedText .empty", "#translationText", ".analysis-stats", "#lookupForm",
    "#detailContent .small-note", "#detailContent .section-label", "#detailContent .loading",
    "#detailContent .audio-link", "#detailContent .jisho-link", ".history-title", "#historyList > .muted"
  ],
  "kanji-kuizu.html": [
    "#start", "#reviewList", "#error", "#game > label", "#game .imposters-actions",
    "#game .imposters-status", "#promptLabel", "#promptAudio", "#choices .choice-result",
    "#feedback > strong", "#results > h2", "#results > p", "#results li > button"
  ],
  "pazuru.html": [
    ".cw-top-card", ".cw-empty", ".cw-status-bar", "#flipDirBtn", "#feedbackBanner",
    ".cw-clue-group > h2", ".cw-clue-state",
    ".cw-clue-entry-box", "#activeClueBadge", "#activeClueSub",
    ".cw-popover-meta .cw-active-clue-id", ".cw-popover-meta .cw-badge",
    ".cw-popover-top-btns", ".cw-popover-clue > strong", ".cw-popover-length-row",
    ".cw-popover-btn-bar", ".cw-popover-error", ".cw-square-draft", ".cw-study-header",
    ".cw-reading-label", ".cw-part-of-speech", ".cw-kanji-heading",
    "#completedWordCard button[data-speak-ja]", "#completedKanjiCard strong:not([lang=ja])",
    "#completedKanjiCard .cw-kanji-head > button",
    ".cw-unrated", ".cw-no-compounds",
    ".cw-review-heading > span", ".cw-review-word > button", "#puzzleResults > h2", "#puzzleResults > p"
  ],
  "shiryo.html": ["#sheetPicker", ".download-panel"],
  "contact.html": ["#contactForm", "#contactSuccess"],
  "data-sources.html": ["body > h1", "body > p", "body > ul"],
  "eawase.html": [
    ".panel-heading", ".board-heading", ".progress-row", "#emptyBoard", "#feedback", "#notice",
    ".board-actions", "#keyboardHelp", "#challengeInfo", "#stats", "#streak", ".credits",
    "#board .card-caption", ".sidebar > section > h2", "#matches > p", "#details > p.small",
    "#details dt", "#details > h3", "#details #saveItem",
    "#results > .eyebrow", "#results > h2", "#results > p", "#results > button",
    "#reviewDialog .dialog-head", "#reviewDialog .dialog-body > p", "#reviewDialog .actions",
    "#reviewNotice", "#reviewList > p", "#reviewList [data-remove]"
  ],
  "kotoba-sagashi.html": [
    ".toolbar", ".card-heading", ".board-heading", ".progress-row", "#listNote", "#emptyBoard",
    "#selectionStatus", "#notice", ".board-bottom", "#selectionHelp", ".source-note",
    "#wordList .word-status", ".notebook-empty", "#wordDetails > p.small", "#wordDetails > h3",
    "#wordDetails > button", "#kanjiDialog .dialog-head", "#kanjiContent h3", "#kanjiContent strong:not([lang=ja])",
    "#kanjiContent:not(:has(*))", "#kanjiPreview:not(:has(*))", "#kanjiPreview h3",
    "#results > .eyebrow", "#results > h2", "#results .result-stats", "#results > p > strong",
    "#results > p.small", "#results > button",
    "#reviewDialog .dialog-head", "#reviewDialog .dialog-body > p", "#reviewDialog .actions",
    "#reviewNotice", "#reviewList > p", "#reviewList [data-remove]"
  ],
  "shiritori.html": [
    ".toolbar", ".turn-strip", ".prompt .eyebrow", "#wordForm",
    "#previousReading", "#feedback", "#hintPanel", "#choices > p", ".card-heading", "#chainEmpty",
    ".chain-meta", "#scores > .score-row > span", "#scores .score-row .small", "#stats", "#bonusLabel", ".rule-note", "#helpDialog",
    "#detailBody:not(:has(*))",
    "#detailBody #saveWord", "#detailBody a", "#results > .eyebrow", "#results > h2",
    "#results > h3", "#results > p", "#reviewDialog .dialog-head", "#reviewBody > p",
    "#reviewBody [data-remove-review]", "#kanjiDialog .dialog-head", "#kanjiBody h3",
    "#kanjiBody:not(:has(*))"
  ],
  "kanji/": [
    ".study-intro", ".catalogue-controls", "#catalogue-list > details > summary",
    "main > p", "article h2", "article dt", "article .tool-links", ".daily-kanji h2",
    ".daily-entry-link", ".daily-credits", ".daily-embed-controls"
  ],
  "kanji-of-the-day.html": [".study-intro", ".daily-kanji h2", ".daily-entry-link", ".daily-credits", ".daily-embed-controls"]
};
const attributes = ["aria-label", "placeholder", "title", "alt", "data-setting-description", "data-study-help"];
const textSources = new WeakMap();
const attributeSources = new WeakMap();
const originalLanguages = new WeakMap();
let initialized = false;

export function interfaceSourceText(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const previous = textSources.get(node);
    return previous && previous.rendered === node.data ? previous.source : node.data;
  }
  return [...node.childNodes].map(interfaceSourceText).join("");
}

export function interfaceSourceAttribute(element, name) {
  const value = element.getAttribute(name);
  const previous = attributeSources.get(element)?.get(name);
  return previous && previous.rendered === value ? previous.source : value;
}

function currentLanguage() {
  return document.documentElement.dataset.interfaceLanguage || "en";
}

export function translateInterface(source, language = currentLanguage()) {
  if (language !== "es" && language !== "pt") return source;
  const es = language === "es";
  const entry = interfaceMessages[source];
  if (entry) return entry[es ? 0 : 1];
  const eligible = source.match(/^(\d+) eligible · (\d+) in this session$/);
  if (eligible) return es ? `${eligible[1]} disponibles · ${eligible[2]} en esta sesión` : `${eligible[1]} disponíveis · ${eligible[2]} nesta sessão`;
  const editorialRound = source.match(/^Round (\d+) of (\d+)$/);
  if (editorialRound) return `${es ? "Ronda" : "Rodada"} ${editorialRound[1]} de ${editorialRound[2]}`;
  const pageTitle = source.match(/^(.+) \| NihongoToolkit$/);
  if (pageTitle) {
    const title = translateInterface(pageTitle[1], language);
    if (title !== pageTitle[1]) return `${title} | NihongoToolkit`;
  }
  const parenthesized = source.match(/^\((.+)\)$/s);
  if (parenthesized && interfaceMessages[parenthesized[1]]) return `(${translateInterface(parenthesized[1], language)})`;
  const about = source.match(/^About (Kana|Imi|Yomi|Goi|Kotoba|Fumitoki|Kanji Chizuchō|Kanji Kuizu|Katsuyō|Katsuyō Renshuū|Eawase|Kotoba Sagashi|Pazuru|Shiryō)$/);
  if (about) return `${language === "es" ? "Acerca de" : "Sobre"} ${about[1]}`;
  const home = source.match(/^(Kana|Imi|Yomi) at NihongoToolkit home$/);
  if (home) return es ? `${home[1]} en la página principal de NihongoToolkit` : `${home[1]} na página inicial do NihongoToolkit`;
  const question = source.match(/^Question (\d+)$/);
  if (question) return `${language === "es" ? "Pregunta" : "Questão"} ${question[1]}`;
  const answer = source.match(/^(Answer|Not quite): (.+) · Enter to continue$/s);
  if (answer) {
    const label = answer[1] === "Answer" ? (es ? "Respuesta" : "Resposta") : (es ? "No exactamente" : "Não foi dessa vez");
    return `${label}: ${answer[2]} · ${es ? "Pulsa Enter para continuar" : "Pressione Enter para continuar"}`;
  }
  const simpleAnswer = source.match(/^Answer: (.+)$/s);
  if (simpleAnswer) return `${es ? "Respuesta" : "Resposta"}: ${simpleAnswer[1]}`;
  const questionProgress = source.match(/^Question (\d+)( · Review)?( \/ \d+)?$/);
  if (questionProgress) return `${es ? "Pregunta" : "Questão"} ${questionProgress[1]}${questionProgress[2] ? ` · ${es ? "Repaso" : "Revisão"}` : ""}${questionProgress[3] || ""}`;
  const count = source.match(/^([\d,]+) (match(?:es)?|characters|word|words|seconds)$/);
  if (count) {
    const labels = es
      ? { match: "coincidencia", matches: "coincidencias", characters: "caracteres", word: "palabra", words: "palabras", seconds: "segundos" }
      : { match: "resultado", matches: "resultados", characters: "caracteres", word: "palavra", words: "palavras", seconds: "segundos" };
    return `${count[1]} ${labels[count[2]]}`;
  }
  const review = source.match(/^Review list \((\d+)\)$/);
  if (review) return `${es ? "Lista de repaso" : "Lista de revisão"} (${review[1]})`;
  const group = source.match(/^(No JLPT estimate|No dictionary radical) \(([\d,]+)\)$/);
  if (group) return `${translateInterface(group[1], language)} (${group[2]})`;
  const strokes = source.match(/^(\d+) strokes? \(([\d,]+)\)$/);
  if (strokes) return `${strokes[1]} ${es ? "trazo" : "traço"}${strokes[1] === "1" ? "" : "s"} (${strokes[2]})`;
  const lifetime = source.match(/^(\d+) completed sessions · (\d+)% unassisted accuracy$/);
  if (lifetime) return es
    ? `${lifetime[1]} sesiones completadas · ${lifetime[2]}% de aciertos sin ayuda`
    : `${lifetime[1]} sessões concluídas · ${lifetime[2]}% de acertos sem ajuda`;
  const found = source.match(/^(\d+) of (\d+) (pairs|words) found(?: · (\d+) lives)?$/);
  if (found) {
    const unit = found[3] === "pairs" ? (es ? "parejas" : "pares") : (es ? "palabras" : "palavras");
    const lives = found[4] ? ` · ${found[4]} vidas` : "";
    const ending = !es && found[3] === "pairs" ? "encontrados" : "encontradas";
    return `${found[1]} de ${found[2]} ${unit} ${ending}${lives}`;
  }
  const left = source.match(/^(Hint|Reveal answer|Reveal Answer) · (\d+) left$/);
  if (left) return `${translateInterface(left[1], language)} · ${left[2]} restantes`;
  const score = source.match(/^(\d+) \/ (\d+) correct · (.+) accuracy( · \d+ skipped)? · (.+) total$/);
  if (score) {
    const skipped = score[4] ? score[4].replace("skipped", es ? "omitidas" : "puladas") : "";
    return es
      ? `${score[1]} / ${score[2]} correctas · ${score[3]} de aciertos${skipped} · ${score[5]} en total`
      : `${score[1]} / ${score[2]} corretas · ${score[3]} de acertos${skipped} · ${score[5]} no total`;
  }
  const sessionComplete = source.match(/^Session complete · (\d+) answered$/);
  if (sessionComplete) return es ? `Sesión completada · ${sessionComplete[1]} respondidas` : `Sessão concluída · ${sessionComplete[1]} respondidas`;
  const sessionQuestions = source.match(/^(\d+) \/ (\d+) questions$/);
  if (sessionQuestions) return `${sessionQuestions[1]} / ${sessionQuestions[2]} ${es ? "preguntas" : "questões"}`;
  const remaining = source.match(/^(\d+:\d{2}) remaining$/);
  if (remaining) return `${remaining[1]} ${es ? "restantes" : "restantes"}`;
  const image = source.match(/^Sharp image, ([\d,]+ × [\d,]+) px$/);
  if (image) return `${es ? "Imagen nítida" : "Imagem nítida"}, ${image[1]} px`;
  const print = source.match(/^(A4|US Letter|US Legal) (portrait|landscape) \(image based\)$/);
  if (print) return `${print[1]} ${translateInterface(print[2] === "portrait" ? "Portrait" : "Landscape", language).toLowerCase()} ${es ? "(basado en imagen)" : "(baseado em imagem)"}`;
  const selfContained = source.match(/^Self-contained page, prints on (A4|US Letter|US Legal)$/);
  if (selfContained) return es ? `Página independiente, se imprime en ${selfContained[1]}` : `Página independente, imprime em ${selfContained[1]}`;
  const assistanceCount = source.match(/^(✧ Hint|Reveal word) \((\d+)\)$/);
  if (assistanceCount) return `${translateInterface(assistanceCount[1], language)} (${assistanceCount[2]})`;
  const timer = source.match(/^(\d+:\d{2}) (left|elapsed)$/);
  if (timer) return `${timer[1]} ${timer[2] === "left" ? "restantes" : es ? "transcurridos" : "decorridos"}`;
  const pairsReady = source.match(/^(\d+) pairs, ready when you are\.$/);
  if (pairsReady) return es ? `${pairsReady[1]} parejas, listas cuando quieras.` : `${pairsReady[1]} pares, prontos quando quiser.`;
  const pairRevealed = source.match(/^Pair revealed: (.+)\. Saved for review; no points awarded\.$/s);
  if (pairRevealed) return es
    ? `Pareja revelada: ${pairRevealed[1]}. Guardada para repasar; no se otorgan puntos.`
    : `Par revelado: ${pairRevealed[1]}. Salvo para revisão; nenhum ponto concedido.`;
  const connection = source.match(/^A connection made! (.+)$/s);
  if (connection) return `${es ? "¡Pareja encontrada!" : "Par encontrado!"} ${connection[1]}`;
  const different = source.match(/^Different items: (.+)\. Try again\.$/s);
  if (different) return `${es ? "Elementos diferentes" : "Itens diferentes"}: ${different[1]}. ${es ? "Inténtalo de nuevo." : "Tente novamente."}`;
  const outlined = source.match(/^Outlined pair: (.+)$/s);
  if (outlined) return `${es ? "Pareja resaltada" : "Par destacado"}: ${outlined[1]}`;
  const memoryResults = source.match(/^(\d+) \/ (\d+) pairs · (\d+) moves · (\d+) flips · (\d+) mismatches$/);
  if (memoryResults) return es
    ? `${memoryResults[1]} / ${memoryResults[2]} parejas · ${memoryResults[3]} movimientos · ${memoryResults[4]} volteos · ${memoryResults[5]} errores`
    : `${memoryResults[1]} / ${memoryResults[2]} pares · ${memoryResults[3]} movimentos · ${memoryResults[4]} viradas · ${memoryResults[5]} erros`;
  const memoryAccuracy = source.match(/^(\d+:\d{2}) elapsed · (\d+)% unassisted accuracy · (\d+) hints · (\d+) reveals$/);
  if (memoryAccuracy) return es
    ? `${memoryAccuracy[1]} transcurridos · ${memoryAccuracy[2]}% de aciertos sin ayuda · ${memoryAccuracy[3]} pistas · ${memoryAccuracy[4]} respuestas reveladas`
    : `${memoryAccuracy[1]} decorridos · ${memoryAccuracy[2]}% de acertos sem ajuda · ${memoryAccuracy[3]} dicas · ${memoryAccuracy[4]} respostas reveladas`;
  const quizResults = source.match(/^Correct: (\d+) · Mistakes: (\d+) · Accuracy: (\d+)%(?: · Score: (\d+))?$/);
  if (quizResults) return es
    ? `Correctas: ${quizResults[1]} · Errores: ${quizResults[2]} · Aciertos: ${quizResults[3]}%${quizResults[4] ? ` · Puntuación: ${quizResults[4]}` : ""}`
    : `Corretas: ${quizResults[1]} · Erros: ${quizResults[2]} · Acertos: ${quizResults[3]}%${quizResults[4] ? ` · Pontuação: ${quizResults[4]}` : ""}`;
  const quizScore = source.match(/^Score (\d+) · Combo (\d+)$/);
  if (quizScore) return `${es ? "Puntuación" : "Pontuação"} ${quizScore[1]} · ${es ? "Racha" : "Sequência"} ${quizScore[2]}`;
  const opening = source.match(/^Your opening word is (.+) \((.+)\)\. Continue with (.+)\.$/s);
  if (opening) return es ? `Tu palabra inicial es ${opening[1]} (${opening[2]}). Continúa con ${opening[3]}.`
    : `Sua palavra inicial é ${opening[1]} (${opening[2]}). Continue com ${opening[3]}.`;
  const beginnerHint = source.match(/^Beginner hint · (.+)$/s);
  if (beginnerHint) return `${es ? "Pista de principiante" : "Dica de iniciante"} · ${translateInterface(beginnerHint[1], language)}`;
  const firstKana = source.match(/^First kana: (.+)$/s);
  if (firstKana) return `${es ? "Primer kana" : "Primeiro kana"}: ${firstKana[1]}`;
  const hiddenReading = source.match(/^Hidden reading: (.+)$/s);
  if (hiddenReading) return `${es ? "Lectura oculta" : "Leitura oculta"}: ${hiddenReading[1]}`;
  const possibleMorae = source.match(/^A possible word has (\d+) morae\.$/);
  if (possibleMorae) return es ? `Una palabra posible tiene ${possibleMorae[1]} moras.` : `Uma palavra possível tem ${possibleMorae[1]} moras.`;
  const morae = source.match(/^(\d+) morae$/);
  if (morae) return `${morae[1]} moras`;
  const assisted = source.match(/^(.+) · This question will count as assisted\.$/s);
  if (assisted) return es
    ? `${translateInterface(assisted[1], language)} · Esta pregunta contará como respondida con ayuda.`
    : `${translateInterface(assisted[1], language)} · Esta questão contará como respondida com ajuda.`;
  const questionTotal = source.match(/^(\d+) questions counted\. Repeated review questions do not count toward the session total\.$/);
  if (questionTotal) return es
    ? `${questionTotal[1]} preguntas contabilizadas. Las preguntas de repaso repetidas no cuentan para el total de la sesión.`
    : `${questionTotal[1]} questões contabilizadas. Questões de revisão repetidas não contam para o total da sessão.`;
  const modeAndPlayers = source.match(/^(.+) · (vs\. computer|solo practice|(\d+) local players)$/);
  if (modeAndPlayers) {
    const players = modeAndPlayers[2] === "vs. computer" ? (es ? "contra el ordenador" : "contra o computador")
      : modeAndPlayers[2] === "solo practice" ? (es ? "práctica individual" : "prática individual")
        : `${modeAndPlayers[3]} ${es ? "jugadores locales" : "jogadores locais"}`;
    return `${translateInterface(modeAndPlayers[1], language)} · ${players}`;
  }
  const playerTurn = source.match(/^Player (\d+)(?:’s turn|'s turn)(.*)$/);
  if (playerTurn) return `${es ? "Turno del jugador" : "Vez do jogador"} ${playerTurn[1]}${playerTurn[2]}`;
  const player = source.match(/^Player (\d+)$/);
  if (player) return `${es ? "Jugador" : "Jogador"} ${player[1]}`;
  const activePlayer = source.match(/^→ (You|Computer|Player \d+)$/);
  if (activePlayer) return `→ ${translateInterface(activePlayer[1], language)}`;
  const boardsCompleted = source.match(/^(\d+) boards completed$/);
  if (boardsCompleted) return `${boardsCompleted[1]} ${es ? "tablero" : "tabuleiro"}${boardsCompleted[1] === "1" ? "" : "s"} ${es ? "completado" : "concluído"}${boardsCompleted[1] === "1" ? "" : "s"}`;
  const vocabularyLevel = source.match(/^(N[1-5]) vocabulary$/);
  if (vocabularyLevel) return `${es ? "Vocabulario" : "Vocabulário"} ${vocabularyLevel[1]}`;
  const memoryBoard = source.match(/^(Kana|JLPT N[1-5–]+) · (.+)$/);
  if (memoryBoard) {
    const description = translateInterface(memoryBoard[2], language);
    if (description !== memoryBoard[2]) return `${memoryBoard[1]} · ${description}`;
  }
  const bonusKana = source.match(/^Bonus kana: (.+) · include it for \+15 points$/);
  if (bonusKana) return es ? `Kana extra: ${bonusKana[1]} · inclúyelo para ganar +15 puntos`
    : `Kana bônus: ${bonusKana[1]} · inclua-o para ganhar +15 pontos`;
  const bonusScores = source.match(/^N5 → 10 pts · N1 → 50 pts( · extra overlap \+5)?$/);
  if (bonusScores) return `N5 → 10 ${es ? "puntos" : "pontos"} · N1 → 50 ${es ? "puntos" : "pontos"}${bonusScores[1] ? ` · ${es ? "coincidencia extra" : "correspondência extra"} +5` : ""}`;
  const chainStats = source.match(/^(\d+) words played · (\d+) unique words · longest chain (\d+)$/);
  if (chainStats) return es ? `${chainStats[1]} palabras jugadas · ${chainStats[2]} palabras distintas · cadena más larga ${chainStats[3]}`
    : `${chainStats[1]} palavras jogadas · ${chainStats[2]} palavras distintas · maior cadeia ${chainStats[3]}`;
  const chainAssists = source.match(/^(\d+) hints · (\d+) reveals$/);
  if (chainAssists) return `${chainAssists[1]} ${es ? "pistas" : "dicas"} · ${chainAssists[2]} ${es ? "respuestas reveladas" : "respostas reveladas"}`;
  const startingKana = source.match(/^Starting kana to practice: (.+)$/s);
  if (startingKana) return `${es ? "Kana iniciales para practicar" : "Kana iniciais para praticar"}: ${startingKana[1]}`;
  const foundWord = source.match(/^(Found|Revealed): (.+)$/s);
  if (foundWord) return `${foundWord[1] === "Found" ? (es ? "Encontrada" : "Encontrada") : (es ? "Revelada" : "Revelada")}: ${foundWord[2]}`;
  const hintWord = source.match(/^Hint for word (\d+):$/);
  if (hintWord) return `${es ? "Pista para la palabra" : "Dica para a palavra"} ${hintWord[1]}:`;
  const startsWith = source.match(/^starts with (.+)$/s);
  if (startsWith) return `${es ? "empieza por" : "começa com"} ${startsWith[1]}`;
  const hintDirection = source.match(/^runs (right →|left ←|down ↓|up ↑|down-right ↘|down-left ↙|up-right ↗|up-left ↖)$/);
  if (hintDirection) {
    const directions = es
      ? { "right →": "a la derecha →", "left ←": "a la izquierda ←", "down ↓": "hacia abajo ↓", "up ↑": "hacia arriba ↑", "down-right ↘": "abajo a la derecha ↘", "down-left ↙": "abajo a la izquierda ↙", "up-right ↗": "arriba a la derecha ↗", "up-left ↖": "arriba a la izquierda ↖" }
      : { "right →": "para a direita →", "left ←": "para a esquerda ←", "down ↓": "para baixo ↓", "up ↑": "para cima ↑", "down-right ↘": "para baixo à direita ↘", "down-left ↙": "para baixo à esquerda ↙", "up-right ↗": "para cima à direita ↗", "up-left ↖": "para cima à esquerda ↖" };
    return `${es ? "va" : "segue"} ${directions[hintDirection[1]]}`;
  }
  const puzzleTitle = source.match(/^(\d+ × \d+) · (All levels|N[\d–N]+) · (Mixed script|Kana|Kanji)$/);
  if (puzzleTitle) return `${puzzleTitle[1]} · ${translateInterface(puzzleTitle[2], language)} · ${translateInterface(puzzleTitle[3], language)}`;
  const crosswordLength = source.match(/^Length: (\d+)(?: \((\d+) empty\)| · (✓ Completed|Type directly in squares))?$/);
  if (crosswordLength) {
    const extra = crosswordLength[2] ? ` (${crosswordLength[2]} ${es ? "vacías" : "vazias"})`
      : crosswordLength[3] ? ` · ${crosswordLength[3] === "✓ Completed" ? (es ? "✓ Completada" : "✓ Concluída") : (es ? "Escribe directamente en las casillas" : "Digite diretamente nas casas")}` : "";
    return `${es ? "Longitud" : "Comprimento"}: ${crosswordLength[1]}${extra}`;
  }
  const clueDetails = source.match(/^Length: (\d+)( · .+)$/s);
  if (clueDetails) return `${es ? "Longitud" : "Comprimento"}: ${clueDetails[1]}${clueDetails[2]}`;
  const clueDirection = source.match(/^(\d+) (Across|Down) · (ヨコ|タテ)$/);
  if (clueDirection) return `${clueDirection[1]} ${clueDirection[2] === "Across" ? "Horizontal" : "Vertical"} · ${clueDirection[3]}`;
  const partOfSpeech = source.match(/^Part of speech: (.+)$/s);
  if (partOfSpeech) return `${translateInterface("Part of speech", language)}: ${partOfSpeech[1]}`;
  const exampleWords = source.match(/^Example words containing (.+):$/);
  if (exampleWords) return es ? `Palabras de ejemplo con ${exampleWords[1]}:` : `Palavras de exemplo com ${exampleWords[1]}:`;
  const cell = source.match(/^Row (\d+), column (\d+): (.+)$/s);
  if (cell) return es ? `Fila ${cell[1]}, columna ${cell[2]}: ${cell[3]}` : `Linha ${cell[1]}, coluna ${cell[2]}: ${cell[3]}`;
  const crosswordCell = source.match(/^Row (\d+), Column (\d+)(?:, Clue (\d+))?, (.+)$/s);
  if (crosswordCell) {
    const value = crosswordCell[4] === "empty" ? (es ? "vacía" : "vazia") : crosswordCell[4];
    return `${es ? "Fila" : "Linha"} ${crosswordCell[1]}, ${es ? "columna" : "coluna"} ${crosswordCell[2]}${crosswordCell[3] ? `, ${es ? "pista" : "dica"} ${crosswordCell[3]}` : ""}, ${value}`;
  }
  const crosswordAnswer = source.match(/^(Type answer|Answer) for (\d+) (across|down)(; crossing character is locked)?$/);
  if (crosswordAnswer) {
    const action = crosswordAnswer[1] === "Type answer" ? (es ? "Escribe la respuesta" : "Digite a resposta") : (es ? "Respuesta" : "Resposta");
    const direction = crosswordAnswer[3] === "across" ? "horizontal" : "vertical";
    return `${action} ${crosswordAnswer[2]} ${direction}${crosswordAnswer[4] ? (es ? "; el carácter de cruce está bloqueado" : "; o caractere do cruzamento está bloqueado") : ""}`;
  }
  const crosswordInput = source.match(/^Type character for Row (\d+), Column (\d+)$/);
  if (crosswordInput) return es ? `Escribe el carácter de la fila ${crosswordInput[1]}, columna ${crosswordInput[2]}`
    : `Digite o caractere da linha ${crosswordInput[1]}, coluna ${crosswordInput[2]}`;
  const answerPlaceholder = source.match(/^Answer \((\d+)\)…$/);
  if (answerPlaceholder) return `${es ? "Respuesta" : "Resposta"} (${answerPlaceholder[1]})…`;
  const pronounce = source.match(/^Pronounce (.+)$/s);
  if (pronounce) return `${es ? "Pronunciar" : "Pronunciar"} ${pronounce[1]}`;
  const removeReview = source.match(/^Remove (.+) from review$/s);
  if (removeReview) return es ? `Eliminar ${removeReview[1]} del repaso` : `Remover ${removeReview[1]} da revisão`;
  const exploreKanji = source.match(/^Explore kanji (.+)$/s);
  if (exploreKanji) return `${es ? "Explorar kanji" : "Explorar kanji"} ${exploreKanji[1]}`;
  const kanjiInformation = source.match(/^Kanji information: (.+)$/s);
  if (kanjiInformation) return `${es ? "Información del kanji" : "Informações do kanji"}: ${kanjiInformation[1]}`;
  const loadKanjiError = source.match(/^We couldn’t load kanji questions right now \((.+)\)\. Please try again in a moment\.$/s);
  if (loadKanjiError) {
    const detail = translateInterface(loadKanjiError[1], language);
    return es ? `No se pudieron cargar las preguntas de kanji (${detail}). Vuelve a intentarlo en unos instantes.`
      : `Não foi possível carregar as questões de kanji (${detail}). Tente novamente em instantes.`;
  }
  const practiceError = source.match(/^Could not start dictionary practice: (.+)$/s);
  if (practiceError) return `${es ? "No se pudo iniciar la práctica con el diccionario" : "Não foi possível iniciar a prática com o dicionário"}: ${translateInterface(practiceError[1], language)}`;
  const vocabularyError = source.match(/^We couldn’t load vocabulary words right now \((.+)\)\. Please try again in a moment\.$/s);
  if (vocabularyError) {
    const detail = translateInterface(vocabularyError[1], language);
    return es ? `No se pudieron cargar las palabras de vocabulario (${detail}). Vuelve a intentarlo en unos instantes.`
      : `Não foi possível carregar as palavras de vocabulário (${detail}). Tente novamente em instantes.`;
  }
  const atlasHeading = source.match(/^(N[1-5]) kanji$/);
  if (atlasHeading) return `Kanji ${atlasHeading[1]}`;
  const atlasMatches = source.match(/^Matches for “(.+)”$/s);
  if (atlasMatches) return es ? `Coincidencias para “${atlasMatches[1]}”` : `Resultados para “${atlasMatches[1]}”`;
  const atlasCount = source.match(/^(\d+) found(?: · showing (\d+))?$/);
  if (atlasCount) return es
    ? `${atlasCount[1]} encontrados${atlasCount[2] ? ` · mostrando ${atlasCount[2]}` : ""}`
    : `${atlasCount[1]} encontrados${atlasCount[2] ? ` · mostrando ${atlasCount[2]}` : ""}`;
  const atlasSearch = source.match(/^No kanji were found for (.+)\.$/s);
  if (atlasSearch) return es ? `No se encontraron kanji para ${atlasSearch[1]}.` : `Nenhum kanji encontrado para ${atlasSearch[1]}.`;
  const atlasNoMatch = source.match(/^No kanji matched “(.+)”\. Try a broader English keyword\.$/s);
  if (atlasNoMatch) return es
    ? `Ningún kanji coincide con “${atlasNoMatch[1]}”. Prueba con una palabra clave más amplia en inglés.`
    : `Nenhum kanji corresponde a “${atlasNoMatch[1]}”. Experimente uma palavra-chave mais ampla em inglês.`;
  const atlasDetails = source.match(/^We couldn’t (find|load) details for “(.+?)”(?: right now)?\. (Try searching for another character|Please check your connection and try again)\.$/s);
  if (atlasDetails) {
    const action = atlasDetails[1] === "find" ? (es ? "encontrar" : "encontrar") : (es ? "cargar" : "carregar");
    const advice = atlasDetails[3].startsWith("Try")
      ? (es ? "Prueba a buscar otro carácter." : "Tente pesquisar outro caractere.")
      : (es ? "Comprueba tu conexión y vuelve a intentarlo." : "Verifique sua conexão e tente novamente.");
    return `${es ? "No se pudieron" : "Não foi possível"} ${action} ${es ? "los detalles" : "os detalhes"} de “${atlasDetails[2]}”. ${advice}`;
  }
  const atlasAction = source.match(/^(View|Inspect|Show stroke order for|Stroke order for|Look up|Particle ·) (.+)$/s);
  if (atlasAction) {
    const labels = es
      ? { View: "Ver", Inspect: "Examinar", "Show stroke order for": "Mostrar el orden de trazos de", "Stroke order for": "Orden de trazos de", "Look up": "Buscar", "Particle ·": "Partícula ·" }
      : { View: "Ver", Inspect: "Examinar", "Show stroke order for": "Mostrar a ordem dos traços de", "Stroke order for": "Ordem dos traços de", "Look up": "Pesquisar", "Particle ·": "Partícula ·" };
    return `${labels[atlasAction[1]]} ${atlasAction[2]}`;
  }
  const lookupKanji = source.match(/^Looking up (.+)…$/s);
  if (lookupKanji) return `${es ? "Buscando" : "Pesquisando"} ${lookupKanji[1]}…`;
  const schoolGrade = source.match(/^School grade (\d+)$/);
  if (schoolGrade) return es ? `Curso escolar ${schoolGrade[1]}` : `${schoolGrade[1]}º ano escolar`;
  const radicalReadings = source.match(/^Radical readings: (.+)$/s);
  if (radicalReadings) return `${es ? "Lecturas del radical" : "Leituras do radical"}: ${radicalReadings[1]}`;
  const strokeProgress = source.match(/^Stroke (\d+) of (\d+)$/);
  if (strokeProgress) return `${es ? "Trazo" : "Traço"} ${strokeProgress[1]} de ${strokeProgress[2]}`;
  const strokeFinished = source.match(/^(\d+) strokes · (reduced motion|click to replay)$/);
  if (strokeFinished) {
    const suffix = strokeFinished[2] === "reduced motion" ? (es ? "movimiento reducido" : "movimento reduzido")
      : (es ? "haz clic para repetir" : "clique para repetir");
    return `${strokeFinished[1]} ${es ? "trazos" : "traços"} · ${suffix}`;
  }
  const strokeError = source.match(/^We couldn’t load the stroke order diagram for (.+) right now\. Please try again in a moment\.$/s);
  if (strokeError) return es
    ? `No se pudo cargar el diagrama de trazos de ${strokeError[1]}. Vuelve a intentarlo en unos instantes.`
    : `Não foi possível carregar o diagrama de traços de ${strokeError[1]}. Tente novamente em instantes.`;
  const parsedWords = source.match(/^Parsed (\d+) words\. Click any word or particle to see its definition\.$/);
  if (parsedWords) {
    const singular = parsedWords[1] === "1";
    return es
      ? `Se ${singular ? "analizó" : "analizaron"} ${parsedWords[1]} ${singular ? "palabra" : "palabras"}. Selecciona una palabra o partícula para ver su definición.`
      : `${parsedWords[1]} ${singular ? "palavra analisada" : "palavras analisadas"}. Selecione uma palavra ou partícula para ver sua definição.`;
  }
  const lookupResult = source.match(/^(Dictionary results|No dictionary results) for “(.+)”\.$/s);
  if (lookupResult) {
    const label = lookupResult[1] === "Dictionary results" ? (es ? "Resultados del diccionario" : "Resultados do dicionário")
      : (es ? "Sin resultados en el diccionario" : "Nenhum resultado no dicionário");
    return `${label} para “${lookupResult[2]}”.`;
  }
  const lookupEmpty = source.match(/^No results for “(.+)”\. Try another spelling or enter a different word above\.$/s);
  if (lookupEmpty) return es
    ? `Sin resultados para “${lookupEmpty[1]}”. Prueba otra grafía o escribe otra palabra arriba.`
    : `Nenhum resultado para “${lookupEmpty[1]}”. Experimente outra grafia ou digite outra palavra acima.`;
  const lookupFailure = source.match(/^Couldn’t look up “(.+)” right now\. Please try again in a moment\.$/s);
  if (lookupFailure) return es ? `No se pudo buscar “${lookupFailure[1]}”. Vuelve a intentarlo en unos instantes.`
    : `Não foi possível pesquisar “${lookupFailure[1]}”. Tente novamente em instantes.`;
  const distinctCount = source.match(/^(\d+) distinct (words|kanji)$/);
  if (distinctCount) {
    const singular = distinctCount[1] === "1";
    const kind = distinctCount[2] === "words" ? (es ? "palabra" : "palavra") : "kanji";
    const ending = distinctCount[2] === "words" ? (singular ? "distinta" : "distintas") : (singular ? "distinto" : "distintos");
    return `${distinctCount[1]} ${kind}${distinctCount[2] === "words" && !singular ? "s" : ""} ${ending}`;
  }
  const distribution = source.match(/^(N[1-5]|Unrated): (\d+) of (\d+), ([\d.]+)%$/);
  if (distribution) return `${translateInterface(distribution[1], language)}: ${distribution[2]} de ${distribution[3]}, ${distribution[4]}%`;
  const formCount = source.match(/^Showing (\d+) of (\d+) forms$/);
  if (formCount) return es ? `Se muestran ${formCount[1]} de ${formCount[2]} formas`
    : `Exibindo ${formCount[1]} de ${formCount[2]} formas`;
  const formSummary = source.match(/^(.+): (\d+) forms\. Readings and usage notes are available in detailed view\.$/s);
  if (formSummary) return es
    ? `${formSummary[1]}: ${formSummary[2]} formas. Las lecturas y notas de uso están disponibles en la vista detallada.`
    : `${formSummary[1]}: ${formSummary[2]} formas. Leituras e notas de uso estão disponíveis na visualização detalhada.`;
  const estimatedLevel = source.match(/^(N[1-5]) \(estimated\)$/);
  if (estimatedLevel) return `${estimatedLevel[1]} (estimado)`;
  const formLabel = source.match(/^(.+) · (affirmative|negative|past affirmative|past negative|Non-past affirmative|Non-past negative|Past affirmative|Past negative)$/);
  if (formLabel) {
    const prefix = translateInterface(formLabel[1], language);
    const suffix = translateInterface(formLabel[2], language);
    if (prefix !== formLabel[1] && suffix !== formLabel[2]) return `${prefix} · ${suffix}`;
  }
  const copyForm = source.match(/^Copy (.+) (plain|polite|neutral)$/);
  if (copyForm) return `Copiar ${translateInterface(copyForm[1], language)} ${translateInterface(copyForm[2], language)}`;
  const savedWord = source.match(/^Remove (.+) from saved words$/s);
  if (savedWord) return es ? `Eliminar ${savedWord[1]} de las palabras guardadas`
    : `Remover ${savedWord[1]} das palavras salvas`;
  const kanjiReading = source.match(/^(On’yomi|Kun’yomi): (.+)$/s);
  if (kanjiReading) return `${kanjiReading[1]}: ${translateInterface(kanjiReading[2], language)}`;
  const importFailure = source.match(/^Import failed: (.+)$/s);
  if (importFailure) return `${es ? "Error de importación" : "Falha na importação"}: ${translateInterface(importFailure[1], language)}`;
  const readingSuffix = source.match(/^This word type requires a reading ending in (.+)\.$/s);
  if (readingSuffix) return es ? `Este tipo de palabra requiere una lectura que termine en ${readingSuffix[1]}.`
    : `Este tipo de palavra exige uma leitura terminada em ${readingSuffix[1]}.`;
  const catalogue = source.match(/^Browse ([\d,]+) kanji and look up their readings and meanings\. JLPT levels are study estimates, not official classifications\.$/);
  if (catalogue) return es
    ? `Explora ${catalogue[1]} kanji y consulta sus lecturas y significados. Los niveles JLPT son estimaciones de estudio, no clasificaciones oficiales.`
    : `Explore ${catalogue[1]} kanji e consulte suas leituras e significados. Os níveis JLPT são estimativas de estudo, não classificações oficiais.`;
  const genericHelp = source.match(/^(Choose|Enable or disable) (.+)\.$/);
  if (genericHelp) {
    const label = genericHelp[2][0].toUpperCase() + genericHelp[2].slice(1);
    const translated = translateInterface(label, language);
    if (translated !== label) {
      const instruction = genericHelp[1] === "Choose" ? (es ? "Elige" : "Escolha") : (es ? "Activa o desactiva" : "Ative ou desative");
      return `${instruction} ${translated[0].toLowerCase()}${translated.slice(1)}.`;
    }
  }
  const help = source.match(/^Help: (.+)$/s);
  if (help) return `${es ? "Ayuda" : "Ajuda"}: ${translateInterface(help[1], language)}`;
  return source;
}

function localizeValue(value, language, element = null) {
  const match = value.match(/^(\s*)([\s\S]*?)(\s*)$/);
  const source = match[2].replace(/\s+/g, " ");
  let translated = translateInterface(source, language);
  const card = element?.matches("[data-card]") && source.match(/^Card (\d+): (.+?)(, matched)?$/s);
  if (card && language !== "en") {
    const value = element.classList.contains("face-down") || element.querySelector(".audio-face")
      ? translateInterface(card[2], language) : card[2];
    translated = `${language === "es" ? "Carta" : "Carta"} ${card[1]}: ${value}${card[3] ? `, ${translateInterface("matched", language)}` : ""}`;
  }
  return translated === source ? value : `${match[1]}${translated}${match[3]}`;
}

function updateLeafLanguage(element, translated, language) {
  if (!element || element.children.length || element.closest("[lang]")?.getAttribute("lang").toLowerCase().split("-")[0] === "ja") return;
  if (translated && language !== "en") {
    if (!originalLanguages.has(element)) originalLanguages.set(element, element.getAttribute("lang"));
    element.lang = language;
  } else if (originalLanguages.has(element)) {
    const original = originalLanguages.get(element);
    if (original === null) element.removeAttribute("lang");
    else element.setAttribute("lang", original);
    originalLanguages.delete(element);
  }
}

function localizeText(node, language) {
  const parent = node.parentElement;
  if (!parent || parent.closest('script, style, noscript, svg, [data-i18n-study], select[hidden]')) return;
  if (parent.closest("[lang]")?.getAttribute("lang").toLowerCase().split("-")[0] === "ja") return;
  if (parent.tagName === "OPTION" && !parent.hasAttribute("value")) return;
  const previous = textSources.get(node);
  const explicitKey = parent.hasAttribute("data-i18n") && parent.dataset.i18n?.trim();
  const source = explicitKey || (previous && node.data === previous.rendered ? previous.source : node.data);
  const rendered = localizeValue(source, language);
  textSources.set(node, { source, rendered });
  if (node.data !== rendered) node.data = rendered;
  updateLeafLanguage(parent, rendered !== source, language);
}

function localizeAttributes(element, language) {
  if (element.closest("script, style, noscript, .study-language")) return;
  if (element.closest("svg") && !element.matches("svg[role=img]")) return;
  let saved = attributeSources.get(element);
  if (!saved) { saved = new Map(); attributeSources.set(element, saved); }
  const customAttrs = element.dataset?.i18nAttr?.split(",").map((name) => name.trim()).filter(Boolean);
  const attrList = customAttrs?.length ? customAttrs : attributes;
  for (const name of attrList) {
    const value = element.getAttribute(name);
    if (value === null) { saved.delete(name); continue; }
    const previous = saved.get(name);
    const source = previous && value === previous.rendered ? previous.source : value;
    const rendered = localizeValue(source, language, element);
    saved.set(name, { source, rendered });
    if (value !== rendered) element.setAttribute(name, rendered);
  }
}

function localizeTree(root, language) {
  if (root.nodeType === Node.TEXT_NODE) return localizeText(root, language);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  localizeAttributes(root, language);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.parentElement?.tagName !== "OPTION" || node.parentElement.hasAttribute("value")) localizeText(node, language);
    } else localizeAttributes(node, language);
  }
}

function localizeAttributeRoots(root, language) {
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.matches(attributeScopes)) localizeAttributes(root, language);
  for (const element of root.querySelectorAll(attributeScopes)) localizeAttributes(element, language);
}

export function initializeInterfaceLocalization() {
  if (initialized || !languageSelectionEnabled) return;
  initialized = true;
  loadInterfaceMessages();
  const file = navigationPage(location.pathname);
  const scopes = [...commonScopes, ...controlScopes, ...(pageScopes[file] || [])].join(", ");
  let started = false;
  const applyTranslations = () => {
    const language = currentLanguage();
    const title = document.querySelector("title");
    if (title) localizeTree(title, language);
    for (const root of document.querySelectorAll(scopes)) localizeTree(root, language);
    for (const element of document.querySelectorAll(attributeScopes)) localizeAttributes(element, language);
  };
  const render = () => {
    if (!started) return;
    const language = currentLanguage();
    if (language !== "en" && !messagesLoaded) {
      loadInterfaceMessages().then(() => { if (started) applyTranslations(); });
      return;
    }
    applyTranslations();
  };
  const start = () => {
    started = true;
    render();
    new MutationObserver((mutations) => {
      const language = currentLanguage();
      if (language !== "en" && !messagesLoaded) {
        loadInterfaceMessages().then(() => { if (started) applyTranslations(); });
        return;
      }
      for (const mutation of mutations) {
        const element = mutation.target.nodeType === Node.ELEMENT_NODE ? mutation.target : mutation.target.parentElement;
        if (mutation.type === "attributes" && element?.matches(attributeScopes)) localizeAttributes(element, language);
        if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) localizeAttributeRoots(node, language);
        }
        if (element?.closest(scopes)) {
          if (mutation.type === "attributes") localizeAttributes(element, language);
          else if (mutation.type === "characterData") localizeText(mutation.target, language);
          else for (const node of mutation.addedNodes) localizeTree(node, language);
        } else if (mutation.type === "childList") {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (node.matches(scopes)) localizeTree(node, language);
            for (const root of node.querySelectorAll(scopes)) localizeTree(root, language);
          }
        }
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: attributes });
  };
  document.addEventListener("nihon:language-change", render);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
}
