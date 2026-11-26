import "./tool-help.css";
import { interfaceSourceAttribute, interfaceSourceText } from "./interface-i18n.js";
import { navigationPage } from "./routes.js";
import { helpSteps } from "./help-steps.js";

const tools = {
  "eawase.html": ["Eawase", "Flip two cards to match representations of the same word or kana. Choose Words or Syllabaries, a matching direction, and a board size in Settings. Arrow keys move between cards; Enter or Space flips one. A correct match keeps the turn in local two-player games; a mismatch passes it. Hints and reveals do not earn points or unassisted accuracy. Listening needs Audio On and Japanese device voices. Kana meaning clues describe sounds, not vocabulary meanings. Script conversions are recognition exercises. Mistake Review reloads saved word identities from the dictionary; imported clues are not question sources."],
  "kotoba-sagashi.html": ["Kotoba Sagashi", "Find Japanese words in straight lines. Drag from the first character to the last, or tap both endpoints. With a keyboard, use arrow keys to move, Enter or Space to set each endpoint, and Escape to cancel. Single-character words use the same cell twice. Settings apply to new puzzles; reading and appearance controls stay live. Quick uses 8×8 with five words. Marathon increases the grid and word count between rounds. Sudden Death ends after your chosen mistake limit. Hints and reveals follow your limits; missed and revealed words go to review. Japanese descriptions are disabled because the dictionary has no Japanese definitions. Review questions reload dictionary words, not imported clues. Kanji words retain necessary okurigana. JLPT levels are study estimates."],
  "katsuyo-renshuu.html": ["Katsuyō Renshuū", "Choose JLPT levels, word types and forms, then load a session from the JMdict database with linked JLPT vocabulary. Type kana, kanji, mixed spelling or romaji and press Enter to check. Only first, unassisted answers earn credit. Missed questions return for review. Comparison and Reverse accept valid ambiguous analyses. Dictionary access is required to start; no offline word bank is substituted. Sentence prompts and auxiliary-pattern vocabulary are unavailable without verified aligned sources."],
  "katsuyo.html": ["Katsuyō", "Enter a dictionary-form verb or adjective in Japanese or romaji. Choose an interpretation when a word is ambiguous. Explore plain and polite endings, open usage rules, filter forms and save words. Unknown words require a confirmed reading and class. Advanced forms are grammatical references, not guarantees of natural usage for every meaning. Form examples search the corpus and Tatoeba for that written form; matching text can have different grammatical interpretations. Word information also offers sourced base-word examples."],
  "kana.html": ["Kana", "Practice hiragana and katakana in either direction. Choose a script or mix both, type your answer, and check it. Incorrect answers show the correct answer before you continue. Free, question-count and timed sessions track your progress."],
  "imi.html": ["Imi", "Practice kanji meanings from Japanese to English or in reverse. Choose a JLPT level, type an answer and check it. Pause to review readings and example words before continuing."],
  "yomi.html": ["Yomi", "Choose on'yomi, kun'yomi or both, a JLPT level and a session length. Romaji converts automatically; either kana script is accepted for the selected reading type. Kanji input is cleared. Toggle Pause to review kanji details at any time during the quiz."],
  "goi.html": ["Goi", "Build Japanese vocabulary with multiple-choice, typing and fill-in-the-blank practice. Choose a JLPT level and a session length, then start. Review definitions and example sentences after each answer; use Next when ready."],
  "kotoba.html": ["Kotoba", "Look up Japanese words, readings, romaji or English meanings. Kanji mode explores individual characters, readings, components and compounds. Example sentences include translations and source credits; request another example to see the word in a different context."],
  "fumitoki.html": ["Fumitoki", "Enter Japanese text and analyze it into words and particles. Select a token for its dictionary form, readings, definitions and examples. Enable translation for a sentence-level translation. Analysis and translation can be imperfect; use the dictionary details to check them."],
  "kanji-chizucho.html": ["Kanji Chizuchō", "Explore a kanji's meanings, readings, components, stroke diagram and related vocabulary. Search a character or a word containing it, then select the character to inspect. Related words and sentences help you learn it in context."],
  "shiryo.html": ["Shiryō", "Printable Japanese cheatsheets and handwriting practice."],
  "kanji-kuizu.html": ["Kanji Kuizu", "Select all correct readings for a kanji or all kanji matching a reading, then check your answer. Questions and random distractors come from dictionary kanji metadata. Practice at your own pace, use per-question countdowns in Timed Challenge and High Score, or revisit your saved mistakes. Sudden Death ends after an incorrect or revealed answer. Hints remove an incorrect choice; reveals show the answers."],
  "pazuru.html": ["Pazuru", "Solve a Japanese vocabulary crossword. Choose a mode, JLPT range, answer script and puzzle size, then create a puzzle. Select a cell or clue to type; check, hint or reveal according to your settings. Inspect words for definitions, example sentences and kanji details. New puzzles vary and prioritize recently unused words."],
  "shiritori.html": ["Shiritori", ""]
};
const descriptions = {
  "setting-overlap": "Allow different hidden words to cross at a cell when they use the same character. Turning this off keeps every word's cells separate.",
  "setting-prompt": "Show the requested form by name or usage description. Mixed chooses between these for each question. Sentence prompts are unavailable without verified aligned examples.",
  "setting-group-voiced": "Add kana with dakuten, such as が / ガ (ga) and ば / バ (ba), and handakuten, such as ぱ / パ (pa).",
  "setting-group-yoon": "Combine an i-row kana with small ゃ, ゅ or ょ: きゃ / キャ (kya), しゅ / シュ (shu), and ちょ / チョ (cho).",
  "setting-group-special": "Practice long vowels such as かあ / カー (kaa), doubled consonants such as きって / キッテ (kitte), and syllabic n in しんよう / シンヨウ (shin'you).",
  kanaDirection: "Choose which script appears in the question and which you type. Random mixes directions; either script accepts hiragana or katakana.",
  meaningDirection: "Practice kanji to English, English to kanji, or alternate between both directions.",
  readingDirection: "Choose on'yomi, kun'yomi or both. Either kana script is accepted; romaji converts automatically.",
  modeSelect: "Choose multiple-choice or typing vocabulary practice.",
  sessionMode: "Free practice continues until you stop; question count and timed practice end at the selected limit.",
  sessionType: "Free practice continues until you stop; questions and timed practice end at the selected limit.",
  sessionTarget: "Set the number of questions or the duration in minutes, depending on your practice length.",
  questionLimit: "Number of questions to present before the session ends.",
  timeLimit: "Duration of the practice session in minutes.",
  showStatsToggle: "Choose whether statistics are visible in your next session. Answers are recorded either way.",
  reviewKanjiToggle: "Pause after an answer to review readings, meanings and example words. Changes apply immediately during the quiz.",
  showExampleToggle: "Show the definition and example sentences after answering, and pause for review.",
  kanjiMode: "Explore individual kanji, their readings and compounds instead of searching word definitions.",
  compoundMeaning: "Show or hide English meanings beside the Japanese compounds.",
  translationToggle: "Display the translation of the analyzed sentence. Machine translations may be imperfect.",
  answerModeSelect: "Choose kana, kanji-containing written forms, or mixed answers for the next puzzle. Challenge and reverse modes may override this choice.",
  sizeSelect: "Choose the grid and target word count. Larger puzzles offer more vocabulary to practice.",
  customWordsInput: "Target 4 to 18 words for a custom puzzle. The number placed depends on available intersections.",
  checkAvailSelect: "Allow unlimited checks, a limited number of checks, or disable checking for a challenge.",
  revealAvailSelect: "Allow unlimited reveals, a limited number of reveals, or disable revealing answers.",
  hintLimitInput: "Maximum assistance uses when a limited availability option is selected.",
  timedMinutesInput: "Minutes available to complete a timed challenge.",
  layoutDirSelect: "Choose whether the clue panel appears to the left or right of the grid.",
  inputStyleSelect: "Type in a clue popup, directly in grid cells, or in textboxes beside the clues. In-square Kanji answers accept native IME input or the whole word's romaji reading, including at locked crossings. You can also enter just the remaining kana. Pending text stays visible and editable; Enter submits it and Escape clears it. In-square clue cards stay below the grid.",
  kanjiFocusToggle: "Use kanji meanings and readings as study clues where available.",
  timerToggle: "Show the puzzle timer. Relaxed mode does not use a timer.",
  "draw-grid": "Display dashed center crosshairs to help gauge stroke balance and placement.",
  "draw-numbers": "Show stroke-order numbers beside each stroke's starting point.",
  "draw-live-check": "Check each stroke as soon as you lift the pen in Trace mode so you can fix direction or placement right away.",
  "train-network": "Choose all railway networks or focus on a linear, branching, or interchange network.",
  "train-legs": "Practice single-instruction rides, multi-leg journeys with follow-up steps, or both.",
  "train-rule": "Focus on counting stops ahead, stops before or after a landmark, line transfers, or terminal stops.",
  "train-view": "Display stations as a connected route map or as a vertical numbered list. You can switch views during a round.",
  editorialLength: "Number of practice rounds in a session.",
  guideCollection: "All expressions includes curated guides plus all JMdict on-mim entries. With examples limits results to entries that have an example sentence. Curated guides shows entries with hand-written notes and comparisons.",
  guideScene: "Browse all expressions grouped by situation or sensation, such as Weather & nature, Food & texture, Voices & speech, or Manner & state.",
  guideUsage: "Filter by how the expression is used grammatically in Japanese: as an adverb (often with と), a する verb, a な/の adjective, a noun, or an interjection.",
  guideFrequency: "Filter by whether JMdict marks the entry as common. Many everyday onomatopoeia are not marked common in JMdict."
};
const modeHelp = {
  classic: "A standard crossword with clues and an optional timer.",
  relaxed: "Practice without a timer or pressure, with unlimited hints and reveals.",
  timed: "Complete the puzzle before the countdown expires.",
  suddenDeath: "An incorrect character or submitted answer ends the round.",
  kanjiChallenge: "Use words containing kanji, including their kana endings, rather than kana-only answers.",
  kanaChallenge: "Enter kana, one character per square.",
  reverse: "Read Japanese clues and enter English meanings."
};

const helpVisuals = {
  "eawase.html": {
    caption: "Example pair: match two cards representing the same word.",
    svg: `<svg viewBox="0 0 260 66" role="img" aria-label="Card showing 山 paired with card showing やま"><rect x="14" y="8" width="84" height="50" rx="8" fill="none" stroke="currentColor" stroke-width="1.8"/><text x="56" y="41" text-anchor="middle" font-size="22" font-weight="700" fill="currentColor">山</text><text x="130" y="39" text-anchor="middle" font-size="18" fill="var(--accent)">↔</text><rect x="162" y="8" width="84" height="50" rx="8" fill="none" stroke="var(--accent)" stroke-width="1.8"/><text x="204" y="40" text-anchor="middle" font-size="18" font-weight="700" fill="var(--accent)">やま</text></svg>`
  },
  "shuden.html": {
    caption: "Example: “2 stops ahead” counts from the next stop, not Here.",
    svg: `<svg viewBox="0 0 280 68" role="img" aria-label="Station line showing Here, stop 1, and stop 2 highlighted"><line x1="36" y1="30" x2="244" y2="30" stroke="currentColor" stroke-width="2.5" opacity=".4"/><circle cx="44" cy="30" r="10" fill="var(--card)" stroke="currentColor" stroke-width="2"/><text x="44" y="56" text-anchor="middle" font-size="11" fill="currentColor">Here</text><circle cx="140" cy="30" r="10" fill="var(--card)" stroke="currentColor" stroke-width="2"/><text x="140" y="34" text-anchor="middle" font-size="11" font-weight="700" fill="currentColor">1</text><text x="140" y="56" text-anchor="middle" font-size="11" fill="currentColor">Next</text><circle cx="236" cy="30" r="11" fill="var(--accent)"/><text x="236" y="34" text-anchor="middle" font-size="11" font-weight="700" fill="var(--page)">2</text><text x="236" y="56" text-anchor="middle" font-size="11" font-weight="700" fill="var(--accent)">Get off</text></svg>`
  },
  "kanji-anaume.html": {
    caption: "Example: the same kanji (日) completes all three compounds.",
    svg: `<svg viewBox="0 0 280 64" role="img" aria-label="Three compounds sharing the kanji 日"><text x="48" y="38" text-anchor="middle" font-size="18" fill="currentColor"><tspan fill="var(--accent)" font-weight="700">日</tspan>本</text><text x="140" y="38" text-anchor="middle" font-size="18" fill="currentColor">毎<tspan fill="var(--accent)" font-weight="700">日</tspan></text><text x="232" y="38" text-anchor="middle" font-size="18" fill="currentColor">休<tspan fill="var(--accent)" font-weight="700">日</tspan></text></svg>`
  },
  "shiritori.html": {
    caption: "Example chain: each word starts with the previous word’s ending.",
    svg: `<svg viewBox="0 0 280 60" role="img" aria-label="Word chain from りんご to ごりら to らくだ"><text x="48" y="35" text-anchor="middle" font-size="16" fill="currentColor">りん<tspan fill="var(--accent)" font-weight="700">ご</tspan></text><text x="95" y="35" text-anchor="middle" font-size="14" fill="var(--muted)">→</text><text x="140" y="35" text-anchor="middle" font-size="16" fill="currentColor"><tspan fill="var(--accent)" font-weight="700">ご</tspan>り<tspan fill="var(--accent)" font-weight="700">ら</tspan></text><text x="185" y="35" text-anchor="middle" font-size="14" fill="var(--muted)">→</text><text x="232" y="35" text-anchor="middle" font-size="16" fill="currentColor"><tspan fill="var(--accent)" font-weight="700">ら</tspan>くだ</text></svg>`
  },
  "kanji-kaki.html": {
    caption: "Trace from the starting dot along the arrow for each stroke.",
    svg: `<svg viewBox="0 0 180 64" role="img" aria-label="Drawing square with numbered stroke direction"><rect x="58" y="6" width="52" height="52" rx="6" fill="none" stroke="currentColor" stroke-width="1.5" opacity=".5"/><line x1="84" y1="6" x2="84" y2="58" stroke="currentColor" stroke-dasharray="3 3" opacity=".25"/><line x1="58" y1="32" x2="110" y2="32" stroke="currentColor" stroke-dasharray="3 3" opacity=".25"/><line x1="68" y1="24" x2="98" y2="24" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/><circle cx="68" cy="24" r="3.5" fill="var(--accent)"/><polygon points="102,24 95,20 96,24 95,28" fill="var(--accent)"/></svg>`
  },
  "pazuru.html": {
    caption: "Solved words share crossing characters to help unlock clues.",
    svg: `<svg viewBox="0 0 220 72" role="img" aria-label="Crossing crossword cells sharing one kana"><rect x="88" y="8" width="26" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="101" y="26" text-anchor="middle" font-size="14" fill="currentColor">さ</text><rect x="62" y="34" width="26" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="75" y="52" text-anchor="middle" font-size="14" fill="currentColor">た</text><rect x="88" y="34" width="26" height="26" rx="4" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="1.8"/><text x="101" y="52" text-anchor="middle" font-size="14" font-weight="700" fill="var(--accent)">か</text><rect x="114" y="34" width="26" height="26" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="127" y="52" text-anchor="middle" font-size="14" fill="currentColor">い</text></svg>`
  }
};

export function mountHelpDialog(pageHelp, stepsKey = navigationPage(location.pathname)) {
  const file = navigationPage(location.pathname);
  const [name, description] = pageHelp || tools[file];
  const steps = document.createElement("ol");
  steps.className = "help-steps";
  for (const [instruction] of helpSteps[stepsKey]) {
    const item = document.createElement("li");
    item.textContent = instruction;
    steps.append(item);
  }
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = "How to use this tool";
  details.append(summary, steps);
  const visual = helpVisuals[stepsKey];
  if (visual) {
    const figure = document.createElement("figure");
    figure.className = "help-visual";
    figure.innerHTML = `${visual.svg}<figcaption>${visual.caption}</figcaption>`;
    details.append(figure);
  }
  const custom = document.querySelector("#helpDialog .dialog-body");
  if (custom) {
    const intro = document.createElement("p");
    intro.textContent = "Build a word chain by starting each Japanese word with the ending of the previous one.";
    details.append(...custom.childNodes);
    custom.append(intro, details);
    custom.closest("dialog").addEventListener("close", () => { details.open = false; });
    return;
  }
  const brand = document.querySelector(".brand-name, .cw-brand-name");
  if (tools[file] && brand?.firstChild?.nodeType === Node.TEXT_NODE) brand.firstChild.textContent = name;
  const heading = document.querySelector(".study-intro h1, .intro h1, .cw-intro h1");
  if (heading && !document.getElementById("helpButton")) {
    const button = document.createElement("button");
    button.id = "helpButton";
    button.type = "button";
    button.className = "study-help-button";
    button.textContent = "?";
    button.setAttribute("aria-label", `About ${name}`);
    const dialog = document.createElement("dialog");
    dialog.id = "helpDialog";
    dialog.className = "study-help-dialog";
    dialog.setAttribute("aria-labelledby", "studyHelpTitle");
    const title = document.createElement("h2");
    title.id = "studyHelpTitle";
    title.textContent = `About ${name}`;
    const text = document.createElement("p");
    text.textContent = description;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "study-help-close";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    dialog.append(title, text, details, close);
    dialog.addEventListener("close", () => { details.open = false; });
    document.body.append(dialog);
    heading.append(" ", button);
    button.addEventListener("click", () => dialog.showModal());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }
}

export function mountToolHelp(pageHelp) {
  const file = navigationPage(location.pathname);
  mountHelpDialog(pageHelp);
  const tooltip = document.createElement("div");
  tooltip.id = "studySettingTooltip";
  tooltip.className = "study-setting-tooltip";
  tooltip.setAttribute("popover", "manual");
  tooltip.setAttribute("role", "tooltip");
  document.body.append(tooltip);
  let active;
  let activeControl;
  const mounted = new WeakMap();
  function describe(node, enabled) {
    if (!node) return;
    const ids = (node.getAttribute("aria-describedby") || "").split(/\s+/).filter((id) => id && id !== tooltip.id);
    if (enabled) ids.push(tooltip.id);
    if (ids.length) node.setAttribute("aria-describedby", ids.join(" "));
    else node.removeAttribute("aria-describedby");
  }
  function hide() {
    tooltip.hidePopover();
    describe(active, false);
    if (activeControl !== active) describe(activeControl, false);
    active = null; activeControl = null;
  }
  function show(trigger, control) {
    hide();
    active = trigger;
    activeControl = control;
    describe(trigger, true);
    if (control !== trigger) describe(control, true);
    tooltip.textContent = interfaceSourceAttribute(trigger, "data-study-help");
    tooltip.showPopover();
    const rect = trigger.getBoundingClientRect();
    const width = tooltip.getBoundingClientRect().width;
    const center = rect.left + rect.width / 2;
    const left = Math.max(8, Math.min(center - width / 2, innerWidth - width - 8));
    tooltip.style.left = `${left}px`;
    const height = tooltip.getBoundingClientRect().height;
    const above = rect.top >= height + 20;
    tooltip.dataset.side = above ? "above" : "below";
    tooltip.style.setProperty("--arrow-left", `${Math.max(14, Math.min(center - left, width - 14))}px`);
    tooltip.style.top = `${Math.max(8, Math.min(above ? rect.top - height - 10 : rect.bottom + 10, innerHeight - height - 8))}px`;
  }
  function bindHelp(trigger, text, control = trigger) {
    if (!trigger.matches(".chip-option")) trigger.classList.add("study-setting-name");
    const action = trigger.matches("button, .chip-option");
    const focusTarget = trigger.matches(".chip-option") ? trigger.querySelector("input") || trigger : trigger;
    if (!action) {
      trigger.tabIndex = 0;
      trigger.setAttribute("role", "button");
      trigger.setAttribute("aria-label", `Help: ${interfaceSourceText(trigger).trim()}`);
    }
    trigger.dataset.studyHelp = text;
    trigger.addEventListener("pointerenter", (event) => {
      if (event.pointerType !== "touch") show(trigger, control);
    });
    trigger.addEventListener("pointerleave", (event) => {
      if (event.pointerType !== "touch" && active === trigger) hide();
    });
    focusTarget.addEventListener("focus", () => {
      if (focusTarget.matches(":focus-visible")) show(trigger, control);
    });
    focusTarget.addEventListener("blur", hide);
    trigger.addEventListener("click", (event) => {
      if (action) { hide(); return; }
      event.preventDefault();
      trigger.focus({ preventScroll: true });
      show(trigger, control);
    });
    trigger.addEventListener("keydown", (event) => {
      if (!action && ["Enter", " "].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        show(trigger, control);
      }
    });
  }
  function enhance() {
    if (active && !active.isConnected) hide();
    for (const control of document.querySelectorAll("select, input[type='checkbox'], input[type='number']")) {
      if (control.hasAttribute("data-no-setting-help")) continue;
      if (["sessionMode", "sessionType"].includes(control.id) && ["kana.html", "imi.html", "yomi.html", "goi.html"].includes(file)) continue;
      if (control.closest(".chips") || ["colorThemeSelect", "answerChoice"].includes(control.id) || mounted.get(control)?.every((node) => node.isConnected)) continue;
      const label = control.labels?.[0];
      if (!label) continue;
      const text = interfaceSourceAttribute(label, "data-setting-description") || descriptions[control.id];
      const nodes = [...label.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE && node.matches("span:not(.font-preview)"))
        .filter((node) => node.textContent.trim());
      const labelText = nodes.map((node) => interfaceSourceText(node).trim()).join(" ");
      if (!text && /font|jlpt|level|range|contrast|compact|politeness|polarity|tense|category|theme/i.test(labelText)) continue;
      const description = text || (control.type === "checkbox" ? `Enable or disable ${labelText.toLowerCase()}.` : `Choose ${labelText.toLowerCase()}.`);
      const triggers = [];
      for (const node of nodes) {
        let trigger = node;
        if (node.nodeType === Node.TEXT_NODE) {
          trigger = document.createElement("span");
          node.before(trigger);
          trigger.append(node);
        }
        if (!trigger.dataset.studyHelp) bindHelp(trigger, description, control);
        triggers.push(trigger);
      }
      if (triggers.length) mounted.set(control, triggers);
    }
    for (const button of document.querySelectorAll(".cw-mode-pill:not([data-help-mounted]), button[data-setting-description]:not([data-help-mounted]), .chip-option[data-setting-description]:not([data-help-mounted])")) {
      button.dataset.helpMounted = "true";
      bindHelp(button, interfaceSourceAttribute(button, "data-setting-description") || modeHelp[button.dataset.mode]);
    }
  }
  enhance();
  new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && active) { event.preventDefault(); hide(); }
  });
  document.addEventListener("click", (event) => {
    if (active && !active.contains(event.target)) hide();
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (active && (!active.contains(event.target) || active.matches("button"))) hide();
  }, true);
  document.addEventListener("focusin", (event) => {
    if (active && !active.contains(event.target)) hide();
  });
  document.addEventListener("close", hide, true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
  window.addEventListener("blur", hide);
}
