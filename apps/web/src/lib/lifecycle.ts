import type { DrillDetail } from "@/lib/queries";
import type { DrillStatus } from "@drillforce/shared";

/** The responder-facing lifecycle, mapped onto drill statuses. */
export const STAGES = [
  { key: "planning", label: "Planning", blurb: "Objectives and the injection matrix" },
  { key: "preparation", label: "Preparation", blurb: "Review what will be injected" },
  { key: "execution", label: "Execution", blurb: "Signals injecting · Slack channel live" },
  { key: "concluded", label: "Concluded", blurb: "Drill over · scoring window" },
  { key: "scored", label: "Scored", blurb: "Scoring agent results · AAR" },
  { key: "completed", label: "Completed", blurb: "Debrief done" },
] as const;
export type StageKey = (typeof STAGES)[number]["key"];

const STAGE_OF: Record<DrillStatus, number> = {
  draft: 0,
  scheduled: 1,
  briefing: 1,
  active: 2,
  scoring: 3,
  debriefing: 4,
  completed: 5,
  cancelled: -1,
};
/** The status whose arrival completes each stage. */
const COMPLETES_ON: Record<StageKey, DrillStatus | null> = {
  planning: "scheduled",
  preparation: "active",
  execution: "scoring",
  concluded: "debriefing",
  scored: "completed",
  completed: null,
};

export interface StageView {
  key: StageKey;
  label: string;
  blurb: string;
  state: "done" | "current" | "upcoming";
  completedAt: Date | null;
}

export function lifecycleStages(drill: Pick<DrillDetail, "status" | "events">): StageView[] {
  const current = STAGE_OF[drill.status];
  const arrived = new Map<string, Date>();
  for (const e of drill.events) {
    if (e.eventType === "system" && e.payload.kind === "status_change" && typeof e.payload.to === "string") {
      arrived.set(e.payload.to, e.occurredAt); // last arrival wins
    }
  }
  return STAGES.map((s, i) => {
    const done = current === 5 ? i <= 5 : i < current;
    const completes = COMPLETES_ON[s.key];
    return {
      ...s,
      state: done ? "done" : i === current ? "current" : "upcoming",
      completedAt: done && completes ? (arrived.get(completes) ?? null) : null,
    };
  });
}
