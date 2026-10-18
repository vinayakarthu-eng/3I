# DrillForce

Enterprise drill orchestration: plan incident drills, run them in Slack with a Claude-powered
Incident Commander, auto-score the response, and turn the results into an After-Action Report and
tracked improvement actions.

## Stack

| Workspace | What it is |
| --- | --- |
| `apps/web` | Next.js 14 (App Router), Tailwind, shadcn/ui, Recharts — the DrillForce UI |
| `apps/slack-bot` | Slack Bolt (socket mode) IC bot: `/drillforce start\|status\|inject\|end` — see its [README](apps/slack-bot/README.md) |
| `workers/injection-engine` | Turns each executing drill's injection matrix into real OpenTelemetry traces, metrics, logs and Datadog events |
| `workers/scoring-agent` | Scores drills after the post-drill window: auto objectives + judgement objectives (Claude or heuristic) |
| `workers/scoring-engine` | The scoring library (time-to-action, completeness, coordination, quality, accuracy, composite) |
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
npm run demo                         # Database Monitoring drill
npm run demo -- --template app       # Application Monitoring drill
npm run demo -- --scoring-delay 2    # score 2 min after concluding (default 15)
```

One command runs the whole lifecycle for real: Postgres, the web app, the **injection engine**, the
**scoring agent** and the [War Room](war-room/SETUP.md) (your real Slack workspace when
`war-room/.env` has tokens, otherwise its browser simulator). It creates a monitoring drill that's
already in **Preparation**; open it, review what will be injected and click **Execute**. Ctrl+C
concludes a running drill and stops everything. Logs go to `.demo/`.

## The drill lifecycle

**Planning → Preparation → Execution → Concluded → Scored → Completed**, shown as a stepper on every
drill with one clear next step per stage.

1. **Planning** — objectives plus the **injection matrix** (Injection tab): per stream the signal
   (HTTP errors, latency, error logs, DB query failures, pool exhaustion, slow queries, replica lag,
   monitor alerts), target service, volume/min, failures/min, duration, start offset and pattern.
   The Application Monitoring and Database Monitoring templates come with a matrix. *Schedule drill.*
2. **Preparation** — “We are going to inject…”: every stream in plain English, expected telemetry,
   destination and Slack. *Review & execute.*
3. **Execution** — the injection engine generates real OpenTelemetry **traces, metrics, logs** and
   Datadog **events** (to Datadog with `DD_API_KEY` + `docker compose --profile datadog up -d`,
   otherwise a dry run that counts the same telemetry); the War Room opens the Slack incident channel,
   invites on-call and its IC / Deputy / Comms / Liaison / Scribe team runs the incident. The page shows
   the live banner, the Slack channel and per-stream progress. *Conclude drill.*
4. **Concluded** — injection stops; Slack is told “This was a drill. The drill has now concluded.”
5. **Scored** — `SCORING_DELAY_MINUTES` (default 15) later the scoring agent scores it: measurable
   objectives automatically, judgement objectives from what responders said (Claude with
   `ANTHROPIC_API_KEY`, else a heuristic), with its reasoning. *Open AAR → Complete.*

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
