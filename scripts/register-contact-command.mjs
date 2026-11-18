import { contactReplyCommand } from "../backend/src/contact.js";

const { CONTACT_DISCORD_APPLICATION_ID: app, CONTACT_DISCORD_GUILD_ID: guild, DISCORD_BOT_TOKEN: token } = process.env;
if (!/^\d+$/.test(app || "") || !/^\d+$/.test(guild || "") || !token) {
  throw new Error("Set CONTACT_DISCORD_APPLICATION_ID, CONTACT_DISCORD_GUILD_ID and DISCORD_BOT_TOKEN in the environment.");
}
const response = await fetch(`https://discord.com/api/v10/applications/${app}/guilds/${guild}/commands`, {
  method: "POST", headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(contactReplyCommand), signal: AbortSignal.timeout(10000)
});
if (!response.ok) throw new Error(`Discord command registration failed (HTTP ${response.status}).`);
console.log("Registered /reply for the configured Discord server. Other commands were not changed.");
