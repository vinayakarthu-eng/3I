# DrillForce

Enterprise drill orchestration platform — plan, run, score, and learn from incident drills.

## Stack

- **Turborepo** monorepo (npm workspaces)
- **apps/web** — Next.js 14 (App Router), Tailwind CSS, shadcn/ui, next-themes
- **packages/db** — Drizzle ORM + PostgreSQL 16 schema, migrations, seed
- **packages/shared** — shared TypeScript types and constants

## Getting started

Requires Node 18+ and Docker Desktop.

```bash
npm install
cp .env.example .env
docker compose up -d
npm run db:migrate
npm run db:seed
npm run dev
```

Open http://localhost:3000.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start Postgres/Redis (docker compose) and all apps in dev mode |
| `npm run db:generate` | Generate a SQL migration from schema changes |
| `npm run db:migrate` | Apply migrations |
| `npm run db:seed` | Reset and load demo data (Acme Corp) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run typecheck` | Type-check all packages |

## Notes

- Authentication is not wired up yet: the first seeded admin (`alex.admin@acme.test`) is treated as the current user.
