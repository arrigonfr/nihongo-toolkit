import { Buffer } from "node:buffer";

const mailbox = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

export function gmailConfigured(env) {
  return Boolean(env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN
    && mailbox.test(env.CONTACT_EMAIL_FROM || "") && /@gmail\.com$/i.test(env.CONTACT_EMAIL_FROM));
}

export async function gmailAccessToken(env) {
  if (!gmailConfigured(env)) throw new Error("Gmail delivery is not configured");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID, client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN, grant_type: "refresh_token"
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error(`Gmail authorization HTTP ${response.status}`);
  const payload = await response.json();
  if (typeof payload.access_token !== "string" || !payload.access_token) throw new Error("Gmail authorization returned no access token");
  return payload.access_token;
}

export function gmailMessage(env, contact, reply, job) {
  if (!mailbox.test(contact.email) || (env.CONTACT_EMAIL_REPLY_TO && !mailbox.test(env.CONTACT_EMAIL_REPLY_TO))
      || !/^[a-zA-Z0-9-]+$/.test(job.id)) throw new Error("Invalid email delivery address or reference");
  const text = `Hello ${contact.name},\n\n${reply.message}\n\nNihongo Toolkit\nReference: ${contact.id}\n\nYour original message:\n${contact.message}`;
  const subject = Buffer.from(`Re: ${contact.subject} - Nihongo Toolkit`).toString("base64");
  const body = Buffer.from(text.replace(/\r?\n/g, "\r\n")).toString("base64").match(/.{1,76}/g).join("\r\n");
  const mime = [
    `From: Nihongo Toolkit <${env.CONTACT_EMAIL_FROM}>`, `To: <${contact.email}>`,
    `Subject: =?UTF-8?B?${subject}?=`,
    `Date: ${new Date(job.created_at).toUTCString()}`,
    // Useful for manual reconciliation in Sent; Gmail does not deduplicate this header.
    `Message-ID: <${job.id}@gmail.com>`,
    ...(env.CONTACT_EMAIL_REPLY_TO ? [`Reply-To: <${env.CONTACT_EMAIL_REPLY_TO}>`] : []),
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64",
    "", body
  ].join("\r\n");
  return Buffer.from(mime).toString("base64url");
}

export class GmailRejected extends Error {}

export async function sendGmail(accessToken, raw) {
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw }), signal: AbortSignal.timeout(8000)
  });
  // Only definite rejections are safe to retry. Timeouts and 5xx may follow acceptance.
  if (response.status >= 400 && response.status < 500 && response.status !== 408) throw new GmailRejected(`Gmail send rejected HTTP ${response.status}`);
  if (!response.ok) throw new Error("Gmail send outcome unknown; check Sent before retrying");
  const payload = await response.json();
  if (typeof payload.id !== "string" || !payload.id) throw new Error("Gmail send outcome unknown; check Sent before retrying");
  return payload;
}
