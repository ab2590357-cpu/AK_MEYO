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
