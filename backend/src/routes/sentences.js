import { analyzeSentence } from "../analyze.js";
import { translateExamples } from "../content-translations.js";
import { localExamples, shuffleExamples } from "../examples.js";
import { CACHE_DYNAMIC, HttpError, searchTerm } from "../http.js";

const unique = (items) => [...new Set(items)];

export async function handleSentenceRoutes({
  res,
  path,
  params,
  db,
  send,
  toWords,
  translateSentence,
  sentenceFallback,
  segment,
}) {
  if (path === "/api/analyze") {
    const text = (params.get("text") ?? params.get("q") ?? "").trim();
    if (!text || text.length > 500) throw new HttpError(400, "Text must contain 1-500 characters");
    const timings = [];
    const result = await analyzeSentence(db, text, {
      toWords,
      translateSentence,
      segment,
      onTiming: (phase, duration) => {
        timings.push(`${phase};dur=${duration.toFixed(1)}`);
      },
    });
    const characters = unique([...text].filter((ch) => /\p{Script=Han}/u.test(ch)));
    result.kanji = characters.length
      ? await db
          .prepare("SELECT character, jlpt FROM kanjis WHERE character IN (SELECT value FROM json_each(?))")
          .all(JSON.stringify(characters))
      : [];
    res.setHeader("Server-Timing", timings.join(", "));
    await send(200, result, CACHE_DYNAMIC);
    return true;
  }
  if (path === "/api/sentences") {
    const query = searchTerm(params);
    const random = params.get("random") === "1";
    let excluded;
    try {
      excluded = JSON.parse(params.get("exclude") || "[]");
    } catch {
      throw new HttpError(400, "Invalid sentence exclusions.");
    }
    if (
      !Array.isArray(excluded) ||
      excluded.length > 10 ||
      excluded.some((text) => typeof text !== "string" || text.length > 1000)
    ) {
      throw new HttpError(400, "Invalid sentence exclusions.");
    }
    let examples = await localExamples(db, { query, limit: 100, random: true });
    if (params.get("corpus") === "1") examples = examples.filter((example) => !example.generated);
    const remainingLocal = examples.filter((example) => !excluded.includes(example.japanese));
    let warning = "";
    if (!examples.length || (random && remainingLocal.length < 5)) {
      try {
        examples.push(...(await sentenceFallback(query)));
      } catch (error) {
        console.error("Sentence fallback failed:", error);
        if (!examples.length) throw new HttpError(502, "Example sentences could not be loaded. Please retry.");
        warning = "Online examples are unavailable right now. Showing saved examples; try again later.";
      }
    }
    const seen = new Set();
    examples = examples.filter((example) => {
      if (seen.has(example.japanese)) return false;
      seen.add(example.japanese);
      return true;
    });
    const fresh = examples.filter((example) => !excluded.includes(example.japanese));
    const picked = await translateExamples(
      db,
      shuffleExamples(fresh.length ? fresh : examples).slice(0, random ? 1 : 3),
    );
    const data = picked.map((example) => ({
      id: example.id,
      text: example.japanese,
      furigana: example.furigana,
      license: example.license,
      owner: example.owner,
      source: example.source,
      generated: example.generated ?? false,
      reviewed: example.reviewed ?? false,
      attribution: example.attribution,
      translations: [
        { id: example.translationId, lang: "eng", text: example.english, owner: example.translationOwner },
      ],
      ...(example.translations_by_language ? { translations_by_language: example.translations_by_language } : {}),
    }));
    await send(200, { data, ...(warning ? { warning } : {}) }, random || warning ? undefined : CACHE_DYNAMIC);
    return true;
  }
  return false;
}
