# A-X-HK Channel Link Hub

This feature is opt-in. It does not start posting until CHANNEL_HUB_ENABLED=true and an admin-owned WhatsApp Channel identifier is configured. WhatsApp Cloud API does not offer a standard Channel publishing endpoint. This worker uses unofficial Baileys; WhatsApp updates or enforcement can stop it.

## Architecture
- channel-hub/public/: responsive website and owner admin.html page
- channel-hub/api/index.js: Vercel HTTP API and private worker endpoints
- channel-hub/db/schema.sql: database tables, RLS, atomic cooldown and queue claim procedures
- lib/services/channel-hub-worker.js: outbound polling worker inside the existing bot
- lib/index.js: optional worker startup and graceful shutdown

## Setup steps
1. Create a NEW dedicated Supabase project. Do not overwrite the old WhatsApp Pro database. Apply channel-hub/db/schema.sql to the new database.
2. Create a Vercel project from ab2590357-cpu/AK_MEYO and set Root Directory to channel-hub. Deploy the feature/channel-link-hub branch as a preview.
3. In Vercel configure SUPABASE_URL, EDGE_PROXY_TOKEN, HASH_SALT (32+ random characters), WORKER_TOKEN (32+ random characters), ADMIN_TOKEN (32+ random characters), CHANNEL_HUB_ENABLED=false to start. The Supabase service/secret key remains inside the Supabase Edge Function and must NEVER be copied into the Vercel public client.
4. Install Node.js and Git in Termux. Test native dependencies before deploying the whole old bot. Preserve old sessions and settings in a persistent private directory and never commit them.
5. Configure the Termux worker with CHANNEL_HUB_API_URL=https://your-vercel-domain.vercel.app/api/index, CHANNEL_HUB_WORKER_TOKEN matching Vercel WORKER_TOKEN, CHANNEL_HUB_INVITE_CODE=0029VbA4HK9LNSaApTeufD1F (or CHANNEL_HUB_CHANNEL_JID as numeric owned Channel JID ending in @newsletter), and CHANNEL_HUB_ENABLED=false initially. The bot resolves a channel invite into its JID using newsletterMetadata after WhatsApp connects.
6. Test posting to a private test Channel using a dedicated WhatsApp account, verify actual result and the owner account admin role. Only then enable CHANNEL_HUB_ENABLED=true in Termux and on Vercel.
7. Keep Railway offline while running the same WhatsApp identity from Termux: two competing sessions may cause issues.
8. Android may suspend Termux even if mobile data is enabled. Adjust battery optimization and foreground settings, and allow queue to retain pending submissions.

## Routes
- / public portal
- /admin.html owner moderation (Bearer ADMIN_TOKEN; token held only in memory)
- /api/index?mode=submit
- /api/index?mode=status
- /api/index?mode=worker
- /api/index?mode=admin
- /api/index?mode=health

## Limits
Current cooldown uses a signed browser visitor cookie for 24 hours, and IP network flood controls. This is NOT strong per-human verification; bypass via another browser or device is possible. For strict one-human-one-post use OTP verification. The queue never automatically retries an uncertain send result; such cases enter needs_review to prevent duplicates.

## Tests
node --test tests/channel-hub-worker.test.mjs
node --test tests/channel-hub-api.test.mjs
npm run check
node --check channel-hub/api/index.js
node --check lib/services/channel-hub-worker.js
node --check channel-hub/public/app.js

Database migration was applied in Supabase project wwehfusaimzrkztdfccz; Vercel integration is configured in preview. Full Termux native dependency support, bot pairing and actual WhatsApp Channel post still require device-side validation.

## Current ownership, links and deployment

- Brand: A-X-HK / ABDULLAH-X-HACKER, founder Abdullah.
- Owner support: WhatsApp contact button on the website is configured with the owner-provided number. Avoid adding any passwords or session secrets to public source.
- Destination Channel: https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F
- Supabase project: wwehfusaimzrkztdfccz (dedicated; ap-south-1). Tables: axhk_channel_submissions and axhk_channel_config, RLS enabled.
- Authenticated Edge gateway: channel-hub/supabase/functions/axhk-channel-gateway/index.ts
- Vercel project: axhk-channel-link-hub (root directory channel-hub); the preview branch is feature/channel-link-hub.
- Public submission remains OFF until paired WhatsApp worker is verified.

## Termux operator checklist

1. Install Termux from F-Droid rather than old Play Store packages. Install Node.js LTS and Git from Termux packages.
2. Clone the GitHub development branch using the normal HTTPS Git repository URL. Do not clone into Android shared storage because Termux can have executable permission issues there.
3. On the phone run npm install in the repository root and inspect any native dependency failures. The original bot has sharp/canvas/ffmpeg native dependencies that might not support Android. Test before linking your account.
4. Store a local .env in Termux private storage (this file is .gitignored). Put secrets there privately using a local editor. Never paste pairing codes, WhatsApp credentials, or API tokens into chats or commits.
5. Start with CHANNEL_HUB_ENABLED=false. Pair from /owner on the local web dashboard or /pair when signed in (see original README). Do not reset an existing session without an independent backup.
6. Use a dedicated test WhatsApp account and owned test Channel for the first post, because Baileys is unofficial. After test, confirm target Channel JID, then enable the polling worker. Keep the old Railway service off.
7. Keep Termux in foreground / use its wakelock if your Android version permits; set battery usage to unrestricted for Termux. Screen-off and data-on do not ensure 24/7 execution.

## Operations safety

- A successful API health check reports configured=true, databaseConnected=true, submissionsOpen=false while closed; this is EXPECTED during staging.
- Stored 24-hour cooldown is per signed browser visitor, supplemented with network flood limits; it is not independently verified WhatsApp identity.
- Do not automatically resend a message after a transient send/acknowledgment failure; review the Channel to avoid duplicate posts.
- The Edge gateway verifies a hashed proxy token stored in a service-only configuration table. The Vercel app must never disclose EDGE_PROXY_TOKEN, HASH_SALT, WORKER_TOKEN or ADMIN_TOKEN.

## Owner-provided ABDULLAH X MD menu image and real Channel forwarding

- On Termux the menu uploader accepts JPEG directly without native sharp. In the protected local dashboard at http://127.0.0.1:3000/dashboard choose Menu Image, choose the supplied JPEG and upload. It persists outside Git in ~/.axhk-whatsapp-bot/data/menu-card-custom.jpg.
- Commands .menu, .help, .categories, .menu <category>, .alive use the JPEG; .menu all and .fullmenu send the JPEG on the first page and then all other catalog pages. The Channel link is included with the menu.
- To enable GENUINE Channel forwarding, the authorized main owner explicitly sends .channelmenu publish. This posts ONE original announcement to their own Channel and saves the actual WhatsApp-returned message locally.
- Later .menu requests attempt to forward THAT ACTUAL CHANNEL POST and then send dynamic command text. No forged newsletter forwarding metadata is generated. WhatsApp itself decides whether to show native View Channel attribution; the bot cannot promise that element.
- .channelmenu status checks the source; .channelmenu disable turns forwarding off without deleting the Channel post. Publish operations have a one-hour cooldown.
- Ordinary menu requests never publish to the Channel. Channel Link Hub public submission queue stays off until actual admin-owned Channel posting is verified.
- Verify: AXHK_TERMUX_MODE=1 node --test tests/channel-menu.test.mjs and AXHK_TERMUX_MODE=1 node scripts/termux-smoke.mjs.
- Preserve saved WhatsApp credentials; never delete the session folder or run Unlink & Reset.


## Activation after verified Channel posting — November 2026

The public website is configured for live mode, but MUST stay unavailable until an authenticated
Termux worker provides a fresh heartbeat and verifies the owner successfully published a
real Channel menu message (the source of genuine forwarded menu replies). There is no
fake View Channel label and the bot must never post random test messages without the
owner's approval.

1. In the owner's Termux shell, pull the feature branch and run the Channel Hub tests.
2. Open the **Vercel** project axhk-channel-link-hub / Settings / Environment Variables.
   Find WORKER_TOKEN. Copy the existing value securely inside your own phone; never
   paste it into public chats, screenshots, GitHub, WhatsApp, or support tickets.
3. Stop the Termux bot with Ctrl+C, run: `node scripts/channel-hub-setup.mjs`.
   This prompts privately for the existing WORKER_TOKEN; paste once and press Enter.
   The script writes local .env using mode 0600 and preserves other variables. It
   configures the correct deployed HTTPS API URL, original Channel invite code, and
   enables outbound polling. It does **not** start an unverified public submission.
4. Restart the bot:
   `AXHK_TERMUX_MODE=1 BOT_PREFIX=. MULTI_PAIR_ENABLED=false npm start`
   and verify WhatsApp remains connected; do not unlink or re-pair unnecessarily.
5. From the authorized owner's WhatsApp private chat, run `.channelmenu status`, then
   `.channelmenu publish` **once**. The second command publishes a real menu image
   to the owner-controlled Channel. Open the actual Channel to confirm that post exists.
6. From the same owner's WhatsApp, run `.menu`, `.channel`, `.submitlink` and `.links`.
   Confirm direct Channel URL and A-X-HK Link Hub URL are correct. The native
   View Channel attribution is determined by WhatsApp and must be tested.
7. Check the public webpage and `/api/index?mode=health`:
   `workerReady:true` and `submissionsOpen:true` mean the verified Termux worker is
   online and public submissions can open. If Termux sleeps, crashes or loses WhatsApp,
   submissions close after the 40-second heartbeat deadline, rather than silently queueing.
8. Submit ONE real WhatsApp invitation through the form. The worker polls about every
   8 seconds when connected. Verify the Channel contains the posted invitation AND
   the website receipt moves from Pending to Published. Unofficial Baileys Channel
   support is not guaranteed by Meta and can break.
9. Keep the phone's battery background use unrestricted for Termux; a data connection
   alone does not guarantee its Node process will stay alive.

If posting fails, leave auto-submissions closed, check the owner panel for the failed
receipt, and inspect the terminal logs (redact secrets). Avoid repeated retries after
an uncertain WhatsApp acknowledgement to prevent duplicate Channel posts.


## Production activation — verified worker gating (November 2026)

Production public URL: https://axhk-channel-link-hub.vercel.app/
Official destination: https://whatsapp.com/channel/0029VbA4HK9LNSaApTeufD1F

The Vercel project has CHANNEL_HUB_ENABLED=true, but **submissions remain disabled unless the private authenticated owner worker is online and has verified a real owner-published post to this Channel**. The public health endpoint at /api/index?mode=health reports workerReady, databaseConnected, and submissionsOpen. Do not claim live operation until workerReady=true AND a real submission appears on the target Channel.

One-time Android setup:
1. Stop the running Termux bot gracefully with Ctrl+C. Do NOT Unlink/Reset the WhatsApp session.
2. `cd ~/AK_MEYO && git pull --ff-only`
3. `node scripts/channel-hub-setup.mjs`. In the private prompt paste WORKER_TOKEN from the A-X-HK Vercel project's protected Settings -> Environment Variables. The script checks the token remotely before writing only a 0600 .env file. Never paste worker/admin tokens in chats or commit them.
4. Restart: `AXHK_TERMUX_MODE=1 BOT_PREFIX=. MULTI_PAIR_ENABLED=false npm start`
5. In the already linked owner WhatsApp chat, send `.channelmenu status`. Confirm your custom menu image exists. Then send `.channelmenu publish` once (this is a real post to your actual Channel; check the Channel before retrying). If successful it serves as the owner verification source.
6. Type `.linkhubstatus` to see whether Cloud DB CONNECTED, Channel verified online YES, and Public submissions open YES. The website should enable its submission button automatically within a few heartbeat intervals.
7. From another browser/device, submit a benign, valid owned WhatsApp Group invite link. Confirm that the website transitions Pending to Published and that the actual post appears in the owned Channel. If a send is ambiguous, check Channel and admin queue before retrying; never blindly resend.
8. Termux needs continued foreground/background execution permission. Android can kill it despite mobile data staying connected. When the 40-second heartbeat expires the site disables new submissions automatically, rather than accepting links into an offline queue.

Bot menu commands:
- `.menu`, `.menu all`, `.categories`: attached branding and official Channel link, with genuine forwarded Channel source only after verified publishing (native View Channel UI is controlled by WhatsApp).
- `.channel`: official Channel join link.
- `.submitlink`: public Group/Channel invite submission website.
- `.links`: live web and Channel URLs, never retired Railway domains.
- `.channelmenu status|publish|disable`: owner-only source announcement lifecycle.
- `.linkhubstatus`: owner-only heartbeat and submission readiness check.

Posting is powered by unofficial Baileys Newsletter functionality, not a supported Meta Cloud API Channels publisher. A WhatsApp update could break it or restrict the linked account.
