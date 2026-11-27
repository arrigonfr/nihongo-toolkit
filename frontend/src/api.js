const configured = import.meta.env.VITE_API_BASE_URL || window.location.origin;
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

function buildRequestUrl(pathOrUrl, params) {
  const url = /^https?:\/\//i.test(pathOrUrl) ? new URL(pathOrUrl) : new URL(`${API_BASE}${pathOrUrl}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null) continue;
      if (Array.isArray(value)) value.forEach((item) => url.searchParams.append(key, String(item)));
      else url.searchParams.set(key, String(value));
    }
  }
  return url;
}

export async function fetchJSON(pathOrUrl, {
  params,
  signal,
  timeoutMs = 10000,
  fallbackError = "We couldn’t complete this request right now. Please try again in a moment.",
  notFoundError,
  useServerError = true
} = {}) {
  const url = buildRequestUrl(pathOrUrl, params);
  const timeout = typeof AbortSignal?.timeout === "function" ? AbortSignal.timeout(timeoutMs) : undefined;
  const combinedSignal = signal && timeout && typeof AbortSignal.any === "function"
    ? AbortSignal.any([timeout, signal])
    : (signal || timeout);
  const response = await fetch(url, {
    signal: combinedSignal,
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    let serverError = "";
    if (useServerError) {
      try {
        const payload = await response.json();
        serverError = payload?.error || "";
      } catch {}
    }
    const message = response.status === 404 && notFoundError
      ? notFoundError
      : sanitizeErrorMessage(serverError, fallbackError);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

export async function fetchItems(path, params, { signal } = {}) {
  const payload = await fetchJSON(path, {
    params,
    signal,
    fallbackError: "We couldn’t load the next set of practice items right now. Please try again in a moment."
  });
  if (!Array.isArray(payload.items) || !payload.items.length) {
    throw new Error("No practice items were found for this selection.");
  }
  return payload.items;
}
