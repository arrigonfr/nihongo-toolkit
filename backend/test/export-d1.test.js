import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, readFile, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { createDatabase } from "../src/database.js";
import { exportD1, sqlValue } from "../scripts/export-d1.js";

test("D1 export preserves records and can be replayed without replacing them", async () => {
  const dir = join("backend/.cache", `d1-export-test-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  const source = createDatabase(":memory:");
  const target = createDatabase(":memory:");
  try {
    source.prepare("INSERT INTO metadata VALUES (?, ?)").run("example", "O'Brien 日本");
    source.prepare("INSERT INTO metadata VALUES (?, ?)").run("other", "value");
    const manifest = await exportD1(source, join(dir, "sql"), { batchSize: 1 });
    assert.equal(manifest.length, 2);
    for (const { file } of manifest) {
      const sql = await readFile(join(dir, "sql", file), "utf8");
      target.exec(sql);
      target.exec(sql);
    }
    assert.equal(target.prepare("SELECT value FROM metadata WHERE key = ?").get("example").value, "O'Brien 日本");
    target.prepare("UPDATE metadata SET value = ? WHERE key = ?").run("existing", "example");
    target.exec(await readFile(join(dir, "sql", manifest[0].file), "utf8"));
    assert.equal(target.prepare("SELECT value FROM metadata WHERE key = ?").get("example").value, "existing");
    assert.equal(target.prepare("SELECT count(*) AS n FROM metadata").get().n, 2);
    await assert.rejects(exportD1(source, join(dir, "sql")), { code: "EEXIST" });
    assert.throws(() => sqlValue("bad\0text"), /NUL/);
  } finally {
    source.close();
    target.close();
    await rm(dir, { recursive: true, force: true });
  }
});
