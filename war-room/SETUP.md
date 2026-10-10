# DrillForce War Room — Setup

The War Room runs a team of six autonomous ICS agents (Incident Commander, Deputy,
SME, Comms, Liaison, Scribe) through an incident-response drill. It runs in two modes:

- **Simulator mode** (no Slack tokens) — everything happens in the browser dashboard at
  `http://localhost:3000`. You can drive the team by typing in the dashboard chat.
- **Live Slack mode** (three tokens present) — the bot creates a real incident channel in
  your workspace, posts as the agents, and reacts autonomously to **real human messages**.

The dashboard mirrors the Slack channel in both modes.

## Run it (simulator mode — no Slack needed)

```bash
cp .env.example .env     # leave the Slack tokens blank
npm install
npm start                # → http://localhost:3000
```

Open the dashboard, pick a scenario, and press **Start Drill**.

## Connect a real Slack workspace (live mode)

You must create the Slack app yourself — no tool can mint these tokens for you.

1. **Create the app.** Go to <https://api.slack.com/apps> → **Create New App** → **From scratch**.
   Name it "DrillForce War Room" and pick your workspace.
2. **Enable Socket Mode.** Left nav → **Socket Mode** → toggle **Enable Socket Mode** on.
   When prompted, generate an **App-Level Token** with the `connections:write` scope — copy it
   (starts with `xapp-`). This is `SLACK_APP_TOKEN`.
3. **Bot token scopes.** Left nav → **OAuth & Permissions** → **Scopes → Bot Token Scopes**, add:
   - `channels:manage` — create the incident channel + set its topic
   - `channels:history` — read messages in the channel
   - `channels:read` — look up channels
   - `chat:write` — post as the agents
   - `commands` — slash commands
   - `reactions:write` — add reactions
   - `users:read` — resolve display names
4. **Event subscriptions.** Left nav → **Event Subscriptions** → toggle on →
   **Subscribe to bot events** → add `message.channels`. Save.
5. **Slash commands.** Left nav → **Slash Commands** → **Create New Command** (×3). With Socket
   Mode the Request URL can be any placeholder (e.g. `https://example.com/slack`):
   - `/drill` — "Start a drill: /drill [scenario] [speed]"
   - `/sitrep` — "Post a situation report"
   - `/drill-stop` — "End the active drill"
6. **Install.** Left nav → **Install App** → **Install to Workspace** → authorize.
   Copy the **Bot User OAuth Token** (starts with `xoxb-`) → `SLACK_BOT_TOKEN`.
7. **Signing secret.** Left nav → **Basic Information → App Credentials** → copy the
   **Signing Secret** → `SLACK_SIGNING_SECRET`.
8. **Fill `.env`** with the three tokens and `npm start`. The banner will show **LIVE SLACK MODE**.

Then in any public channel run `/drill database_failover 2` — the bot creates
`#inc-<id>-...`, invites you, and the agents start working. Type in the channel and they react:

| You type | The team does |
|---|---|
| `I'll take ops` | IC assigns you the ops role |
| `root cause found: ...` | IC moves the incident to **mitigating** |
| `I propose we fail over to the replica` | IC collects the proposal and asks for go/no-go |
| `fix deployed` | IC opens a **monitoring** window |
| `all clear` | IC marks it **resolved**; Scribe posts the after-action |
| `sitrep` / `/sitrep` | IC posts a full situation report |

## Commands

- `/drill [scenario] [speed]` — scenarios: `database_failover`, `credential_stuffing`,
  `canary_leak`; speed `1`/`2`/`4`.
- `/sitrep` — situation report.
- `/drill-stop` — end the drill and post the after-action.
