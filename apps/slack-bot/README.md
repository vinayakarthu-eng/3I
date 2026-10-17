# DrillForce Slack IC Bot

Runs drills in Slack: `/drillforce start` opens a dedicated channel, briefs participants, and a
Claude-powered Incident Commander challenges the team while every message, reaction, and inject is
recorded as a `drill_event`.

## 1. Create the Slack app

Easiest: **api.slack.com/apps → Create New App → From an app manifest**, pick your workspace, and paste
[`slack-app-manifest.yaml`](./slack-app-manifest.yaml). It configures everything below.

Doing it by hand instead:

| Setting | Value |
| --- | --- |
| **Bot token scopes** | `commands`, `chat:write`, `channels:manage`, `channels:read`, `channels:history`, `channels:join`, `reactions:read`, `users:read`, `users:read.email` |
| **Event subscriptions** (bot events) | `message.channels`, `reaction_added`, `member_joined_channel` |
| **Slash command** | `/drillforce` — usage hint `start <drill-id> \| status \| inject <description> \| end` |
| **Socket Mode** | Enabled (no public URL needed for local dev) |
| **Request URLs** (production only, Socket Mode off) | Events, slash commands, and interactivity all point at `https://<your-host>/slack/events` |

## 2. Configure DrillForce

Each organization connects **its own** workspace: Settings → Integrations → **Add to Slack**. The
bot serves every connected workspace from one Socket Mode connection, and a workspace can only
see and run its own organization's drills.

In the Slack app (**api.slack.com/apps**):

1. **Manage Distribution** → activate public distribution (needed to install into more than one
   workspace).
2. **OAuth & Permissions → Redirect URLs** → add `https://<your-drillforce-host>/api/slack/oauth/callback`
   (Slack requires https — use a tunnel such as ngrok for local testing and set
   `NEXT_PUBLIC_APP_URL` to the tunnel URL).

Then set these in the **root** `.env` (see `.env.example`):

| Variable | Used by | Where to find it |
| --- | --- | --- |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | web (OAuth) | **Basic Information** → App Credentials |
| `SLACK_ENCRYPTION_KEY` | web + bot | Any random string of 32+ characters, e.g. `openssl rand -hex 32`. Encrypts stored bot tokens (AES-256-GCM) and signs the OAuth `state`. Keep it stable — changing it orphans connected workspaces. |
| `SLACK_APP_TOKEN` (`xapp-…`) | bot | **Basic Information** → App-Level Tokens → Generate, scope `connections:write` |
| `SLACK_SIGNING_SECRET` | bot | **Basic Information** → App Credentials (used when you leave Socket Mode) |
| `ANTHROPIC_API_KEY` | bot | console.anthropic.com. Optional: without it the IC uses scripted challenges. |

**Legacy single-workspace mode.** An existing `SLACK_BOT_TOKEN` keeps working: its workspace is
mapped to `SLACK_LEGACY_ORG_ID` (or the demo org). Once that workspace is connected via Add to
Slack, the env token is ignored and can be removed.

Disconnecting (Settings → Integrations, or `DELETE /api/v1/integrations/slack`) revokes the token at
Slack; the bot stops responding there and detaches any drill it was running.

## 3. Run

```bash
npm run dev          # from the repo root: web app + bot
# or just the bot
npm run dev -w @drillforce/slack-bot
```

## Commands

| Command | What it does |
| --- | --- |
| `/drillforce start <drill-id>` | Drill must belong to the workspace's organization and be *Scheduled* or *Briefing*. Creates `#drill-<name>-<date>`, invites participants (matched by email), posts the briefing, marks the drill *Active*, starts the IC. A unique ID prefix (6+ chars) works too. |
| `/drillforce status` | Elapsed time, status, objectives checklist (inside a drill channel, or pass an ID). |
| `/drillforce inject <description>` | Posts `⚠️ INJECT: …` as the bot and logs an `inject` event. |
| `/drillforce end` | Posts a summary, sets the drill to *Scoring* with `ended_at`. |

The IC replies when @mentioned, or to a question asked in a thread under one of its posts. When the
channel is quiet for 3–5 minutes (`IC_QUIET_MIN_SECONDS` / `IC_QUIET_MAX_SECONDS`) it posts the next
planned inject or a new challenge.

## Try it without Slack

```bash
npm run simulate -w @drillforce/slack-bot -- <drill-id>
```

Runs start → messages → IC reply → inject → quiet-channel nudge → status → end against the real
database with a fake Slack client, printing what the bot would post.
