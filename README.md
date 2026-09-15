# ABDULLAH-X-HK MD Mini Style WhatsApp Bot

ABDULLAH-X-HK is a **simple plugin-first WhatsApp bot** built on Node.js, Express, and Baileys. The structure is intentionally kept close to the classic `--md-mini-` style: a small root, one `plugins/` folder for commands, one `lib/` folder for the core runtime, and `data/` for persistent files.

The main rule is simple:

```text
Add a command file inside plugins/  ->  restart/redeploy  ->  command auto-loads  ->  menu shows it automatically
```

You do **not** need to edit `index.js`, `main.js`, the dispatcher, the registry, or the menu for normal new commands.

---

## 1. Project Structure

```text
ABDULLAH-X-HK_MD_MINI_STYLE_SIMPLE/
├── data/                  # Persistent local data placeholder. Runtime data should be on /data in Railway.
├── lib/                   # Core bot engine, services, dashboard, WhatsApp socket, DB, dispatcher.
├── plugins/               # All bot commands. Add new command files here.
├── .media.json            # Editable media-command manifest.
├── LICENSE
├── README.md              # This architecture + deployment guide.
├── app.json               # Hosting metadata / app template values.
├── config.js              # Root config bridge to lib/config.js.
├── index.js               # Small entry point. Imports main.js only.
├── main.js                # Small entry point. Imports lib/index.js only.
├── package.json           # Node dependencies and scripts.
└── pair.html              # Public pairing page copy.
```

### What each folder does

| Path | Purpose |
|---|---|
| `plugins/` | Command files. This is where your friend adds commands. |
| `plugins/core/` | Original A-X-HK command packs migrated into plugin structure. Do not delete unless you know the command pack is not needed. |
| `plugins/_example.plugin.js` | Example template. Ignored because it starts with `_`. Copy it to create a real plugin. |
| `lib/core/` | Internal command registry, dispatcher, plugin loader, database, rate limit, logging. |
| `lib/services/` | WhatsApp connection, dashboard, media downloader, AI, voice, backups, reminders, admin, etc. |
| `lib/public/` | Dashboard and web assets served by Express. |
| `data/` | Placeholder only. In hosting, point real data to a persistent disk/volume. |

---

## 2. Startup Flow

```text
node index.js
  ↓
index.js imports main.js
  ↓
main.js imports lib/index.js
  ↓
lib/index.js loads plugins from plugins/
  ↓
plugins register commands into registry
  ↓
database + admin auth + dashboard start
  ↓
WhatsApp socket starts
  ↓
incoming WhatsApp messages go to dispatcher
  ↓
dispatcher finds command in registry and runs it
```

### Important files in the flow

| File | Role |
|---|---|
| `index.js` | Clean root entry point for hosting. |
| `main.js` | Keeps root simple and forwards to the real runtime. |
| `lib/index.js` | Boots plugin loader, database, dashboard, workers, and WhatsApp manager. |
| `lib/core/plugin-loader.js` | Recursively scans `plugins/` and imports `.js` / `.mjs` plugins. |
| `lib/core/registry.js` | Stores commands, aliases, categories, and menu groups. |
| `lib/core/dispatcher.js` | Parses WhatsApp messages, checks permissions/cooldowns, and runs commands. |
| `lib/services/whatsapp.js` | Handles Baileys socket, pairing, reconnect, sessions, and message events. |
| `lib/services/web.js` | Serves dashboard, link page, pair page, APIs, health route. |

---

## 3. Plugin Architecture

The bot supports three command styles:

1. A plugin file that exports **one command object**.
2. A plugin file that exports **an array of commands**.
3. Old core command packs that directly call the internal registry. These are kept under `plugins/core/` for compatibility.

### Plugin discovery rules

The plugin loader scans all nested folders under `plugins/`.

Loaded:

```text
plugins/hello.js
plugins/media/tiktok.js
plugins/group/tagall.js
plugins/tools/calculator.mjs
```

Ignored:

```text
plugins/_example.plugin.js
plugins/_disabled/anything.js
plugins/.hidden/file.js
plugins/test.disabled.js
```

### One-command plugin example

Create this file:

```text
plugins/hello.js
```

Add this code:

```js
export default {
  name: 'hello',
  aliases: ['hi', 'salam'],
  category: 'fun',
  description: 'Send a simple hello message',
  usage: 'hello',
  cooldown: 2,

  async run(ctx) {
    await ctx.reply('Hello 👋');
  }
};
```

After restart/redeploy:

```text
.hello
.hi
.salam
```

will work, and the command will appear under the `fun` category/menu.

### Multiple commands in one plugin file

Create this file:

```text
plugins/tools/basic.js
```

Add this code:

```js
export default [
  {
    name: 'ping',
    category: 'tools',
    description: 'Check bot response',
    async run(ctx) {
      await ctx.reply('Pong ✅');
    }
  },
  {
    name: 'time',
    category: 'tools',
    description: 'Show server time',
    async run(ctx) {
      await ctx.reply(new Date().toLocaleString());
    }
  }
];
```

### Command fields

| Field | Required | Meaning |
|---|---:|---|
| `name` | Yes | Main command name without prefix. Example: `hello` for `.hello`. |
| `run(ctx)` | Yes | Command handler function. |
| `aliases` | No | Extra names for the same command. |
| `category` | No | Menu category. Default is `general`. |
| `description` | No | Help/menu description. |
| `usage` | No | Usage hint shown by help systems. |
| `ownerOnly` | No | Only owner can run this command. |
| `groupOnly` | No | Command works only in groups. |
| `adminOnly` | No | Group admin only. |
| `botAdminRequired` | No | Bot must be admin. |
| `cooldown` | No | Cooldown in seconds. Default is `2`. |

### Useful `ctx` properties

Every command receives `ctx`.

Common usage:

```js
async run(ctx) {
  await ctx.reply('Message');
  console.log(ctx.args);       // array of words after command
  console.log(ctx.text);       // full text after command
  console.log(ctx.from);       // chat JID
  console.log(ctx.sender);     // sender JID
}
```

Use `ctx.reply()` for normal replies. Existing advanced core plugins use more internal helpers, but a new simple plugin usually only needs `ctx.reply()`, `ctx.args`, and `ctx.text`.

### Duplicate command protection

If two plugins use the same `name` or alias, startup will show a duplicate command error. Rename one command or alias.

---

## 4. Menu System

The menu is automatic because commands are stored by category in the registry.

```text
plugin category: 'media'  -> MEDIA menu
plugin category: 'tools'  -> TOOLS menu
plugin category: 'fun'    -> FUN menu
```

To add a command to a menu, set its `category` field. No manual menu edit is required.

---

## 5. Media Commands and `.media.json`

The file `.media.json` is an editable manifest for media-related command names and aliases.

Use it for things like:

- rename `.tiktok` to another command name
- add aliases like `.tt`, `.tiktokdl`
- enable or disable media commands
- keep media command setup separate from code

Important safety rule:

```text
.media.json does not enable bypass, private login access, DRM access, proxy bypass, or anti-bot bypass.
```

The media downloader is for public media only.

---

## 6. Local Development Setup

### Requirements

- Node.js `20.11.0` or newer
- npm
- A WhatsApp account for pairing

### Install

```bash
npm install
```

### Start

```bash
npm start
```

The default local dashboard runs on:

```text
http://localhost:3000
```

Health check:

```text
http://localhost:3000/health
```

### Development watch mode

```bash
npm run dev
```

### Basic syntax check

```bash
npm run check
```

For a full manual syntax sweep:

```bash
find . -name "*.js" -not -path "./node_modules/*" -print0 | xargs -0 -n1 node --check
```

---

## 7. Environment Variables

Create a `.env` file locally or set variables in Railway.

### Required / recommended

| Variable | Example | Purpose |
|---|---|---|
| `OWNER_NUMBER` | `923001234567` | Owner WhatsApp number without `+`. |
| `PREFIX` | `.` | Bot command prefix. |
| `MODE` | `public` | `public` or `private`. |
| `BOT_NAME` | `ABDULLAH-X-HK WHATSAPP BOT` | Full bot name. |
| `SHORT_NAME` | `A-X-HK` | Short brand name. |
| `OWNER_NAME` | `ABDULLAH-X-HK` | Owner display name. |
| `PUBLIC_URL` | `https://your-app.up.railway.app` | Public bot/dashboard URL. |
| `OWNER_SETUP_CODE` | `change-this-code` | First dashboard setup code. Use a strong secret. |

### Persistent storage variables

For Railway or any server with persistent disk:

| Variable | Railway value |
|---|---|
| `AXHK_HOME` | `/data` |
| `DATA_DIR` | `/data/data` |
| `SESSION_DIR` | `/data/session` |
| `MULTI_SESSION_DIR` | `/data/sessions` |

If these are not persistent, WhatsApp pairing can be lost after redeploy.

### Multi-session variables

| Variable | Example | Purpose |
|---|---|---|
| `MULTI_PAIR_ENABLED` | `true` | Enable public linked sessions. |
| `MAX_MULTI_SESSIONS` | `20` | Max linked sessions. |
| `MULTI_PAIR_ACCESS_CODE` | `optional-code` | Optional code required to create a public session. |
| `PUBLIC_SESSION_TTL_DAYS` | `0` | Public session expiry days. `0` means no expiry. |

### AI variables

| Variable | Example | Purpose |
|---|---|---|
| `AI_ENABLED` | `true` | Enables AI features. |
| `AI_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible API base. |
| `AI_API_KEY` | `sk-...` | API key. Keep secret. |
| `AI_MODEL` | `gpt-4o-mini` | Chat model. |
| `AI_FALLBACK_MODELS` | `gpt-4o-mini,gpt-4.1-mini` | Optional fallback list. |

### Voice variables

| Variable | Example | Purpose |
|---|---|---|
| `VOICE_PROVIDER` | `elevenlabs` | Voice provider name. |
| `VOICE_API_KEY` | `...` | Voice API key. |
| `VOICE_BASE_URL` | `https://api.elevenlabs.io/v1` | Voice API base. |
| `VOICE_DEFAULT_ID` | `JBFqnCBsd6RMkjVDRZzb` | Default voice ID. |
| `VOICE_MODEL` | `eleven_multilingual_v2` | Voice model. |

### Optional brand variables

| Variable | Purpose |
|---|---|
| `BRAND_TAGLINE` | Bot tagline. |
| `FOOTER_TEXT` | Plain footer text. |
| `FOOTER_DISPLAY_TEXT` | Display footer text. |
| `FOOTER_MESSAGE` | WhatsApp footer message. |
| `CREATOR_STUDIO_URL` | External creator studio URL. |
| `OWNER_CONTACT_URL` | Owner contact link. |

---

## 8. Railway Deployment Setup

Railway is the recommended hosting because this WhatsApp bot needs a long-running process and persistent storage.

### Step 1 — Push to GitHub

Create a GitHub repository and push this project.

```bash
git init
git add .
git commit -m "deploy: add A-X-HK MD mini bot"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### Step 2 — Create Railway service

In Railway:

1. Create a new project.
2. Add service from GitHub repo.
3. Select this bot repository.
4. Set Node.js build automatically.

### Step 3 — Add persistent volume

Add a Railway volume and mount it at:

```text
/data
```

Then set these variables:

```env
AXHK_HOME=/data
DATA_DIR=/data/data
SESSION_DIR=/data/session
MULTI_SESSION_DIR=/data/sessions
```

### Step 4 — Set Railway variables

Minimum recommended variables:

```env
OWNER_NUMBER=923001234567
PREFIX=.
MODE=public
MULTI_PAIR_ENABLED=true
MAX_MULTI_SESSIONS=20
AXHK_HOME=/data
DATA_DIR=/data/data
SESSION_DIR=/data/session
MULTI_SESSION_DIR=/data/sessions
OWNER_SETUP_CODE=use-a-strong-secret
PUBLIC_URL=https://your-railway-domain.up.railway.app
```

Optional AI:

```env
AI_ENABLED=true
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=your_api_key_here
AI_MODEL=gpt-4o-mini
```

Optional voice:

```env
VOICE_PROVIDER=elevenlabs
VOICE_API_KEY=your_voice_key_here
VOICE_BASE_URL=https://api.elevenlabs.io/v1
VOICE_DEFAULT_ID=your_voice_id
```

### Step 5 — Build and start commands

Railway normally detects Node automatically.

Recommended start command:

```bash
npm start
```

Health check path:

```text
/health
```

The app listens on `process.env.PORT`, so Railway can assign the port automatically.

### Step 6 — Generate public domain

Generate a Railway domain and set:

```env
PUBLIC_URL=https://your-generated-domain.up.railway.app
```

Redeploy after setting `PUBLIC_URL`.

### Step 7 — Pair WhatsApp

Open:

```text
https://your-generated-domain.up.railway.app/owner
```

or:

```text
https://your-generated-domain.up.railway.app/pair
```

Then pair the main WhatsApp session using QR or pairing code.

### Step 8 — Verify deployment

Check:

```text
https://your-generated-domain.up.railway.app/health
```

Expected response is JSON with `ok: true`.

Also test in WhatsApp:

```text
.menu
.ping
.owner
```

---

## 9. GitHub + Railway Update Workflow

After the first setup, updates are simple:

```bash
git add .
git commit -m "update: add new plugin command"
git push
```

Railway will redeploy if GitHub auto-deploy is enabled.

For plugin-only updates:

1. Add a new file inside `plugins/`.
2. Commit and push.
3. Railway redeploys.
4. Command appears in menu automatically.

---

## 10. Manual ZIP Deployment

If you do not want GitHub:

1. Extract this ZIP.
2. Upload files to your server/Railway-compatible deployment method.
3. Run `npm install`.
4. Set environment variables.
5. Start with `npm start`.

For Railway CLI:

```bash
railway login
railway link
railway up
```

Then add variables and volume from Railway dashboard.

---

## 11. Dashboard and API Routes

Public routes:

| Route | Purpose |
|---|---|
| `/` | Redirects to dashboard or link page. |
| `/link` | Public user link page. |
| `/health` | Health check. |
| `/ready` | Readiness check. |
| `/api/status` | Public safe status. |
| `/api/brand` | Public brand data. |
| `/api/commands` | Public command/category list. |

Owner/admin routes:

| Route | Purpose |
|---|---|
| `/owner` | Owner login/setup page. |
| `/dashboard` | Owner dashboard. |
| `/pair` | Main session pairing page. |
| `/sessions` | Multi-session dashboard. |
| `/deploy` | Deployment/update info page. |

---

## 12. Backup and Upgrade Rules

Before major upgrade:

1. Open dashboard.
2. Download safe backup from backup API/dashboard.
3. Confirm Railway volume is attached at `/data`.
4. Deploy updated code.
5. Check `/health`.
6. Confirm WhatsApp still connected.

Important:

```text
Never delete /data/session unless you want to re-pair main WhatsApp.
Never delete /data/sessions unless you want to remove linked public sessions.
```

---

## 13. Security Rules

Do not commit these to GitHub:

```text
.env
data/*.json
data/session/
data/sessions/
/data/session
/data/sessions
```

Keep these secret:

```text
OWNER_SETUP_CODE
DASHBOARD_TOKEN
AI_API_KEY
VOICE_API_KEY
```

Use a strong dashboard setup code. Do not share QR or pairing codes.

---

## 14. Troubleshooting

### Bot starts but WhatsApp is not connected

Open `/pair` and pair again. If logs show `401 loggedOut`, the session was logged out and must be re-paired.

### Command does not appear in menu

Check:

1. File is inside `plugins/`.
2. File extension is `.js` or `.mjs`.
3. File/folder does not start with `_` or `.`.
4. File is not named `.disabled.js`.
5. Command has `name` and `run(ctx)`.
6. Bot was restarted/redeployed.

### Duplicate command/alias error

Two plugins are using the same command name or alias. Rename one.

### Railway loses pairing after deploy

Persistent storage is missing or wrong. Set:

```env
AXHK_HOME=/data
DATA_DIR=/data/data
SESSION_DIR=/data/session
MULTI_SESSION_DIR=/data/sessions
```

and make sure Railway volume is mounted at `/data`.

### Disk full / ENOSPC

Clean old backups/download temp files and check Railway volume usage. Keep persistent volume healthy.

### Media download fails

This bot downloads public media only. Private, login-required, DRM, region-blocked, or anti-bot-protected URLs may fail. The bypass system is intentionally not included.

### Dashboard not opening

Check Railway logs and `/health`. Confirm Railway generated domain points to the correct service and that the service is listening on Railway's `PORT`.

---

## 15. Recommended Simple Command Workflow

For your friend/developer:

```text
1. Open plugins/
2. Create new file, e.g. plugins/my-command.js
3. Export command object
4. Restart/redeploy
5. Test in WhatsApp
6. Done
```

Example:

```js
export default {
  name: 'test',
  aliases: ['t'],
  category: 'tools',
  description: 'Test command',
  async run(ctx) {
    await ctx.reply('Test command working ✅');
  }
};
```

Test:

```text
.test
.t
.menu
```

---

## 16. Final Architecture Summary

```text
Simple root files
  ↓
lib/ = engine
  ↓
plugins/ = commands
  ↓
registry = command storage
  ↓
menu = auto categories
  ↓
dispatcher = command runner
  ↓
WhatsApp = message input/output
  ↓
Railway /data volume = persistent session and database
```

This keeps the bot powerful internally but simple for adding commands.
