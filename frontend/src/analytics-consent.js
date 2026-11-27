// @ts-check

const CONSENT_KEY = "nihon:analytics-consent-v1";

/** @typedef {"granted" | "denied"} ConsentChoice */

/** @returns {ConsentChoice | null} */
function readConsent() {
  try {
    const value = localStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

/** @param {ConsentChoice} value */
function saveConsent(value) {
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // Storage may be unavailable in private browsing; apply for this page session only.
  }
}

/** @returns {((...args: unknown[]) => void) | null} */
function getGtag() {
  const fn = /** @type {{ gtag?: unknown }} */ (/** @type {unknown} */ (window)).gtag;
  return typeof fn === "function" ? /** @type {(...args: unknown[]) => void} */ (fn) : null;
}

/** @param {ConsentChoice} value */
function applyConsent(value) {
  const gtag = getGtag();
  if (gtag) {
    gtag("consent", "update", {
      analytics_storage: value,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied"
    });
  }
}

function injectStyles() {
  if (document.getElementById("analytics-consent-style")) return;
  const style = document.createElement("style");
  style.id = "analytics-consent-style";
  style.textContent = `
    .analytics-consent {
      position: fixed;
      right: 16px;
      bottom: 16px;
      left: 16px;
      z-index: 900;
      max-width: 540px;
      margin: 0 auto;
      padding: 12px 16px;
      border: 1px solid var(--line, #d5d8d6);
      border-radius: 12px;
      background: var(--card, #fff);
      color: var(--ink, #252b28);
      box-shadow: 0 10px 28px rgb(0 0 0 / 18%);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 10px 14px;
      font: 400 0.875rem/1.45 system-ui, -apple-system, sans-serif;
      box-sizing: border-box;
    }
    .analytics-consent p {
      margin: 0;
      flex: 1 1 240px;
    }
    .analytics-consent-actions {
      display: flex;
      gap: 8px;
      flex-shrink: 0;
    }
    .analytics-consent button {
      font: 600 0.85rem/1 system-ui, -apple-system, sans-serif;
      padding: 8px 14px;
      min-height: 36px;
      border-radius: 8px;
      border: 1px solid var(--line, #c8ccc9);
      background: transparent;
      color: var(--ink, #252b28);
      cursor: pointer;
    }
    .analytics-consent button[data-consent="granted"] {
      background: var(--accent, #254d3e);
      border-color: var(--accent, #254d3e);
      color: #fff;
    }
    .analytics-consent button:focus-visible {
      outline: 3px solid var(--accent, #254d3e);
      outline-offset: 2px;
    }
  `;
  document.head.append(style);
}

export function mountAnalyticsConsent() {
  if (!getGtag()) return;
  if (window.self !== window.top) return;
  const saved = readConsent();
  if (saved) return;
  if (document.querySelector(".analytics-consent")) return;

  injectStyles();
  const banner = document.createElement("aside");
  banner.className = "analytics-consent";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Analytics consent");

  const text = document.createElement("p");
  text.textContent = "We use privacy-friendly analytics to improve NihongoToolkit. No ads or cross-site tracking.";

  const actions = document.createElement("div");
  actions.className = "analytics-consent-actions";

  const decline = document.createElement("button");
  decline.type = "button";
  decline.dataset.consent = "denied";
  decline.textContent = "Decline";

  const accept = document.createElement("button");
  accept.type = "button";
  accept.dataset.consent = "granted";
  accept.textContent = "Accept";

  /** @param {ConsentChoice} value */
  const choose = (value) => {
    saveConsent(value);
    applyConsent(value);
    banner.remove();
  };
  decline.addEventListener("click", () => choose("denied"));
  accept.addEventListener("click", () => choose("granted"));

  actions.append(decline, accept);
  banner.append(text, actions);
  document.body.append(banner);
}
