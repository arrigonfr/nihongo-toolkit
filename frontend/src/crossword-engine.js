import { romanizeKana } from "./romanize.js";
import { alignFuriganaRuby, formatFurigana } from "./furigana.js";

export const THEMES = {
  all: { label: "All vocabulary", ja: "総合" },
  food: {
    label: "Food & drink", ja: "食事",
    pattern: /\b(food|eat|drink|meal|fruit|vegetable|meat|fish|rice|tea|coffee|water|bread|cake|sweet|cook|kitchen|restaurant|taste|delicious|hungry|thirsty|breakfast|lunch|dinner|soup|egg|milk|sugar|salt|wine|beer|alcohol|dish|plate|cup|glass|bowl|chopstick|spoon|fork|knife|bake|boil|fry)\b/i
  },
  travel: {
    label: "Travel & directions", ja: "旅行",
    pattern: /\b(travel|trip|journey|train|station|bus|car|airplane|airport|flight|hotel|ticket|passport|map|road|street|bridge|port|ship|boat|bicycle|ride|drive|walk|arrive|depart|leave|return|tour|sightseeing|luggage|baggage|embassy|foreign|abroad|direction|north|south|east|west|left|right)\b/i
  },
  work: {
    label: "Work & business", ja: "仕事",
    pattern: /\b(work|job|company|office|business|boss|president|manager|colleague|meeting|conference|salary|wage|pay|money|bank|economy|industry|factory|manufacture|produce|sell|buy|trade|market|contract|document|report|project|schedule|career|employ|hire|retire|profession|task|duty)\b/i
  },
  nature: {
    label: "Nature & weather", ja: "自然",
    pattern: /\b(nature|tree|flower|grass|forest|woods|mountain|hill|river|sea|ocean|lake|pond|water|sky|cloud|rain|snow|wind|storm|weather|sun|moon|star|earth|ground|stone|rock|sand|island|valley|field|animal|bird|dog|cat|fish|insect|season|spring|summer|autumn|fall|winter|warm|cold|hot|cool)\b/i
  },
  emotions: {
    label: "Emotions & mind", ja: "感情",
    pattern: /\b(feel|feeling|emotion|happy|glad|joy|delight|sad|sorrow|grief|cry|weep|angry|anger|mad|fear|afraid|scared|worry|anxious|anxiety|nervous|calm|peace|relief|relieved|surprise|surprised|shock|lonely|loneliness|love|like|hate|dislike|envy|jealous|proud|pride|shame|ashamed|embarrassed|regret|hope|wish|mood|heart|mind)\b/i
  },
  school: {
    label: "School & study", ja: "学校",
    pattern: /\b(school|university|college|class|classroom|lesson|study|learn|teach|teacher|professor|student|pupil|exam|test|grade|score|homework|textbook|book|dictionary|notebook|pen|pencil|paper|letter|read|write|question|answer|library|graduate|education|knowledge|subject|math|science|history|language|english|japanese)\b/i
  },
  technology: {
    label: "Technology & science", ja: "技術",
    pattern: /\b(technology|computer|machine|device|tool|electricity|electric|electronic|internet|network|website|data|information|system|program|software|hardware|phone|telephone|camera|television|radio|video|screen|button|switch|engine|motor|energy|power|science|research|experiment|invent|modern|digital|robot)\b/i
  },
  daily: {
    label: "Daily routines & home", ja: "日常",
    pattern: /\b(morning|noon|afternoon|evening|night|today|tomorrow|yesterday|wake|sleep|bed|get up|wash|bath|shower|brush|wear|clothes|shirt|shoes|hat|coat|room|house|home|door|window|chair|table|desk|light|clock|watch|key|umbrella|wallet|bag|clean|sweep|laundry|shop|shopping|buy|walk|rest|habit|routine)\b/i
  },
  verbs: { label: "Verbs", ja: "動詞" },
  adjectives: { label: "Adjectives", ja: "形容詞" },
  katakana: { label: "Katakana loanwords", ja: "カタカナ語" },
  expressions: { label: "Common expressions", ja: "表現" }
};

export const PUZZLE_SIZES = {
  small: { label: "Small (8×8 · ~6 words)", gridSize: 8, targetWords: 6 },
  medium: { label: "Medium (11×11 · ~10 words)", gridSize: 11, targetWords: 10 },
  large: { label: "Large (14×14 · ~14 words)", gridSize: 14, targetWords: 14 },
  custom: { label: "Custom size", gridSize: 11, targetWords: 10 }
};

export function createSeededRandom(seedInput) {
  let str = String(seedInput ?? Date.now());
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  }
  let state = h || 123456789;
  return function next() {
    state |= 0;
    state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function matchesTheme(item, themeKey) {
  if (!themeKey || themeKey === "all" || !THEMES[themeKey]) return true;
  const posTags = item.posTags || [];
  const posStr = String(item.partOfSpeech || "").toLowerCase();
  const word = String(item.word || "");
  const reading = String(item.furigana || item.reading || "");
  const meaning = String(item.meaning || "");
  if (themeKey === "verbs") {
    return posTags.some((p) => p.startsWith("v")) || posStr.includes("verb");
  }
  if (themeKey === "adjectives") {
    return posTags.some((p) => p.startsWith("adj")) || posStr.includes("adjective");
  }
  if (themeKey === "katakana") {
    return /^[\u30A0-\u30FFー]+$/.test(word) || /^[\u30A0-\u30FFー]+$/.test(reading);
  }
  if (themeKey === "expressions") {
    return posTags.some((p) => ["exp", "int", "conj", "adv", "prt"].includes(p))
      || /\b(expression|interjection|conjunction|adverb)\b/i.test(posStr);
  }
  const theme = THEMES[themeKey];
  return theme.pattern ? theme.pattern.test(meaning) : true;
}

export function cleanEnglishToken(meaning) {
  const parts = String(meaning || "")
    .split(/[;,]/)
    .map((s) => s.replace(/\([^)]*\)/g, "").replace(/^to\s+/i, "").trim())
    .filter(Boolean);
  for (const part of parts) {
    const letters = part.toUpperCase().replace(/[^A-Z]/g, "");
    if (letters.length >= 3 && letters.length <= 10 && /^[A-Za-z\s-]+$/.test(part)) {
      return letters;
    }
  }
  return "";
}

export function hasKanji(text) {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(String(text || ""));
}

export function resolveEntryAnswer(item, answerMode, rng = Math.random) {
  const word = String(item.word || "").trim();
  const reading = String(item.furigana || item.reading || word).trim();
  if (answerMode === "reverse") {
    const token = cleanEnglishToken(item.meaning);
    if (!token) return null;
    return { answer: token, chars: [...token], script: "english" };
  }
  if (answerMode === "kana") {
    const chars = [...reading].filter((c) => !/[\s・]/u.test(c));
    if (chars.length < 2) return null;
    return { answer: chars.join(""), chars, script: "kana" };
  }
  if (answerMode === "kanji") {
    if (!hasKanji(word)) return null;
    const chars = [...word].filter((c) => !/[\s・]/u.test(c));
    if (chars.length < 2) return null;
    return { answer: chars.join(""), chars, script: "kanji" };
  }
  // "both" / mixed mode: mix kanji and kana answers
  const useKanji = hasKanji(word) && [...word].length >= 2 && rng() < 0.55;
  const chosen = useKanji ? word : reading;
  const chars = [...chosen].filter((c) => !/[\s・]/u.test(c));
  if (chars.length < 2) return null;
  return { answer: chars.join(""), chars, script: useKanji ? "kanji" : "kana" };
}

export function formatFuriganaHTML(text) {
  return formatFurigana(text);
}

export function maskTargetInSentence(sentence, word, reading, { isFuriganaMarkup = false } = {}) {
  if (!sentence) return "";
  let out = String(sentence);
  const escapeRe = (s) => String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const stems = [];
  if (word && hasKanji(word)) {
    const kanjiPrefix = (word.match(/^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+/u) || [""])[0];
    if (kanjiPrefix) stems.push(kanjiPrefix);
  }
  const allKanji = [...new Set([...String(word || "")].filter((ch) => hasKanji(ch)))];

  if (isFuriganaMarkup) {
    // 1. Replace any {Base|Reading} ruby token that matches the word, reading, kanji stem, or shares a kanji from the word
    out = out.replace(/\{([^|{}]+)\|([^{}]+)\}[ぁ-ん]*/gu, (full, base, rt) => {
      if (
        base === word ||
        rt === reading ||
        (word && base.includes(word)) ||
        (reading && rt.includes(reading)) ||
        stems.some((st) => base.includes(st)) ||
        allKanji.some((k) => base.includes(k))
      ) {
        return "［＿＿］";
      }
      return full;
    });
  }

  // 2. Replace full word or reading occurrences
  if (word) {
    out = out.replace(new RegExp(`${escapeRe(word)}[ぁ-ん]*`, "gu"), "［＿＿］");
  }
  if (reading && reading.length >= 2) {
    out = out.replace(new RegExp(escapeRe(reading), "gu"), "［＿＿］");
  }
  // 3. Replace kanji stem + conjugated okurigana
  for (const stem of stems) {
    out = out.replace(new RegExp(`${escapeRe(stem)}[ぁ-ん]*`, "gu"), "［＿＿］");
  }

  return out;
}

export function buildClue(item, {
  script = "kana",
  answerMode = "kana",
  kanjiFocus = false,
  themeKey = "all",
  rng = Math.random
} = {}) {
  const word = String(item.word || "").trim();
  const reading = String(item.furigana || item.reading || word).trim();
  const romaji = item.romaji || romanizeKana(reading);
  const meaning = String(item.meaning || "").trim();
  const pos = String(item.partOfSpeech || "").split(",")[0]?.trim() || "";
  const themeLabel = themeKey !== "all" && THEMES[themeKey] ? THEMES[themeKey].label : "";

  if (answerMode === "reverse") {
    return {
      type: "reverse",
      badge: "Reverse · 英語",
      text: `${word} (${reading})`,
      furiganaHTML: alignFuriganaRuby(word, reading),
      romaji,
      hint: pos ? `${pos} · Enter the English meaning` : "Enter the English meaning"
    };
  }

  if (kanjiFocus && item.kanjiDetails?.length) {
    const kd = item.kanjiDetails;
    const breakdown = kd.map((k) => {
      const m = (k.meanings || []).slice(0, 2).join("/") || "kanji";
      return script === "kanji" ? `(${m})` : `${k.kanji} (${m})`;
    }).join(" + ");
    return {
      type: "kanji-focus",
      badge: `Kanji Focus · ${script === "kanji" ? "漢字" : "かな"}`,
      text: `${meaning} — Kanji: ${breakdown}`,
      furiganaHTML: "",
      romaji: "",
      hint: pos || `N${item.level}`
    };
  }

  const candidates = [];

  // 1. Standard English meaning clue
  candidates.push({
    type: "meaning",
    badge: script === "kanji" ? "漢字" : "かな",
    text: meaning,
    furiganaHTML: "",
    romaji: "",
    hint: [pos, themeLabel].filter(Boolean).join(" · ")
  });

  // 2. Fill-in-the-blank cloze sentence clue if example contains word or reading
  if (item.example && (item.example.includes(word) || (reading && item.example.includes(reading)))) {
    const blanked = maskTargetInSentence(item.example, word, reading, { isFuriganaMarkup: false });
    const rawFuriSource = item.exampleFurigana || item.example;
    const blankedFuri = maskTargetInSentence(rawFuriSource, word, reading, { isFuriganaMarkup: true });
    const leaksAnswer =
      (word && (blanked.includes(word) || blankedFuri.includes(word))) ||
      (reading && (blanked.includes(reading) || blankedFuri.includes(reading)));

    if (!leaksAnswer && blanked.includes("［＿＿］")) {
      candidates.push({
        type: "cloze",
        badge: `Cloze · ${script === "kanji" ? "漢字" : "かな"}`,
        text: `${blanked} — “${item.exampleMeaning || meaning}”`,
        furiganaHTML: `${formatFuriganaHTML(blankedFuri)} — “${item.exampleMeaning || meaning}”`,
        romaji: "",
        hint: `Meaning: ${meaning}`
      });
    }
  }

  // 3. Synonym / Antonym clue
  if (item.antonyms?.length) {
    candidates.push({
      type: "antonym",
      badge: `Antonym · ${script === "kanji" ? "漢字" : "かな"}`,
      text: `${meaning} (Opposite of ${item.antonyms[0]})`,
      furiganaHTML: "",
      romaji: "",
      hint: pos || "Antonym clue"
    });
  } else if (item.synonyms?.length) {
    candidates.push({
      type: "synonym",
      badge: `Related · ${script === "kanji" ? "漢字" : "かな"}`,
      text: `${meaning} (Related: ${item.synonyms[0]})`,
      furiganaHTML: "",
      romaji: "",
      hint: pos || "Synonym / related clue"
    });
  }

  // 4. Usage / Category hint
  if (item.usageNotes?.length || item.fields?.length) {
    const note = item.usageNotes?.[0] || item.fields?.[0];
    candidates.push({
      type: "usage",
      badge: `Usage · ${script === "kanji" ? "漢字" : "かな"}`,
      text: `${meaning} [${note}]`,
      furiganaHTML: "",
      romaji: "",
      hint: pos
    });
  }

  // Pick a varied clue deterministically via rng
  const pick = candidates.length > 1 && rng() < 0.45
    ? candidates[1 + Math.floor(rng() * (candidates.length - 1))]
    : candidates[0];
  return pick;
}

export function generateCrossword(pool, {
  gridSize = 11,
  targetWords = 10,
  answerMode = "kana",
  kanjiFocus = false,
  themeKey = "all",
  priorityIds = [],
  recentIds = [],
  seed = Date.now()
} = {}) {
  const rng = createSeededRandom(seed);
  const prioritySet = new Set(priorityIds);
  const recentSet = new Set(recentIds);
  const seenAnswers = new Set();
  const seenWords = new Set();

  // Prepare candidate entries
  const prepared = [];
  for (const item of pool || []) {
    if (!item || !item.word || !item.meaning) continue;
    const resolved = resolveEntryAnswer(item, answerMode, rng);
    if (!resolved) continue;
    const len = resolved.chars.length;
    if (len < 2 || len > gridSize) continue;
    if (seenAnswers.has(resolved.answer) || seenWords.has(item.word)) continue;
    seenAnswers.add(resolved.answer);
    seenWords.add(item.word);
    prepared.push({
      item,
      answer: resolved.answer,
      chars: resolved.chars,
      script: resolved.script,
      isPriority: prioritySet.has(item.id) || prioritySet.has(item.word),
      isRecent: recentSet.has(item.id) || recentSet.has(item.word) || recentSet.has(resolved.answer)
    });
  }

  if (!prepared.length) {
    return { rows: 0, cols: 0, grid: [], entries: [], across: [], down: [] };
  }

  // Compute character frequencies across prepared pool to favor intersectable words
  const charFreq = new Map();
  for (const entry of prepared) {
    for (const ch of new Set(entry.chars)) {
      charFreq.set(ch, (charFreq.get(ch) || 0) + 1);
    }
  }

  const scored = prepared.map((entry) => {
    const intersectScore = entry.chars.reduce((sum, ch) => sum + ((charFreq.get(ch) || 1) - 1), 0);
    return {
      ...entry,
      intersectScore,
      sortScore:
        (entry.isPriority ? 1000 : 0) -
        (entry.isRecent ? 500 : 0) +
        Math.min(intersectScore, 14) * 1.6 +
        entry.chars.length * 1.4 +
        rng() * 48
    };
  }).sort((a, b) => b.sortScore - a.sortScore);

  const canPlace = (board, chars, row, col, dir) => {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    const len = chars.length;
    if (row < 0 || col < 0) return -1;
    if (row + dr * (len - 1) >= gridSize || col + dc * (len - 1) >= gridSize) return -1;

    // Cell immediately before start and after end must be empty
    const beforeR = row - dr;
    const beforeC = col - dc;
    if (beforeR >= 0 && beforeC >= 0 && board[beforeR][beforeC] !== null) return -1;
    const afterR = row + dr * len;
    const afterC = col + dc * len;
    if (afterR < gridSize && afterC < gridSize && board[afterR][afterC] !== null) return -1;

    let intersections = 0;
    for (let i = 0; i < len; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const cell = board[r][c];
      if (cell !== null) {
        if (cell.char !== chars[i]) return -1;
        // Don't overlap in the same direction
        if (cell[dir]) return -1;
        intersections++;
      } else {
        // Check perpendicular neighbors; they must be empty so we don't form unintended adjacent words
        if (dir === "across") {
          if (r > 0 && board[r - 1][c] !== null) return -1;
          if (r + 1 < gridSize && board[r + 1][c] !== null) return -1;
        } else {
          if (c > 0 && board[r][c - 1] !== null) return -1;
          if (c + 1 < gridSize && board[r][c + 1] !== null) return -1;
        }
      }
    }
    return intersections;
  };

  const placeWord = (board, placed, candidate, row, col, dir) => {
    const dr = dir === "down" ? 1 : 0;
    const dc = dir === "across" ? 1 : 0;
    for (let i = 0; i < candidate.chars.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      if (!board[r][c]) {
        board[r][c] = { char: candidate.chars[i], across: false, down: false };
      }
      board[r][c][dir] = true;
    }
    placed.push({ ...candidate, row, col, dir });
  };

  let bestLayout = null;
  const starters = scored.filter((entry) => entry.intersectScore > 0);
  if (!starters.length) starters.push(scored[0]);
  const maxAttempts = Math.min(8, starters.length);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const board = Array.from({ length: gridSize }, () => Array(gridSize).fill(null));
    const placed = [];
    const usedIndices = new Set();

    // Pick starter word that has intersections if possible
    const starter = starters[attempt];
    usedIndices.add(scored.indexOf(starter));
    const startRow = Math.floor(gridSize / 2);
    const startCol = Math.max(0, Math.floor((gridSize - starter.chars.length) / 2));
    placeWord(board, placed, starter, startRow, startCol, "across");

    let madeProgress = true;
    while (placed.length < targetWords && madeProgress) {
      madeProgress = false;
      let bestMove = null;

      for (let idx = 0; idx < scored.length; idx++) {
        if (usedIndices.has(idx)) continue;
        const cand = scored[idx];
        // Find all valid intersecting placements
        for (const existing of placed) {
          const nextDir = existing.dir === "across" ? "down" : "across";
          for (let i = 0; i < existing.chars.length; i++) {
            const ch = existing.chars[i];
            for (let j = 0; j < cand.chars.length; j++) {
              if (cand.chars[j] !== ch) continue;
              const er = existing.row + (existing.dir === "down" ? i : 0);
              const ec = existing.col + (existing.dir === "across" ? i : 0);
              const row = er - (nextDir === "down" ? j : 0);
              const col = ec - (nextDir === "across" ? j : 0);
              const intersections = canPlace(board, cand.chars, row, col, nextDir);
              if (intersections > 0) {
                // Prefer placements with more intersections, balanced across/down, and closer to center
                const centerDist = Math.abs(row + (nextDir === "down" ? cand.chars.length / 2 : 0) - gridSize / 2)
                  + Math.abs(col + (nextDir === "across" ? cand.chars.length / 2 : 0) - gridSize / 2);
                const dirCount = placed.filter((p) => p.dir === nextDir).length;
                const dirBonus = dirCount === 0 ? 50 : Math.max(0, 15 - dirCount * 2);
                const moveScore = (cand.isPriority ? 200 : 0) - (cand.isRecent ? 160 : 0) + intersections * 35 + dirBonus - centerDist * 1.5 + rng() * 14;
                if (!bestMove || moveScore > bestMove.moveScore) {
                  bestMove = { idx, cand, row, col, dir: nextDir, moveScore };
                }
              }
            }
          }
        }
      }

      if (bestMove) {
        usedIndices.add(bestMove.idx);
        placeWord(board, placed, bestMove.cand, bestMove.row, bestMove.col, bestMove.dir);
        madeProgress = true;
      }
    }

    const hasAcross = placed.some((p) => p.dir === "across");
    const hasDown = placed.some((p) => p.dir === "down");
    const balanceBonus = placed.filter((p) => p.dir === "across").length * placed.filter((p) => p.dir === "down").length;
    const layoutScore = placed.length * 20 + balanceBonus * 10;
    if (!bestLayout || layoutScore > bestLayout.layoutScore) {
      bestLayout = { board, placed, layoutScore };
      if (placed.length >= targetWords && hasAcross && hasDown) break;
    }
  }

  const { board, placed } = bestLayout;

  // Crop bounding box to keep grid compact and clean
  let minR = gridSize, maxR = 0, minC = gridSize, maxC = 0;
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (board[r][c]) {
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
      }
    }
  }

  const rows = maxR - minR + 1;
  const cols = maxC - minC + 1;
  const grid = Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => {
      const cell = board[r + minR][c + minC];
      return cell
        ? {
            row: r,
            col: c,
            solution: cell.char,
            value: "",
            number: null,
            acrossId: null,
            downId: null,
            status: "empty", // "empty" | "correct" | "incorrect" | "revealed"
            locked: false
          }
        : null;
    })
  );

  // Normalize placed coordinates to cropped grid
  const shifted = placed.map((p) => ({
    ...p,
    row: p.row - minR,
    col: p.col - minC
  }));

  // Assign standard crossword clue numbers (top-to-bottom, left-to-right)
  const startNumbers = new Map();
  let nextNum = 1;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const startsHere = shifted.some((p) => p.row === r && p.col === c);
      if (startsHere) {
        startNumbers.set(`${r},${c}`, nextNum);
        grid[r][c].number = nextNum;
        nextNum++;
      }
    }
  }

  const entries = shifted
    .map((p) => {
      const number = startNumbers.get(`${p.row},${p.col}`);
      const id = `${number}-${p.dir}`;
      const cells = [];
      for (let i = 0; i < p.chars.length; i++) {
        const r = p.row + (p.dir === "down" ? i : 0);
        const c = p.col + (p.dir === "across" ? i : 0);
        cells.push({ row: r, col: c });
        if (p.dir === "across") grid[r][c].acrossId = id;
        else grid[r][c].downId = id;
      }
      const clue = buildClue(p.item, {
        script: p.script,
        answerMode,
        kanjiFocus,
        themeKey,
        rng
      });
      return {
        id,
        number,
        dir: p.dir,
        row: p.row,
        col: p.col,
        length: p.chars.length,
        answer: p.answer,
        chars: p.chars,
        script: p.script,
        cells,
        clue,
        item: p.item,
        completed: false,
        revealed: false
      };
    })
    .sort((a, b) => a.number - b.number || (a.dir === "across" ? -1 : 1));

  return {
    rows,
    cols,
    grid,
    entries,
    across: entries.filter((e) => e.dir === "across"),
    down: entries.filter((e) => e.dir === "down")
  };
}
