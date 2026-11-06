import { API_BASE } from "./api.js";
import { canonicalPage } from "./page-paths.js";

const page = canonicalPage(location.pathname);
if (process.env.TRACK_VISITS === "true" && page) {
  // One report per document load, including reloads. Never retry or await in the UI.
  void fetch(`${API_BASE}/api/page-views`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ page }), keepalive: true, credentials: "omit",
    referrerPolicy: "no-referrer"
  }).then((response) => {
    if (!response.ok) console.warn("Page view reporting unavailable.");
  }).catch(() => console.warn("Page view reporting unavailable."));
}
