// @ts-check
import "./analytics-consent.css";

const CONSENT_KEY = "nihon:analytics-consent-v1";

/** @typedef {"granted" | "denied"} ConsentChoice */
/** @typedef {{ gaId?: string, gtmId?: string, load?: () => void }} AnalyticsRuntime */

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

/** @returns {AnalyticsRuntime | null} */
function getAnalyticsRuntime() {
  const runtime = /** @type {{ __nihonAnalytics?: unknown }} */ (/** @type {unknown} */ (window)).__nihonAnalytics;
  return runtime && typeof runtime === "object" ? /** @type {AnalyticsRuntime} */ (runtime) : null;
}

/** @param {ConsentChoice} value */
function applyConsent(value) {
  const gtag = getGtag();
  if (gtag) {
    gtag("consent", "update", {
      analytics_storage: value,
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
  }
  if (value === "granted") {
    getAnalyticsRuntime()?.load?.();
  }
}

/** @param {ConsentChoice | null} choice */
function bannerCopy(choice) {
  const base = "We use privacy-friendly analytics to improve NihongoToolkit. No ads or cross-site tracking.";
  if (choice === "granted") return `${base} Analytics are currently enabled.`;
  if (choice === "denied") return `${base} Analytics are currently disabled.`;
  return base;
}

/** @param {ConsentChoice | null} choice */
function triggerLabel(choice) {
  if (choice === "granted") return "Analytics: On · Manage";
  if (choice === "denied") return "Analytics: Off · Manage";
  return "Analytics preferences";
}

export function mountAnalyticsConsent() {
  const runtime = getAnalyticsRuntime();
  if (!runtime && !getGtag()) return;
  if (window.self !== window.top) return;
  if (document.querySelector(".analytics-consent") || document.querySelector(".analytics-consent-trigger")) return;

  let currentChoice = readConsent();

  const banner = document.createElement("aside");
  banner.className = "analytics-consent";
  banner.setAttribute("role", "region");
  banner.setAttribute("aria-label", "Analytics consent");

  const text = document.createElement("p");
  text.textContent = bannerCopy(currentChoice);

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

  actions.append(decline, accept);
  banner.append(text, actions);

  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "analytics-consent-trigger";
  trigger.setAttribute("aria-expanded", "false");

  /** @param {boolean} open */
  const syncUi = (open) => {
    text.textContent = bannerCopy(currentChoice);
    banner.hidden = !open;
    trigger.textContent = triggerLabel(currentChoice);
    trigger.hidden = open;
    trigger.setAttribute("aria-expanded", String(open));
    accept.setAttribute("aria-pressed", String(currentChoice === "granted"));
    decline.setAttribute("aria-pressed", String(currentChoice === "denied"));
  };

  /** @param {ConsentChoice} value */
  const choose = (value) => {
    currentChoice = value;
    saveConsent(value);
    applyConsent(value);
    syncUi(false);
  };

  decline.addEventListener("click", () => choose("denied"));
  accept.addEventListener("click", () => choose("granted"));
  trigger.addEventListener("click", () => {
    syncUi(true);
    (currentChoice === "granted" ? decline : accept).focus();
  });
  banner.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && currentChoice !== null && !banner.hidden) {
      syncUi(false);
      trigger.focus();
    }
  });

  const existingFooter = document.querySelector("footer");
  if (existingFooter) {
    existingFooter.append(trigger);
  } else {
    const wrapper = document.createElement("div");
    wrapper.className = "analytics-consent-footer";
    wrapper.append(trigger);
    document.body.append(wrapper);
  }
  document.body.append(banner);
  syncUi(currentChoice === null);
}
