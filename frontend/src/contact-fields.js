export const CONTACT_SUBJECTS = ["Feedback", "Feature Request", "Data Inconsistency", "General Bug Report", "Other"];

export function validateContact(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Expected a contact message.";
  if (typeof value.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)) return "Invalid submission reference.";
  if (typeof value.name !== "string" || !value.name.trim() || value.name.length > 120 || /[\r\n\u0000-\u001f]/.test(value.name)) return "Enter your full name (up to 120 characters).";
  if (typeof value.email !== "string" || value.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.email) || /[\u0000-\u001f]/.test(value.email)) return "Enter a valid email address.";
  if (!CONTACT_SUBJECTS.includes(value.subject)) return "Choose a subject.";
  if (typeof value.message !== "string" || !value.message.trim() || value.message.length > 3000 || /\u0000/.test(value.message)) return "Enter a message (up to 3,000 characters).";
  return null;
}
