import { exactWordCandidates } from "./async-database.js";
import { segmentText } from "./tokenizer.js";

export { segmentText } from "./tokenizer.js";

const GODAN_MASU = { い: "う", き: "く", ぎ: "ぐ", し: "す", ち: "つ", に: "ぬ", び: "ぶ", み: "む", り: "る" };
const GODAN_NAI = { わ: "う", か: "く", が: "ぐ", さ: "す", た: "つ", な: "ぬ", ば: "ぶ", ま: "む", ら: "る" };
const GODAN_BA = { え: "う", け: "く", げ: "ぐ", せ: "す", て: "つ", ね: "ぬ", べ: "ぶ", め: "む", れ: "る" };

export function deinflectCandidates(surface) {
  const out = [surface];
  const add = (word) => {
    if (word && !out.includes(word)) out.push(word);
  };

  if (
    /^(し|して|した|しない|しなかった|します|しました|しません|しませんでした|している|していた|しています|していました|したい|できる|できます|できました|できません|できませんでした)$/.test(
      surface,
    )
  ) {
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
    "ませんでした",
    "ました",
    "ません",
    "ます",
    "ましょう",
    "たいです",
    "たかったです",
    "たくなかったです",
    "たい",
    "たかった",
    "たくない",
    "たくなかった",
    "たくて",
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
    "ていました",
    "ていません",
    "ています",
    "ていた",
    "ていない",
    "ている",
    "ておく",
    "てある",
    "てしまう",
    "てしまった",
    "でいました",
    "でいません",
    "でいます",
    "でいた",
    "でいない",
    "でいる",
    "でおく",
    "である",
    "でしまう",
    "でしまった",
    "たら",
    "たり",
    "て",
    "た",
    "だら",
    "だり",
    "で",
    "だ",
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
    "られました",
    "られません",
    "られます",
    "られた",
    "られて",
    "られない",
    "られる",
    "れました",
    "れません",
    "れます",
    "れた",
    "れて",
    "れない",
    "れる",
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

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const TRANSLATION_SYSTEM_PROMPT =
  "Translate the following Japanese text into natural English. Return only the English translation without notes, explanations, or surrounding quotes.";
const PERSISTENT_TRANSLATION_TTL_MS = 24 * 60 * 60 * 1000;
const MEMORY_TRANSLATION_TTL_MS = 60 * 60 * 1000;

export function extractEmail(value) {
  const match = String(value || "").match(EMAIL_RE);
  return match ? match[0] : "";
}

function cleanTranslation(value) {
  let text = String(value || "").trim();
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

function isCooldownStatus(status) {
  return status === 402 || status === 429 || status === 456 || status >= 500;
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   enabled?: boolean,
 *   cache?: any,
 *   cooldownMs?: number,
 *   now?: () => number,
 *   ai?: any,
 *   deeplApiKey?: string,
 *   groqApiKey?: string,
 *   groqModel?: string,
 *   geminiApiKey?: string,
 *   geminiModel?: string,
 *   openrouterApiKey?: string,
 *   openrouterModel?: string,
 *   mymemoryEmail?: string,
 *   siteUrl?: string
 * }} [options]
 */
export function createSentenceTranslator({
  fetchImpl = fetch,
  enabled = process.env.TRANSLATION_API_FALLBACK !== "false",
  cache = null,
  cooldownMs = 5 * 60 * 1000,
  now = Date.now,
  ai = null,
  deeplApiKey = process.env.DEEPL_API_KEY || "",
  groqApiKey = process.env.GROQ_API_KEY || "",
  groqModel = process.env.GROQ_MODEL || "llama-3.1-8b-instant",
  geminiApiKey = process.env.GEMINI_API_KEY || "",
  geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash-lite",
  openrouterApiKey = process.env.OPENROUTER_API_KEY || "",
  openrouterModel = process.env.OPENROUTER_MODEL || "openrouter/free",
  mymemoryEmail = process.env.MYMEMORY_EMAIL || process.env.CONTACT_EMAIL_FROM || "",
  siteUrl = process.env.SITE_URL || "https://nihongotoolkit.pages.dev",
} = {}) {
  const memoryCache = new Map();
  const pending = new Map();
  const cooldowns = new Map();
  const contactEmail = extractEmail(mymemoryEmail);

  const isCoolingDown = (provider) => (cooldowns.get(provider) || 0) > now();
  const tripCooldown = (provider) => {
    if (cooldownMs > 0) cooldowns.set(provider, now() + cooldownMs);
  };

  async function runOpenAICompatible(provider, endpoint, apiKey, model, query, extraHeaders = {}) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      signal: AbortSignal.timeout(8000),
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 300,
        messages: [
          { role: "system", content: TRANSLATION_SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
      }),
    });
    if (!response.ok) {
      if (isCooldownStatus(response.status)) tripCooldown(provider);
      return "";
    }
    const payload = await response.json();
    return cleanTranslation(payload?.choices?.[0]?.message?.content);
  }

  const providers = [
    ai?.run
      ? {
          name: "workers-ai",
          async translate(query) {
            const result = await ai.run("@cf/meta/m2m100-1.2b", {
              text: query,
              source_lang: "ja",
              target_lang: "en",
            });
            return cleanTranslation(result?.translated_text);
          },
        }
      : null,
    deeplApiKey
      ? {
          name: "deepl",
          async translate(query) {
            const response = await fetchImpl("https://api-free.deepl.com/v2/translate", {
              method: "POST",
              signal: AbortSignal.timeout(6000),
              headers: {
                "Content-Type": "application/json",
                Authorization: `DeepL-Auth-Key ${deeplApiKey}`,
              },
              body: JSON.stringify({ text: [query], source_lang: "JA", target_lang: "EN" }),
            });
            if (!response.ok) {
              if (isCooldownStatus(response.status)) tripCooldown("deepl");
              return "";
            }
            const payload = await response.json();
            return cleanTranslation(payload?.translations?.[0]?.text);
          },
        }
      : null,
    groqApiKey
      ? {
          name: "groq",
          translate: (query) =>
            runOpenAICompatible(
              "groq",
              "https://api.groq.com/openai/v1/chat/completions",
              groqApiKey,
              groqModel,
              query,
            ),
        }
      : null,
    geminiApiKey
      ? {
          name: "gemini",
          async translate(query) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;
            const response = await fetchImpl(url, {
              method: "POST",
              signal: AbortSignal.timeout(8000),
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: TRANSLATION_SYSTEM_PROMPT }] },
                contents: [{ role: "user", parts: [{ text: query }] }],
                generationConfig: { temperature: 0, maxOutputTokens: 300 },
              }),
            });
            if (!response.ok) {
              if (isCooldownStatus(response.status)) tripCooldown("gemini");
              return "";
            }
            const payload = await response.json();
            return cleanTranslation(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
          },
        }
      : null,
    openrouterApiKey
      ? {
          name: "openrouter",
          translate: (query) =>
            runOpenAICompatible(
              "openrouter",
              "https://openrouter.ai/api/v1/chat/completions",
              openrouterApiKey,
              openrouterModel,
              query,
              { "HTTP-Referer": siteUrl, "X-Title": "NihongoToolkit" },
            ),
        }
      : null,
    {
      name: "mymemory",
      async translate(query) {
        const url = new URL("https://api.mymemory.translated.net/get");
        const params = { langpair: "ja|en", q: query };
        if (contactEmail) params.de = contactEmail;
        url.search = new URLSearchParams(params).toString();
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(6000),
          headers: { Accept: "application/json" },
        });
        if (!response.ok) {
          if (isCooldownStatus(response.status)) tripCooldown("mymemory");
          return "";
        }
        const payload = await response.json();
        const candidate = cleanTranslation(payload?.responseData?.translatedText);
        if (!candidate || /^MYMEMORY WARNING/i.test(candidate)) {
          if (/^MYMEMORY WARNING/i.test(candidate)) tripCooldown("mymemory");
          return "";
        }
        return candidate;
      },
    },
  ].filter(Boolean);

  return async function translateSentence(text) {
    if (!enabled) return "";
    const query = String(text || "").trim();
    if (!query) return "";
    const cached = memoryCache.get(query);
    if (cached && cached.expires > now()) return cached.translation;
    if (pending.has(query)) return pending.get(query);

    const request = (async () => {
      const cacheKey = `translate:ja-en:${query}`;
      if (cache?.get) {
        const persisted = await cache.get(cacheKey);
        if (typeof persisted === "string" && persisted) {
          if (memoryCache.size >= 300) memoryCache.delete(memoryCache.keys().next().value);
          memoryCache.set(query, { translation: persisted, expires: now() + MEMORY_TRANSLATION_TTL_MS });
          return persisted;
        }
      }

      let translation = "";
      for (const provider of providers) {
        if (!provider || isCoolingDown(provider.name)) continue;
        try {
          translation = await provider.translate(query);
          if (translation) break;
        } catch {
          // Ignore transient error and try next provider in pool
        }
      }

      if (translation) {
        if (memoryCache.size >= 300) {
          memoryCache.delete(memoryCache.keys().next().value);
        }
        memoryCache.set(query, { translation, expires: now() + MEMORY_TRANSLATION_TTL_MS });
        if (cache?.set) {
          await cache.set(cacheKey, translation, PERSISTENT_TRANSLATION_TTL_MS);
        }
      }
      return translation;
    })();

    pending.set(query, request);
    try {
      return await request;
    } finally {
      pending.delete(query);
    }
  };
}

async function localSentenceTranslation(db, text) {
  try {
    const row = await db
      .prepare("SELECT en FROM sentences WHERE ja = ? AND en <> '' ORDER BY (source = 'ai-generated'), id LIMIT 1")
      .get(text);
    return String(row?.en || "").trim();
  } catch {
    return "";
  }
}

/**
 * @param {any} db
 * @param {string} text
 * @param {{ toWord?: any, toWords?: any, translateSentence?: any, segment?: any, onTiming?: (phase: string, duration: number) => void }} [options]
 */
export async function analyzeSentence(
  db,
  text,
  {
    toWord = undefined,
    toWords = undefined,
    translateSentence = createSentenceTranslator(),
    segment = segmentText,
    onTiming = (_phase, _duration) => {},
  } = {},
) {
  const trimmed = String(text || "").trim();
  let started = performance.now();
  const rawTokens = await segment(text);
  onTiming("tokenizer", performance.now() - started);
  started = performance.now();
  const candidatesByToken = rawTokens.map((token) =>
    token.type === "word" || token.type === "particle"
      ? [...new Set([token.base, token.text, ...deinflectCandidates(token.text)].filter(Boolean))]
      : [],
  );
  const matches = await exactWordCandidates(db, candidatesByToken.flat());
  onTiming("dictionary", performance.now() - started);
  started = performance.now();
  const selectedRows = [
    ...new Map(
      candidatesByToken
        .flatMap((candidates) => matches.get(candidates.find((candidate) => matches.get(candidate)?.length)) ?? [])
        .map((row) => [row.id, row]),
    ).values(),
  ];
  const mappedRows = toWords ? await toWords(selectedRows) : await Promise.all(selectedRows.map(toWord));
  const mappedById = new Map(selectedRows.map((row, index) => [row.id, mappedRows[index]]));
  const enriched = await Promise.all(
    rawTokens.map(async (token, index) => {
      if (token.type !== "word" && token.type !== "particle") {
        return { ...token, reading: "", base: "", result: null, results: [] };
      }
      const candidates = candidatesByToken[index];
      for (const candidate of candidates) {
        const rows = matches.get(candidate);
        if (rows.length) {
          const mapped = rows.map((row) => mappedById.get(row.id));
          const primary = mapped[0];
          const form =
            (primary.japanese || []).find((f) => f.word === candidate || f.reading === candidate) ||
            primary.japanese?.[0] ||
            {};
          return {
            ...token,
            base: candidate,
            reading: token.reading || (candidate === token.text ? form.reading : "") || "",
            result: primary,
            results: mapped,
          };
        }
      }
      return { ...token, result: null, results: [] };
    }),
  );
  onTiming("enrichment", performance.now() - started);

  started = performance.now();
  let translation = "";
  let translationSource = "";
  let translationUnavailable = false;
  if (trimmed) {
    translation = await localSentenceTranslation(db, trimmed);
    if (translation) {
      translationSource = "Local corpus";
    } else {
      translation = await translateSentence(trimmed);
      if (translation) {
        translationSource = "Translation";
      } else {
        translationUnavailable = true;
      }
    }
    onTiming("translation", performance.now() - started);
  }

  return {
    tokens: enriched,
    translation,
    translationSource,
    translationUnavailable,
  };
}
