# Contact form: setup and operations

## What happens

1. A visitor submits their full name, email, subject and message at `/contact`.
   Cloudflare Turnstile checks the submission. No automatic acknowledgement
   email is sent, avoiding an unauthenticated email-sending endpoint.
2. The Worker atomically saves the contact and a Discord notification job in
   the existing `PAGE_VIEWS_DB`. The visitor sees a receipt reference only
   after storage succeeds. Retrying an unchanged submission in the same page
   session reuses its reference.
3. An incoming Discord webhook posts it to your private support channel,
   including the reference and `/reply` instructions.
4. A permitted staff member runs
   `/reply ticket:<contact-reference> message:<your response>` in that channel.
   Only references belonging to contacts already delivered by this website
   are accepted. The Worker records the response, marks the contact `replied`,
   queues an email to the **stored** visitor email, and displays the response
   in the channel. The command cannot choose an arbitrary email recipient.
5. Gmail sends the email from your dedicated support account. Safely retryable
   failures are retried by the Worker cron; uncertain send outcomes require
   manual review to avoid duplicate emails.

**Ordinary Discord messages and native Discord replies are not forwarded.**
Use `/reply` with the contact reference; it is not Discord's native Reply action.
This is an HTTP-interactions app: no Gateway bot or continuously running server
is needed. The slash command appears as a channel response, not a threaded reply
to the webhook notification.
Visitor email ownership is not verified. Treat submissions as untrusted and do
not include sensitive account information in a reply solely because an address
was entered in the form.

## 1. Apply the database migration

The existing binding is `PAGE_VIEWS_DB`; its database name is
`nihongo_toolkit_view`. The migration adds three tables and leaves page views
unchanged:

```sh
npx wrangler d1 migrations apply nihongo_toolkit_view --local
# Apply deliberately to production when ready:
npx wrangler d1 migrations apply nihongo_toolkit_view --remote
```

`--local` applies the migrations to Wrangler's **local simulated D1 database**
on your computer, under `.wrangler/state/v3/d1/` by default. It uses the
`nihongo_toolkit_view` configuration and `PAGE_VIEWS_DB` binding, but it is
separate from the real Cloudflare-hosted database. It does not change production,
Turso, or `backend/data/nihon.sqlite`. `wrangler dev` uses this local D1 state
by default. A custom `--persist-to` directory changes where that state is stored;
use the same directory for migration and development commands.

`--remote` is the separate, deliberate step that changes the Cloudflare-hosted
database identified by `database_id` in `wrangler.jsonc`. Local migrations and
test records are not automatically uploaded to it.

Tables: `contact_messages`, `contact_replies`, `contact_outbox`.
Unlike aggregate page views, these contain personal information. Restrict D1
access and backups; never publish exports of this database.

## 2. Create a Discord server, private channel and app

### Create your server first

1. Open [Discord](https://discord.com/app) in your browser or the desktop app.
   Create an account and sign in if you do not already have one.
2. In the left-hand server sidebar, click **+ (Add a Server)**, then
   **Create My Own**. If Discord asks what the server is for, choose the
   option that fits or skip that question.
3. Name it something like **Nihongo Toolkit Support** and click **Create**.
   This creates a Discord workspace, not a server you need to host or pay for.
4. Keep it for internal support: do not publish an invite link. You can use it
   alone initially and invite trusted staff later.
5. Open the server's name menu and choose **Server Settings**. This is where
   you will manage roles and integrations in the steps below.

Your Discord **server** holds channels and members. The **application** you
create later in the Developer Portal is a separate integration installed into
that server. Discord calls a server a **guild** in its API and configuration.

### A. Understand your existing Admin and Members roles

If you already created **Admin** (Administrator enabled) and **Members**
(ordinary messaging permissions), keep them. You do not need to start over.

- Being in both roles does **not** reduce your Admin permissions to those of
  Members. Server-level role permissions accumulate; a role with fewer
  permissions does not cancel a role with more.
- As server owner, you already have access to everything. Giving yourself Admin
  is still useful here because our backend explicitly checks for a role ID.
- You may remove Members from your own account for clarity, or leave it assigned.
  Neither choice prevents this integration from working.
- **Members is not the support role.** Never use its ID for
  `CONTACT_DISCORD_ROLE_ID`, since that would authorize ordinary members to
  respond to visitors.
- For your current solo setup, use **Admin's role ID** as
  `CONTACT_DISCORD_ROLE_ID`. Keep that role assigned to yourself.
- Do **not** give the bot your Admin role. Your human permissions and the bot's
  permissions are separate.

An Administrator bypasses channel permission restrictions. A private channel
can exclude ordinary members, but cannot hide messages from the server owner
or other administrators.

If you later add support staff, create a separate **Contact Support** role
instead of making them administrators. Give it View Channel, Send Messages,
Read Message History, Use Application Commands and Manage Messages in the
support channel, then configure its ID instead. Our `/reply` command defaults
to requiring Manage Messages; the backend additionally requires the configured
role. Merely owning the server is not a substitute for having that role assigned.

### B. Create or check the private contact channel

1. Return to the normal Discord app, not the Developer Portal.
2. In your server, click **+** next to **Text Channels**.
3. Choose **Text**, name it `website-contact`, and enable **Private Channel**.
4. If Discord asks who may access it, select **Admin**, not **Members**.
5. Create the channel. If it already exists, right-click it and choose
   **Edit Channel → Permissions** instead.
6. Under advanced channel permissions:
   - For **@everyone**, set **View Channel** to the red **X** (deny).
   - Do not add a View Channel allow for **Members**.
   - Allow your Admin/support role to view the channel. Your own Administrator
     permission already bypasses the deny, but explicit support access makes
     the intended setup clearer.
7. Save changes. Leave unrelated permissions at their defaults.

The three permission states mean **X = deny**, **/ = inherit**, and
**checkmark = allow**. They are not simple on/off checkboxes. If the channel is
inside a category, verify that its effective permissions remain private; do
not later sync it with a public category without reviewing the result.

### C. Create the incoming webhook

This is how the website's contact messages will enter the channel.

1. Right-click `website-contact` → **Edit Channel**.
2. Open **Integrations → Webhooks**. Depending on the client, select
   **Create Webhook** or **New Webhook**.
3. Name it `Nihongo Contact` and confirm its selected channel is
   `website-contact`. An avatar is optional.
4. Save, then choose **Copy Webhook URL**.
5. Store that URL with `npx wrangler secret put CONTACT_DISCORD_WEBHOOK_URL`
   when you reach the configuration commands below.

The webhook URL is a **secret**, not your Worker URL. Anyone with it can post
to that webhook. Do not paste it into chat or include it in screenshots.
Do not put it into the Developer Portal's Interactions Endpoint field.

### D. Create the application in the Developer Portal

Open [Discord Developer Portal](https://discord.com/developers/applications),
click **New Application**, enter `Nihongo Contact`, accept the terms and create it.
If it already exists, click that application's card instead.

The following checklist is for **this private, server-only contact integration**,
not a public bot, Discord login system or game. Portal labels may move slightly
between versions. Save changes on each screen before moving to the next.

#### General Information

| Setting | What to do |
| --- | --- |
| Name | `Nihongo Contact` |
| App icon / description / tags | Optional; leave blank if you prefer |
| Application ID | Copy for `CONTACT_DISCORD_APPLICATION_ID` |
| Public Key | Copy for `CONTACT_DISCORD_PUBLIC_KEY`; this is not the bot token |
| Interactions Endpoint URL | **Leave blank for now.** Configure after deploying the Worker in section 5 |
| Other endpoint URLs, including event/webhook subscriptions if shown | Leave blank; this integration uses only the Interactions Endpoint |
| Terms of Service / Privacy Policy URLs if shown | Not needed for this private installation; do not invent URLs |

Do not enter localhost as the Interactions Endpoint. Discord must be able to
reach it over public HTTPS and verify its response before saving it.

#### Installation

Use this private-install route consistently; do not also configure a public
Discord Provided Link.

| Setting | What to choose |
| --- | --- |
| Installation Contexts → Guild Install | **On / checked** |
| Installation Contexts → User Install | **Off / unchecked** |
| Install Link | **None** |
| Default Install Settings | Leave unchanged if still visible; we will explicitly choose scopes and permissions in the OAuth2 URL Generator |

**Guild Install** means install into your server. **User Install** means install
for a personal account across Discord contexts, which we do not want.
Selecting **None** hides the public Add App link; you will still install the
application yourself using a generated OAuth2 URL below.

#### Bot

If you see **Add Bot**, click it. Some applications already have a bot user.

| Setting | What to choose |
| --- | --- |
| Bot username / avatar | Optional; use `Nihongo Contact` if available |
| Public Bot | **Off**; only the application owner should install this private bot |
| Requires OAuth2 Code Grant | **Off**; we are not implementing an OAuth login/code-exchange flow |
| Presence Intent | **Off** |
| Server Members Intent | **Off** |
| Message Content Intent | **Off** |
| Bot Permissions calculator, if shown | Do not select Administrator or other broad permissions; installation permissions are chosen below |

The last three switches are **Privileged Gateway Intents**. All remain off:
the Worker receives signed HTTP slash-command requests and never listens to
ordinary Discord messages or connects to the Gateway.

If turning off Public Bot reports that a private application cannot have a
default authorization link, return to **Installation**, set **Install Link =
None**, save, then turn off Public Bot again.

For command registration:

1. Under **Token**, click **Reset Token** if necessary.
2. Complete Discord's password/MFA confirmation.
3. Copy the token once and keep it in a password manager or the gitignored
   local `.dev.vars` file as `DISCORD_BOT_TOKEN`.
4. Never share the token or click Reset Token casually after configuring it;
   resetting invalidates the previous token.

The token is only used by our registration script. The deployed Worker does
not need a bot token.

#### OAuth2 → General, if shown

- Leave **Redirects** empty. This application does not have a Discord login
  callback and does not need a redirect URI.
- Do not generate, copy or use the **Client Secret**. It is not the bot token
  and is not used by this integration.
- Leave unrelated OAuth2 settings at their defaults.

#### OAuth2 → URL Generator

This is the screen with many scope and permission checkboxes. Select **only**
the following:

**Scopes:**

- [x] `bot`
- [x] `applications.commands`
- [ ] Everything else, including `identify`, `email`, `guilds`,
  `guilds.join` and `webhook.incoming`

We already created the incoming webhook manually, so `webhook.incoming` is
unnecessary. The `email` scope would request a Discord user's email and has
nothing to do with sending replies to website visitors.

After selecting `bot`, the **Bot Permissions** section appears. Select:

- [x] View Channels
- [x] Send Messages
- [ ] All other permissions, especially **Administrator**, Manage Server,
  Manage Roles, Manage Channels, Manage Webhooks and Manage Messages

The bot does not need Manage Messages just because the **human** `/reply`
command defaults to that permission. These are separate checks.
If an **Integration Type** selector appears, choose **Guild Install**.

1. Copy the **Generated URL** at the bottom.
2. Open it in a browser where you are logged into the **same Discord account
   that owns the application**.
3. Choose **Add to Server**, select your support server and continue.
4. Check that the authorization screen does not request Administrator.
5. Authorize and complete any verification.

If the server is absent from the list, check which account is logged in and
that it owns or can manage the server. Because Public Bot is off, another
account cannot install this app for you.

Leave other Portal areas (such as Rich Presence, Activities, Monetization,
App Directory, Linked Roles and unrelated event subscriptions) unconfigured.
They are not used by this integration.

### E. Give the installed app access to the private channel

1. Return to Discord and open **Edit Channel → Permissions** for
   `website-contact`.
2. Add the installed bot/application member, or its automatically created role.
3. Allow **View Channel** and **Send Messages** there. Do not grant
   Administrator or give it your Admin role.
4. Keep **@everyone → View Channel** denied and Members without access.
5. Save.

The bot can appear **offline**. That is expected: no continuously running
Gateway connection is used. Its online indicator is not a health check for
the webhook or slash-command endpoint.

Also, `/reply` will **not appear yet** simply because you installed the app.
It must be registered using our script in section 5.

### F. Collect the IDs and distinguish the credentials

1. In the regular Discord app, open the gear beside your username →
   **Advanced → Developer Mode**, and turn it on.
2. Right-click the server icon → **Copy Server ID**.
3. Right-click `website-contact` → **Copy Channel ID**.
4. Open **Server Settings → Roles**, use the Admin role's context menu →
   **Copy Role ID**. For your current setup, this is the role to use.
5. Get the Application ID and Public Key from the application's
   **General Information** screen in the Developer Portal.

| Value | Where it comes from | Configuration name | Secret? |
| --- | --- | --- | --- |
| Server ID / Guild ID | Your Discord server | `CONTACT_DISCORD_GUILD_ID` | No |
| Channel ID | `website-contact` | `CONTACT_DISCORD_CHANNEL_ID` | No |
| Admin role ID (or future Contact Support role ID) | Server Settings → Roles | `CONTACT_DISCORD_ROLE_ID` | No |
| Application ID | Portal → General Information | `CONTACT_DISCORD_APPLICATION_ID` | No |
| Public Key | Portal → General Information | `CONTACT_DISCORD_PUBLIC_KEY` | No |
| Webhook URL | Channel → Integrations → Webhooks | `CONTACT_DISCORD_WEBHOOK_URL` | **Yes** |
| Bot Token | Portal → Bot → Token | `DISCORD_BOT_TOKEN`, local registration only | **Yes** |
| Client Secret | Portal → OAuth2 | **Not used** | **Yes; do not copy it** |

An ID is not the display name: enter the copied numeric ID, not `Admin`,
`website-contact` or `Nihongo Contact`.

### G. Save the configuration (do not enable contacts yet)

Add these non-secret values to the Worker's `vars` in `wrangler.jsonc`:

```json
{
  "CONTACT_ENABLED": "false",
  "CONTACT_DISCORD_APPLICATION_ID": "your-application-id",
  "CONTACT_DISCORD_GUILD_ID": "your-server-id",
  "CONTACT_DISCORD_CHANNEL_ID": "your-private-channel-id",
  "CONTACT_DISCORD_ROLE_ID": "your-support-role-id",
  "CONTACT_EMAIL_FROM": "your-support-account@gmail.com"
}
```

Keep the existing vars; merge these keys instead of replacing the whole object.
Optionally set `CONTACT_EMAIL_REPLY_TO` to a mailbox you actually monitor.
Without that setting, replies go to the From address. Incoming email replies
are **not** ingested by this application.

Set the webhook URL and public key via prompts:

```sh
npx wrangler secret put CONTACT_DISCORD_WEBHOOK_URL
npx wrangler secret put CONTACT_DISCORD_PUBLIC_KEY
```

Do not paste secrets into chat, committed files, screenshots or command arguments.
The public key is not a secret, but storing it this way is convenient.

## 3. Configure Gmail (no custom domain required)

The site stays on Cloudflare's free `pages.dev` / `workers.dev` hostnames.
Those are hosting addresses, not email domains whose DNS you control. No
domain purchase, DNS setup or paid Google Workspace account is needed here.
The sender will be a regular **dedicated `@gmail.com` account**.

This replaces the earlier Resend instructions. Resend's shared testing sender
cannot email arbitrary visitors, so it does not fit this deployment.

### A. Create the support mailbox

1. Create a regular Google account with Gmail, choosing an available address
   for support, for example `your-toolkit-support@gmail.com`.
2. Sign into Gmail and finish any account setup. Send a manual test email to
   another address you control, and confirm you can receive replies.
3. Enable two-step verification and configure account recovery.
4. Set `CONTACT_EMAIL_FROM` to this **bare email address**, not a display-name
   string. The application adds the display name `Nihongo Toolkit` itself.
5. Monitor this inbox for visitors' email replies and delivery failures.
   Incoming emails are not synchronized back to Discord or D1.

Use the **same support account** when granting Google access below. Do not
authorize your personal Gmail and then set From to the support account.
No Gmail password or app password is used by this integration.

### B. Start Personal mode onboarding with the correct account

Use [Google's Personal mode onboarding](https://console.cloud.google.com/auth/overview/personal),
not the ordinary External application setup.

**Sign in with the dedicated support Gmail account before continuing.** Only
the Google Account that creates the Personal mode application can authorize
its clients. Adding another account as a project Owner or Editor does not
allow that account to authorize Gmail. A separate browser profile signed into
only the support account helps avoid creating the app under the wrong identity.

If you already created an **External** project following the earlier guide:

- Leave it intact for now; there is no need to delete it.
- It **cannot be converted to Personal**. Create a new project through the
  Personal onboarding flow instead.
- Do not keep trying to complete Branding or click Publish app on that old
  project. Those are not steps in this replacement flow.
- Old OAuth client credentials and refresh tokens will not become credentials
  for the new project. Obtain a matching new client/token set below.
- Your Discord server, app, roles, webhook, Cloudflare Worker and D1 database
  are unaffected.

In the Personal onboarding screen:

1. If there are no existing Personal projects, Google creates a new project
   when you continue, normally named `personal-mode-app`.
2. If a **Personal mode project** dropdown is shown, choose **Create a new
   project**, unless you deliberately want to reuse an existing Personal
   project created by this same support account.
3. If offered a project name, use `Nihongo Contact Mail`. The default name is
   also fine; the name is not an authorization setting.
4. Configure the OAuth client on that same screen as described next.

### C. Create the Web application client during onboarding

| Screen / field | Value |
| --- | --- |
| Application type | **Web application** |
| Client name, if requested | `Nihongo Contact setup` |
| Authorized JavaScript origins, if shown | Leave empty |
| Authorized redirect URIs | `https://developers.google.com/oauthplayground` |
| Use this client for an AI-powered agent | **Unchecked**; our Worker sends human-written support replies |
| Terms of Service agreement | Read and accept to continue |

1. Click **Continue**.
2. In **OAuth client created**, securely copy the **Client ID** and **Client
   secret**. Google says the full secret cannot be viewed or downloaded again
   after this dialog closes. You may download the JSON to secure storage, but
   never into a tracked repository location or a shared folder.
3. Note which project was created/selected. Use that project for all remaining
   Google Cloud steps, not the old External project.
4. If you need to check the redirect URI later, open **Google Auth Platform →
   Clients**, select this Web application client and inspect its redirect URIs.

The redirect URI is for the **one-time authorization using Google's OAuth
Playground**. It is not your Cloudflare Worker endpoint or website address.
You do not need to implement a public callback in this application.

There is no need to create a second OAuth client through the ordinary
Credentials wizard: onboarding just created the client we will use.

### D. Enable Gmail API and confirm Personal mode

With the **new Personal project** selected:

1. Go to **APIs & Services → Library**.
2. Search for **Gmail API**, open Google's Gmail API entry, then click
   **Enable**. If it is already enabled, leave it enabled.
3. If onboarding warned that APIs could not be auto-enabled, this is where
   you enable Gmail API manually. Do not enable unrelated APIs.
4. Open **Google Auth Platform → Audience** and confirm the user type is
   **Personal**.

**Personal mode has no Testing/In production publishing status.** There is
no Publish app step, no test-user list to populate, no OAuth verification
requirement, and no seven-day testing-token expiry. Do not switch to the old
External project just to look for these controls.

If you still see **External / Testing**, first check the project selector.
If the new project is also External, stop and return to Personal onboarding;
an existing External application cannot be switched to Personal.

Personal is a one-time choice: it also cannot later be changed to External
or Internal. If you eventually need other Google accounts to authorize the
application, create a separate project for that use case.

Only the support mailbox owner grants Google authorization. Website visitors
do not sign in with Google; being an email recipient does not make them an
OAuth user of the app.

The only scope our authorization flow will request is:

```text
https://www.googleapis.com/auth/gmail.send
```

This permits sending, not reading your inbox. Do not request full Gmail access,
`gmail.readonly`, `gmail.modify`, `gmail.compose`, contacts or calendar scopes.
If you configure a scope list under **Data Access**, include only `gmail.send`;
the actual grant is requested explicitly in Playground below.

You are not deploying your site to Google Cloud or changing its Cloudflare
hosting. No domain purchase or paid Google compute resource is needed for
this setup. Do not claim ownership of `pages.dev`, `workers.dev` or `gmail.com`.

### E. Authorize your support mailbox once

1. Open [Google OAuth Playground](https://developers.google.com/oauthplayground).
   Verify the hostname is `developers.google.com`, not a third-party token tool.
2. Open the gear/settings panel:
   - OAuth flow: **Server-side**.
   - OAuth endpoints: **Google** (do not enter custom endpoints).
   - Access type: **Offline**.
   - Force prompt / prompt for consent: choose **Consent** if available.
   - Enable **Use your own OAuth credentials**.
   - Enter the **new Personal project's** Client ID and Client secret from
     step C, not credentials from the old External project.
3. Close the settings panel. In Step 1, enter this exact scope in
   **Input your own scopes**:
   `https://www.googleapis.com/auth/gmail.send`.
4. Click **Authorize APIs**, select the **same support Gmail account that
   created the Personal application**, and approve sending email. Confirm the
   authorization refers to the client/project you just created.
5. Personal mode should not show an unverified-app warning. If it does, stop
   and check that **Use your own OAuth credentials** is enabled and that you
   entered the Personal project's client credentials. An
   `client_user_mismatch` error means you selected a Google account other than
   the application's creator. Do not change the app to External to work around it.
6. In Playground Step 2, click **Exchange authorization code for tokens**.
7. Copy the **Refresh token** to secure storage. Do not substitute the
   **Access token**: access tokens are short-lived and the Worker refreshes
   them automatically.
8. Do not click **Revoke tokens** afterward; that invalidates the authorization.
   Close the Playground when done and keep the refresh token private.
   Never enable **Include OAuth credentials and OAuth tokens in the link** or
   share Playground URLs/screenshots containing tokens.

If no refresh token appears, confirm Offline access and consent were selected,
then authorize again. Playground's default shared client credentials are not
appropriate for a persistent deployment; **Use your own OAuth credentials**
must be enabled. The refresh token must come from this Personal client; tokens
issued by the old External/Testing client retain that client's restrictions.
If Google reports `redirect_uri_mismatch`, check the selected client's type is
Web application and its redirect URI is exactly
`https://developers.google.com/oauthplayground` (no trailing slash).

### F. Store the credentials in the Worker

Run each command and paste the corresponding value into Wrangler's prompt:

```sh
npx wrangler secret put GMAIL_CLIENT_ID
npx wrangler secret put GMAIL_CLIENT_SECRET
npx wrangler secret put GMAIL_REFRESH_TOKEN
```

Use all three values from the new flow together. If you previously stored
credentials from the External project, these commands replace them. Do not
combine an old refresh token with the new client ID or secret.

Set this non-secret Worker variable to the exact mailbox you authorized:

```json
"CONTACT_EMAIL_FROM": "your-support-account@gmail.com"
```

Keep `CONTACT_ENABLED=false` until the remaining setup and test are complete.
Do not put OAuth credentials in `VITE_*` variables or committed files.
For local Worker tests, the same names belong in the gitignored root `.dev.vars`.
If you previously configured `RESEND_API_KEY`, it is no longer used; remove
that obsolete Worker secret and revoke its key in Resend when no longer needed.

### G. Understand the limits

- Gmail applies account sending limits and abuse protections; a free Gmail
  account is suitable for low-volume, human-reviewed support, not bulk mail.
  API quota does not remove mailbox sending limits. New accounts can have
  additional restrictions; consult Google's current limits rather than
  promising a fixed daily capacity.
- Personal mode removes the seven-day **testing** expiry; it does not make
  credentials permanent. Refresh tokens may still expire or be revoked,
  including after account/security changes.
  A `Gmail authorization HTTP 400` error often means you need to repeat
  authorization and replace `GMAIL_REFRESH_TOKEN`.
- `sent` means Gmail accepted the API call, not that the visitor received it.
  Check Gmail **Sent** and the inbox for bounces. The application does not
  read either folder.
- Gmail does not offer Resend-style send idempotency keys. A timeout, server
  error or Worker interruption during sending leaves the job `failed` with
  an **outcome unknown** message. It is not automatically sent again.
  Review Gmail Sent before deciding whether to resend; details below.

## 4. Configure Turnstile and the frontend

1. In Cloudflare **Turnstile**, create a Managed widget and allow the actual
   hostname of your frontend.
2. Store its secret key on the Worker:

```sh
npx wrangler secret put TURNSTILE_SECRET_KEY
```

3. Set the **public site key** in your frontend build environment:

```sh
VITE_TURNSTILE_SITE_KEY=your-public-site-key \
VITE_API_BASE_URL=https://your-worker.example \
npm run build
```

The secret key must never be put in a `VITE_*` variable. The frontend displays
an unavailable notice when the public site key is absent.
`ALLOWED_ORIGINS` on the Worker must include the exact frontend origin. The
backend checks the Turnstile action (`contact`) and hostname as well as success.
For local manual testing, use a separate widget configured for `localhost` or
`127.0.0.1`; do not weaken the production hostname checks.

Also configure a Cloudflare rate-limiting rule for `POST /api/contact` before
opening the form publicly. Turnstile reduces automated abuse but is not a
storage quota or comprehensive rate limit.

## 5. Deploy, connect interactions and register `/reply`

1. Deploy the Worker using your normal deployment flow with the new migration,
   vars and secrets. Keep `CONTACT_ENABLED=false` until setup is complete.
2. In Discord application **General Information → Interactions Endpoint URL**,
   set `https://your-worker.example/api/discord/contact`.
   The public HTTPS endpoint verifies Discord's Ed25519 signature and answers
   its PING handshake even while contact submissions are disabled.
   Do not use this as an incoming-webhook URL.
3. Register the command using the provided script. Put the following values
   in the root `.dev.vars` (already gitignored) for local registration:

```dotenv
CONTACT_DISCORD_APPLICATION_ID=your-application-id
CONTACT_DISCORD_GUILD_ID=your-server-id
DISCORD_BOT_TOKEN=your-bot-token
```

Then:

```sh
node --use-system-ca --env-file=.dev.vars scripts/register-contact-command.mjs
```

With Node.js 24, `--use-system-ca` also trusts certificates from the operating
system, including approved corporate proxy certificates. If registration fails
with `SELF_SIGNED_CERT_IN_CHAIN`, ensure your organization's root certificate
is installed and trusted, or supply an approved PEM CA bundle through
`NODE_EXTRA_CA_CERTS`. Do not disable TLS certificate verification.

This creates/updates only the guild `/reply` command; it does not overwrite
your other commands. The bot token is needed only for registration, not by
the deployed Worker. Remove it from local storage when no longer needed.
If the command is not available, check the application installation and
Discord server **Integrations → application → command permissions**.
If registration returns HTTP 403, confirm the application ID and bot token
belong to the same application, the guild ID is the intended server ID, and
the app is installed in that server with the `applications.commands` scope.
Receiving webhook notifications does not prove that the app is installed.
If `/reply` returns "You cannot reply to contacts from this account or channel",
its private response lists the missing or mismatched Worker runtime settings.
Check those settings on the Worker serving the Interactions Endpoint URL, not
only in GitHub Actions. The configured support role must belong to the human
invoking the command; server ownership does not bypass this check. Run the
command directly in the configured channel, not in a thread or DM.

**Alternative: register from GitHub Actions (including from a phone).**
Use this when local Discord API access is unavailable and your organization's
policy permits registration from a GitHub-hosted runner.

- Commit and push `.github/workflows/register-discord-command.yml` and the
  registration script to the repository's default branch. The workflow must
  exist on that branch for GitHub to offer the manual trigger.
- In the repository's GitHub web interface, open **Settings → Secrets and
  variables → Actions → New repository secret**. Add three secrets named
  `CONTACT_DISCORD_APPLICATION_ID`, `CONTACT_DISCORD_GUILD_ID`, and
  `DISCORD_BOT_TOKEN`, using the values described above. These GitHub secrets
  are separate from Cloudflare runtime secrets. Never commit `.dev.vars`.
- Open **Actions → Register Discord reply command → Run workflow**.
  Select the default branch and confirm **Run workflow**. On a phone, use
  GitHub in the browser; request the desktop site if these controls are hidden.
- Open the run and its **Register reply command** step. Success prints
  `Registered /reply for the configured Discord server.` If it fails, inspect
  the error before changing credentials.
- Return to Discord and select `/reply` from the command picker, then fill in
  its `ticket` and `message` fields. Pasting the example as ordinary chat does
  not invoke the command.

The workflow runs only on manual request, uses Node.js built-ins without
installing dependencies, and does not deploy the site or Worker. After success,
you can delete the GitHub `DISCORD_BOT_TOKEN` secret if no further registration
is needed; add it again before rerunning. The Worker's interaction endpoint
and runtime configuration are still required.

4. Set `CONTACT_ENABLED=true` in the Worker's vars and deploy again. Publish
   the frontend built with the Turnstile site key and correct API URL.
5. Submit a test contact using an email address you control. Confirm the
   private-channel notification, run `/reply` with its reference, then check
   the recipient's mailbox and your support Gmail Sent folder. Ordinary channel
   messages must do nothing.

No cloud resources, migrations, command registrations or deployments are
automatically performed by the implementation or its tests.

## Reply email appearance and deliverability

Replies include a branded HTML layout and an equivalent plain-text fallback.
Visitor and staff content is escaped before insertion into HTML; Discord
formatting is treated as text, not executable markup. The subject identifies
Nihongo Toolkit and the contact category without pretending to be an existing
email thread. No remote images, tracking pixels or promotional links are added.

A successful Gmail API send means Gmail accepted the email, not that it reached
the recipient's inbox. A template cannot guarantee inbox placement.

- Set `CONTACT_EMAIL_FROM` to the dedicated Gmail account that authorized the
  refresh token. Keep a stable sender identity. Leave `CONTACT_EMAIL_REPLY_TO`
  unset unless another monitored reply address is actually needed.
- For this `@gmail.com` sender, Google manages the sending domain's
  authentication; do not add Gmail SPF/DKIM records to your Pages or Workers
  subdomain. In a received Gmail message, use **More → Show original** to inspect
  SPF, DKIM and DMARC results and the sender identity. Other providers offer
  similar message-header views. Authentication passing is necessary evidence
  to check, not a guarantee against spam filtering.
- Read any explanation displayed above the message in Spam. For your own
  requested test reply, use **Not spam** and optionally add the sender to your
  contacts. This helps that recipient's filtering; it does not fix delivery
  globally.
- Send only genuine replies to requested contacts. Avoid repetitive bursts of
  test messages, artificial "warm-up" traffic, misleading subjects and link-heavy
  content. A new support account has limited reputation; allow legitimate use
  to establish it rather than buying or manufacturing engagement.
- A submitted email address is not proof of ownership. Keep Turnstile and
  rate limiting enabled, and do not send unsolicited follow-ups.

See [Google's email sender guidelines](https://support.google.com/mail/answer/81126).
If delivery remains poor, inspect the actual received headers and spam reason
before changing providers. A custom domain with an authenticated mail provider
is a future option, not a requirement for this Gmail setup or an inbox guarantee.

## Local development and automated checks

The contact API is **Worker/D1-only**. `npm run dev:backend` uses the dictionary
Node server and does not provide these contact endpoints. For manual testing:

1. Apply the local D1 migration.
2. Put local vars and secrets in root `.dev.vars`; use a separate private test
   Discord channel, webhook and app. Include `CONTACT_ENABLED=true` and
   `ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173`.
3. Run `npx wrangler dev` for the API (normally port 8787).
4. In another terminal, run:

```sh
VITE_API_BASE_URL=http://localhost:8787 \
VITE_TURNSTILE_SITE_KEY=your-local-widget-public-site-key \
npm run dev:frontend
```

Open the contact page through Vite at `/contact`. A local Discord interactions
endpoint needs a public HTTPS tunnel or a separately deployed test Worker;
Discord cannot reach localhost. Never point production Discord at an insecure
or untrusted tunnel. This repository's Worker is API-only for ordinary page
requests; Vite or your frontend host serves the contact HTML.

Tests use real local D1 tables and cryptographic signatures, but mock all
Discord, Turnstile, Google OAuth and Gmail traffic:

```sh
npm run test:contact
```

Stop local servers with Ctrl+C when finished.

## Delivery states, retries and troubleshooting

`contact_messages.status` starts as `open`. Only an authorized `/reply` for a
stored and Discord-delivered website contact changes it to `replied`. Email
delivery status is tracked separately in `contact_outbox`.

The Worker attempts delivery after a submission or reply. A cron trigger every
five minutes retries pending work. Jobs use atomic leases to prevent concurrent
workers from sending the same job. There are at most six delivery attempts,
with a 23-hour cutoff; terminal errors are recorded as `failed`. Configure
monitoring for failed jobs, and check Worker logs without logging message bodies,
addresses or credentials.
For Gmail, this retry policy applies only before attempting a send or after a
definite rejection (for example HTTP 429). Before calling Gmail's send API, the
Worker durably marks the job as requiring review if interrupted. An accepted
response changes it to `sent`; a definite rejection can requeue it. Uncertain
outcomes stay `failed`, including a crash immediately before sending. This
favors avoiding duplicate emails over automatic recovery in ambiguous cases.

Inspect counts without exposing personal information:

```sh
npx wrangler d1 execute nihongo_toolkit_view --remote --command \
  "SELECT kind, status, COUNT(*) AS count FROM contact_outbox GROUP BY kind, status"
```

- **No Discord notification:** inspect Discord outbox `last_error`, check the
  webhook channel ID, webhook secret, cron and D1 migrations.
- **Command refused:** verify Application, Guild, Channel and Role IDs. The
  staff member must have the configured role. The ticket is the website UUID,
  not the Discord message ID. A contact not yet successfully notified cannot
  be replied to.
- **Reply recorded but no email:** inspect the email outbox and Gmail Sent;
  verify the OAuth credentials, authorized support account, sending limits and
  recipient address. A Gmail send HTTP 403 can indicate missing scope or policy
  restrictions. Reauthorize with only `gmail.send` as needed.
- **Discord webhook retry duplicates:** webhook delivery is at-least-once.
  A lost response after Discord accepts a message can produce duplicate
  notifications with the same contact reference. Do not reply to both.
- **Unknown email outcome:** do not immediately rerun `/reply`. Search the
  support Gmail Sent folder for the contact reference or
  `rfc822msgid:email-DISCORD_INTERACTION_ID@gmail.com` using the job's ID.
  The Message-ID helps investigation; it is **not** a Gmail deduplication key.
  If you establish that the message was not sent, you can deliberately send
  another `/reply`. If the result remains unclear, keep it under review.
- **Email duplicates:** signed interaction replays reuse the same stored reply.
  Re-running `/reply` intentionally creates a new response and email. Gmail
  has no exactly-once send guarantee; never blindly requeue uncertain jobs.
- **`replied` is not delivery confirmation:** it means staff recorded a reply;
  a failed email does not erase that audit record.

The implementation does not automatically delete contacts. Decide and publish
a retention period before launch. Delete expired contacts and their corresponding
Discord messages according to that policy; deleting a contact row cascades to
its replies and outbox jobs, but does not delete Discord messages or Gmail
messages. Restrict access to all three providers and honor deletion requests.

References: [Discord interactions](https://docs.discord.com/developers/platform/interactions),
[Gmail sending API](https://developers.google.com/workspace/gmail/api/guides/sending),
[Google OAuth token expiration](https://developers.google.com/identity/protocols/oauth2#expiration),
[Google verification exceptions](https://support.google.com/cloud/answer/13464323),
[Gmail sending limits](https://support.google.com/mail/answer/22839),
[Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).
