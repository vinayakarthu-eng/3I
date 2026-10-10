export const SECTORS = ["technology", "healthcare", "public_sector"] as const;
export type Sector = (typeof SECTORS)[number];

export const USER_ROLES = ["admin", "drill_manager", "participant", "viewer"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const DRILL_TYPES = ["tabletop", "functional", "full_scale"] as const;
export type DrillType = (typeof DRILL_TYPES)[number];

export const DRILL_STATUSES = [
  "draft",
  "scheduled",
  "briefing",
  "active",
  "scoring",
  "debriefing",
  "completed",
  "cancelled",
] as const;
export type DrillStatus = (typeof DRILL_STATUSES)[number];

export const CRITERIA_TYPES = [
  "time_to_action",
  "completeness",
  "quality",
  "accuracy",
  "coordination",
] as const;
export type CriteriaType = (typeof CRITERIA_TYPES)[number];

export const PARTICIPANT_ROLES = [
  "incident_commander",
  "responder",
  "observer",
  "evaluator",
] as const;
export type ParticipantRole = (typeof PARTICIPANT_ROLES)[number];

export const EVENT_TYPES = ["message", "action", "inject", "signal", "score", "system"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const ACTION_CATEGORIES = ["process", "tooling", "knowledge", "staffing", "design"] as const;
export type ActionCategory = (typeof ACTION_CATEGORIES)[number];

export const COMPETENCY_CATEGORIES = ["technical", "communication", "leadership", "process"] as const;
export type CompetencyCategory = (typeof COMPETENCY_CATEGORIES)[number];

export const DIFFICULTIES = ["beginner", "intermediate", "advanced"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const CERT_STATUSES = ["active", "expired", "revoked"] as const;
export type CertStatus = (typeof CERT_STATUSES)[number];

/** Requirements stored in certifications.requirements (jsonb). */
export interface CertRequirements {
  minDrills?: number;
  minAvgScore?: number;
  minICDrills?: number;
  allCompetenciesMin?: number;
  competencyThresholds?: { competency: string; min: number }[];
}

export interface UserCertStats {
  /** scored drills participated in */
  drills: number;
  /** scored drills where the user was incident_commander */
  icDrills: number;
  /** mean composite across participated drills */
  avgScore: number | null;
  /** competency name -> average score */
  byCompetency: Record<string, number>;
}

/** Each requirement as a 0..1 satisfaction ratio (used for eligibility + progress bars). */
function certRequirementRatios(req: CertRequirements, s: UserCertStats): number[] {
  const ratios: number[] = [];
  const ratio = (have: number, need: number) => (need <= 0 ? 1 : Math.min(1, have / need));
  if (req.minDrills != null) ratios.push(ratio(s.drills, req.minDrills));
  if (req.minICDrills != null) ratios.push(ratio(s.icDrills, req.minICDrills));
  if (req.minAvgScore != null) ratios.push(ratio(s.avgScore ?? 0, req.minAvgScore));
  for (const t of req.competencyThresholds ?? []) {
    ratios.push(ratio(s.byCompetency[t.competency] ?? 0, t.min));
  }
  if (req.allCompetenciesMin != null) {
    for (const name of COMPETENCY_AREAS.map((c) => c.name)) {
      ratios.push(ratio(s.byCompetency[name] ?? 0, req.allCompetenciesMin));
    }
  }
  return ratios.length ? ratios : [1];
}

export function isCertEligible(req: CertRequirements, s: UserCertStats): boolean {
  return certRequirementRatios(req, s).every((r) => r >= 1);
}

/** 0..1 overall progress toward a certification. */
export function certProgress(req: CertRequirements, s: UserCertStats): number {
  const ratios = certRequirementRatios(req, s);
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export interface CompetencyAreaSeed {
  name: string;
  description: string;
  category: CompetencyCategory;
  sortOrder: number;
}

/** Canonical 6 competency areas; seeded into the competency_areas table. */
export const COMPETENCY_AREAS: CompetencyAreaSeed[] = [
  { name: "Incident Scoping", description: "Identify scope, severity, and blast radius quickly", category: "technical", sortOrder: 0 },
  { name: "Incident Mechanics", description: "Technical diagnosis, mitigation steps, tool usage", category: "technical", sortOrder: 1 },
  { name: "Internal Communication", description: "Status updates to team, escalation, handoffs", category: "communication", sortOrder: 2 },
  { name: "External Communication", description: "Customer comms, stakeholder updates, status page management", category: "communication", sortOrder: 3 },
  { name: "Incident Command", description: "Leadership, decision-making, delegation, prioritization", category: "leadership", sortOrder: 4 },
  { name: "Process Adherence", description: "Following runbooks, documenting actions, post-incident procedures", category: "process", sortOrder: 5 },
];

export interface CertificationSeed {
  id: string;
  name: string;
  description: string;
  requirements: CertRequirements;
  validForMonths: number;
  badgeColor: string;
}

/** The 4 seeded certifications. */
export const CERTIFICATIONS: CertificationSeed[] = [
  {
    id: "incident-responder",
    name: "Incident Responder",
    description: "Complete 3 drills with an average score of at least 60.",
    requirements: { minDrills: 3, minAvgScore: 60 },
    validForMonths: 12,
    badgeColor: "blue",
  },
  {
    id: "incident-commander",
    name: "Incident Commander",
    description: "Complete 5 drills as Incident Commander with avg score ≥70 and Incident Command ≥75.",
    requirements: {
      minICDrills: 5,
      minAvgScore: 70,
      competencyThresholds: [{ competency: "Incident Command", min: 75 }],
    },
    validForMonths: 12,
    badgeColor: "purple",
  },
  {
    id: "crisis-communication-specialist",
    name: "Crisis Communication Specialist",
    description: "Complete 3 drills with Internal and External Communication competencies ≥80.",
    requirements: {
      minDrills: 3,
      competencyThresholds: [
        { competency: "Internal Communication", min: 80 },
        { competency: "External Communication", min: 80 },
      ],
    },
    validForMonths: 12,
    badgeColor: "green",
  },
  {
    id: "full-spectrum-operator",
    name: "Full Spectrum Operator",
    description: "Reach ≥70 in all six competencies across 10 or more drills.",
    requirements: { minDrills: 10, allCompetenciesMin: 70 },
    validForMonths: 24,
    badgeColor: "gold",
  },
];

export const COMPETENCY_CATEGORY_LABELS: Record<CompetencyCategory, string> = {
  technical: "Technical",
  communication: "Communication",
  leadership: "Leadership",
  process: "Process",
};

/** Skill level bands used by the readiness dashboard (Phase 3). */
export const SKILL_LEVELS = [
  { min: 90, max: 100, label: "Expert", badge: "gold" },
  { min: 75, max: 89, label: "Advanced", badge: "purple" },
  { min: 60, max: 74, label: "Practitioner", badge: "green" },
  { min: 40, max: 59, label: "Beginner", badge: "blue" },
  { min: 0, max: 39, label: "Novice", badge: "gray" },
] as const;
export type SkillLevel = (typeof SKILL_LEVELS)[number];

export function skillLevel(score: number): SkillLevel {
  return SKILL_LEVELS.find((l) => score >= l.min) ?? SKILL_LEVELS[SKILL_LEVELS.length - 1];
}

/** Heatmap cell color band for a 0–100 score. */
export function scoreBand(score: number | null): "none" | "red" | "orange" | "yellow" | "green" | "emerald" {
  if (score == null) return "none";
  if (score < 50) return "red";
  if (score < 70) return "orange";
  if (score < 80) return "yellow";
  if (score < 90) return "green";
  return "emerald";
}

export const ACTION_SEVERITIES = ["P1", "P2", "P3", "P4"] as const;
export type ActionSeverity = (typeof ACTION_SEVERITIES)[number];

export const ACTION_STATUSES = ["open", "in_progress", "completed", "verified", "deferred"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Scenario shape stored in drills.scenario */
export interface DrillScenario {
  summary?: string;
  injects?: { at_minute: number; description: string }[];
  expected_actions?: string[];
  /** Drives the simulation monitoring profile; see simulation-engine.ts. */
  scenarioType?: ScenarioType;
  /** SEV level surfaced in the alert banner, e.g. "SEV-1". */
  severity?: string;
}

/** Target value shapes stored in drill_objectives.target_value */
export type ObjectiveTarget =
  | { max_minutes: number }
  | { checklist: string[] }
  | { rubric: { dimension: string; scale: number }[] }
  | { expected_outcome: string }
  | { stakeholders: string[] }
  | Record<string, unknown>;

export const DRILL_TYPE_LABELS: Record<DrillType, string> = {
  tabletop: "Tabletop",
  functional: "Functional",
  full_scale: "Full-Scale",
};

export const DRILL_STATUS_LABELS: Record<DrillStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  briefing: "Briefing",
  active: "Active",
  scoring: "Scoring",
  debriefing: "Debriefing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const CRITERIA_TYPE_LABELS: Record<CriteriaType, string> = {
  time_to_action: "Time-to-Action",
  completeness: "Completeness",
  quality: "Quality",
  accuracy: "Accuracy",
  coordination: "Coordination",
};

export const PARTICIPANT_ROLE_LABELS: Record<ParticipantRole, string> = {
  incident_commander: "Incident Commander",
  responder: "Responder",
  observer: "Observer",
  evaluator: "Evaluator",
};

export const SECTOR_LABELS: Record<Sector, string> = {
  technology: "Technology",
  healthcare: "Healthcare",
  public_sector: "Public Sector",
};
export * from "./templates";
export * from "./simulation-engine";
export * from "./log-generator";
import type { ScenarioType } from "./simulation-engine";

/** Valid forward transitions; any non-terminal status may also be cancelled. */
const FORWARD_TRANSITIONS: Record<DrillStatus, DrillStatus[]> = {
  draft: ["scheduled"],
  scheduled: ["briefing"],
  briefing: ["active"],
  active: ["scoring"],
  scoring: ["debriefing"],
  debriefing: ["completed"],
  completed: [],
  cancelled: [],
};

export function allowedTransitions(from: DrillStatus): DrillStatus[] {
  if (from === "completed" || from === "cancelled") return [];
  return [...FORWARD_TRANSITIONS[from], "cancelled"];
}

export function canTransition(from: DrillStatus, to: DrillStatus) {
  return allowedTransitions(from).includes(to);
}

export const DEFAULT_PASS_THRESHOLD = 70;

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  message: "Message",
  action: "Action",
  inject: "Inject",
  signal: "Signal",
  score: "Score",
  system: "System",
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  verified: "Verified",
  deferred: "Deferred",
};

export const ACTION_CATEGORY_LABELS: Record<ActionCategory, string> = {
  process: "Process",
  tooling: "Tooling",
  knowledge: "Knowledge",
  staffing: "Staffing",
  design: "Design",
};

/** open → in_progress → completed → verified; anything unverified can be deferred (with justification). */
const ACTION_TRANSITIONS: Record<ActionStatus, ActionStatus[]> = {
  open: ["in_progress", "deferred"],
  in_progress: ["open", "completed", "deferred"],
  completed: ["in_progress", "verified", "deferred"],
  verified: [],
  deferred: ["open"],
};

export function allowedActionTransitions(from: ActionStatus): ActionStatus[] {
  return ACTION_TRANSITIONS[from];
}

/** Overdue = past due and still being worked on. */
export function isActionOverdue(a: { dueDate: string | null; status: ActionStatus }, today = new Date()) {
  if (!a.dueDate || a.status === "completed" || a.status === "verified" || a.status === "deferred") return false;
  return a.dueDate < today.toISOString().slice(0, 10);
}
