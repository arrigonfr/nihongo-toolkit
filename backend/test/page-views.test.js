import test from "node:test";
import assert from "node:assert/strict";
import { pageViews } from "../src/page-views.js";

test("TRACK_VISITS requires the exact string true and disabled reporting never touches D1", async () => {
  const original = process.env.TRACK_VISITS;
  try {
    delete process.env.TRACK_VISITS;
    for (const flag of [undefined, "", "false", "TRUE", "1", true, false]) {
      const env = { TRACK_VISITS: flag, get PAGE_VIEWS_DB() { throw new Error("D1 must not be accessed"); } };
      const response = await pageViews(new Request("https://worker.test/api/page-views", { method: "POST" }), env, {});
      assert.equal(response.status, 503);
    }
    process.env.TRACK_VISITS = "true";
    const tasks = [];
    const storage = { prepare() { return { bind() { return { run: async () => {} }; } }; } };
    assert.equal((await pageViews(new Request("https://worker.test/api/page-views", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"page":"/"}'
    }), { PAGE_VIEWS_DB: storage }, { waitUntil: (task) => tasks.push(task) })).status, 202, "Node-compatible process.env flag is supported");
    await Promise.all(tasks);
    const env = { TRACK_VISITS: "false", get PAGE_VIEWS_DB() { throw new Error("Worker false overrides Node flag"); } };
    assert.equal((await pageViews(new Request("https://worker.test/api/page-views", { method: "POST" }), env, {})).status, 503);
  } finally {
    if (original === undefined) delete process.env.TRACK_VISITS;
    else process.env.TRACK_VISITS = original;
  }
});

test("UTC dates roll over without time components; failed writes stay off the response path", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-05T23:59:59.999Z") });
  const dates = [], tasks = [];
  const env = { TRACK_VISITS: "true", PAGE_VIEWS_DB: {
    prepare() { return { bind(date) { dates.push(date); return { run: async () => {} }; } }; }
  } };
  const request = () => new Request("https://worker.test/api/page-views", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: '{"page":"/"}'
  });
  await pageViews(request(), env, { waitUntil: (task) => tasks.push(task) });
  await Promise.all(tasks);
  t.mock.timers.tick(1);
  await pageViews(request(), env, { waitUntil: (task) => tasks.push(task) });
  await Promise.all(tasks);
  assert.deepEqual(dates, ["2026-11-05", "2026-11-06"]);
  t.mock.method(console, "error", () => {});
  env.PAGE_VIEWS_DB.prepare = () => { throw new Error("Unavailable"); };
  assert.equal((await pageViews(request(), env, { waitUntil: (task) => tasks.push(task) })).status, 202);
  await Promise.all(tasks);
  assert.equal(console.error.mock.callCount(), 1);
});

test("counter schedules server UTC aggregate writes without awaiting D1", async () => {
  const tasks = [];
  let values, complete;
  const pending = new Promise((resolve) => { complete = resolve; });
  const env = { TRACK_VISITS: "true", ALLOWED_ORIGINS: "https://nihongo-toolkit.pages.dev",
    PAGE_VIEWS_DB: { prepare(sql) {
      assert.match(sql, /ON CONFLICT\(date, page\) DO UPDATE SET views = views \+ 1/);
      return { bind(...args) { values = args; return { run: () => pending }; } };
    } } };
  const response = await pageViews(new Request("https://worker.test/api/page-views", {
    method: "POST", headers: { Origin: env.ALLOWED_ORIGINS, "Content-Type": "application/json" }, body: '{"page":"/"}'
  }), env, { waitUntil: (promise) => tasks.push(promise) });
  assert.equal(response.status, 202);
  assert.equal(tasks.length, 1);
  assert.match(values[0], /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(values[0], values[2].slice(0, 10));
  assert.match(values[2], /Z$/);
  assert.equal(values[1], "/");
  complete();
  await Promise.all(tasks);
});

test("counter failures are explicit and payload/CORS are narrowly constrained", async () => {
  const env = { TRACK_VISITS: "true", PAGE_VIEWS_DB: {} };
  const request = (body, extra = {}) => new Request("https://worker.test/api/page-views", {
    method: "POST", headers: { "Content-Type": "application/json" }, body, ...extra
  });
  for (const body of ['{}', '{"page":"/unknown"}', '{"page":"/index.html"}', '{"page":"/?q=private"}', '{"page":"/","id":"secret"}', 'null', '{']) {
    assert.equal((await pageViews(request(body), env, {})).status, 400);
  }
  assert.equal((await pageViews(request("x".repeat(257)), env, {})).status, 413);
  assert.equal((await pageViews(request('{"page":"/"}', { headers: { "Content-Type": "text/plain" } }), env, {})).status, 415);
  assert.equal((await pageViews(request('{"page":"/"}', { headers: { Origin: "https://evil.test" } }), env, {})).status, 403);
  assert.equal((await pageViews(request('{"page":"/"}'), {}, {})).status, 503);
  assert.equal((await pageViews(request('{"page":"/"}'), { TRACK_VISITS: "true" }, {})).status, 503);
  assert.equal((await pageViews(new Request("https://worker.test/api/page-views", { method: "DELETE" }), env, {})).status, 405);
});

test("daily counts default to UTC today and remain readable with tracking disabled", async (t) => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date("2026-11-06T00:30:00Z") });
  const dates = [];
  const env = { TRACK_VISITS: "false", PAGE_VIEWS_DB: {
    prepare(sql) {
      assert.match(sql, /WHERE date = \? ORDER BY page/);
      return { bind(date) {
        dates.push(date);
        return { all: async () => ({ results: date === "2026-11-06"
          ? [{ page: "/", views: 2 }, { page: "/fumitoki.html", views: 3 }] : [] }) };
      } };
    }
  } };
  const get = (query = "") => pageViews(new Request(`https://worker.test/api/page-views${query}`), env, {});
  assert.deepEqual(await (await get()).json(), {
    date: "2026-11-06", pages: [{ page: "/", views: 2 }, { page: "/fumitoki.html", views: 3 }], total: 5
  });
  assert.deepEqual(await (await get("?date=2024-02-29")).json(), { date: "2024-02-29", pages: [], total: 0 });
  for (const date of ["", "2026-02-29", "2026-04-31", "2026-13-01", "2026-1-01", "today", "2026-11-06T00:00:00Z"]) {
    assert.equal((await get(`?date=${encodeURIComponent(date)}`)).status, 400, date);
  }
  assert.equal((await get("?date=2026-11-06&date=2026-11-05")).status, 400);
  assert.deepEqual(dates, ["2026-11-06", "2024-02-29"]);
  assert.equal((await pageViews(new Request("https://worker.test/api/page-views"), {}, {})).status, 503);
  t.mock.method(console, "error", () => {});
  env.PAGE_VIEWS_DB.prepare = () => { throw new Error("Unavailable"); };
  assert.equal((await get()).status, 503);
  assert.equal(console.error.mock.callCount(), 1);
});
