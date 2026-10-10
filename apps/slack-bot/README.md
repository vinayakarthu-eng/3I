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

## 2. Collect the tokens

| Variable | Where to find it |
| --- | --- |
| `SLACK_BOT_TOKEN` (`xoxb-…`) | **OAuth & Permissions** → Install to Workspace → Bot User OAuth Token |
| `SLACK_APP_TOKEN` (`xapp-…`) | **Basic Information** → App-Level Tokens → Generate, scope `connections:write` |
| `SLACK_SIGNING_SECRET` | **Basic Information** → App Credentials (used when you leave Socket Mode) |
| `ANTHROPIC_API_KEY` | console.anthropic.com. Optional: without it the IC uses scripted challenges. |

Add them to the **root** `.env` (see `.env.example`).

## 3. Run

```bash
npm run dev          # from the repo root: web app + bot
# or just the bot
npm run dev -w @drillforce/slack-bot
```

## Commands

| Command | What it does |
| --- | --- |
| `/drillforce start <drill-id>` | Drill must be *Scheduled* or *Briefing*. Creates `#drill-<name>-<date>`, invites participants (matched by email), posts the briefing, marks the drill *Active*, starts the IC. A unique ID prefix (6+ chars) works too. |
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
