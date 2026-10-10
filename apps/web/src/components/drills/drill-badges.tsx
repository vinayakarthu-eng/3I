import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CRITERIA_TYPE_LABELS,
  DRILL_STATUS_LABELS,
  DRILL_TYPE_LABELS,
  PARTICIPANT_ROLE_LABELS,
  type CriteriaType,
  type DrillStatus,
  type DrillType,
  type ParticipantRole,
} from "@drillforce/shared";

const STATUS_STYLES: Record<DrillStatus, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  scheduled: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  briefing: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300",
  active: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  scoring: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  debriefing: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

export function DrillStatusBadge({ status, className }: { status: DrillStatus; className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", STATUS_STYLES[status], className)}
    >
      {DRILL_STATUS_LABELS[status]}
    </Badge>
  );
}

export function DrillTypeBadge({ type }: { type: DrillType }) {
  return (
    <Badge variant="outline" className="font-medium">
      {DRILL_TYPE_LABELS[type]}
    </Badge>
  );
}

export function CriteriaBadge({ criteria }: { criteria: CriteriaType }) {
  return (
    <Badge variant="secondary" className="font-medium">
      {CRITERIA_TYPE_LABELS[criteria]}
    </Badge>
  );
}

export function ParticipantRoleBadge({ role }: { role: ParticipantRole }) {
  return (
    <Badge variant={role === "incident_commander" ? "default" : "secondary"} className="font-medium">
      {PARTICIPANT_ROLE_LABELS[role]}
    </Badge>
  );
}
