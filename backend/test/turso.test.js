import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { asyncDatabase } from "../src/async-database.js";
import { openTursoDatabase } from "../src/turso.js";

test("Turso batches reads, normalizes rows, and deduplicates only within a request", async () => {
  const client = createClient({ url: ":memory:" });
  let batches = 0;
  const source = { batch(stmts, mode) { batches++; assert.equal(mode, "read"); return client.batch(stmts, mode); } };
  try {
    const db = asyncDatabase(source);
    const rows = await Promise.all(Array.from({ length: 100 }, (_, i) => db.prepare("SELECT ? AS n").get(i)));
    assert.deepEqual(rows[99], { n: 99 });
    assert.equal(batches, 1);
    assert.deepEqual(await db.prepare("SELECT ? AS n").get(99), { n: 99 });
    assert.equal(batches, 1);
    await asyncDatabase(source).prepare("SELECT ? AS n").get(99);
    assert.equal(batches, 2);
    assert.equal(await db.prepare("SELECT 1 WHERE 0").get(), undefined);
    const failures = await Promise.allSettled([
      db.prepare("SELECT * FROM missing_table").all(),
      db.prepare("SELECT 2").all()
    ]);
    assert.ok(failures.every((result) => result.status === "rejected"));
  } finally {
    client.close();
  }
});

test("Turso configuration requires both secrets", () => {
  for (const env of [{}, { TURSO_DATABASE_URL: "libsql://example.turso.io" }, { TURSO_AUTH_TOKEN: "token" }]) {
    assert.throws(() => openTursoDatabase(env), /TURSO_DATABASE_URL and TURSO_AUTH_TOKEN/);
  }
});

test("Incomplete batches reject every waiting query", async () => {
  const db = asyncDatabase({ batch: async () => [] });
  await assert.rejects(db.prepare("SELECT 1").get(), /Incomplete Turso batch/);
});
