import { openDatabase } from "./database.js";
import { createHandler as createPortableHandler } from "./handler.js";
export { dictionaryRecord, kanjiRecord } from "./handler.js";

export function createHandler(options = {}) {
  return createPortableHandler({ openDatabase, ...options });
}
