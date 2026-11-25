import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { createClient } from "@libsql/client/web";
import { ensureTranslationSchema, syncTranslations, translationValueHash, writeTranslationReview } from "../scripts/translation-lib.js";

test("translation sync protects conflicts on a dedicated empty Turso staging database", {
  skip: process.env.RUN_TRANSLATION_STAGING !== "1"
}, async () => {
  const { TURSO_DATABASE_URL: production, TURSO_STAGING_DATABASE_URL: staging,
    TURSO_STAGING_AUTH_TOKEN: token } = process.env;
  if (!production || !staging || !token) throw new Error("Production URL, staging URL and staging token are required");
  const origin = (url) => {
    const parsed = new URL(url);
    if (!["libsql:", "https:"].includes(parsed.protocol)) throw new Error("Database URLs must use libsql:// or https://");
    return new URL(url.replace(/^libsql:/, "https:")).origin;
  };
  if (origin(production) === origin(staging)) throw new Error("Staging and production URLs must differ");

  const client = createClient({ url: staging, authToken: token, intMode: "number" });
  const db = new DatabaseSync(":memory:");
  let initialized = false;
  try {
    const objects = await client.execute(`SELECT type, name FROM sqlite_master
      WHERE (type='table' AND name NOT LIKE 'sqlite_%') OR type='trigger'`);
    if (objects.rows.some((row) => row.type !== "table" || row.name !== "content_translations")) throw new Error("Staging database must be empty");
    if (objects.rows.length && Number((await client.execute("SELECT count(*) AS n FROM content_translations")).rows[0].n) !== 0) {
      throw new Error("Staging translations must be empty");
    }
    ensureTranslationSchema(db);
    await client.executeMultiple(readFileSync(new URL("../src/translations.sql", import.meta.url), "utf8"));
    initialized = true;
    const insert = db.prepare("INSERT INTO content_translations VALUES (?,?,?,?,?,?,?,?,?,?)");
    for (const id of ["staging:machine", "staging:human"]) {
      insert.run("sense", id, "es", '["test"]', "machine", "translation-staging-test", "test", "{}", "hash", "2026-01-01T00:00:00.000Z");
      writeTranslationReview(db, {
        kind: "sense", item_id: id, lang: "es", source_hash: "hash",
        value_hash: translationValueHash('["test"]'), status: "approved", reviewer: "staging test"
      });
    }
    assert.equal((await syncTranslations(db, client, "staging", { batchSize: 1 })).matched, 2);
    await client.execute({ sql: "UPDATE content_translations SET method='human', value=? WHERE item_id=?",
      args: ['["human"]', "staging:human"] });
    const conflict = await syncTranslations(db, client, "staging");
    assert.equal(conflict.protectedHuman, 1);
    db.prepare("DELETE FROM content_translations").run();
    await assert.rejects(syncTranslations(db, client, "staging"), /Conflicting or human remote translation/);
    assert.equal((await client.execute("SELECT count(*) n FROM content_translations")).rows[0].n, 2);
    insert.run("sense", "staging:human", "es", '["human"]', "human", "translation-staging-test", "test", "{}", "hash", "2026-01-01T00:00:00.000Z");
    const result = await syncTranslations(db, client, "staging");
    assert.equal(result.deleted, 1);
    assert.equal(result.matched, 1);
  } finally {
    try {
      if (initialized) await client.execute({
        sql: "DELETE FROM content_translations WHERE source=? AND item_id IN (?,?)",
        args: ["translation-staging-test", "staging:machine", "staging:human"]
      });
    } finally { client.close(); db.close(); }
  }
});
