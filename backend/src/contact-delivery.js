async function providerJSON(url, options) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Provider HTTP ${response.status}`);
  const payload = await response.json();
  if (typeof payload.id !== "string") throw new Error("Provider returned no message ID");
  return payload;
}

export async function deliverContacts(env) {
  if (env.CONTACT_ENABLED !== "true") return;
  const db = env.PAGE_VIEWS_DB;
  if (!db) throw new Error("Contact storage is not configured");
  const now = Date.now();
  // Claim work atomically so concurrent submissions and cron runs cannot send the same job.
  const { results: jobs } = await db
    .prepare(`
    UPDATE contact_outbox SET status = 'sending', lease_until = ?, attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM contact_outbox WHERE
        (status = 'pending' AND next_attempt_at <= ?) OR (status = 'sending' AND lease_until < ?)
      ORDER BY created_at LIMIT 3
    ) RETURNING *
  `)
    .bind(now + 90000, now, now)
    .all();
  for (const job of jobs) {
    let emailAttempted = false;
    try {
      if (job.attempts > 6 || now - job.created_at > 23 * 60 * 60 * 1000)
        throw new Error("Delivery retry window expired");
      const contact = await db.prepare("SELECT * FROM contact_messages WHERE id = ?").bind(job.contact_id).first();
      if (!contact) throw new Error("Contact no longer exists");
      let result;
      if (job.kind === "discord") {
        const url = new URL(env.CONTACT_DISCORD_WEBHOOK_URL);
        if (url.origin !== "https://discord.com" || !/^\/api\/webhooks\/\d+\/[^/]+$/.test(url.pathname))
          throw new Error("Invalid Discord webhook configuration");
        url.search = "?wait=true";
        result = await providerJSON(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: `New website contact. Reply using \`/reply ticket:${contact.id} message:your response\`.`,
            allowed_mentions: { parse: [] },
            embeds: [
              {
                title: contact.subject,
                description: contact.message,
                fields: [
                  { name: "Name", value: contact.name },
                  { name: "Email", value: contact.email },
                ],
                footer: { text: `Contact ${contact.id}` },
              },
            ],
          }),
        });
        if (result.channel_id !== env.CONTACT_DISCORD_CHANNEL_ID)
          throw new Error("Discord webhook targets the wrong channel");
        await db.batch([
          db.prepare("UPDATE contact_messages SET discord_message_id = ? WHERE id = ?").bind(result.id, contact.id),
          db
            .prepare("UPDATE contact_outbox SET status = 'sent', provider_id = ?, last_error = NULL WHERE id = ?")
            .bind(result.id, job.id),
        ]);
      } else {
        const reply = await db.prepare("SELECT message FROM contact_replies WHERE id = ?").bind(job.reply_id).first();
        if (!reply) throw new Error("Reply no longer exists");
        const accessToken = await gmailAccessToken(env);
        const raw = gmailMessage(env, contact, reply, job);
        // Persist a no-retry marker BEFORE sending: a Worker crash must not resend accepted mail.
        await db
          .prepare("UPDATE contact_outbox SET status = 'failed', last_error = ? WHERE id = ?")
          .bind("Gmail send outcome unknown; check Sent before retrying", job.id)
          .run();
        emailAttempted = true;
        result = await sendGmail(accessToken, raw);
        await db
          .prepare("UPDATE contact_outbox SET status = 'sent', provider_id = ?, last_error = NULL WHERE id = ?")
          .bind(result.id, job.id)
          .run();
      }
    } catch (error) {
      // Never log message bodies, addresses, tokens or provider response bodies.
      const uncertain = emailAttempted && !(error instanceof GmailRejected);
      const reason = uncertain
        ? "Gmail send outcome unknown; check Sent before retrying"
        : error instanceof Error &&
            /^(Provider HTTP \d+|Provider returned no message ID|Delivery retry window expired|Contact no longer exists|Reply no longer exists|Invalid Discord webhook configuration|Discord webhook targets the wrong channel|Gmail delivery is not configured|Gmail authorization HTTP \d+|Gmail authorization returned no access token|Gmail send rejected HTTP \d+|Invalid email delivery address or reference)$/.test(
              error.message,
            )
          ? error.message
          : "Delivery failed; check provider configuration or availability";
      console.error("Contact delivery failed.", job.id, reason);
      await db
        .prepare("UPDATE contact_outbox SET status = ?, next_attempt_at = ?, last_error = ? WHERE id = ?")
        .bind(
          uncertain || job.attempts >= 6 || now - job.created_at > 23 * 60 * 60 * 1000 ? "failed" : "pending",
          Date.now() + 300000,
          reason,
          job.id,
        )
        .run();
    }
  }
}

export function scheduleContactDelivery(env, ctx) {
  ctx.waitUntil(
    deliverContacts(env).catch(() => {
      console.error("Contact outbox processing failed; check the D1 binding and migrations.");
    }),
  );
}

import { GmailRejected, gmailAccessToken, gmailMessage, sendGmail } from "./contact-gmail.js";
