import { segmentText } from "./tokenizer.js";
export { segmentText } from "./tokenizer.js";

const GODAN_MASU = { "い": "う", "き": "く", "ぎ": "ぐ", "し": "す", "ち": "つ", "に": "ぬ", "び": "ぶ", "み": "む", "り": "る" };
const GODAN_NAI  = { "わ": "う", "か": "く", "が": "ぐ", "さ": "す", "た": "つ", "な": "ぬ", "ば": "ぶ", "ま": "む", "ら": "る" };
const GODAN_BA   = { "え": "う", "け": "く", "げ": "ぐ", "せ": "す", "て": "つ", "ね": "ぬ", "べ": "ぶ", "め": "む", "れ": "る" };

export function deinflectCandidates(surface) {
  const out = [surface];
  const add = (word) => {
    if (word && !out.includes(word)) out.push(word);
  };

  if (/^(し|して|した|しない|しなかった|します|しました|しません|しませんでした|している|していた|しています|していました|したい|できる|できます|できました|できません|できませんでした)$/.test(surface)) {
    if (surface.startsWith("でき")) add("できる");
    else add("する");
  }
  if (/^(き|きて|きた|こない|こなかった|きます|きました|きません|きませんでした|来.+)$/.test(surface)) {
    add(surface.startsWith("来") ? "来る" : "くる");
  }
  if (/^(あり|あって|あった|あります|ありました|ありません|ありませんでした)$/.test(surface)) {
    add("ある");
  }
  if (surface === "いい" || surface === "よかった" || surface === "よくない" || surface === "よく") {
    add("いい");
    add("良い");
  }

  const masuSuffixes = [
    "ませんでした", "ました", "ません", "ます", "ましょう",
    "たいです", "たかったです", "たくなかったです", "たい", "たかった", "たくない", "たくなかった", "たくて"
  ];
  for (const suf of masuSuffixes) {
    if (surface.length > suf.length && surface.endsWith(suf)) {
      const stem = surface.slice(0, -suf.length);
      add(stem + "る");
      const last = stem.slice(-1);
      if (GODAN_MASU[last]) add(stem.slice(0, -1) + GODAN_MASU[last]);
      add(stem);
    }
  }

  const teSuffixes = [
    "ていました", "ていません", "ています", "ていた", "ていない", "ている", "ておく", "てある", "てしまう", "てしまった",
    "でいました", "でいません", "でいます", "でいた", "でいない", "でいる", "でおく", "である", "でしまう", "でしまった",
    "たら", "たり", "て", "た", "だら", "だり", "で", "だ"
  ];
  for (const suf of teSuffixes) {
    if (surface.length > suf.length && surface.endsWith(suf)) {
      const stem = surface.slice(0, -suf.length);
      const voiced = suf.startsWith("で") || suf.startsWith("だ");
      if (!voiced) {
        add(stem + "る");
        if (stem.endsWith("っ")) {
          const base = stem.slice(0, -1);
          add(base + "う");
          add(base + "つ");
          add(base + "る");
          add(base + "く");
        } else if (stem.endsWith("い")) {
          const base = stem.slice(0, -1);
          add(base + "く");
          add(base + "う");
        } else if (stem.endsWith("し")) {
          add(stem.slice(0, -1) + "す");
        }
      } else {
        if (stem.endsWith("ん")) {
          const base = stem.slice(0, -1);
          add(base + "む");
          add(base + "ぶ");
          add(base + "ぬ");
        } else if (stem.endsWith("い")) {
          add(stem.slice(0, -1) + "ぐ");
        }
      }
    }
  }

  const naiSuffixes = ["なければ", "なかった", "なくて", "ないで", "ない", "ず"];
  for (const suf of naiSuffixes) {
    if (surface.length > suf.length && surface.endsWith(suf)) {
      const stem = surface.slice(0, -suf.length);
      add(stem + "る");
      const last = stem.slice(-1);
      if (GODAN_NAI[last]) add(stem.slice(0, -1) + GODAN_NAI[last]);
    }
  }

  const passiveSuffixes = [
    "られました", "られません", "られます", "られた", "られて", "られない", "られる",
    "れました", "れません", "れます", "れた", "れて", "れない", "れる"
  ];
  for (const suf of passiveSuffixes) {
    if (surface.length > suf.length && surface.endsWith(suf)) {
      const stem = surface.slice(0, -suf.length);
      add(stem + "る");
      const last = stem.slice(-1);
      if (GODAN_NAI[last]) add(stem.slice(0, -1) + GODAN_NAI[last]);
    }
  }

  const adjSuffixes = ["くなかった", "くない", "かった", "くて", "く"];
  for (const suf of adjSuffixes) {
    if (surface.length > suf.length && surface.endsWith(suf)) {
      const stem = surface.slice(0, -suf.length);
      add(stem + "い");
    }
  }

  if (surface.length > 2 && surface.endsWith("れば")) {
    const stem = surface.slice(0, -2);
    add(stem + "る");
    const last = stem.slice(-1);
    if (GODAN_BA[last]) add(stem.slice(0, -1) + GODAN_BA[last]);
  }

  return out;
}

const translationCache = new Map();
const translationPending = new Map();

export function createSentenceTranslator({
  fetchImpl = fetch,
  enabled = process.env.TRANSLATION_API_FALLBACK !== "false"
} = {}) {
  return async function translateSentence(text) {
    if (!enabled) return "";
    const query = String(text || "").trim();
    if (!query) return "";
    const cached = translationCache.get(query);
    if (cached && cached.expires > Date.now()) return cached.translation;
    if (translationPending.has(query)) return translationPending.get(query);

    const request = (async () => {
      let translation = "";
      try {
        const url = new URL("https://api.mymemory.translated.net/get");
        url.search = new URLSearchParams({ langpair: "ja|en", q: query });
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(6000),
          headers: { Accept: "application/json" }
        });
        if (response.ok) {
          const payload = await response.json();
          const candidate = String(payload?.responseData?.translatedText || "").trim();
          if (candidate && !/^MYMEMORY WARNING/i.test(candidate)) {
            translation = candidate;
          }
        }
      } catch {
        // Ignore and try fallback provider
      }

      if (!translation) {
        try {
          const url = new URL("https://translate.googleapis.com/translate_a/single");
          url.search = new URLSearchParams({ client: "gtx", sl: "ja", tl: "en", dt: "t", q: query });
          const response = await fetchImpl(url, {
            signal: AbortSignal.timeout(6000),
            headers: { Accept: "application/json" }
          });
          if (response.ok) {
            const payload = await response.json();
            if (Array.isArray(payload?.[0])) {
              translation = payload[0].map((part) => part?.[0] || "").join("").trim();
            }
          }
        } catch {
          // Ignore network error
        }
      }

      if (translation) {
        if (translationCache.size >= 300) {
          translationCache.delete(translationCache.keys().next().value);
        }
        translationCache.set(query, { translation, expires: Date.now() + 3600000 });
      }
      return translation;
    })();

    translationPending.set(query, request);
    try {
      return await request;
    } finally {
      translationPending.delete(query);
    }
  };
}

export async function analyzeSentence(db, text, { toWord, translateSentence = createSentenceTranslator() } = {}) {
  const trimmed = String(text || "").trim();
  const findExact = db.prepare(`
    SELECT * FROM words
    WHERE word = ? OR reading = ?
    ORDER BY is_common DESC, (word = ? OR senses LIKE '%"uk"%') DESC, id
    LIMIT 6
  `);

  const rawTokens = await segmentText(text);
  const enriched = rawTokens.map((token) => {
    if (token.type !== "word" && token.type !== "particle") {
      return { ...token, reading: "", base: "", result: null, results: [] };
    }
    const candidates = [...new Set([token.base, token.text, ...deinflectCandidates(token.text)].filter(Boolean))];
    for (const candidate of candidates) {
      const rows = findExact.all(candidate, candidate, candidate);
      if (rows.length) {
        const mapped = rows.map((row) => toWord(row));
        const primary = mapped[0];
        const form = (primary.japanese || []).find((f) => f.word === candidate || f.reading === candidate)
          || primary.japanese?.[0] || {};
        return {
          ...token,
          base: candidate,
          reading: token.reading || (candidate === token.text ? form.reading : "") || "",
          result: primary,
          results: mapped
        };
      }
    }
    return { ...token, result: null, results: [] };
  });

  let translation = "";
  let translationSource = "";
  if (trimmed) {
    translation = await translateSentence(trimmed);
    if (translation) {
      translationSource = "Translation";
    }
  }

  return {
    tokens: enriched,
    translation,
    translationSource
  };
}
