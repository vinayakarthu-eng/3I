"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTime } from "@/lib/format";
import type { DrillDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { EVENT_TYPE_LABELS, EVENT_TYPES, type EventType } from "@drillforce/shared";
import {
  AlertTriangle,
  BarChart3,
  Cog,
  MessageSquare,
  Radio,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";

const EVENT_STYLE: Record<EventType, { icon: LucideIcon; className: string }> = {
  message: { icon: MessageSquare, className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  action: { icon: Zap, className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  inject: { icon: AlertTriangle, className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  signal: { icon: Radio, className: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  score: { icon: BarChart3, className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300" },
  system: { icon: Cog, className: "bg-muted text-muted-foreground" },
};

function describe(payload: Record<string, unknown>) {
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.description === "string") return payload.description;
  return JSON.stringify(payload);
}

/** "T+12m" relative to drill start, when known. */
function offset(at: Date, start: Date | null) {
  if (!start) return null;
  const mins = Math.round((new Date(at).getTime() - new Date(start).getTime()) / 60000);
  return mins >= 0 ? `T+${mins}m` : `T${mins}m`;
}

export function EventsTab({ drill }: { drill: DrillDetail }) {
  const [filter, setFilter] = useState<EventType | "all">("all");
  const counts = Object.fromEntries(
    EVENT_TYPES.map((t) => [t, drill.events.filter((e) => e.eventType === t).length]),
  ) as Record<EventType, number>;
  const events = filter === "all" ? drill.events : drill.events.filter((e) => e.eventType === filter);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter events by type">
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>
          All <span className="ml-1 tabular-nums opacity-70">{drill.events.length}</span>
        </Button>
        {EVENT_TYPES.filter((t) => counts[t] > 0).map((t) => (
          <Button key={t} size="sm" variant={filter === t ? "default" : "outline"} onClick={() => setFilter(t)}>
            {EVENT_TYPE_LABELS[t]} <span className="ml-1 tabular-nums opacity-70">{counts[t]}</span>
          </Button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
          <Radio className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No events yet. Messages, actions, and injects appear here once the drill is running in Slack.
          </p>
        </div>
      ) : (
        <ol className="space-y-1">
          {events.map((e) => {
            const style = EVENT_STYLE[e.eventType];
            const Icon = style.icon;
            const rel = offset(e.occurredAt, drill.startedAt);
            return (
              <li key={e.id} className="flex gap-3 rounded-md px-2 py-2.5 hover:bg-muted/50">
                <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style.className)}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {e.actor ? (drill.actorNames[e.actor] ?? e.actor) : "Unknown"}
                    </span>
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                      {EVENT_TYPE_LABELS[e.eventType]}
                    </Badge>
                    {rel && <span className="font-mono">{rel}</span>}
                    <span>{formatDateTime(e.occurredAt)}</span>
                    {e.channel && <span>{e.channel}</span>}
                  </div>
                  <p className="mt-0.5 break-words text-sm">{describe(e.payload)}</p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
