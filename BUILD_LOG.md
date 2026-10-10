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

## Phase 3 — Team Readiness Dashboard ✅

- **Queries** (`src/lib/readiness.ts`): per-member competency averages, org overview
  (drills run / avg score / active members / competency coverage %), team competency trend,
  and a full per-user profile. A member's competency score = avg of their participated drills'
  competency scores.
- **`/readiness`**: period selector (7d/30d/90d/all via `?period=`), summary cards, a
  color-banded heatmap (members × 6 competencies, cells link to the profile) with skill-level
  badges, and a team competency trend chart (one line per competency).
- **`/readiness/[userId]`**: personal radar, strengths/gaps (top/bottom 2), per-competency
  skill badges, drill-history table, and a personal competency trend chart.
- **Shared components**: `SkillBadge`, `CompetencyRadar`, `CompetencyLineChart`, `PeriodTabs`
  (reused by Phase 5/8).
- Added **Readiness** to the sidebar.
- Decision: period filter is a SQL fragment comparing against an ISO string — the `postgres`
  driver can't bind a JS `Date` against a `coalesce()` expression.
- `npm run build` passes; `/readiness`, `?period=*`, and `/readiness/[userId]` return 200.

## Phase 4 — Scenario Library + Quick Drills ✅

- **Schema** (migration `0005_hesitant_whirlwind`): `drill_templates` table keyed by a stable
  slug id, with sector/type/difficulty/duration/based_on/is_quick_drill plus jsonb
  scenario/objectives/competency_areas_tested.
- **Library** (`packages/shared/src/templates.ts`): expanded `DRILL_TEMPLATES` to **21** — 15
  rich scenarios (8 tech, 4 healthcare, 3 public sector) + **6 single-competency quick drills**,
  each with injects, 2–3 objectives, competencies tested, difficulty, and a real-incident
  "based_on". Per CLAUDE.md adjustment #2 the templates are seeded into the table (shared TS
  stays the source of truth).
- **`/scenarios`**: card grid with sector/type/difficulty badges, duration, competency dots,
  filters (sector/type/difficulty/competency/duration) + search, a Quick Drills tab, and an
  expandable detail dialog. "Use Template" → `/drills/new?template=<id>`.
- **Wizard**: `TemplateDialog` + the new-drill page are now DB-backed; `/drills/new?template=<id>`
  pre-fills the wizard from the table.
- `/templates` now redirects to `/scenarios`; sidebar shows **Scenarios**.
- Decision: template objectives created via the wizard are not auto-mapped to a competency id
  yet (the form doesn't thread competency through) — they can be set on the Objectives tab.
- `npm run build` passes; `/scenarios`, `/drills/new?template=*`, `/templates` (307) all OK.

## Phase 5 — Certification Engine ✅

- **Schema** (migration `0006_concerned_gambit`): `certifications` (slug id, requirements jsonb,
  valid_for_months, badge_color) + `user_certifications` (earned/expires/score/drill_ids/status).
- **Shared**: `CERTIFICATIONS` (the 4 defs), `CertRequirements`, and pure
  `isCertEligible` / `certProgress` helpers.
- **Engine** (`packages/db/src/certifications.ts`): `computeCertStats(db, orgId)` (per-member
  drills / IC drills / avg score / competency averages) and idempotent
  `awardCertifications(db, orgId)`. Shared by the seed and the web app.
- **Auto-award**: web scoring actions call `evaluateCertifications(orgId)` after a drill
  finalizes; the seed awards eligible members (added participants to the historical drills so
  Incident Responder is earned — 3 awards seeded).
- **`/certifications`**: cards per cert with badge, requirements, the current user's
  earned/in-progress(%)/not-started state, and the list of holders.
- **`/certifications/[certId]/[userId]`**: print-styled certificate (seal, dates, score, QR
  placeholder, signature lines) with a Print button.
- Earned certifications now appear on the readiness profile; sidebar shows **Certifications**.
- `npm run build` passes; `/certifications` and the certificate route return 200.

## Phase 6 — Reports + Compliance Evidence ✅

- **Schema** (migration `0007_powerful_stephen_strange`): `compliance_frameworks`,
  `compliance_requirements` (clause/description/evidence_type + a small `config` jsonb for
  threshold/competency/minDrills), and `drill_compliance_evidence` (status + evidence jsonb).
- **Shared**: `COMPLIANCE_FRAMEWORKS` (ISO 27001, DORA, SOC 2, NIST CSF with ~11 clauses) +
  status/evidence-type enums.
- **Engine** (`packages/db/src/compliance.ts`): `evaluateDrillCompliance` maps a scored drill's
  composite / competency averages / participant certs / org drill frequency onto each
  requirement (met/partial/not_met); `evaluateOrgCompliance` backfills all scored drills.
  Hooked into the scoring actions (runs on finalize) and the seed.
- **`/drills/[id]/report`**: three tabs — Tactical Debrief (timeline, did-well, to-practice,
  this-drill-vs-team per competency), Executive Summary (composite, pass/fail, top strengths/gaps,
  risk impact, next steps), and Compliance Evidence (per-framework clause tables). Print button +
  link to the existing AAR (CLAUDE.md adjustment #4).
- **`/compliance`**: framework tabs, per-framework compliance score, requirements table
  (status / last evidence / evidence count), print/export. Sidebar shows **Compliance**.
- Scores tab links to the Full Report.
- `npm run build` passes; `/compliance` and all report tabs return 200.

## Phase 7 — Real-Time Drill Execution ✅

- **Schema**: added `observation` to `EVENT_TYPES` (migration `0008_clumsy_colleen_wing`,
  CLAUDE.md adjustment #5); updated the events-tab icon map.
- **`/drills/[id]/briefing`**: scenario, objectives, rules of engagement, roster with per-member
  readiness, "I'm Ready" toggle (stored in `config.ready`), and an IC "Start Drill" button that
  unlocks once all are ready → moves the drill to `active` and opens `/live`.
- **`/drills/[id]/live`**: reuses the Phase 1 WarRoom with a `live` config — IC gets an **End
  Drill** button and an **Injects** control sheet (fire injects early); observers/evaluators get
  an **Observe** sheet (quick-tag buttons + free-text notes + objective selector → `observation`
  events); a bottom inject ticker. Injects still auto-fire on schedule.
- **Server actions** (`live-actions.ts`): `toggleReady`, `startDrill`, `endDrill` (→ scoring +
  auto-score + cert/compliance eval), `recordObservation`.
- **`/drills/[id]/complete`**: elapsed time, event count, composite, initial auto-scores, and a
  "View Full Report" CTA. End Drill routes here; `/live` and `/briefing` redirect by status.
- Drill detail routes to Briefing/Live/Simulation based on status.
- `npm run build` passes; briefing/live/simulate/complete all return 200.

## Phase 8 — Benchmarking + Analytics ✅

- **Queries** (`src/lib/analytics.ts`): `getDrillAnalytics` (per scored drill: composite,
  time-to-resolution, time-to-first-response from first message/action event, event count,
  competency scores) and `getMostImproved` (biggest composite gain across a user's recent drills).
- **`/analytics`**: MTTR trend (line), drill frequency per month (bar), score distribution
  histogram, org competency radar, Top Performers / Most Improved / Risk Areas (<60 highlighted
  red) cards, TTR-by-scenario-type bar, average TTR / TTFR stat cards, this-quarter-vs-last
  internal benchmark with trend arrow, and an interactive 2–3 drill comparison table.
- **Components**: `SimpleBar`/`SimpleLine` recharts wrappers + `DrillCompare` client selector.
  Reuses `CompetencyRadar`, `getReadinessMembers`, `getOrgCompetencyAverages`.
- Added **Analytics** to the sidebar. `npm run build` passes; `/analytics` returns 200.
