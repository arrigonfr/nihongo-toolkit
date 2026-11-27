import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = join(here, "..", "data", "dev-page-views.sqlite");
const MIGRATIONS_DIR = join(here, "..", "migrations", "page-views");

function applyMigrations(sqlite) {
  sqlite.exec("CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)");
  const applied = new Set(
    sqlite
      .prepare("SELECT name FROM _local_migrations")
      .all()
      .map((row) => row.name),
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  for (const name of files) {
    if (applied.has(name)) continue;
    sqlite.exec("BEGIN");
    try {
      sqlite.exec(readFileSync(join(MIGRATIONS_DIR, name), "utf8"));
      sqlite.prepare("INSERT INTO _local_migrations (name) VALUES (?)").run(name);
      sqlite.exec("COMMIT");
    } catch (error) {
      sqlite.exec("ROLLBACK");
      throw error;
    }
  }
}

export function createLocalD1(sqlite) {
  function prepare(sql) {
    const makeBound = (args) => ({
      sql,
      args,
      bind: (...nextArgs) => makeBound(nextArgs),
      async all() {
        return { results: sqlite.prepare(sql).all(...args) };
      },
      async first() {
        return sqlite.prepare(sql).get(...args) ?? null;
      },
      async run() {
        const result = sqlite.prepare(sql).run(...args);
        return { success: true, meta: { changes: Number(result.changes ?? 0) } };
      },
    });
    return makeBound([]);
  }
  return {
    prepare,
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const results = [];
        for (const stmt of statements) {
          results.push(await stmt.run());
        }
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => sqlite.close(),
  };
}

export function openLocalD1(path = process.env.LOCAL_D1_PATH || DEFAULT_DB_PATH) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const sqlite = new DatabaseSync(path);
  sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  applyMigrations(sqlite);
  return createLocalD1(sqlite);
}
