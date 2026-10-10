"use client";

import {
  changeDrillStatus,
  deleteDrill,
  duplicateDrill,
  renameDrill,
} from "@/app/drills/[id]/actions";
import { DrillStatusBadge, DrillTypeBadge } from "@/components/drills/drill-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAction } from "@/hooks/use-action";
import { formatScore, scoreColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  allowedTransitions,
  DRILL_STATUS_LABELS,
  type DrillStatus,
  type DrillType,
} from "@drillforce/shared";
import { ChevronDown, Copy, Loader2, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { InlineEdit } from "./inline-edit";

export function DrillHeader({
  drill,
}: {
  drill: { id: string; name: string; type: DrillType; status: DrillStatus; score: number | null };
}) {
  const router = useRouter();
  const rename = useAction();
  const status = useAction();
  const other = useAction();
  const [confirm, setConfirm] = useState<null | "delete" | DrillStatus>(null);

  const transitions = allowedTransitions(drill.status);

  function moveTo(to: DrillStatus) {
    status.run(() => changeDrillStatus(drill.id, to), {
      success: `Status changed to ${DRILL_STATUS_LABELS[to]}`,
    });
  }

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <InlineEdit
          value={drill.name}
          ariaLabel="drill name"
          pending={rename.pending}
          className="text-2xl font-semibold tracking-tight"
          onSave={(name) => rename.run(() => renameDrill(drill.id, name), { success: "Drill renamed" })}
        />
        <div className="flex flex-wrap items-center gap-2">
          <DrillTypeBadge type={drill.type} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild disabled={transitions.length === 0 || status.pending}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
                aria-label="Change status"
              >
                <DrillStatusBadge status={drill.status} />
                {status.pending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : (
                  transitions.length > 0 && <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Move to</DropdownMenuLabel>
              {transitions.map((to) => (
                <DropdownMenuItem
                  key={to}
                  onSelect={() => (to === "cancelled" ? setConfirm("cancelled") : moveTo(to))}
                  className={cn(to === "cancelled" && "text-destructive focus:text-destructive")}
                >
                  <DrillStatusBadge status={to} />
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-start gap-4">
        {drill.score != null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Composite score</div>
            <div className={cn("text-3xl font-semibold tabular-nums", scoreColor(drill.score))}>
              {formatScore(drill.score)}
            </div>
          </div>
        )}
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href={`/drills/${drill.id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit Drill
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More actions" disabled={other.pending}>
                {other.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onSelect={() =>
                  other.run(() => duplicateDrill(drill.id), {
                    success: "Drill duplicated as a new draft",
                    onSuccess: ({ id }) => router.push(`/drills/${id}`),
                  })
                }
              >
                <Copy className="h-4 w-4" />
                Duplicate Drill
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirm("delete")}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete Drill
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <AlertDialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm === "delete" ? `Delete “${drill.name}”?` : `Cancel “${drill.name}”?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm === "delete"
                ? "This permanently deletes the drill with its objectives, participants, events, scores, and improvement actions. This can’t be undone."
                : "Cancelled drills can’t be resumed. You can duplicate it later to run it again."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirm === "delete") {
                  other.run(() => deleteDrill(drill.id), {
                    success: "Drill deleted",
                    onSuccess: () => router.push("/drills"),
                  });
                } else if (confirm) {
                  moveTo(confirm);
                }
              }}
            >
              {confirm === "delete" ? "Delete drill" : "Cancel drill"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
