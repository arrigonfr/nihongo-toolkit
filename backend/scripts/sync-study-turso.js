import { DatabaseSync } from "node:sqlite";
import { databasePath } from "../src/database.js";
import { openTursoDatabase } from "../src/turso.js";

const tables = ["study_decks", "study_guide_entries", "study_guide_cards", "study_guide_pairs", "study_guide_info", "study_drawing"];

export async function syncStudy(local, remote, log = console.log) {
  local.exec("BEGIN");
  try {
    const plan = tables.map(table => {
      const { n } = local.prepare(`SELECT count(*) AS n FROM ${table}`).get();
      if (!n) throw new Error(`Empty ${table}; provision the local study database first.`);
      const { sql } = local.prepare("SELECT sql FROM sqlite_schema WHERE type='table' AND name=?").get(table);
      const columns = local.prepare(`PRAGMA table_info(${table})`).all();
      const indexes = local.prepare("SELECT sql FROM sqlite_schema WHERE type='index' AND tbl_name=? AND sql IS NOT NULL").all(table).map(r => r.sql);
      return { table, n, sql, columns, indexes };
    });
    for (const { table, n, sql, columns, indexes } of plan) {
      log(`${table}: ${n} local rows`);
      if (!remote) continue;
      const names = columns.map(c => c.name);
      const remoteInfo = await remote.execute(`PRAGMA table_info(${table})`);
      const remoteNames = (remoteInfo?.rows || []).map(row => row.name ?? row[1]);
      if (remoteNames.length && (remoteNames.length !== names.length || remoteNames.some((name, i) => name !== names[i]))) {
        log(`${table}: remote schema differs; recreating table`);
        await remote.execute(`DROP TABLE IF EXISTS ${table}`);
      }
      await remote.execute(sql.replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS "));
      for (const indexSql of indexes) {
        await remote.execute(indexSql.replace(/^CREATE (UNIQUE )?INDEX /i, "CREATE $1INDEX IF NOT EXISTS "));
      }
      const keys = columns.filter(c => c.pk).sort((a,b) => a.pk-b.pk).map(c => c.name);
      const updates = names.filter(name => !keys.includes(name)).map(name => `${name}=excluded.${name}`);
      const insert = `INSERT INTO ${table} (${names}) VALUES (${names.map(() => "?")})
        ON CONFLICT (${keys}) DO UPDATE SET ${updates}`;
      let batch = [], bytes = 0;
      for (const row of local.prepare(`SELECT * FROM ${table}`).iterate()) {
        const args = names.map(name => row[name]);
        const size = Buffer.byteLength(JSON.stringify(args));
        if (batch.length && (batch.length >= 100 || bytes + size > 500_000)) {
          await remote.batch(batch, "write");
          batch = []; bytes = 0;
        }
        batch.push({ sql: insert, args });
        bytes += size;
      }
      if (batch.length) await remote.batch(batch, "write");
    }
  } finally { local.exec("ROLLBACK"); }
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length && !(args.length === 1 && args[0] === "--apply")) throw new Error("Usage: sync-study-turso.js [--apply]");
  const local = new DatabaseSync(databasePath, { readOnly: true });
  const remote = args.length ? openTursoDatabase(process.env) : null;
  try {
    console.log(remote ? `Applying study data to ${new URL(process.env.TURSO_DATABASE_URL).hostname}` : "Dry run: local counts only; no remote connection.");
    await syncStudy(local, remote);
    if (remote) console.log("Study sync complete.");
  } finally { remote?.close(); local.close(); }
}
