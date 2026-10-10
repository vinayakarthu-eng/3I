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

## Phase 9 — Integrations + Webhooks ✅

- **Schema** (migration `0009_unusual_ares`): `webhooks` (org, name, url, events jsonb, secret,
  active) + `webhook_deliveries` (event, success, status_code, error) for the delivery log.
- **`/settings/integrations`**: a 9-card integration grid — Slack is **functional** (status from
  `SLACK_BOT_TOKEN`, links to the bot README); Teams is "Coming soon"; PagerDuty, Rootly, Datadog,
  Grafana, Jira, Opsgenie, Statuspage are UI placeholders.
- **Webhook system** (`lib/webhooks.ts`): `dispatchWebhookEvent(orgId, event, payload)` POSTs JSON
  (with an optional HMAC-SHA256 `x-drillforce-signature`) to every active subscribed webhook and
  records each attempt. Wired into `drill.started`, `drill.ended`, `drill.scored`, and
  `inject.fired`. (`action.created` is selectable but not emitted — the web app has no action-create
  path yet.)
- **Webhook management UI**: add/edit/delete/pause, a Test button, and a delivery log table.
- Decision: added a `webhook_deliveries` table (beyond the spec's single table) to back the
  delivery log.
- `npm run build` passes; `/settings/integrations` returns 200.

## Phase 10 — Navigation Polish + Settings + Final Verification ✅

- **`/settings`**: real settings form — Organization (name/sector/logo placeholder), Scoring
  (pass-threshold range slider, per-competency weights), Notifications (5 email toggles), Drill
  defaults (default duration), and a link to Integrations. Persists to `organizations.config` via
  `updateOrgSettings`.
- **Navigation**: sidebar reordered to Dashboard · Drills · Scenarios · Readiness · Analytics ·
  Actions · Compliance · Certifications · Reports · Settings.
- **`/dashboard`**: re-exports the dashboard page so the alias returns **200** (CLAUDE.md
  adjustment #1 — a redirect would 307 and fail the literal route check).
- **404**: branded not-found page with DrillForce shield + CTAs.
- **Breadcrumbs**: `Breadcrumbs` component added to nested pages (integrations, drill report,
  readiness profile).
- **Loading states**: `loading.tsx` skeletons for readiness, analytics, compliance, scenarios,
  certifications, settings.
- Empty states already present on list pages; mobile uses the existing responsive sidebar drawer
  + horizontally-scrolling tables (`overflow-x-auto`) and stacking grids.

## Final verification

- `docker` Postgres/Redis healthy · `npm run db:migrate` + `npm run db:seed` clean.
- `npm run build` passes · `npm run typecheck` passes (6/6 packages) · `npm test` 7/7 pass.
- Route check (all **200**, /dashboard included): `/`, `/dashboard`, `/drills`, `/drills/new`,
  `/scenarios`, `/readiness`, `/analytics`, `/actions`, `/compliance`, `/certifications`,
  `/settings`, `/settings/integrations`, `/reports`.

## Post-build — Realistic simulation engine ✅

Reworked the war-room simulation (the UptimeLabs differentiator) from a single global
intensity curve to a **per-service model**:

- **Per-service telemetry** (`simulation-engine.ts`): each of the 6 services emits its own
  rpm / error% / latency / CPU / queue-depth and health status; the 4 chart series are derived
  from them (requests summed, error request-weighted, latency = worst path, CPU averaged).
- **Dependency-aware cascading**: each scenario names which services it hits, how hard, and the
  onset delay — so the root fails first and dependents degrade after it (e.g. DB Primary → down,
  then Replica/Cache/API degrade, while MQ/CDN stay healthy).
- **Scenario signatures**: DNS outage collapses requests to ~5% with ~85% errors across all
  services; high-traffic drives ~8× rpm + a growing MQ queue (~46k) + CPU saturation; deployment
  failure takes one service to 100% then cascades; credential leak keeps metrics near-normal with
  the signal in the logs.
- **Recovery phase**: an IC **Resolve** control sets a mitigation time; `overallPressure` then
  decays and services heal back to baseline over ~4 min (verified: DB failover errors 21%→0.5%,
  latency 4859ms→133ms).
- **Richer logs** (`log-generator.ts`): templated lines with dynamic request ids, IPs, latencies,
  status codes, SQL and cache keys; error/warn lines concentrate on whichever services are hot.
- **War-room UI**: service grid shows live per-service metrics (`rpm · ms` healthy / `% err · ms`
  impaired) with status-colored borders; recovery banner; IC Resolve button.
- Verified via an engine harness (scenario-distinct output + recovery curve) and a deep-incident
  war-room screenshot. Build/typecheck/tests all green.

## Post-build — Slack IC bot wired to the timed-inject system ✅

The Slack IC bot was functional (Claude-powered IC persona: briefs the channel, nudges quiet
rooms, answers questions in-thread, posts injects, scores hand-off) but only knew about the old
embedded `scenario.injects`. Wired it to the **`drill_injects`** table that the web execution
flow and the realistic simulation use:

- On attach, the session loads unfired `drill_injects` ordered by trigger time.
- The 15s tick now auto-fires any inject whose `trigger_at_minutes` has elapsed — posts it with
  its **service impact** (from the payload, via `resolveInjectEffect`), marks it `fired`, and logs
  the event (synchronous removal from the pending list prevents double-fire).
- The Slack briefing announces how many timed injects will fire; comms injects post without an
  impact line.
- Verified with `npm run simulate -w @drillforce/slack-bot` and a full `typecheck` (6/6).

## Headless direction — API-first foundation (in progress)

Guiding principle: the HTTP API is the product's contract; the Next front is the reference
client. Rollout is additive — the API grows alongside the working UI, which migrates to it later.

- **`packages/core`** — new framework-agnostic domain layer. Every operation takes an explicit
  `Ctx = { orgId, userId }` (no `getCurrentUser`). First operations: `listDrills`, `getDrill`,
  `listDrillInjects`, `listScenarios`/`getScenario`, `getReadiness`, plus `authenticateKey` /
  `generateApiKey` and a typed `ApiError`.
- **`api_keys` table** (migration `0010`) — hashed, org-scoped keys. `Authorization: Bearer
  df_live_…`. The seed mints one and prints it once.
- **REST at `/api/v1/*`** (Next route handlers over core): `GET /api/v1` (public discovery),
  `/drills`, `/drills/:id`, `/drills/:id/injects`, `/scenarios`, `/readiness`. A `withApiKey`
  wrapper authenticates and maps results/errors to a `{ data } | { error }` envelope.
- Verified with curl: 401 without/with a bad key; authed reads return org-scoped JSON.
  `typecheck` 7/7, `build` compiles all routes.
### Headless — writes + key management (done)

- **Core writes** (`drill-writes.ts`): `createDrill` (from a template or name+type+objectives, with
  participant find-or-create), `changeDrillStatus` (validated transitions; entering `scoring`
  auto-scores + re-evaluates certs/compliance), `fireInject`, `submitScores` (wraps the scoring
  engine + evals). All zod-validated, org-scoped, returning typed `ApiError`s.
- **POST routes**: `POST /api/v1/drills`, `/drills/:id/status`, `/drills/:id/scores`,
  `/drills/:id/injects/:injectId/fire`.
- **Key management** (`api-keys.ts` + Settings UI): `listApiKeys` / `createApiKey` (raw shown once) /
  `revokeApiKey`; a Settings card to create (reveal-once dialog + copy), list (prefix / created /
  last-used), and revoke keys.
- Verified by driving a whole drill over curl: create-from-template → draft→scheduled→briefing→active
  → fire inject, plus a rejected `active→completed` (400). Settings key card renders. `typecheck`
  7/7, `build` compiles all 9 `/api/v1` routes.
- **Still ahead:** a typed `packages/sdk`; migrate the web app + Slack bot to consume the API;
  OpenAPI spec; webhook dispatch from core (API-path writes don't emit webhooks yet); optional
  standalone `apps/api`.

### Summary

- **10 phases complete.** New top-level pages: `/scenarios`, `/readiness` (+`/[userId]`),
  `/analytics`, `/compliance`, `/certifications` (+`/[certId]/[userId]`), `/settings/integrations`,
  `/dashboard`; new drill pages: `/simulate`, `/briefing`, `/live`, `/complete`, `/report`.
- **New database tables (9):** drill_injects, competency_areas, drill_templates, certifications,
  user_certifications, compliance_frameworks, compliance_requirements, drill_compliance_evidence,
  webhooks (+ webhook_deliveries). Migrations `0003`–`0009`.
- **UptimeLabs parity:** simulated monitoring war room, 6-area competency scoring, team readiness
  heatmap, 21-scenario library + quick drills, 4 certifications, compliance evidence (ISO 27001 /
  DORA / SOC 2 / NIST CSF), web-based real-time execution, benchmarking/analytics, integrations.
- **DrillForce-only:** signal/inject engine, multi-sector scenarios (healthcare + public sector),
  compliance mapping engine, webhook system with delivery log, structured multi-format reports,
  improvement-action tracking with verification.
- **Known gaps / next steps:** wizard objectives aren't auto-mapped to competency ids;
  `action.created` webhook event isn't emitted (no web action-create path); email notifications are
  preference-only. Recommended next: Clerk auth, Vercel deploy, a real Slack app connection, and an
  `ANTHROPIC_API_KEY` for AI AAR/report generation.
