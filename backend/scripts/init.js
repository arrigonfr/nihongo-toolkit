import { createDatabase, databasePath } from "../src/database.js";
const db = createDatabase();
db.close();
console.log(`SQLite schema ready: ${databasePath}`);
