# A-X-HK Private Cloud Bot Panel

Separate Vercel project: axhk-bot-panel. Owner pages are protected by Vercel SSO and by a second cloud password.
The bot remains on the Termux phone, and the website never stores a WhatsApp auth session.

## One-time Termux bridge setup

On Vercel, locate the AXHK_BRIDGE_SECRET environment variable and the project-specific
Deployment Protection automation bypass secret. Do not paste either key in chat.
Log into the cloud owner page and create a new password (14+ characters).
Keep the original Termux bot running on local port 3000. In a second Termux session:

    cd ~/AK_MEYO
    git fetch origin
    git switch feature/vercel-bot-panel
    git pull --ff-only origin feature/vercel-bot-panel
    read -rsp 'AXHK bridge secret: ' AXHK_BRIDGE_SECRET; echo
    export AXHK_BRIDGE_SECRET
    read -rsp 'Vercel bypass secret: ' AXHK_VERCEL_BYPASS; echo
    export AXHK_VERCEL_BYPASS
    read -rsp 'Local owner password: ' AXHK_LOCAL_OWNER_PASSWORD; echo
    export AXHK_LOCAL_OWNER_PASSWORD
    export AXHK_PANEL_URL=https://axhk-bot-panel.vercel.app
    node bot-panel/termux-agent.mjs

Alternative to the local password: an already-configured DASHBOARD_TOKEN in the private Termux shell.
Never expose port 3000, upload WhatsApp session files, or commit credentials.

## Architecture and restrictions

- Private Vercel Blob contains short-lived command requests/results; the phone polls outbound.
- Cloud controls use a signed owner cookie and require Vercel account authentication.
- Admin login passwords remain hashed in a private blob.
- Owner pairing codes appear only in the protected dashboard.
- SSO protects /link too, so this is NOT yet a public multi-user pairing website.
- Files larger than 2.8 MB are intentionally limited by serverless proxy request sizes.
- Bot offline means pairing and live commands are unavailable, even though the web page loads.
- Cloud logout/reset and destructive session delete are intentionally restricted.
- Real end-to-end verification requires the Termux bridge to connect from the owner's phone.
- Do not retry a timed-out write without checking locally; a previous action might have executed.

## Project environments

BLOB_READ_WRITE_TOKEN (private attached Blob store), AXHK_PANEL_SESSION_SECRET,
AXHK_BRIDGE_SECRET. Node 22, project root bot-panel, Vercel SSO all environments.
