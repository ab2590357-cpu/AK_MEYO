# A-X-HK Channel Link Hub

This feature is opt-in. It does not start posting until CHANNEL_HUB_ENABLED=true and an admin-owned WhatsApp Channel JID is configured. WhatsApp Cloud API does not offer a standard Channel publishing endpoint. This worker uses unofficial Baileys; WhatsApp updates or enforcement can stop it.

## Architecture
- channel-hub/public/: responsive website and owner admin.html page
- channel-hub/api/index.js: Vercel HTTP API and private worker endpoints
- channel-hub/db/schema.sql: database tables, RLS, atomic cooldown and queue claim procedures
- lib/services/channel-hub-worker.js: outbound polling worker inside the existing bot
- lib/index.js: optional worker startup and graceful shutdown

## Setup steps
1. Create a NEW dedicated Supabase project. Do not overwrite the old WhatsApp Pro database. Apply channel-hub/db/schema.sql to the new database.
2. Create a Vercel project from ab2590357-cpu/AK_MEYO and set Root Directory to channel-hub. Deploy the feature/channel-link-hub branch as a preview.
3. In Vercel set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, HASH_SALT (32+ random characters), WORKER_TOKEN (32+ random characters), ADMIN_TOKEN (32+ random characters), CHANNEL_HUB_ENABLED=false to start. Never make the service key public.
4. Install Node.js and Git in Termux. Test native dependencies before deploying the whole old bot. Preserve old sessions and settings in a persistent private directory and never commit them.
5. Configure the Termux worker with CHANNEL_HUB_API_URL=https://your-vercel-domain.vercel.app/api/index, CHANNEL_HUB_WORKER_TOKEN matching Vercel WORKER_TOKEN, CHANNEL_HUB_CHANNEL_JID as numeric admin-owned Channel JID ending in @newsletter, and CHANNEL_HUB_ENABLED=false initially.
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

Full Termux native dependency support, Supabase migration, bot account pairing and WhatsApp Channel successful posting still require live validation.
