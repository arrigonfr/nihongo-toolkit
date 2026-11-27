// @ts-check

export const CONTACT_SUBJECTS = ["Feedback", "Feature Request", "Data Inconsistency", "General Bug Report", "Other"];

/** @param {string} character */
export function kanjiReportPath(character) {
  return `/contact?kanji=${encodeURIComponent(character)}`;
}

/** @param {string | null | undefined} character */
export function kanjiReportDraft(character) {
  if (!character || (!/^\p{Unified_Ideograph}$/u.test(character) && !/^[\uF900-\uFAFF]$/u.test(character))) return null;
  const codepoint = (character.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, "0");
  return {
    subject: "Data Inconsistency",
    message: `Kanji: ${character} (U+${codepoint})\n\nSuggested Japanese reading or meaning:\n\nSource or example of Japanese usage:\n`,
  };
}

/** @param {unknown} value */
export function validateContact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Expected a contact message.";
  const record = /** @type {Record<string, unknown>} */ (value);
  if (
    typeof record.id !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(record.id)
  )
    return "Invalid submission reference.";
  if (
    typeof record.name !== "string" ||
    !record.name.trim() ||
    record.name.length > 120 ||
    /[\r\n\u0000-\u001f]/.test(record.name)
  )
    return "Enter your full name (up to 120 characters).";
  if (
    typeof record.email !== "string" ||
    record.email.length > 254 ||
    !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(record.email) ||
    /[\u0000-\u001f]/.test(record.email)
  )
    return "Enter a valid email address.";
  if (typeof record.subject !== "string" || !CONTACT_SUBJECTS.includes(record.subject)) return "Choose a subject.";
  if (
    typeof record.message !== "string" ||
    !record.message.trim() ||
    record.message.length > 3000 ||
    /\u0000/.test(record.message)
  )
    return "Enter a message (up to 3,000 characters).";
  return null;
}
