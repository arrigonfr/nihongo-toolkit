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

function emailText(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]).replace(/\r\n|\r|\n/g, "<br>");
}

function encodedBody(text) {
  return Buffer.from(text.replace(/\r\n|\r|\n/g, "\r\n")).toString("base64").match(/.{1,76}/g).join("\r\n");
}

export function gmailMessage(env, contact, reply, job) {
  if (!mailbox.test(contact.email) || (env.CONTACT_EMAIL_REPLY_TO && !mailbox.test(env.CONTACT_EMAIL_REPLY_TO))
      || !/^[a-zA-Z0-9-]+$/.test(job.id)) throw new Error("Invalid email delivery address or reference");
  const text = `Hello ${contact.name},\n\n${reply.message}\n\nNihongoToolkit\nReference: ${contact.id}\n\nYour original message:\n${contact.message}`;
  const subject = Buffer.from(`NihongoToolkit: ${contact.subject}`).toString("base64");
  const boundary = `nihongo-${job.id}`;
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Your NihongoToolkit reply</title></head>
<body style="margin:0;padding:0;background-color:#f4f3ef;color:#242c35;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#f4f3ef;"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background-color:#ffffff;border:1px solid #deded8;border-radius:12px;">
<tr><td style="padding:28px 28px 22px;border-bottom:4px solid #32766b;">
<p style="margin:0;font-size:22px;font-weight:bold;">NihongoToolkit</p>
<p style="margin:8px 0 0;color:#52616b;font-size:14px;">A reply to your website message</p></td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word;">
<h1 style="margin:0 0 20px;font-size:22px;line-height:1.4;">Hello ${emailText(contact.name)},</h1>
<p style="margin:0 0 24px;">${emailText(reply.message)}</p>
<p style="margin:0;color:#52616b;">Thank you for getting in touch.<br>NihongoToolkit</p>
</td></tr>
<tr><td style="padding:24px 28px;background-color:#f7f8f6;border-top:1px solid #deded8;font-size:14px;line-height:1.7;overflow-wrap:anywhere;word-break:break-word;">
<h2 style="margin:0 0 12px;font-size:16px;">Your original message</h2>
<p style="margin:0 0 12px;font-weight:bold;">${emailText(contact.subject)}</p>
<p style="margin:0;color:#52616b;">${emailText(contact.message)}</p></td></tr>
<tr><td style="padding:20px 28px;color:#52616b;font-size:12px;line-height:1.6;overflow-wrap:anywhere;">
You received this email because you contacted NihongoToolkit.<br>Reference: ${emailText(contact.id)}
</td></tr></table>
</td></tr></table></body></html>`;
  const mime = [
    `From: NihongoToolkit <${env.CONTACT_EMAIL_FROM}>`, `To: <${contact.email}>`,
    `Subject: =?UTF-8?B?${subject}?=`,
    `Date: ${new Date().toUTCString()}`,
    ...(env.CONTACT_EMAIL_REPLY_TO ? [`Reply-To: <${env.CONTACT_EMAIL_REPLY_TO}>`] : []),
    "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "", `--${boundary}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64",
    "", encodedBody(text),
    `--${boundary}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64",
    "", encodedBody(html), `--${boundary}--`, ""
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
