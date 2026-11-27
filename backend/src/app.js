import { contactForm, discordContactReply } from "./contact.js";
import { openDatabase } from "./database.js";
import { createHandler as createPortableHandler } from "./handler.js";
import { openLocalD1 } from "./local-d1.js";
import { sendWebResponse, toWebRequest } from "./node-fetch-adapter.js";
import { pageViews } from "./page-views.js";

export { dictionaryRecord, kanjiRecord } from "./handler.js";

const WORKER_ROUTES = {
  "/api/page-views": pageViews,
  "/api/contact": contactForm,
  "/api/discord/contact": discordContactReply,
};

export function createHandler(options = {}) {
  const portable = createPortableHandler({ openDatabase, ...options });
  let localD1;
  const pending = new Set();
  const ctx = options.ctx ?? {
    waitUntil(promise) {
      const tracked = Promise.resolve(promise).catch((error) => console.error("Background task failed:", error));
      pending.add(tracked);
      tracked.finally(() => pending.delete(tracked));
    },
  };
  const getEnv = () => {
    const base = {
      ALLOWED_ORIGINS: "http://localhost:5173,http://127.0.0.1:5173",
      ...process.env,
      ...(options.env || {}),
    };
    const hasExplicitD1 = options.env && Object.hasOwn(options.env, "PAGE_VIEWS_DB");
    if (!base.PAGE_VIEWS_DB && !hasExplicitD1 && options.localD1 !== false) {
      localD1 ??= openLocalD1(options.localD1Path);
      base.PAGE_VIEWS_DB = localD1;
    }
    return base;
  };

  return async function handler(req, res) {
    const pathname = new URL(req.url || "/", "http://localhost").pathname;
    const workerRoute = WORKER_ROUTES[pathname];
    if (workerRoute) {
      const response = await workerRoute(toWebRequest(req), getEnv(), ctx);
      await sendWebResponse(res, response);
      return;
    }
    return portable(req, res);
  };
}
