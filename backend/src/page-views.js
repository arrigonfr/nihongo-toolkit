import { PAGE_PATHS } from "../../frontend/src/page-paths.js";

export async function pageViews(request, env, ctx) {
  const origin = request.headers.get("Origin");
  const allowed = [new URL(request.url).origin, ...(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim())];
  const headers = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin && !allowed.includes(origin)) return new Response(null, { status: 403, headers });
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  const reply = (status, error) => error
    ? Response.json({ error }, { status, headers })
    : new Response(null, { status, headers });
  if (request.method === "OPTIONS") {
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    return reply(204);
  }
  if (request.method !== "POST") {
    headers.Allow = "POST, OPTIONS";
    return reply(405, "Method not allowed");
  }
  if ((env.TRACK_VISITS ?? process.env.TRACK_VISITS) !== "true") return reply(503, "Page view reporting is disabled");
  if (!env.PAGE_VIEWS_DB) return reply(503, "Page view storage is not configured");
  if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") || "")) return reply(415, "Expected JSON");
  // Bound the stream as well as Content-Length, which is optional and untrusted.
  const reader = request.body?.getReader();
  if (!reader) return reply(400, "Expected a page");
  const chunks = [];
  let length = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 256) { await reader.cancel(); return reply(413, "Payload too large"); }
    chunks.push(value);
  }
  let payload;
  try {
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    payload = JSON.parse(new TextDecoder().decode(bytes));
  } catch { return reply(400, "Invalid JSON"); }
  if (!payload || Object.keys(payload).length !== 1 || !PAGE_PATHS.includes(payload.page)) return reply(400, "Invalid canonical page");
  const now = new Date().toISOString();
  ctx.waitUntil(Promise.resolve().then(() => env.PAGE_VIEWS_DB.prepare(`
    INSERT INTO daily_page_views (date, page, views, updated_at) VALUES (?, ?, 1, ?)
    ON CONFLICT(date, page) DO UPDATE SET views = views + 1, updated_at = MAX(updated_at, excluded.updated_at)
  `).bind(now.slice(0, 10), payload.page, now).run()).catch(() => {
    console.error("Page view write failed; check the D1 binding and migrations.");
  }));
  return reply(202);
}
