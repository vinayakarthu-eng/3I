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

export const ACTION_SEVERITIES = ["P1", "P2", "P3", "P4"] as const;
export type ActionSeverity = (typeof ACTION_SEVERITIES)[number];

export const ACTION_STATUSES = ["open", "in_progress", "completed", "verified", "deferred"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

/** Scenario shape stored in drills.scenario */
export interface DrillScenario {
  summary?: string;
  injects?: { at_minute: number; description: string }[];
  expected_actions?: string[];
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
