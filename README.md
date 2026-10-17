# DrillForce

Enterprise drill orchestration: plan incident drills, run them in Slack with a Claude-powered
Incident Commander, auto-score the response, and turn the results into an After-Action Report and
tracked improvement actions.

## Stack

| Workspace | What it is |
| --- | --- |
| `apps/web` | Next.js 14 (App Router), Tailwind, shadcn/ui, Recharts — the DrillForce UI |
| `apps/slack-bot` | Slack Bolt (socket mode) IC bot: `/drillforce start\|status\|inject\|end` — see its [README](apps/slack-bot/README.md) |
| `workers/scoring-engine` | Auto-scores drills in *Scoring* from their events; computes the composite |
| `workers/report-generator` | Generates After-Action Reports for drills in *Debriefing* (Claude, or a template without an API key) |
| `packages/core` | The domain layer — every read and write, org-scoped by `Ctx`. The web app, the `/api/v1` API and the Slack bot all go through it |
| `packages/sdk` | Typed client for `/api/v1` — see its [README](packages/sdk/README.md) |
| `packages/db` | Drizzle ORM schema, migrations, seed (PostgreSQL 16) |
| `packages/shared` | Shared types, labels, drill templates, workflow rules |

## Getting started

Requires Node 18+ and Docker Desktop.

```bash
npm install
cp .env.example .env      # add Slack / Anthropic keys when you have them
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev               # web on http://localhost:3000 + bot + workers
```

Without Slack tokens the bot exits with a warning and everything else keeps running. Without
`ANTHROPIC_API_KEY` the IC bot uses scripted challenges and AARs come from a template generator.

## Live demo mode

```bash
npm run demo                                         # database_failover, real time
npm run demo -- --scenario credential_stuffing --speed 2
npm run demo -- --no-drill                           # start everything, open drills yourself
```

One command runs the whole product for real: Postgres, the DrillForce web app (reused if it's
already on :3000), and the [War Room](war-room/SETUP.md) with its own API key, recording into
DrillForce. It opens a drill as a monitoring alert — in your real Slack workspace when
`war-room/.env` has Slack tokens (the on-call list in `SLACK_ONCALL` is invited and paged),
otherwise in the War Room's browser simulator. You play the responder; the agents react. When the
incident resolves the drill is scored in DrillForce, ready for the AAR. Ctrl+C ends the drill
properly and stops everything. Logs go to `.demo/`.

## API

Everything the UI does is available over HTTP at `/api/v1` with an API key (Settings → API keys):
`Authorization: Bearer df_live_…`. The OpenAPI document is served at `/api/v1/openapi.json`, and
`packages/sdk` wraps it in a typed client. Writes made through the API fire the same webhooks as
the UI. The [War Room](war-room/SETUP.md) can record its incidents as drills through it.

## Drill lifecycle

`draft → scheduled → briefing → active → scoring → debriefing → completed` (any non-final stage can be
cancelled).

1. **Plan** – create a drill with the wizard (`/drills/new`) or from a template.
2. **Run** – `/drillforce start <id>` in Slack opens a channel, briefs participants, and starts the IC bot.
   Every message, reaction, and inject is recorded.
3. **Score** – ending the drill moves it to *Scoring*; the scoring engine auto-scores time-to-action,
   completeness, and coordination objectives, evaluators score quality and accuracy in the Scores tab.
   When every objective is scored the composite is stored and the drill moves to *Debriefing*.
4. **Learn** – the report generator writes the AAR (`/drills/<id>/aar`) and creates improvement actions,
   tracked on `/actions` through `open → in progress → completed → verified` (or deferred with a reason).

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Postgres/Redis and every app/worker in dev mode |
| `npm run db:generate` | Generate a SQL migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset and load demo data (Acme Corp) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` / `npm run lint` / `npm test` | Checks across all workspaces |
| `npm run simulate -w @drillforce/slack-bot -- <drill-id>` | Run a drill end-to-end without Slack |

## Notes

- Authentication isn't wired up yet: the first seeded admin (`alex.admin@acme.test`) is the current user.
