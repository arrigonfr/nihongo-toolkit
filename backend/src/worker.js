import { createHandler } from "./handler.js";
import { segmentText } from "./tokenizer.js";
import { assetTokenizer } from "./tokenizer-worker.js";
import { createSentenceFallback } from "./examples.js";
import { createSentenceTranslator } from "./analyze.js";
import { createWordFallback } from "./shiritori.js";
import { openTursoDatabase } from "./turso.js";
import { pageViews } from "./page-views.js";
import { contactForm, discordContactReply } from "./contact.js";
import { scheduleContactDelivery } from "./contact-delivery.js";
import { createD1Cache } from "./d1-cache.js";

const handlers = new WeakMap();

function allowedOriginsFor(url, env) {
  return [url.origin, ...(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)];
}

function selectRateLimiter(pathname, method, env) {
  if (method === "OPTIONS" || pathname === "/api/discord/contact") return null;
  if (method === "POST" && (pathname === "/api/page-views" || pathname === "/api/contact")) {
    return { limiter: env.WRITE_RATE_LIMITER, bucket: `write:${pathname}`, period: 60 };
  }
  if (pathname === "/api/analyze" || pathname === "/api/sentences") {
    return { limiter: env.EXPENSIVE_RATE_LIMITER, bucket: `expensive:${pathname}`, period: 60 };
  }
  if (pathname.startsWith("/api/")) {
    return { limiter: env.API_RATE_LIMITER, bucket: "api", period: 60 };
  }
  return null;
}

async function checkRateLimit(request, url, env) {
  const selection = selectRateLimiter(url.pathname, request.method, env);
  if (!selection?.limiter?.limit) return null;
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const { success } = await selection.limiter.limit({ key: `${selection.bucket}:${ip}` });
  if (success) return null;
  const headers = {
    "Cache-Control": "no-store",
    "Retry-After": String(selection.period),
    Vary: "Origin"
  };
  const origin = request.headers.get("Origin");
  if (origin && allowedOriginsFor(url, env).includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return Response.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers }
  );
}

function isEdgeCacheable(method, url) {
  if (method !== "GET") return false;
  const { pathname, searchParams } = url;
  if (!pathname.startsWith("/api/")) return false;
  if (pathname === "/api/health" || pathname === "/api/page-views"
      || pathname === "/api/contact" || pathname === "/api/discord/contact"
      || pathname === "/api/kanji/batch" || pathname === "/api/words/batch") return false;
  if (pathname === "/api/conjugator" && searchParams.get("random") === "true") return false;
  if ((pathname === "/api/sentences" || pathname === "/api/shiritori/words") && searchParams.get("random") === "1") return false;
  return true;
}

function edgeCacheKey(url) {
  const canonical = new URL(url.origin + url.pathname);
  const entries = [...url.searchParams.entries()].sort(([a, av], [b, bv]) =>
    a === b ? av.localeCompare(bv) : a.localeCompare(b));
  for (const [k, v] of entries) canonical.searchParams.append(k, v);
  return new Request(canonical.toString(), { method: "GET" });
}

export default {
  scheduled(_event, env, ctx) {
    scheduleContactDelivery(env, ctx);
    const cache = createD1Cache(env.PAGE_VIEWS_DB);
    if (cache) ctx?.waitUntil?.(cache.prune());
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const limited = await checkRateLimit(request, url, env);
    if (limited) return limited;
    if (url.pathname === "/api/contact") return contactForm(request, env, ctx);
    if (url.pathname === "/api/discord/contact") return discordContactReply(request, env, ctx);
    if (url.pathname === "/api/page-views") return pageViews(request, env, ctx);
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

    const origin = request.headers.get("Origin");
    const allowed = allowedOriginsFor(url, env);
    if (origin && !allowed.includes(origin)) {
      return Response.json({ error: "Origin is not allowed" }, {
        status: 403,
        headers: { "Cache-Control": "no-store", Vary: "Origin, Accept-Encoding" }
      });
    }

    const cache = typeof caches !== "undefined" ? caches.default : null;
    const cacheable = cache && isEdgeCacheable(request.method, url);
    const cacheKey = cacheable ? edgeCacheKey(url) : null;
    if (cacheKey) {
      const cached = await cache.match(cacheKey);
      if (cached) {
        const hitHeaders = new Headers(cached.headers);
        hitHeaders.set("Vary", "Origin, Accept-Encoding");
        if (origin) hitHeaders.set("Access-Control-Allow-Origin", origin);
        else hitHeaders.delete("Access-Control-Allow-Origin");
        return new Response(cached.body, { status: cached.status, headers: hitHeaders });
      }
    }

    const headers = new Headers();
    let status = 200;
    let body;
    const res = {
      setHeader: (name, value) => headers.set(name, value),
      set statusCode(value) { status = value; },
      end: (value) => { body = value; }
    };
    let state = handlers.get(env);
    if (!state) {
      try {
        state = { database: openTursoDatabase(env), byOrigin: new Map() };
        handlers.set(env, state);
      } catch (error) {
        console.error("Database configuration failed:", error);
        return Response.json({ error: "Database unavailable" }, { status: 503 });
      }
    }
    const { database, byOrigin } = state;
    let handler = byOrigin.get(url.origin);
    if (!handler) {
      const apiCache = createD1Cache(env.PAGE_VIEWS_DB);
      handler = createHandler({
        database,
        origins: allowed,
        compression: false,
        segment: (text) => segmentText(text, () => assetTokenizer(env.ASSETS)),
        sentenceFallback: createSentenceFallback({
          enabled: env.SENTENCE_API_FALLBACK !== "false",
          cache: apiCache,
          cooldownMs: 300_000
        }),
        translateSentence: createSentenceTranslator({
          enabled: env.TRANSLATION_API_FALLBACK !== "false",
          cache: apiCache,
          cooldownMs: 300_000,
          ai: env.AI || null,
          deeplApiKey: env.DEEPL_API_KEY || "",
          groqApiKey: env.GROQ_API_KEY || "",
          groqModel: env.GROQ_MODEL || undefined,
          geminiApiKey: env.GEMINI_API_KEY || "",
          geminiModel: env.GEMINI_MODEL || undefined,
          openrouterApiKey: env.OPENROUTER_API_KEY || "",
          openrouterModel: env.OPENROUTER_MODEL || undefined,
          mymemoryEmail: env.MYMEMORY_EMAIL || env.CONTACT_EMAIL_FROM || "",
          siteUrl: allowed.find((o) => o !== url.origin) || url.origin
        }),
        wordFallback: createWordFallback({ enabled: env.WORD_API_FALLBACK !== "false" })
      });
      if (byOrigin.size >= 8) byOrigin.delete(byOrigin.keys().next().value);
      byOrigin.set(url.origin, handler);
    }
    await handler({
      url: request.url, method: request.method,
      headers: Object.fromEntries(request.headers)
    }, res);
    const response = new Response(status === 204 || request.method === "HEAD" ? null : body, { status, headers });
    if (cacheKey && status === 200 && /\bpublic\b/i.test(headers.get("Cache-Control") || "")) {
      const storeHeaders = new Headers(headers);
      storeHeaders.delete("Access-Control-Allow-Origin");
      storeHeaders.set("Vary", "Accept-Encoding");
      const toCache = new Response(body, { status, headers: storeHeaders });
      ctx?.waitUntil?.(cache.put(cacheKey, toCache).catch(() => {}));
    }
    return response;
  }
};
