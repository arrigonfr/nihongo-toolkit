import { createHandler } from "./handler.js";
import { segmentText } from "./tokenizer.js";
import { assetTokenizer } from "./tokenizer-worker.js";
import { createSentenceFallback } from "./examples.js";
import { createSentenceTranslator } from "./analyze.js";
import { createWordFallback } from "./shiritori.js";

const handlers = new WeakMap();
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/") {
      url.pathname = "/index.html";
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    const headers = new Headers();
    let status = 200;
    let body;
    const res = {
      setHeader: (name, value) => headers.set(name, value),
      set statusCode(value) { status = value; },
      end: (value) => { body = value; }
    };
    let byOrigin = handlers.get(env.DB);
    if (!byOrigin) { byOrigin = new Map(); handlers.set(env.DB, byOrigin); }
    let handler = byOrigin.get(url.origin);
    if (!handler) {
      handler = createHandler({
      database: env.DB,
      origins: [url.origin, ...(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)],
      compression: false,
      segment: (text) => segmentText(text, () => assetTokenizer(env.ASSETS)),
      sentenceFallback: createSentenceFallback({ enabled: env.SENTENCE_API_FALLBACK !== "false" }),
      translateSentence: createSentenceTranslator({ enabled: env.TRANSLATION_API_FALLBACK !== "false" }),
      wordFallback: createWordFallback({ enabled: env.WORD_API_FALLBACK !== "false" })
      });
      if (byOrigin.size >= 8) byOrigin.delete(byOrigin.keys().next().value);
      byOrigin.set(url.origin, handler);
    }
    await handler({
      url: request.url, method: request.method,
      headers: Object.fromEntries(request.headers)
    }, res);
    return new Response(status === 204 ? null : body, { status, headers });
  }
};
