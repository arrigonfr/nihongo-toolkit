import { createSentenceTranslator } from "./analyze.js";
import { asyncDatabase } from "./async-database.js";
import { createSentenceFallback } from "./examples.js";
import { applyStandardHeaders, HttpError } from "./http.js";
import { isPracticeKanji } from "./practice-kanji.js";
import { handleKanjiRoutes } from "./routes/kanji.js";
import { handlePracticeRoutes } from "./routes/practice.js";
import { handleSentenceRoutes } from "./routes/sentences.js";
import { handleStudyRoutes } from "./routes/study.js";
import { handleWordsRoutes } from "./routes/words.js";
import { createLookupHelpers, dictionaryRecord, kanjiRecord } from "./serializers.js";
import { createWordFallback } from "./shiritori.js";
import { sendBody } from "./transport.js";

export { dictionaryRecord, kanjiRecord };

const parse = JSON.parse;
const ROUTE_HANDLERS = [handlePracticeRoutes, handleKanjiRoutes, handleWordsRoutes, handleSentenceRoutes];

/**
 * @param {{
 *   database?: any,
 *   openDatabase?: any,
 *   origins?: string[],
 *   segment?: any,
 *   sentenceFallback?: any,
 *   translateSentence?: any,
 *   wordFallback?: any,
 *   compression?: boolean
 * }} [options]
 */
export function createHandler({
  database = undefined,
  openDatabase = undefined,
  origins = undefined,
  segment = undefined,
  sentenceFallback = createSentenceFallback(),
  translateSentence = createSentenceTranslator(),
  wordFallback = createWordFallback(),
  compression = process.env.API_COMPRESSION === "true" ||
    (process.env.API_COMPRESSION !== "false" && process.env.NODE_ENV === "production"),
} = {}) {
  let source = database;
  let tags;
  let practiceFilterRegistered = false;
  const kanjiCounts = new Map();
  const allowedOrigins =
    origins ??
    (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,http://127.0.0.1:5173").split(",").map((s) => s.trim());

  return async function handler(req, res) {
    res.setHeader("Vary", "Origin, Accept-Encoding");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    const send = (status, data, cacheControl) => {
      if (status === 200 && cacheControl) res.setHeader("Cache-Control", cacheControl);
      res.statusCode = status;
      return sendBody(req, res, JSON.stringify(data), "application/json; charset=utf-8", compression);
    };
    try {
      if (applyStandardHeaders(req, res, allowedOrigins)) return;
      const url = new URL(req.url, "http://localhost");
      let path;
      try {
        path = decodeURIComponent(url.pathname);
      } catch {
        throw new HttpError(400, "Invalid URL encoding");
      }
      const params = url.searchParams;
      if (!source) source = openDatabase();
      if (!practiceFilterRegistered && !source.batch) {
        source.function("is_practice_kanji", { deterministic: true }, (character, on, kun, meanings) =>
          Number(isPracticeKanji(character, parse(on), parse(kun), parse(meanings))),
        );
        practiceFilterRegistered = true;
      }
      const db = asyncDatabase(source);
      if (req.method === "HEAD" && path === "/api/health") {
        await db.prepare("SELECT 1").get();
        res.statusCode = 200;
        res.end();
        return;
      }
      if (await handleStudyRoutes({ path, url, db, send })) return;

      tags ??= parse((await db.prepare("SELECT value FROM metadata WHERE key = 'jmdict_tags'").get())?.value ?? "{}");
      const helpers = createLookupHelpers(db, tags);
      const context = {
        req,
        res,
        url,
        path,
        params,
        db,
        tags,
        send,
        kanjiCounts,
        compression,
        segment,
        sentenceFallback,
        translateSentence,
        wordFallback,
        ...helpers,
      };
      for (const route of ROUTE_HANDLERS) {
        if (await route(context)) return;
      }
      throw new HttpError(404, "Endpoint not found");
    } catch (error) {
      res.setHeader("Cache-Control", "no-store");
      if (!(error instanceof HttpError)) console.error("Backend request failed:", error);
      return send(error instanceof HttpError ? error.status : 503, {
        error:
          error instanceof HttpError
            ? error.message
            : "The dictionary is temporarily unavailable. Please try again in a moment.",
      });
    }
  };
}
