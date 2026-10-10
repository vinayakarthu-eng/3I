# DrillForce Build Log

Tracking the 10-phase UptimeLabs parity build. Decisions are documented here per the
"do not ask questions — make decisions and document them" directive in CLAUDE.md.

## Baseline (pre-Phase 1)

- Docker Postgres 16 + Redis already up and healthy.
- Node 20.20.2 via nvm (`~/.nvm/versions/node/v20.20.2/bin`).
- `npm run build` passes clean (exit 0) on `main` at commit `123ae02`.
- Existing routes: `/`, `/drills`, `/drills/new`, `/drills/[id]` (+ edit, aar), `/actions`,
  `/reports`, `/templates`, `/settings`.

### Global decisions

- Chart colors use `hsl(var(--chart-N))` / `hsl(var(--border))` for light/dark parity.
- All new reads go in `src/lib/queries.ts` (`server-only`); mutations are server actions
  returning `ActionResult<T>` and called via `useAction()`.
- New text enums use the `oneOf()` CHECK helper in the schema.
- Migrations generated with `npm run db:generate` and applied with `npm run db:migrate`.

---

## Phase 1 — Simulated Monitoring Dashboard ✅

- **Schema**: `drill_injects` table (migration `0003_tense_masked_marvel`) + `INJECT_TYPES`
  enum. `DrillScenario` extended with `scenarioType` + `severity`.
- **Engines** (`packages/shared`): `simulation-engine.ts` (deterministic metrics, service
  health, intensity ramp, 6 scenario profiles) and `log-generator.ts` (scenario-specific
  INFO/WARN/ERROR log lines). Re-exported from the shared barrel.
- **UI**: `/drills/[id]/simulate` renders a full-screen (`fixed inset-0`) war room:
  60% monitoring panel (service grid, 4 live recharts updating every 2s, terminal-styled
  log stream, SEV alert banner) + 40% Slack-style comms panel.
- **Server actions** (`simulate/actions.ts`): `postChatMessage` (persists as `message`
  drill_event) and `fireInject` (marks inject fired + logs `inject` event). Injects
  auto-fire client-side on their `trigger_at_minutes` and shift metrics/logs/banner.
- **Link**: "Enter Simulation" button on drill detail when status is `active`/`briefing`.
- **Seed**: 5–6 timed injects per seed drill.
- Decision: full-screen as an overlay (`fixed inset-0 z-50`) rather than refactoring the
  root sidebar layout — lower risk, reused by Phase 7's `/live`.
- `npm run build` passes.

## Phase 2 — Competency Framework ✅

- **Schema** (migration `0004_kind_sebastian_shaw`): `competency_areas` table
  (name/description/category/weight/sort_order) + nullable `competency_area_id` FK on both
  `drill_objectives` and `drill_scores` (`on delete set null`).
- **Shared**: canonical `COMPETENCY_AREAS` (6), `COMPETENCY_CATEGORIES`, plus `SKILL_LEVELS` /
  `skillLevel()` / `scoreBand()` helpers (used by Phase 3+).
- **Seed**: inserts the 6 competency areas and maps every seed objective (and its scores) to a
  competency. Used the 6 areas per CLAUDE.md adjustment #3.
- **Scoring engine**: auto-score and manual-score inserts now copy `competencyAreaId` from the
  objective so newly scored drills populate competencies.
- **Scores tab**: radar is now **by competency** (not criteria), plus a competency breakdown
  card (score, # objectives assessed, ↑/↓ trend vs. the org's previous drill via
  `getDrillCompetencyStats`).
- **Objectives tab**: competency selector in the add/edit dialog; competency shown on each card.
- `npm run build` passes.
