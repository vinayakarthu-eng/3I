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

## Alert-triggered incidents (channel + responders)

Point a monitoring tool (Datadog, Grafana, PagerDuty, a cron check…) at the alert webhook.
When it fires, the bot **creates the incident channel, pages the responders, and starts the
response** — no slash command needed.

```bash
curl -X POST http://localhost:3000/api/alert \
  -H 'content-type: application/json' \
  -d '{"title":"Primary DB unreachable","service":"database-primary","severity":"SEV1","responders":["U0123ABC"]}'
```

- `service`/`title` pick the closest scenario (db → failover, auth/login → credential stuffing,
  canary/deploy → canary leak).
- `responders` (Slack user IDs) are invited and @-mentioned, along with everyone in `SLACK_ONCALL`.
- In live Slack mode this creates a real `#inc-…` channel; in simulator mode it opens the incident
  in the dashboard.

## Commands

- `/drill [scenario] [speed]` — scenarios: `database_failover`, `credential_stuffing`,
  `canary_leak`; speed `1`/`2`/`4`.
- `/sitrep` — situation report.
- `/drill-stop` — end the drill and post the after-action.

## Record drills in DrillForce (optional)

Set `DRILLFORCE_API_URL` (where the DrillForce web app runs, e.g. `http://localhost:3000`) and
`DRILLFORCE_API_KEY` (Settings → API keys) in `.env`, and give the War Room its own `PORT` (e.g.
`3100`) if both run locally. Each incident then becomes a DrillForce drill:

- incident start → drill created from the matching scenario template and moved to **Active**
- every agent, human and inject message → a timeline event (agents as `agent:<role>`, Slack
  users as `slack:<id>`, injects as signals)
- incident close → drill moved to **Scoring**: auto-scored, `drill.ended` / `drill.scored`
  webhooks fire, and the AAR can be generated

The adapter only uses the public API and is fail-soft: if DrillForce is down the drill carries on.

## The incident team (roles, skills and cadence)

Each agent follows a written skill (`src/skills/index.js`) grounded in ICS and the PagerDuty
incident-response guide:

| Role | What it does in the channel |
|---|---|
| 🎖️ **Incident Commander** | Reacts 👀 instantly and replies **in the thread of every human message**, by name, with one question that moves the incident forward (who owns it, what you see, impact, next step, report-back time). Assigns owners with time boxes, runs decisions (“Are there any strong objections?” → Deputy risk check → explicit GO / no-go), moves the phase, and posts a status update **every 5 minutes** (state · done · in progress · pending/unowned · next update). |
| 🛡️ **Deputy** | Logs every action with owner and due time, **chases overdue actions** by name (twice, 5 min apart, then escalates to the IC), risk-checks proposals, reports blast radius. |
| 📢 **Comms** | Owned separately from the IC — a human can claim it (“I'll take comms”). **At T+10 asks: external comms (status page / customers) or internal only?**, recommends one from customer impact, drafts updates on every phase change and an exec line when leadership asks. |
| 🔗 **Liaison** | **At T+5** asks whether support, vendors/dependency teams or leadership need to be engaged, and owns those conversations (e.g. payments vendor + Finance). |
| 📝 **Scribe** | Posts the **milestone digest every 10 minutes** (phase changes, decisions, owners, open actions, pending), nudges the channel when it goes quiet, writes the after-action. |
| 🔬 **SME** | Offers theories with confidence as signals land; confirms or questions findings. |

Times are drill time (scaled by `DRILL_SPEED`). With `ANTHROPIC_API_KEY` set, the same roles write
their messages with Claude (the skill is the system prompt; the incident state and transcript are the
context); if a call fails the playbook text is used, so the drill never stalls.
