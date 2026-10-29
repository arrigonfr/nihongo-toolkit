const configured = import.meta.env.VITE_API_BASE_URL;
if (!configured) throw new Error("Set VITE_API_BASE_URL before starting or building the frontend.");
const base = new URL(configured);
if (!["http:", "https:"].includes(base.protocol)) throw new Error("Backend URL must use HTTP or HTTPS.");
if (import.meta.env.PROD && base.protocol !== "https:"
    && !["localhost", "127.0.0.1", "[::1]"].includes(base.hostname)) {
  throw new Error("Production backend URLs must use HTTPS.");
}
export const API_BASE = configured.replace(/\/+$/, "");

const INTERNAL_DETAIL_RE = /VITE_|backend|database|sqlite|importer|\bHTTP\s+\d+|\bAPI\b/i;

function sanitizeErrorMessage(message, fallback) {
  const text = typeof message === "string" ? message.trim() : "";
  return text && !INTERNAL_DETAIL_RE.test(text) ? text : fallback;
}

export async function fetchItems(path, params) {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, item));
    else url.searchParams.set(key, value);
  }
  const response = await fetch(url, {
    signal: AbortSignal.timeout(10000), headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    let serverError = "";
    try {
      const payload = await response.json();
      serverError = payload?.error || "";
    } catch {}
    throw new Error(sanitizeErrorMessage(
      serverError,
      "We couldn’t load the next set of practice items right now. Please try again in a moment."
    ));
  }
  const payload = await response.json();
  if (!Array.isArray(payload.items) || !payload.items.length) {
    throw new Error("No practice items were found for this selection.");
  }
  return payload.items;
}
