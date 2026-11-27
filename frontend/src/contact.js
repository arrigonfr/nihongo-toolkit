import "./practice.css";
import "./study-controls.css";
import "./ui-kit.css";
import "./contact.css";
import "./navigation.js";
import { API_BASE } from "./api.js";
import { mountAppearance } from "./appearance.js";
import { CONTACT_SUBJECTS, kanjiReportDraft, validateContact } from "./contact-fields.js";
import { mountSupport } from "./study-controls.js";

mountAppearance(document.querySelector("header"), document.getElementById("themeButton"));
mountSupport();
const form = document.getElementById("contactForm");
const fields = document.getElementById("contactFields");
const button = document.getElementById("contactSend");
const status = document.getElementById("contactStatus");
const success = document.getElementById("contactSuccess");
const copyButton = document.getElementById("contactSupportCopy");
for (const subject of CONTACT_SUBJECTS) form.elements.subject.add(new Option(subject, subject));
const draft = kanjiReportDraft(new URLSearchParams(location.search).get("kanji"));
if (draft) {
  form.elements.subject.value = draft.subject;
  form.elements.message.value = draft.message;
}

const supportEmail = (import.meta.env.VITE_CONTACT_SUPPORT_EMAIL || "").trim();
if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(supportEmail)) {
  const link = document.getElementById("contactSupportEmail");
  link.href = `mailto:${supportEmail}`;
  link.textContent = supportEmail;
  document.getElementById("contactSupportTip").hidden = false;
  document.getElementById("contactSpamTip").hidden = true;
  copyButton.hidden = !navigator.clipboard;
  copyButton.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(supportEmail);
      copyButton.textContent = "Copied!";
    } catch {
      copyButton.textContent = "Copy failed";
    }
  });
}
success.addEventListener("click", (event) => {
  if (event.target === success) success.close();
});
success.addEventListener("close", () => button.focus());

let token = "",
  widget,
  submitting = false,
  previousFields,
  submissionId;
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
if (!siteKey) {
  status.textContent = "The contact form is not available yet. Please check back soon.";
} else {
  const script = document.createElement("script");
  script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
  script.async = true;
  script.onerror = () => {
    console.error("Contact verification could not be loaded.");
    status.textContent = "Could not load verification. Please refresh the page to try again.";
  };
  script.onload = () => {
    widget = window.turnstile.render("#contactVerification", {
      sitekey: siteKey,
      action: "contact",
      size: "flexible",
      callback(value) {
        token = value;
        button.disabled = submitting;
      },
      "expired-callback"() {
        token = "";
        button.disabled = true;
        status.textContent = "Verification expired. Please verify again.";
      },
      "error-callback"() {
        token = "";
        button.disabled = true;
        console.error("Contact verification failed.");
        status.textContent = "Verification failed. Please refresh the page to try again.";
      },
    });
  };
  document.head.append(script);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const values = Object.fromEntries(
    ["name", "email", "subject", "message"].map((name) => [name, form.elements.namedItem(name).value]),
  );
  const fingerprint = JSON.stringify(values);
  if (fingerprint !== previousFields) {
    submissionId = crypto.randomUUID();
    previousFields = fingerprint;
  }
  const payload = { ...values, id: submissionId, turnstileToken: token };
  const error = validateContact(payload);
  if (error || !token) {
    status.textContent = error || "Complete the verification before sending.";
    return;
  }
  submitting = true;
  button.disabled = true;
  fields.disabled = true;
  status.textContent = "Sending your message...";
  try {
    const response = await fetch(`${API_BASE}/api/contact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 400) throw new Error("Check your details and complete verification again.");
      throw new Error("We could not accept your message. Please try again in a moment.");
    }
    const result = await response.json();
    if (result.id !== submissionId || result.status !== "received")
      throw new Error("We could not confirm receipt. Please try again.");
    status.textContent = `Message received. Reference: ${result.id}`;
    form.reset();
    previousFields = undefined;
    document.getElementById("contactReference").textContent = result.id;
    copyButton.textContent = "Copy email address";
    success.showModal();
  } catch (error) {
    console.error("Contact submission could not be confirmed.");
    status.textContent =
      error.name === "TimeoutError" || error.name === "TypeError"
        ? "We could not confirm receipt. Check your connection and try again; retrying the same message will not create another submission."
        : error.message;
  } finally {
    submitting = false;
    fields.disabled = false;
    token = "";
    button.disabled = true;
    if (widget !== undefined) window.turnstile.reset(widget);
  }
});
