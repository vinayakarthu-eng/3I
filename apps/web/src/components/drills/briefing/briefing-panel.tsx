"use client";

import { startDrill, toggleReady } from "@/app/drills/[id]/live-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAction } from "@/hooks/use-action";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PARTICIPANT_ROLE_LABELS, type ParticipantRole } from "@drillforce/shared";
import { Check, Loader2, Play } from "lucide-react";
import { useRouter } from "next/navigation";

export interface BriefingParticipant {
  userId: string;
  name: string;
  role: string;
  ready: boolean;
}

export function BriefingPanel({
  drillId,
  status,
  participants,
  currentUserId,
  isIC,
}: {
  drillId: string;
  status: string;
  participants: BriefingParticipant[];
  currentUserId: string;
  isIC: boolean;
}) {
  const router = useRouter();
  const ready = useAction();
  const start = useAction();

  const me = participants.find((p) => p.userId === currentUserId);
  const allReady = participants.length > 0 && participants.every((p) => p.ready);
  const canStart = isIC && status === "briefing" && allReady;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {participants.map((p) => (
          <div key={p.userId} className="flex items-center gap-3 rounded-lg border p-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {PARTICIPANT_ROLE_LABELS[p.role as ParticipantRole] ?? p.role}
              </p>
            </div>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                p.ready
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {p.ready ? <Check className="h-3 w-3" /> : null}
              {p.ready ? "Ready" : "Not ready"}
            </span>
          </div>
        ))}
        {participants.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No participants yet. Add participants on the drill&apos;s Participants tab.
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {me && (
          <Button
            variant={me.ready ? "outline" : "default"}
            disabled={ready.pending}
            onClick={() =>
              ready.run(() => toggleReady(drillId), { onSuccess: () => router.refresh() })
            }
          >
            {ready.pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {me.ready ? "Mark not ready" : "I'm Ready"}
          </Button>
        )}

        {isIC && (
          <Button
            disabled={!canStart || start.pending}
            onClick={() =>
              start.run(() => startDrill(drillId), {
                success: "Drill started",
                onSuccess: () => router.push(`/drills/${drillId}/live`),
              })
            }
          >
            {start.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Start Drill
          </Button>
        )}
      </div>

      {isIC && status === "briefing" && !allReady && (
        <p className="text-xs text-muted-foreground">
          Start unlocks once every participant has marked themselves ready.
        </p>
      )}
      {isIC && status !== "briefing" && (
        <p className="text-xs text-muted-foreground">
          Move the drill to the Briefing stage (from the drill page) to start execution.
        </p>
      )}
    </div>
  );
}
