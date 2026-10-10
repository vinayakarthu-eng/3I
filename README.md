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
