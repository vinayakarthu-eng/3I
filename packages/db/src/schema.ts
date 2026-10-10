import {
  ACTION_CATEGORIES,
  ACTION_SEVERITIES,
  ACTION_STATUSES,
  CRITERIA_TYPES,
  DRILL_STATUSES,
  DRILL_TYPES,
  EVENT_TYPES,
  PARTICIPANT_ROLES,
  SECTORS,
  USER_ROLES,
  type DrillScenario,
  type ObjectiveTarget,
} from "@drillforce/shared";
import { relations, sql, type AnyColumn, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** CHECK (col IN ('a','b',...)) — keeps text "enums" honest at the DB level. */
function oneOf(column: AnyColumn, values: readonly string[]): SQL {
  const list = values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ");
  return sql`${column} in (${sql.raw(list)})`;
}

const createdAt = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

// ─── organizations ──────────────────────────────────────────────────────────
export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sector: text("sector", { enum: SECTORS }).notNull().default("technology"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [check("organizations_sector_check", oneOf(t.sector, SECTORS))],
);

// ─── users ──────────────────────────────────────────────────────────────────
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    email: text("email").notNull().unique(),
    name: text("name").notNull(),
    role: text("role", { enum: USER_ROLES }).notNull().default("participant"),
    createdAt: createdAt(),
  },
  (t) => [
    index("users_org_id_idx").on(t.orgId),
    check("users_role_check", oneOf(t.role, USER_ROLES)),
  ],
);

// ─── drills ─────────────────────────────────────────────────────────────────
export const drills = pgTable(
  "drills",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    type: text("type", { enum: DRILL_TYPES }).notNull(),
    status: text("status", { enum: DRILL_STATUSES }).notNull().default("draft"),
    description: text("description"),
    scenario: jsonb("scenario").$type<DrillScenario>(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("drills_org_id_idx").on(t.orgId),
    index("drills_status_idx").on(t.status),
    check("drills_type_check", oneOf(t.type, DRILL_TYPES)),
    check("drills_status_check", oneOf(t.status, DRILL_STATUSES)),
  ],
);

// ─── drill_objectives ───────────────────────────────────────────────────────
export const drillObjectives = pgTable(
  "drill_objectives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    criteriaType: text("criteria_type", { enum: CRITERIA_TYPES }).notNull(),
    targetValue: jsonb("target_value").$type<ObjectiveTarget>(),
    weight: integer("weight").notNull().default(1),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    index("drill_objectives_drill_id_idx").on(t.drillId),
    check("drill_objectives_criteria_type_check", oneOf(t.criteriaType, CRITERIA_TYPES)),
  ],
);

// ─── drill_participants ─────────────────────────────────────────────────────
export const drillParticipants = pgTable(
  "drill_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: PARTICIPANT_ROLES }).notNull().default("responder"),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (t) => [
    index("drill_participants_drill_id_idx").on(t.drillId),
    check("drill_participants_role_check", oneOf(t.role, PARTICIPANT_ROLES)),
  ],
);

// ─── drill_events ───────────────────────────────────────────────────────────
export const drillEvents = pgTable(
  "drill_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    eventType: text("event_type", { enum: EVENT_TYPES }).notNull(),
    actor: text("actor"),
    channel: text("channel"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("drill_events_drill_id_occurred_at_idx").on(t.drillId, t.occurredAt),
    check("drill_events_event_type_check", oneOf(t.eventType, EVENT_TYPES)),
  ],
);

// ─── drill_scores ───────────────────────────────────────────────────────────
export const drillScores = pgTable(
  "drill_scores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    objectiveId: uuid("objective_id").references(() => drillObjectives.id, {
      onDelete: "cascade",
    }),
    criteriaType: text("criteria_type", { enum: CRITERIA_TYPES }).notNull(),
    rawValue: numeric("raw_value"),
    normalizedScore: numeric("normalized_score"),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    scoredBy: text("scored_by"),
    scoredAt: timestamp("scored_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index("drill_scores_drill_id_idx").on(t.drillId),
    check("drill_scores_criteria_type_check", oneOf(t.criteriaType, CRITERIA_TYPES)),
    check(
      "drill_scores_normalized_score_range",
      sql`${t.normalizedScore} is null or (${t.normalizedScore} >= 0 and ${t.normalizedScore} <= 100)`,
    ),
  ],
);

// ─── drill_composite ────────────────────────────────────────────────────────
export interface CompositeBreakdown {
  byCriteria: Partial<Record<string, number>>;
  objectives: { objectiveId: string; score: number; weight: number }[];
}

export const drillComposites = pgTable(
  "drill_composite",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .unique()
      .references(() => drills.id, { onDelete: "cascade" }),
    compositeScore: numeric("composite_score").notNull(),
    passThreshold: integer("pass_threshold").notNull().default(70),
    passed: boolean("passed").notNull(),
    breakdown: jsonb("breakdown").$type<CompositeBreakdown>().notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "drill_composite_score_range",
      sql`${t.compositeScore} >= 0 and ${t.compositeScore} <= 100`,
    ),
  ],
);

// ─── improvement_actions ────────────────────────────────────────────────────
export const improvementActions = pgTable(
  "improvement_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    drillId: uuid("drill_id")
      .notNull()
      .references(() => drills.id, { onDelete: "cascade" }),
    gapDescription: text("gap_description").notNull(),
    actionDescription: text("action_description").notNull(),
    category: text("category", { enum: ACTION_CATEGORIES }),
    severity: text("severity", { enum: ACTION_SEVERITIES }).notNull().default("P3"),
    ownerId: uuid("owner_id").references(() => users.id, { onDelete: "set null" }),
    dueDate: date("due_date"),
    status: text("status", { enum: ACTION_STATUSES }).notNull().default("open"),
    verificationMethod: text("verification_method"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("improvement_actions_drill_id_idx").on(t.drillId),
    check(
      "improvement_actions_category_check",
      sql`${t.category} is null or ${oneOf(t.category, ACTION_CATEGORIES)}`,
    ),
    check("improvement_actions_severity_check", oneOf(t.severity, ACTION_SEVERITIES)),
    check("improvement_actions_status_check", oneOf(t.status, ACTION_STATUSES)),
  ],
);

// ─── drill_lifecycle_templates ──────────────────────────────────────────────
export interface LifecycleStage {
  id: string;
  name: string;
  type: string;
  required: boolean;
  gate_config?: Record<string, unknown>;
  hooks?: Record<string, unknown>;
}

export const drillLifecycleTemplates = pgTable(
  "drill_lifecycle_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orgId: uuid("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    stages: jsonb("stages").$type<LifecycleStage[]>().notNull().default([]),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("drill_lifecycle_templates_org_id_idx").on(t.orgId)],
);

// ─── relations ──────────────────────────────────────────────────────────────
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  drills: many(drills),
  lifecycleTemplates: many(drillLifecycleTemplates),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.orgId], references: [organizations.id] }),
  participations: many(drillParticipants),
}));

export const drillsRelations = relations(drills, ({ one, many }) => ({
  organization: one(organizations, { fields: [drills.orgId], references: [organizations.id] }),
  creator: one(users, { fields: [drills.createdBy], references: [users.id] }),
  objectives: many(drillObjectives),
  participants: many(drillParticipants),
  events: many(drillEvents),
  scores: many(drillScores),
  improvementActions: many(improvementActions),
  composite: one(drillComposites, { fields: [drills.id], references: [drillComposites.drillId] }),
}));

export const drillCompositesRelations = relations(drillComposites, ({ one }) => ({
  drill: one(drills, { fields: [drillComposites.drillId], references: [drills.id] }),
}));

export const drillObjectivesRelations = relations(drillObjectives, ({ one, many }) => ({
  drill: one(drills, { fields: [drillObjectives.drillId], references: [drills.id] }),
  scores: many(drillScores),
}));

export const drillParticipantsRelations = relations(drillParticipants, ({ one }) => ({
  drill: one(drills, { fields: [drillParticipants.drillId], references: [drills.id] }),
  user: one(users, { fields: [drillParticipants.userId], references: [users.id] }),
}));

export const drillEventsRelations = relations(drillEvents, ({ one }) => ({
  drill: one(drills, { fields: [drillEvents.drillId], references: [drills.id] }),
}));

export const drillScoresRelations = relations(drillScores, ({ one }) => ({
  drill: one(drills, { fields: [drillScores.drillId], references: [drills.id] }),
  objective: one(drillObjectives, {
    fields: [drillScores.objectiveId],
    references: [drillObjectives.id],
  }),
}));

export const improvementActionsRelations = relations(improvementActions, ({ one }) => ({
  drill: one(drills, { fields: [improvementActions.drillId], references: [drills.id] }),
  owner: one(users, { fields: [improvementActions.ownerId], references: [users.id] }),
}));

export const drillLifecycleTemplatesRelations = relations(drillLifecycleTemplates, ({ one }) => ({
  organization: one(organizations, {
    fields: [drillLifecycleTemplates.orgId],
    references: [organizations.id],
  }),
}));

// ─── inferred types ─────────────────────────────────────────────────────────
export type Organization = typeof organizations.$inferSelect;
export type User = typeof users.$inferSelect;
export type Drill = typeof drills.$inferSelect;
export type NewDrill = typeof drills.$inferInsert;
export type DrillObjective = typeof drillObjectives.$inferSelect;
export type DrillParticipant = typeof drillParticipants.$inferSelect;
export type DrillEvent = typeof drillEvents.$inferSelect;
export type DrillScore = typeof drillScores.$inferSelect;
export type ImprovementAction = typeof improvementActions.$inferSelect;
export type DrillComposite = typeof drillComposites.$inferSelect;
export type DrillLifecycleTemplate = typeof drillLifecycleTemplates.$inferSelect;
