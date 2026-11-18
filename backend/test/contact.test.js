import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Miniflare } from "miniflare";
import { build } from "esbuild";
import { resolve } from "node:path";
import { contactForm, discordContactReply } from "../src/contact.js";
import { deliverContacts } from "../src/contact-delivery.js";
import { validateContact } from "../../frontend/src/contact-fields.js";
import { gmailConfigured, gmailMessage } from "../src/contact-gmail.js";

const submission = () => ({ id: randomUUID(), name: "Test Visitor", email: "visitor@example.test", subject: "Feedback", message: "A test message.", turnstileToken: "valid" });
const post = (body, headers = {}) => new Request("https://worker.test/api/contact", {
  method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body)
});

test("contact validation rejects invalid fields and keeps all five supported subjects", () => {
  for (const subject of ["Feedback", "Feature Request", "Data Inconsistency", "General Bug Report", "Other"]) assert.equal(validateContact({ ...submission(), subject }), null);
  for (const overrides of [{ name: " " }, { name: "a".repeat(121) }, { email: "bad" }, { email: "a@example.test\nBcc:bad" }, { subject: "Unknown" }, { message: " " }, { message: "a".repeat(3001) }, { id: "not-a-uuid" }]) {
    assert.equal(typeof validateContact({ ...submission(), ...overrides }), "string");
  }
});

test("Gmail MIME preserves Unicode and rejects header injection", () => {
  const env = { CONTACT_EMAIL_FROM: "support@gmail.com", GMAIL_CLIENT_ID: "id", GMAIL_CLIENT_SECRET: "secret", GMAIL_REFRESH_TOKEN: "refresh" };
  assert.equal(gmailConfigured(env), true);
  assert.equal(gmailConfigured({ ...env, CONTACT_EMAIL_FROM: "Nihongo <support@gmail.com>" }), false);
  assert.equal(gmailConfigured({ ...env, GMAIL_REFRESH_TOKEN: "" }), false);
  const contact = { ...submission(), message: "日本語の質問", name: "日本 太郎" };
  const job = { id: "email-500", created_at: Date.now() };
  const raw = gmailMessage(env, contact, { message: "ありがとう！" }, job);
  assert.match(raw, /^[A-Za-z0-9_-]+$/);
  const mime = Buffer.from(raw, "base64url").toString();
  assert.match(mime, /From: Nihongo Toolkit <support@gmail.com>\r\n/);
  assert.match(mime, /Message-ID: <email-500@gmail.com>/);
  assert.match(Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString(), /ありがとう！/);
  assert.throws(() => gmailMessage(env, { ...contact, email: "a@example.test\r\nBcc: other@example.test" }, { message: "test" }, job), /Invalid email/);
  assert.throws(() => gmailMessage({ ...env, CONTACT_EMAIL_REPLY_TO: "bad\r\nheader" }, contact, { message: "test" }, job), /Invalid email/);
});

test("contact D1 lifecycle, signed Discord authorization and safe Gmail delivery", { timeout: 60000 }, async (t) => {
  const bundle = await build({
    entryPoints: ["backend/src/worker.js"], bundle: true, write: false, format: "esm", platform: "browser",
    external: ["node:*"], alias: { "#tokenizer-loader": resolve("backend/src/tokenizer-worker.js") }
  });
  const mf = new Miniflare({
    modules: true, script: bundle.outputFiles[0].text, d1Databases: ["PAGE_VIEWS_DB"],
    compatibilityDate: "2026-08-06", compatibilityFlags: ["nodejs_compat"],
    outboundService: () => { throw new Error("No real provider calls are permitted"); }
  });
  try {
    assert.equal((await mf.dispatchFetch("https://worker.test/api/contact", { method: "POST", body: "{}" })).status, 503);
    assert.equal((await mf.dispatchFetch("https://worker.test/api/discord/contact", { method: "POST", body: "{}" })).status, 401);
    const db = await mf.getD1Database("PAGE_VIEWS_DB");
    await db.exec((await readFile(new URL("../migrations/page-views/0002_contact.sql", import.meta.url), "utf8")).replace(/\n/g, " "));
    const key = await crypto.subtle.generateKey("Ed25519", true, ["sign", "verify"]);
    const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", key.publicKey)).toString("hex");
    const env = {
      CONTACT_ENABLED: "true", PAGE_VIEWS_DB: db, ALLOWED_ORIGINS: "https://site.test",
      TURNSTILE_SECRET_KEY: "test-secret", CONTACT_DISCORD_PUBLIC_KEY: publicKey,
      CONTACT_DISCORD_WEBHOOK_URL: "https://discord.com/api/webhooks/123/test-token",
      CONTACT_DISCORD_CHANNEL_ID: "42", CONTACT_DISCORD_GUILD_ID: "41", CONTACT_DISCORD_ROLE_ID: "43",
      CONTACT_DISCORD_APPLICATION_ID: "44", CONTACT_EMAIL_FROM: "support@gmail.com",
      GMAIL_CLIENT_ID: "test-client", GMAIL_CLIENT_SECRET: "test-secret", GMAIL_REFRESH_TOKEN: "test-refresh"
    };
    const calls = [], tasks = [];
    let failDiscord = false, failEmail = false, unknownEmail = "", failAuth = false;
    t.mock.method(console, "error", () => {});
    t.mock.method(globalThis, "fetch", async (url, options) => {
      if (String(url) === "https://oauth2.googleapis.com/token") {
        assert.equal(options.body.get("grant_type"), "refresh_token");
        assert.equal(options.body.get("refresh_token"), "test-refresh");
        return failAuth ? new Response("invalid_grant", { status: 400 }) : Response.json({ access_token: "test-access" });
      }
      const body = JSON.parse(options.body);
      if (String(url).includes("siteverify")) return Response.json({ success: body.response === "valid", action: "contact", hostname: "site.test" });
      calls.push({ url: String(url), body, headers: options.headers });
      if (String(url).includes("discord.com")) return failDiscord ? new Response("unavailable", { status: 503 }) : Response.json({ id: "100", channel_id: "42" });
      if (String(url) === "https://gmail.googleapis.com/gmail/v1/users/me/messages/send") {
        assert.equal(options.headers.Authorization, "Bearer test-access");
        assert.equal((await db.prepare("SELECT status FROM contact_outbox WHERE id = 'email-500'").first()).status, "failed");
        if (unknownEmail === "network") throw new Error("Connection lost after acceptance");
        if (unknownEmail === "server") return new Response("unavailable", { status: 503 });
        if (unknownEmail === "malformed") return Response.json({});
        return failEmail ? new Response("rate limit", { status: 429 }) : Response.json({ id: "email-1" });
      }
      throw new Error("Unexpected network request");
    });
    const ctx = { waitUntil(task) { tasks.push(task); } };
    const finish = async () => { await Promise.all(tasks.splice(0)); };
    const send = (payload, overrides = {}) => contactForm(post(payload, { Origin: "https://site.test" }), { ...env, ...overrides }, ctx);
    const interaction = (ticket, overrides = {}) => ({
      type: 2, id: "500", application_id: "44", guild_id: "41", channel_id: "42",
      member: { user: { id: "99" }, roles: ["43"] },
      data: { type: 1, name: "reply", options: [{ type: 3, name: "ticket", value: ticket }, { type: 3, name: "message", value: "Thanks for the feedback!" }] },
      ...overrides
    });
    const signed = async (payload, { timestamp = String(Math.floor(Date.now() / 1000)), tamper = false } = {}) => {
      const raw = JSON.stringify(payload);
      const signature = Buffer.from(await crypto.subtle.sign("Ed25519", key.privateKey, new TextEncoder().encode(timestamp + raw))).toString("hex");
      return new Request("https://worker.test/api/discord/contact", {
        method: "POST", body: tamper ? `${raw} ` : raw,
        headers: { "X-Signature-Timestamp": timestamp, "X-Signature-Ed25519": signature }
      });
    };
    await t.test("configuration, CORS, bounded input and verification fail explicitly", async () => {
      assert.equal((await send(submission(), { CONTACT_ENABLED: "false" })).status, 503);
      assert.equal((await send({ ...submission(), turnstileToken: "invalid" })).status, 400);
      assert.equal((await send("x".repeat(20001))).status, 413);
      assert.equal((await send("{")).status, 400);
      assert.equal((await contactForm(post(submission(), { Origin: "https://evil.test" }), env, ctx)).status, 403);
      assert.equal((await contactForm(new Request("https://worker.test/api/contact"), env, ctx)).status, 405);
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM contact_messages").first()).count, 0);
    });
    const contact = submission();
    await t.test("submission commits before delivery; provider failure is retried without losing the contact", async () => {
      failDiscord = true;
      assert.equal((await send(contact)).status, 202);
      await finish();
      assert.equal((await db.prepare("SELECT status FROM contact_messages").first()).status, "open");
      assert.equal((await db.prepare("SELECT status FROM contact_outbox").first()).status, "pending");
      const premature = await (await discordContactReply(await signed(interaction(contact.id)), env, ctx)).json();
      assert.match(premature.data.content, /not a website contact delivered/);
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM contact_replies").first()).count, 0);
      assert.equal((await send(contact)).status, 202);
      assert.equal((await send({ ...contact, message: "Different payload" })).status, 409);
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM contact_messages").first()).count, 1);
      failDiscord = false;
      await db.prepare("UPDATE contact_outbox SET next_attempt_at = 0").run();
      await Promise.all([deliverContacts(env), deliverContacts(env)]);
      assert.equal(calls.filter((call) => call.url.includes("discord.com")).length, 2);
      assert.deepEqual(calls[0].body.allowed_mentions, { parse: [] });
      assert.equal((await db.prepare("SELECT discord_message_id FROM contact_messages").first()).discord_message_id, "100");
    });
    await t.test("unsigned, tampered, expired, unauthorized and unrelated Discord requests cannot reply", async () => {
      assert.equal((await discordContactReply(post("{}"), env, ctx)).status, 401);
      assert.equal((await discordContactReply(await signed(interaction(contact.id), { tamper: true }), env, ctx)).status, 401);
      assert.equal((await discordContactReply(await signed(interaction(contact.id), { timestamp: "1" }), env, ctx)).status, 401);
      assert.deepEqual(await (await discordContactReply(await signed({ type: 1 }), env, ctx)).json(), { type: 1 });
      for (const bad of [
        interaction(contact.id, { channel_id: "wrong" }), interaction(contact.id, { guild_id: "wrong" }),
        interaction(contact.id, { application_id: "wrong" }), interaction(contact.id, { member: { user: { id: "99" }, roles: [] } }),
        interaction(randomUUID()), interaction(contact.id, { type: 0 }), interaction(contact.id, { data: { name: "unrelated" } })
      ]) {
        const result = await (await discordContactReply(await signed(bad), env, ctx)).json();
        assert.equal(result.data.flags, 64);
      }
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM contact_replies").first()).count, 0);
      assert.equal((await db.prepare("SELECT status FROM contact_messages").first()).status, "open");
    });
    await t.test("authorized /reply changes status and emails only the stored contact, replay sends no extra mail", async () => {
      failEmail = true;
      const request = interaction(contact.id);
      const result = await (await discordContactReply(await signed(request), env, ctx)).json();
      assert.match(result.data.content, /email queued/);
      assert.equal(result.data.flags, undefined);
      await finish();
      assert.equal((await db.prepare("SELECT status FROM contact_messages").first()).status, "replied");
      assert.equal((await db.prepare("SELECT status FROM contact_outbox WHERE kind = 'email'").first()).status, "pending");
      failEmail = false;
      await db.prepare("UPDATE contact_outbox SET next_attempt_at = 0 WHERE kind = 'email'").run();
      await deliverContacts(env);
      await discordContactReply(await signed(request), env, ctx);
      await finish();
      const emails = calls.filter((call) => call.url.includes("gmail.googleapis.com"));
      assert.equal(emails.length, 2);
      assert.equal(emails[0].body.raw, emails[1].body.raw);
      const mime = Buffer.from(emails[1].body.raw, "base64url").toString();
      assert.ok(mime.includes(`To: <${contact.email}>\r\n`));
      assert.match(Buffer.from(mime.split("\r\n\r\n")[1], "base64").toString(), /Thanks for the feedback!/);
      assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM contact_replies").first()).count, 1);
      assert.equal((await db.prepare("SELECT status FROM contact_outbox WHERE kind = 'email'").first()).status, "sent");
    });
    await t.test("authorization failures retry before send; uncertain sends stop for manual reconciliation", async () => {
      await db.prepare("UPDATE contact_outbox SET status = 'pending', next_attempt_at = 0 WHERE kind = 'email'").run();
      failAuth = true;
      const before = calls.length;
      await deliverContacts(env);
      assert.equal(calls.length, before);
      assert.equal((await db.prepare("SELECT status FROM contact_outbox WHERE kind = 'email'").first()).status, "pending");
      failAuth = false;
      for (const outcome of ["network", "server", "malformed"]) {
        unknownEmail = outcome;
        await db.prepare("UPDATE contact_outbox SET status = 'pending', attempts = 0, next_attempt_at = 0 WHERE kind = 'email'").run();
        await deliverContacts(env);
        const row = await db.prepare("SELECT status, last_error FROM contact_outbox WHERE kind = 'email'").first();
        assert.equal(row.status, "failed", outcome);
        assert.match(row.last_error, /outcome unknown/);
        const after = calls.length;
        await deliverContacts(env);
        assert.equal(calls.length, after);
      }
      unknownEmail = "";
    });
    await t.test("expired retries fail visibly without a provider call", async () => {
      await db.prepare("UPDATE contact_outbox SET status = 'pending', next_attempt_at = 0, created_at = 0 WHERE kind = 'email'").run();
      const before = calls.length;
      await deliverContacts(env);
      assert.equal(calls.length, before);
      assert.equal((await db.prepare("SELECT status FROM contact_outbox WHERE kind = 'email'").first()).status, "failed");
    });
  } finally { await mf.dispose(); }
});
