import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { analyzeSentence, createSentenceTranslator, extractEmail } from "../src/analyze.js";
import { createD1Cache } from "../src/d1-cache.js";
import { asyncDatabase } from "../src/async-database.js";

function d1Adapter(sqlite) {
  return {
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      return {
        bind(...args) {
          return {
            async first() { return stmt.get(...args) ?? null; },
            async run() { return stmt.run(...args); }
          };
        }
      };
    }
  };
}

test("extractEmail parses bare and display-name email strings", () => {
  assert.equal(extractEmail("hello@example.com"), "hello@example.com");
  assert.equal(extractEmail("NihongoToolkit <contact@example.com>"), "contact@example.com");
  assert.equal(extractEmail("not-an-email"), "");
});

test("createSentenceTranslator tries configured free providers in priority order and cools down 429s", async () => {
  const attempts = [];
  let currentTime = 1_000_000;
  const translate = createSentenceTranslator({
    enabled: true,
    cooldownMs: 60_000,
    now: () => currentTime,
    ai: {
      async run(model) {
        attempts.push(`workers-ai:${model}`);
        throw new Error("quota exceeded");
      }
    },
    deeplApiKey: "deepl-key",
    groqApiKey: "groq-key",
    geminiApiKey: "gemini-key",
    openrouterApiKey: "or-key",
    mymemoryEmail: "NihongoToolkit <team@example.com>",
    fetchImpl: async (url) => {
      const href = String(url);
      if (href.includes("api-free.deepl.com")) {
        attempts.push("deepl");
        return { ok: false, status: 456 };
      }
      if (href.includes("api.groq.com")) {
        attempts.push("groq");
        return { ok: false, status: 429 };
      }
      if (href.includes("generativelanguage.googleapis.com")) {
        attempts.push("gemini");
        return { ok: false, status: 503 };
      }
      if (href.includes("openrouter.ai")) {
        attempts.push("openrouter");
        return { ok: true, json: async () => ({ choices: [{ message: { content: '"Good morning."' } }] }) };
      }
      throw new Error(`Unexpected URL: ${href}`);
    }
  });

  assert.equal(await translate("おはようございます。"), "Good morning.");
  assert.deepEqual(attempts, ["workers-ai:@cf/meta/m2m100-1.2b", "deepl", "groq", "gemini", "openrouter"]);

  // Second distinct sentence skips cooled-down DeepL, Groq, and Gemini immediately
  attempts.length = 0;
  assert.equal(await translate("こんにちは。"), "Good morning.");
  assert.deepEqual(attempts, ["workers-ai:@cf/meta/m2m100-1.2b", "openrouter"]);
});

test("createSentenceTranslator passes de=<email> to MyMemory and falls back to Google Translate", async () => {
  const urls = [];
  const translate = createSentenceTranslator({
    enabled: true,
    mymemoryEmail: "NihongoToolkit <owner@example.com>",
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      urls.push(parsed);
      if (parsed.hostname === "api.mymemory.translated.net") {
        assert.equal(parsed.searchParams.get("de"), "owner@example.com");
        return { ok: true, json: async () => ({ responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS" } }) };
      }
      return { ok: true, json: async () => [[["Thank you.", "ありがとう。"]]] };
    }
  });

  assert.equal(await translate("ありがとう。"), "Thank you.");
  assert.equal(urls.length, 2);
});

test("createD1Cache persists translations across translator instances and degrades safely if unmigrated", async () => {
  const unmigrated = new DatabaseSync(":memory:");
  try {
    const brokenCache = createD1Cache(d1Adapter(unmigrated));
    assert.equal(await brokenCache.get("missing"), null);
    await brokenCache.set("missing", "value", 60_000);
  } finally {
    unmigrated.close();
  }

  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE api_cache (cache_key TEXT PRIMARY KEY, value TEXT NOT NULL, expires_at INTEGER NOT NULL);
  `);
  let currentTime = 10_000;
  const cache = createD1Cache(d1Adapter(sqlite), { now: () => currentTime });
  let calls = 0;
  const makeTranslator = () => createSentenceTranslator({
    enabled: true,
    cache,
    now: () => currentTime,
    fetchImpl: async () => {
      calls++;
      return { ok: true, json: async () => ({ responseData: { translatedText: "Hello." } }) };
    }
  });

  try {
    assert.equal(await makeTranslator()("こんにちは"), "Hello.");
    assert.equal(calls, 1);
    // Fresh translator instance (simulating isolate restart) reads from D1 cache
    assert.equal(await makeTranslator()("こんにちは"), "Hello.");
    assert.equal(calls, 1);

    // After TTL expires, prune deletes it and translator fetches again
    currentTime += 25 * 60 * 60 * 1000;
    await cache.prune();
    assert.equal(await cache.get("translate:ja-en:こんにちは"), null);
  } finally {
    sqlite.close();
  }
});

test("analyzeSentence prefers local sentences table before calling external translator and marks unavailable", async () => {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE words (id INTEGER PRIMARY KEY, kanji TEXT, kana TEXT, meanings TEXT, common INTEGER, kanji_forms TEXT, kana_forms TEXT, senses TEXT);
    CREATE TABLE word_forms (kind INTEGER, form TEXT, word_id INTEGER);
    CREATE TABLE sentences (id INTEGER PRIMARY KEY, source TEXT, source_id TEXT, ja TEXT, en TEXT, license TEXT, attribution TEXT);
    INSERT INTO sentences VALUES (1, 'tatoeba', '1', '日本です。', 'It is Japan.', 'CC BY 2.0 FR', '{}');
  `);
  const db = asyncDatabase(sqlite);
  let translatorCalls = 0;
  try {
    const local = await analyzeSentence(db, "日本です。", {
      toWord: (row) => row,
      segment: async () => [],
      translateSentence: async () => { translatorCalls++; return "Should not be called"; }
    });
    assert.equal(local.translation, "It is Japan.");
    assert.equal(local.translationSource, "Local corpus");
    assert.equal(local.translationUnavailable, false);
    assert.equal(translatorCalls, 0);

    const unavailable = await analyzeSentence(db, "未知の文です。", {
      toWord: (row) => row,
      segment: async () => [],
      translateSentence: async () => { translatorCalls++; return ""; }
    });
    assert.equal(unavailable.translation, "");
    assert.equal(unavailable.translationUnavailable, true);
    assert.equal(translatorCalls, 1);
  } finally {
    sqlite.close();
  }
});
