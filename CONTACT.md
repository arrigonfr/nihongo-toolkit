# Contact form: production setup

A visitor submits the form on **Cloudflare Pages**. The **Worker** verifies
Turnstile, saves the contact in **D1**, and posts it to a private **Discord**
channel. A staff member uses Discord's `/reply` command to send a response
through **Gmail**. There is no automatic acknowledgement email.

| What | NihongoToolkit production value |
| --- | --- |
| Website origin | `https://nihongotoolkit.pages.dev` |
| Worker origin | `https://nihongo-toolkit.fragappstore.workers.dev` |
| Discord Interactions Endpoint URL | `https://nihongo-toolkit.fragappstore.workers.dev/api/discord/contact` |
| D1 database | `nihongo_toolkit_view` |

Use the sections in order for a fresh setup. If your form already works, use
the [configuration tables](#configuration-reference) to check individual settings.
No custom domain or paid Google Workspace account is needed.

## 1. Cloudflare D1: prepare the production database

1. In Cloudflare, open **Workers & Pages > nihongo-toolkit (Worker) > Bindings**.
   The production Worker must have a **D1 database binding** named
   `PAGE_VIEWS_DB` pointing to `nihongo_toolkit_view`. This is already declared
   under `d1_databases` in [wrangler.jsonc](wrangler.jsonc), not under `vars`.
2. From the repository root, using Wrangler signed in to the correct
   Cloudflare account, apply the migration:

   ```sh
   npx wrangler d1 migrations apply nihongo_toolkit_view --remote
   ```

3. In the D1 dashboard, confirm `contact_messages`, `contact_replies`, and
   `contact_outbox` exist. They share the existing page-view database. The
   `--local` flag instead applies migrations to Wrangler's local simulation;
   it does not change production or Turso.

## 2. Discord: create the private channel and support role

1. In the Discord app, click **+ > Create My Own** in the server sidebar if you
   need a server. Name it `NihongoToolkit Support` or use your existing server.
2. Open **Server Settings > Roles > Create Role**. Name it `Contact Support`.
   Leave its server-wide permissions off and assign the role to **your human
   account** under **Manage Members**. Do not assign it to the bot. Owners and
   Administrators still need this role to pass the Worker's check.
3. Create a private **Text** channel named `website-contact`. Open
   **Edit Channel > Permissions** and set these channel permissions:

   | Role | Channel permissions |
   | --- | --- |
   | `@everyone` | Deny **View Channel** |
   | `Contact Support` | Allow **View Channel**, **Send Messages**, **Read Message History**, **Use Application Commands**, and **Manage Messages** (the command's default permission) |

   Don't grant access to ordinary members. Leave unrelated permissions inherited.
4. In that channel, open **Edit Channel > Integrations > Webhooks > New
   Webhook**. Name it `Nihongo Contact`, select `website-contact`, save, and
   **Copy Webhook URL** for `CONTACT_DISCORD_WEBHOOK_URL`. This secret lets the
   Worker post notifications; it doesn't install the app or register `/reply`.
5. In **User Settings > Advanced**, enable **Developer Mode** and copy these
   three IDs. Keep them as digit strings; don't use display names.

   | Copy action | Setting |
   | --- | --- |
   | Right-click the **server icon** > **Copy Server ID** | `CONTACT_DISCORD_GUILD_ID` |
   | Right-click `website-contact` > **Copy Channel ID** | `CONTACT_DISCORD_CHANNEL_ID` |
   | **Server Settings > Roles**, right-click `Contact Support` > **Copy Role ID** | `CONTACT_DISCORD_ROLE_ID` |

## 3. Discord Developer Portal: create and install the app

1. Open the [Discord Developer Portal](https://discord.com/developers/applications),
   choose **New Application**, and name it `Nihongo Contact`. In **General
   Information**, copy **Application ID** and **Public Key** for
   `CONTACT_DISCORD_APPLICATION_ID` and `CONTACT_DISCORD_PUBLIC_KEY`. Leave
   **Interactions Endpoint URL** empty until step 9.
2. Use these settings and save:

   | Screen | Setting | Value |
   | --- | --- | --- |
   | Installation | Guild Install / User Install | **On** / **Off** |
   | Installation | Install Link | **None** |
   | Bot | Public Bot / Requires OAuth2 Code Grant | **Off** / **Off** |
   | Bot | Presence, Server Members, and Message Content intents | All **Off** |

3. In **Bot > Token**, generate or reset the token if you don't already have
   it. Keep it private for GitHub Actions (`DISCORD_BOT_TOKEN`). It's not the
   Public Key or OAuth2 Client Secret. Don't reset a working token to troubleshoot.
4. In **OAuth2 > URL Generator**, choose scopes `bot` and
   `applications.commands` only. Under **Bot Permissions**, select **View
   Channels** and **Send Messages** only. If shown, choose **Guild Install**.
   Open the generated URL in your browser, select your support server, and
   authorize. Use this link if you can't find **Add App** in Discord.
5. Back in Discord, open `website-contact` > **Edit Channel > Permissions**.
   Add the installed bot or its `Nihongo Contact` role and allow **View
   Channel** and **Send Messages**. Do not give the bot Administrator or
   `Contact Support`. It can appear offline; `/reply` uses the Worker endpoint.

## 4. Gmail: create the sending mailbox

1. Create or choose a dedicated `@gmail.com` account for support and sign in
   to it. Enable two-step verification and account recovery.
2. Note the bare address (for example, `your-toolkit-support@gmail.com`) for
   `CONTACT_EMAIL_FROM`. Use this **same account** for both Google steps below.
   Monitor its inbox for visitor replies and bounces; they don't sync to Discord.

## 5. Google Cloud: create a Personal OAuth client and enable Gmail API

1. While signed in as the support Gmail account, open
   [Personal mode onboarding](https://console.cloud.google.com/auth/overview/personal).
   Create a new Personal project, or select one created by this same account.
   An existing External project can't be converted. In Personal mode there's
   no **Publish app** step, test-user list, or seven-day Testing token expiry.
2. Create the OAuth client **in the onboarding screen**:

   | Field | Value |
   | --- | --- |
   | Application type | **Web application** |
   | Client name | `Nihongo Contact setup` |
   | Authorized JavaScript origins | Leave empty |
   | Authorized redirect URIs | `https://developers.google.com/oauthplayground` |
   | Use this client for an AI-powered agent | Unchecked |

3. Accept the terms and click **Continue**. Copy the **Client ID** and save
   the **Client secret** securely before closing the dialog; these are
   `GMAIL_CLIENT_ID` and `GMAIL_CLIENT_SECRET`.
4. With that project selected, go to **APIs & Services > Library > Gmail API**
   and click **Enable** (if not already enabled). In **Google Auth Platform >
   Audience**, confirm the type is **Personal**, not **External / Testing**.

## 6. Google OAuth Playground: authorize the mailbox once

1. Open Google's [OAuth Playground](https://developers.google.com/oauthplayground).
   In the gear menu, use these settings:

   | Setting | Value |
   | --- | --- |
   | OAuth flow / endpoints | **Server-side** / **Google** |
   | Access type | **Offline** |
   | Force prompt (if shown) | **Consent** |
   | Use your own OAuth credentials | Checked; enter the Personal client's ID and secret from step 5 |

2. In Playground **Step 1 > Input your own scopes**, enter exactly
   `https://www.googleapis.com/auth/gmail.send`. Click **Authorize APIs**,
   select the support Gmail account that created the client, and approve.
   This grants send access, not inbox access.
3. In Playground **Step 2**, click **Exchange authorization code for tokens**.
   Save the **Refresh token** as `GMAIL_REFRESH_TOKEN`, not the short-lived
   **Access token**. Do not revoke tokens or share a Playground link containing
   them. Use this token with the same client ID and secret.

## 7. Cloudflare Turnstile: create a widget for Pages

1. In **Cloudflare > Turnstile**, click **Add widget**. Name it
   `NihongoToolkit Contact`, add hostname `nihongotoolkit.pages.dev` (no
   `https://` or path), select **Managed**, and create the widget.
2. Copy both keys from the same widget. The **Site Key** goes to Pages as
   `VITE_TURNSTILE_SITE_KEY`. The **Secret Key** goes to the Worker as
   `TURNSTILE_SECRET_KEY`. Do not replace one with the other.

## 8. Cloudflare Workers: configure and deploy the API

1. Configure the **production Worker** using the [backend table](#backend-worker-runtime).
2. For a fresh install, set `CONTACT_ENABLED` to the string `"false"` in the
   top-level `vars` and deploy. If the Worker builds from Git, push to its
   production branch and wait for the deployment. If deploying from your
   computer, run `npm run deploy:cloudflare` from the repository root.
   The deployed endpoint can answer Discord's verification request while the
   form is disabled.

## 9. Discord Developer Portal: connect the Worker endpoint

1. Return to the app's **General Information** screen.
   Paste `https://nihongo-toolkit.fragappstore.workers.dev/api/discord/contact`
   into **Interactions Endpoint URL**. Do not paste the incoming webhook URL.
2. Save. If Discord can't validate the URL, verify that the Worker is deployed
   and has the same app's Public Key.

## 10. GitHub Actions: register `/reply` in the server

1. In the repository on GitHub, make sure
   [register-discord-command.yml](.github/workflows/register-discord-command.yml)
   and its script are on the **default branch**. In **Settings > Secrets and
   variables > Actions > New repository secret**, add the three values in the
   [registration table](#github-actions-command-registration-only).
2. Open **Actions > Register Discord reply command > Run workflow**, select
   the default branch, and run it. Look for `Registered /reply for the
   configured Discord server.` This is the path that worked when the local
   network blocked Discord's API; use GitHub in your phone's browser if needed
   (request the desktop site if controls are hidden).
3. In `website-contact`, type `/reply` and check that your application appears
   in the command picker. You can remove the GitHub bot token secret after
   registration. Keep the Worker runtime settings; they are separate.

## 11. Cloudflare Pages: publish and test the complete flow

1. In **Workers & Pages > nihongotoolkit (Pages) > Settings > Variables and
   secrets**, select **Production** and set the [frontend build variables](#frontend-pages-production-build).
2. Set `CONTACT_ENABLED` to `"true"` in the Worker's production `vars` and
   deploy again as in step 8. On the Pages project's **Deployments** tab,
   retry the production deployment (or push a new production build) so it picks
   up the build variables. Keep the contact API disabled on Worker previews.
3. Open [the contact page](https://nihongotoolkit.pages.dev/contact), submit a
   message with an email address you control, and confirm the receipt and
   Discord notification have the same reference.
4. In the configured channel itself (not in a thread or DM), **select**
   `/reply` from Discord's command picker. Set `ticket` to that reference,
   fill in `message`, and submit. Pasting the command as chat or clicking
   Discord's native **Reply** will not send email.
5. Confirm Discord says **Reply recorded … email queued**, then check the
   support Gmail's **Sent** folder and the recipient's **Inbox** and **Spam**.
   `replied` means the reply was recorded; `sent` means Gmail accepted it,
   not that it reached the inbox.

## Configuration reference

### Frontend: Pages production build

Enter these as **plain text** in **Pages > Settings > Variables and secrets >
Production**. They're public in the compiled site. None belongs in the
Worker's `wrangler.jsonc`. Rebuild Pages when a value changes.

| Variable | Value / where to get it |
| --- | --- |
| `VITE_TURNSTILE_SITE_KEY` | **Site Key** from the Turnstile widget (step 7) |
| `VITE_API_BASE_URL` | `https://nihongo-toolkit.fragappstore.workers.dev` (origin only, no `/api/contact`) |
| `VITE_CONTACT_SUPPORT_EMAIL` | Optional. The support Gmail address from step 4, e.g. `nihongotoolkit.support@gmail.com`. The success dialog asks visitors to add it to their contacts so replies are less likely to go to spam; if unset, the dialog only tells them to check spam. |

### Backend: Worker runtime

For dashboard entries, use **Worker > Settings > Variables and secrets** on
the production Worker, **not** the Worker build settings or the Pages project.
Use **Text** for plain strings (IDs are not JSON numbers) and **Secret** for
credentials. Never put secret values in Git or a `VITE_*` variable.

| Name | Value / where to get it | Type | Where to set it |
| --- | --- | --- | --- |
| `CONTACT_ENABLED` | `"true"` for live contacts; `"false"` during setup and for previews | Text | `wrangler.jsonc` > `vars` (already declared) |
| `ALLOWED_ORIGINS` | `https://nihongotoolkit.pages.dev` (exact origin, no path or trailing slash) | Text | `wrangler.jsonc` > `vars` (already declared) |
| `PAGE_VIEWS_DB` | Existing D1 database `nihongo_toolkit_view` (step 1) | D1 binding, not text or secret | `wrangler.jsonc` > `d1_databases` (already declared) |
| `CONTACT_DISCORD_GUILD_ID` | Discord **server** ID (step 2); same ID used in GitHub | Text | `vars` or Worker dashboard |
| `CONTACT_DISCORD_CHANNEL_ID` | `website-contact` **channel** ID (step 2) | Text | `vars` or Worker dashboard |
| `CONTACT_DISCORD_ROLE_ID` | Human `Contact Support` **role** ID (step 2), not the bot role | Text | `vars` or Worker dashboard |
| `CONTACT_DISCORD_APPLICATION_ID` | **Application ID** in Developer Portal > General Information (step 3) | Text | `vars` or Worker dashboard |
| `CONTACT_DISCORD_PUBLIC_KEY` | **Public Key** from the same screen (step 3) | Text; secret storage also works | `vars` or Worker dashboard |
| `CONTACT_DISCORD_WEBHOOK_URL` | **Copy Webhook URL** in `website-contact` (step 2) | Secret | Worker dashboard only, or `npx wrangler secret put CONTACT_DISCORD_WEBHOOK_URL` |
| `CONTACT_EMAIL_FROM` | Exact bare `@gmail.com` address authorized in step 6 | Text | `vars` or Worker dashboard |
| `CONTACT_EMAIL_REPLY_TO` | Optional alternate monitored mailbox; leave unset to use From | Text | `vars` or Worker dashboard |
| `GMAIL_CLIENT_ID` | Personal OAuth client's **Client ID** (step 5) | Text is sufficient; Secret also works | `vars` or Worker dashboard |
| `GMAIL_CLIENT_SECRET` | Same Personal client's **Client secret** (step 5) | Secret | Worker dashboard or `wrangler secret put`; never `vars` |
| `GMAIL_REFRESH_TOKEN` | **Refresh token** from Playground (step 6) | Secret | Worker dashboard or `wrangler secret put`; never `vars` |
| `TURNSTILE_SECRET_KEY` | **Secret Key** from the same widget as the frontend Site Key (step 7) | Secret | Worker dashboard or `wrangler secret put`; never `vars` |

**Choose one source per name.** For plain text, `vars` means the top-level
`vars` in [wrangler.jsonc](wrangler.jsonc) for production. If you keep plain
text settings only in the dashboard, set top-level `"keep_vars": true` in
`wrangler.jsonc` so Wrangler preserves them on deploy. This isn't needed for
dashboard secrets. If you already store non-secret IDs as Worker secrets,
you can leave them there; don't duplicate them in `vars`.

The Worker already has a five-minute cron in `triggers.crons` for delivery
retries. Keep it in place. `NODE_VERSION=24` and
`ONNXRUNTIME_NODE_INSTALL_CUDA=skip`, if needed by either Cloudflare build, are
[general deployment settings](README.md#cloudflare-dependency-installation),
not contact runtime variables.

### GitHub Actions: command registration only

The existing workflow reads these from **GitHub repository Actions secrets**
when manually triggered. They are not Cloudflare build settings.

| Secret name | Value |
| --- | --- |
| `CONTACT_DISCORD_APPLICATION_ID` | Same Application ID as the Worker; not inherently secret, but the workflow reads it from `secrets` |
| `CONTACT_DISCORD_GUILD_ID` | Same **server ID** as the Worker; likewise stored here as an Actions secret |
| `DISCORD_BOT_TOKEN` | Bot token from step 3. Registration only; never needed by the Worker or Pages |

## Troubleshooting

| What you see | Check first |
| --- | --- |
| Submit returns **503: The contact form is currently unavailable.** | The Worker needs `CONTACT_ENABLED="true"`, the D1 binding, `TURNSTILE_SECRET_KEY`, the webhook URL, and the channel ID. The green Turnstile check in Pages doesn't prove the Worker has its secret. |
| Contact saved, no Discord notification | Check the Discord job in `contact_outbox`. The webhook must target the exact configured channel. |
| Discord notification arrived, but `/reply` is missing | Posting via webhook is separate. Check the workflow succeeded for the right server and the app is installed with `applications.commands`. Then check **Server Settings > Integrations > app > command permissions**. |
| `/reply` says you cannot reply from this account or channel | The private response names the failing setting. For `CONTACT_DISCORD_GUILD_ID`, copy **Server ID** from the server icon, not Channel ID, and fix it on the **Worker**. For a role mismatch, verify the human has the exact configured role. Don't reset the bot token or re-register for a Worker config correction. |
| Google authorization shows `redirect_uri_mismatch` or `client_user_mismatch` | Check the exact Playground redirect URI and use the Gmail account that created the Personal project. |
| Reply recorded, no email | Check the email job in `contact_outbox` and Gmail **Sent**. If the job says **outcome unknown**, check Sent using the contact reference before retrying; another `/reply` may send a duplicate. |
| Email arrives in Spam | Expected at first: a new `@gmail.com` sender has no reputation, and without a custom domain there are no SPF/DKIM/DMARC settings to tune (Google already signs `@gmail.com`). What helps: the recipient adds the support address to contacts (the success dialog asks for this when `VITE_CONTACT_SUPPORT_EMAIL` is set) or marks the reply **Not spam**; the recipient emails the support address first; leave `CONTACT_EMAIL_REPLY_TO` unset or equal to `CONTACT_EMAIL_FROM`; keep replies short and personal, without links, attachments, or salesy wording; send low, steady volume. Check **More > Show original** for SPF/DKIM/DMARC `PASS`. Inbox placement can't be guaranteed. |

Keep the support channel and D1 data private. Set a retention period for D1,
Discord, and Gmail copies. The form does not verify ownership of the supplied
email address, so don't include sensitive information based solely on a submission.

For local checks that don't contact real providers, run `npm run test:contact`.
If manually registering from a machine that can reach Discord's API, put the
same three registration values in gitignored `.dev.vars` and run
`node --use-system-ca --env-file=.dev.vars scripts/register-contact-command.mjs`
with Node.js 24. Never disable TLS verification.
