import "./tool-help.css";

const tools = {
  "絵合わせ.html": ["Eawase", "Flip two cards to match representations of the same word or kana. Choose Words or Syllabaries, a matching direction, and a board size in Settings. Arrow keys move between cards; Enter or Space flips one. A correct match keeps the turn in local two-player games; a mismatch passes it. Hints and reveals do not earn points or unassisted accuracy. Listening needs Audio On and Japanese device voices. Kana meaning clues describe sounds, not vocabulary meanings. Script conversions are recognition exercises. Daily uses eight date-seeded basic kana pairs, saves progress, and resumes rather than restarting. Mistake Review draws from missed, assisted, unfinished, and saved items in your notebook."],
  "言葉探し.html": ["Kotoba Sagashi", "Find Japanese words in straight lines. Drag from the first character to the last, or tap both endpoints. With a keyboard, use arrow keys to move, Enter or Space to set each endpoint, and Escape to cancel. Single-character words use the same cell twice. Settings apply to new puzzles; reading and appearance controls stay live. Quick uses 8×8 with five words. Daily uses fixed N5 kana rules and a date seed. Marathon increases the grid and word count between rounds. Sudden Death ends after your chosen mistake limit. Hints and reveals follow your limits; missed and revealed words go to review. Japanese clues and icons are category clues, not dictionary definitions. Kanji words retain necessary okurigana. JLPT levels and category filters are study estimates."],
  "活用練習.html": ["Katsuyō Renshuu", "Choose one or more estimated JLPT levels, word types and forms, then start a focused session. Type Japanese or romaji and press Enter to check. Hints, reveals and retries support learning; only first, unassisted answers earn credit. Incorrect forms recur more often. Daily Practice tracks completed days. Comparison and Reverse accept all valid analyses of ambiguous forms. The built-in word bank and original teaching examples work offline; kanji lookups need the dictionary."],
  "活用.html": ["Katsuyō", "Enter a dictionary-form verb or adjective in Japanese or romaji. Choose an interpretation when a word is ambiguous. Explore plain and polite endings, open usage rules, filter forms and save words. Unknown words require a confirmed reading and class. Advanced forms are grammatical references, not guarantees of natural usage for every meaning."],
  "仮名.html": ["Kana", "Practice hiragana and katakana in either direction. Choose a script or mix both, type your answer, and use Show answer when you get stuck. Free, question-count and timed sessions track your progress."],
  "意味.html": ["Imi", "Practice kanji meanings from Japanese to English or in reverse. Choose a JLPT level, type an answer and check it. Pause to review readings and example words before continuing."],
  "読み.html": ["Yomi", "Practice kanji readings using romaji, hiragana or katakana. Choose a JLPT level and session length. After answering, review the character's readings, meanings and example words."],
  "語彙.html": ["Goi", "Build Japanese vocabulary with multiple-choice, typing and fill-in-the-blank practice. Choose a JLPT level and a session length, then start. Review definitions and example sentences after each answer; use Next when ready."],
  "言葉.html": ["Kotoba", "Look up Japanese words, readings, romaji or English meanings. Kanji mode explores individual characters, readings, components and compounds. Example sentences include translations and source credits; request another example to see the word in a different context."],
  "文解き.html": ["Fumitoki", "Enter Japanese text and analyze it into words and particles. Select a token for its dictionary form, readings, definitions and examples. Enable translation for a sentence-level translation. Analysis and translation can be imperfect; use the dictionary details to check them."],
  "漢字地図帳.html": ["Kanji Chizuchō", "Explore a kanji's meanings, readings, components, stroke diagram and related vocabulary. Search a character or a word containing it, then select the character to inspect. Related words and sentences help you learn it in context."],
  "パズル.html": ["Pazuru", "Solve a Japanese vocabulary crossword. Choose a mode, JLPT range, answer script and puzzle size, then create a puzzle. Select a cell or clue to type; check, hint or reveal according to your settings. Inspect words for definitions, example sentences and kanji details. Daily puzzles are date-seeded; other puzzles vary."],
  "しりとり.html": ["Shiritori", ""]
};
const descriptions = {
  "setting-language": "Choose Japanese, English, or both for the question instructions, requested form, grammatical features and answer choices. Japanese words and example sentences remain Japanese.",
  "setting-overlap": "Allow different hidden words to cross at a cell when they use the same character. Turning this off keeps every word's cells separate.",
  "setting-prompt": "Show the requested form by name, usage description, or a translated sentence with a blank. Mixed randomly chooses one of these for each new question; its politeness, polarity and tense stay explicit.",
  "setting-group-voiced": "Add kana with dakuten, such as が / ガ (ga) and ば / バ (ba), and handakuten, such as ぱ / パ (pa).",
  "setting-group-yoon": "Combine an i-row kana with small ゃ, ゅ or ょ: きゃ / キャ (kya), しゅ / シュ (shu), and ちょ / チョ (cho).",
  "setting-group-special": "Practice long vowels such as かあ / カー (kaa), doubled consonants such as きって / キッテ (kitte), and syllabic n in しんよう / シンヨウ (shin'you).",
  kanaDirection: "Choose which script appears in the question and which you type. Random mixes directions; either script accepts hiragana or katakana.",
  meaningDirection: "Practice kanji to English, English to kanji, or alternate between both directions.",
  readingDirection: "Choose the writing system accepted for your reading answers.",
  modeSelect: "Choose multiple-choice, typing or cloze (fill-in-the-blank) vocabulary practice.",
  sessionMode: "Free practice continues until you stop; question count and timed practice end at the selected limit.",
  sessionType: "Free practice continues until you stop; questions and timed practice end at the selected limit.",
  sessionTarget: "Set the number of questions or the duration in minutes, depending on your practice length.",
  questionLimit: "Number of questions to present before the session ends.",
  timeLimit: "Duration of the practice session in minutes.",
  showStatsToggle: "Choose whether statistics are visible in your next session. Answers are recorded either way.",
  reviewKanjiToggle: "Pause after an answer to review readings, meanings and example words before moving on.",
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
  timerToggle: "Show the puzzle timer. Relaxed mode does not use a timer."
};
const modeHelp = {
  classic: "A standard crossword with clues and an optional timer.",
  relaxed: "Practice without a timer or pressure, with unlimited hints.",
  daily: "A date-seeded puzzle with a daily streak counter.",
  timed: "Complete the puzzle before the countdown expires.",
  suddenDeath: "An incorrect character or submitted answer ends the round.",
  kanjiChallenge: "Use words containing kanji, including their kana endings, rather than kana-only answers.",
  kanaChallenge: "Enter kana, one character per square.",
  reverse: "Read Japanese clues and enter English meanings."
};

export function mountToolHelp() {
  const file = decodeURIComponent(location.pathname.split("/").pop());
  const [name, description] = tools[file] || ["Japanese practice", "Choose your study settings, then begin practicing. Review answers and use the shared reading and audio controls as needed."];
  const brand = document.querySelector(".brand-name, .cw-brand-name");
  if (brand?.firstChild?.nodeType === Node.TEXT_NODE) brand.firstChild.textContent = name;
  const heading = document.querySelector(".intro h1, .cw-intro h1");
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
    const shared = document.createElement("p");
    shared.textContent = "Valid settings save automatically in this browser. Audio, furigana, romaji and appearance preferences are shared across Nihon tools. Hover, focus or tap a setting name for details. " + (file === "活用練習.html"
      ? "Practice examples are original teaching templates, not dictionary quotations. Speech availability depends on your device’s Japanese voices."
      : "Example availability depends on the dictionary and the optional Tatoeba service; unavailable examples are not generated or invented.");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "study-help-close";
    close.textContent = "Close";
    close.addEventListener("click", () => dialog.close());
    dialog.append(title, text, shared, close);
    document.body.append(dialog);
    heading.append(" ", button);
    button.addEventListener("click", () => dialog.showModal());
    dialog.addEventListener("click", (event) => { if (event.target === dialog) dialog.close(); });
  }

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
    tooltip.textContent = trigger.dataset.studyHelp;
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
      trigger.setAttribute("aria-label", `Help: ${trigger.textContent.trim()}`);
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
      if (control.closest(".chips") || ["colorThemeSelect", "answerChoice"].includes(control.id) || mounted.get(control)?.every((node) => node.isConnected)) continue;
      const label = control.labels?.[0];
      if (!label) continue;
      const text = label.dataset.settingDescription || descriptions[control.id];
      const nodes = [...label.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE && node.matches("span:not(.font-preview)"))
        .filter((node) => node.textContent.trim());
      const labelText = nodes.map((node) => node.textContent.trim()).join(" ");
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
      bindHelp(button, button.dataset.settingDescription || modeHelp[button.dataset.mode]);
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
