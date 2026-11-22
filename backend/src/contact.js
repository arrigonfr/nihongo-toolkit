import { validateContact } from "../../frontend/src/contact-fields.js";
import { scheduleContactDelivery } from "./contact-delivery.js";
import { gmailConfigured } from "./contact-gmail.js";

class RequestError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readBody(request, limit) {
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "Expected a message.");
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new RequestError(413, "Message is too large."); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

function json(text) {
  try { return JSON.parse(text); }
  catch { throw new RequestError(400, "Invalid JSON."); }
}

const origins = (request, env) => [new URL(request.url).origin, ...(env.ALLOWED_ORIGINS || "").split(",").map((value) => value.trim()).filter(Boolean)];

export async function contactForm(request, env, ctx) {
  const headers = { "Cache-Control": "no-store", Vary: "Origin" };
  const origin = request.headers.get("Origin");
  const allowed = origins(request, env);
  if (origin && !allowed.includes(origin)) return Response.json({ error: "Origin not allowed." }, { status: 403, headers });
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (request.method === "OPTIONS") {
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    return new Response(null, { status: 204, headers });
  }
  if (request.method !== "POST") return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...headers, Allow: "POST, OPTIONS" } });
  if (env.CONTACT_ENABLED !== "true" || !env.PAGE_VIEWS_DB || !env.TURNSTILE_SECRET_KEY || !env.CONTACT_DISCORD_WEBHOOK_URL || !env.CONTACT_DISCORD_CHANNEL_ID) {
    return Response.json({ error: "The contact form is currently unavailable." }, { status: 503, headers });
  }
  try {
    if (!/^application\/json(?:;|$)/i.test(request.headers.get("Content-Type") || "")) throw new RequestError(415, "Expected JSON.");
    const payload = json(await readBody(request, 20000));
    const error = validateContact(payload);
    if (error) throw new RequestError(400, error);
    const { id, subject } = payload;
    const name = payload.name.trim(), email = payload.email.trim(), message = payload.message.trim();
    const db = env.PAGE_VIEWS_DB;
    const existing = await db.prepare("SELECT name, email, subject, message FROM contact_messages WHERE id = ?").bind(id).first();
    if (existing) {
      if (existing.name !== name || existing.email !== email || existing.subject !== subject || existing.message !== message) throw new RequestError(409, "This submission reference has already been used.");
      return Response.json({ id, status: "received" }, { status: 202, headers });
    }
    if (typeof payload.turnstileToken !== "string" || !payload.turnstileToken || payload.turnstileToken.length > 2048) throw new RequestError(400, "Complete the verification before sending.");
    const verification = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(8000),
      body: JSON.stringify({ secret: env.TURNSTILE_SECRET_KEY, response: payload.turnstileToken })
    });
    if (!verification.ok) throw new Error("Verification provider unavailable");
    const verified = await verification.json();
    if (!verified.success || verified.action !== "contact" || !allowed.some((value) => new URL(value).hostname === verified.hostname)) throw new RequestError(400, "Verification expired or failed. Please try again.");
    const now = Date.now();
    await db.batch([
      db.prepare("INSERT INTO contact_messages (id, name, email, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(id, name, email, subject, message, now),
      db.prepare("INSERT INTO contact_outbox (id, contact_id, kind, next_attempt_at, created_at) VALUES (?, ?, 'discord', ?, ?)")
        .bind(`discord-${id}`, id, now, now)
    ]);
    scheduleContactDelivery(env, ctx);
    return Response.json({ id, status: "received" }, { status: 202, headers });
  } catch (error) {
    if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("Contact submission failed; check verification, D1 configuration and migrations.");
    return Response.json({ error: "We could not accept your message. Please try again." }, { status: 503, headers });
  }
}

export const contactReplyCommand = {
  name: "reply", description: "Reply by email to a NihongoToolkit contact submission", type: 1,
  default_member_permissions: "8192",
  options: [
    { name: "ticket", description: "Contact reference from the website notification", type: 3, required: true, min_length: 36, max_length: 36 },
    { name: "message", description: "Response to send to the visitor by email", type: 3, required: true, min_length: 1, max_length: 1500 }
  ]
};

async function validSignature(request, raw, publicKey) {
  const signature = request.headers.get("X-Signature-Ed25519") || "";
  const timestamp = request.headers.get("X-Signature-Timestamp") || "";
  if (!/^[0-9a-f]{128}$/i.test(signature) || !/^[0-9a-f]{64}$/i.test(publicKey || "") || !/^\d+$/.test(timestamp)
      || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const bytes = (hex) => Uint8Array.from(hex.match(/../g), (pair) => parseInt(pair, 16));
  const key = await crypto.subtle.importKey("raw", bytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify("Ed25519", key, bytes(signature), new TextEncoder().encode(timestamp + raw));
}

export async function discordContactReply(request, env, ctx) {
  const headers = { "Cache-Control": "no-store" };
  const say = (content, ephemeral = true) => Response.json({
    type: 4, data: { content, allowed_mentions: { parse: [] }, ...(ephemeral ? { flags: 64 } : {}) }
  }, { headers });
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { ...headers, Allow: "POST" } });
  try {
    const raw = await readBody(request, 32000);
    if (!await validSignature(request, raw, env.CONTACT_DISCORD_PUBLIC_KEY)) return new Response("Invalid signature", { status: 401, headers });
    const interaction = json(raw);
    if (interaction?.type === 1) return Response.json({ type: 1 }, { headers });
    if (env.CONTACT_ENABLED !== "true" || !env.PAGE_VIEWS_DB || !gmailConfigured(env)) return say("Contact replies are not configured.");
    if (interaction?.type !== 2 || interaction.data?.name !== "reply" || interaction.data?.type !== 1) return say("Unsupported contact command.");
    const authorizationErrors = [];
    for (const [setting, actual] of [
      ["CONTACT_DISCORD_APPLICATION_ID", interaction.application_id],
      ["CONTACT_DISCORD_GUILD_ID", interaction.guild_id],
      ["CONTACT_DISCORD_CHANNEL_ID", interaction.channel_id]
    ]) {
      if (!env[setting]) authorizationErrors.push(`${setting} is missing from the Worker runtime.`);
      else if (actual !== env[setting]) authorizationErrors.push(`${setting} does not match this command's application, server or channel.`);
    }
    if (!env.CONTACT_DISCORD_ROLE_ID) authorizationErrors.push("CONTACT_DISCORD_ROLE_ID is missing from the Worker runtime.");
    else if (!Array.isArray(interaction.member?.roles) || !interaction.member.roles.includes(env.CONTACT_DISCORD_ROLE_ID)) {
      authorizationErrors.push("Your account does not have the role configured in CONTACT_DISCORD_ROLE_ID.");
    }
    if (authorizationErrors.length) {
      return say(`You cannot reply to contacts from this account or channel.\n${authorizationErrors.join("\n")}`);
    }
    const options = interaction.data.options;
    if (!Array.isArray(options) || options.length !== 2 || options.some((item) => item.type !== 3)) return say("Provide a ticket and message.");
    const ticket = options.find((item) => item.name === "ticket")?.value;
    const message = options.find((item) => item.name === "message")?.value;
    if (typeof ticket !== "string" || !/^[0-9a-f-]{36}$/i.test(ticket) || typeof message !== "string" || !message.trim() || message.length > 1500
        || !/^\d+$/.test(interaction.id || "") || !/^\d+$/.test(interaction.member?.user?.id || "")) return say("Invalid ticket or reply.");
    const db = env.PAGE_VIEWS_DB;
    const contact = await db.prepare("SELECT id, discord_message_id FROM contact_messages WHERE id = ?").bind(ticket).first();
    if (!contact?.discord_message_id) return say("This is not a website contact delivered to this channel. No email was sent.");
    const prior = await db.prepare("SELECT id FROM contact_replies WHERE id = ?").bind(interaction.id).first();
    if (!prior) {
      const now = Date.now();
      await db.batch([
        db.prepare("INSERT OR IGNORE INTO contact_replies (id, contact_id, discord_user_id, message, created_at) VALUES (?, ?, ?, ?, ?)")
          .bind(interaction.id, ticket, interaction.member.user.id, message.trim(), now),
        db.prepare("INSERT OR IGNORE INTO contact_outbox (id, contact_id, reply_id, kind, next_attempt_at, created_at) VALUES (?, ?, ?, 'email', ?, ?)")
          .bind(`email-${interaction.id}`, ticket, interaction.id, now, now),
        db.prepare("UPDATE contact_messages SET status = 'replied', replied_at = ? WHERE id = ?").bind(now, ticket)
      ]);
      scheduleContactDelivery(env, ctx);
    }
    return say(`Reply recorded for contact ${ticket}; email queued.\n\n${message.trim()}`, false);
  } catch (error) {
    if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("Discord contact reply failed; check contact configuration and D1 migrations.");
    return say("Could not record the reply. Please try the command again.");
  }
}
