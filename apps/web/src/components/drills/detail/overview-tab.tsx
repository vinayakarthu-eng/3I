"use client";

import { updateDrillDescription, updateDrillScenario } from "@/app/drills/[id]/actions";
import { DrillStatusBadge } from "@/components/drills/drill-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatDateTime } from "@/lib/format";
import type { DrillDetail } from "@/lib/queries";
import {
  DRILL_TYPE_LABELS,
  SECTOR_LABELS,
  type DrillStatus,
  type Sector,
} from "@drillforce/shared";
import { Braces, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { InlineEdit } from "./inline-edit";

export function OverviewTab({ drill }: { drill: DrillDetail }) {
  const description = useAction();
  const scenario = drill.scenario ?? {};
  const sector = (drill.config.sector as Sector | undefined) ?? drill.organization.sector;

  const transitions = drill.events
    .filter((e) => e.eventType === "system" && e.payload.kind === "status_change")
    .map((e) => ({
      id: e.id,
      to: e.payload.to as DrillStatus,
      text: String(e.payload.text ?? ""),
      at: e.occurredAt,
      actor: e.actor ? drill.actorNames[e.actor] : undefined,
    }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Description</CardTitle>
          </CardHeader>
          <CardContent>
            <InlineEdit
              multiline
              value={drill.description ?? ""}
              placeholder="Add a description…"
              ariaLabel="description"
              pending={description.pending}
              className="whitespace-pre-wrap text-sm text-muted-foreground"
              onSave={(text) =>
                description.run(() => updateDrillDescription(drill.id, text), { success: "Description saved" })
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Key info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <Info label="Type">{DRILL_TYPE_LABELS[drill.type]}</Info>
              <Info label="Sector">{SECTOR_LABELS[sector]}</Info>
              <Info label="Created by">{drill.creator?.name ?? "—"}</Info>
              <Info label="Created">{formatDate(drill.createdAt)}</Info>
              <Info label="Scheduled" wide>
                {formatDateTime(drill.scheduledAt)}
              </Info>
              {drill.startedAt && <Info label="Started" wide>{formatDateTime(drill.startedAt)}</Info>}
              {drill.endedAt && <Info label="Ended" wide>{formatDateTime(drill.endedAt)}</Info>}
            </dl>
          </CardContent>
        </Card>
      </div>

      <ScenarioCard drillId={drill.id} scenario={scenario} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
          <CardDescription>Status changes over the life of this drill.</CardDescription>
        </CardHeader>
        <CardContent>
          {transitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No status changes recorded yet.</p>
          ) : (
            <ol className="relative space-y-5 border-l pl-6">
              {transitions.map((t) => (
                <li key={t.id} className="relative">
                  <span className="absolute -left-[29px] top-1 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                  <div className="flex flex-wrap items-center gap-2">
                    <DrillStatusBadge status={t.to} />
                    <span className="text-xs text-muted-foreground">{formatDateTime(t.at)}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t.text}
                    {t.actor && <> · {t.actor}</>}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function ScenarioCard({
  drillId,
  scenario,
}: {
  drillId: string;
  scenario: NonNullable<DrillDetail["scenario"]>;
}) {
  const [open, setOpen] = useState(false);
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const save = useAction();

  const openEditor = () => {
    setJson(JSON.stringify({ summary: "", injects: [], expected_actions: [], ...scenario }, null, 2));
    setError(null);
    setOpen(true);
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="text-base">Scenario</CardTitle>
          <CardDescription>{scenario.summary || "No scenario summary yet."}</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={openEditor}>
          <Braces className="h-4 w-4" />
          Edit JSON
        </Button>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border p-4">
          <h4 className="mb-3 text-sm font-medium">Injects</h4>
          {scenario.injects?.length ? (
            <ol className="space-y-3">
              {scenario.injects.map((inject, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <span className="w-12 shrink-0 rounded bg-muted px-1.5 py-0.5 text-center font-mono text-xs">
                    T+{inject.at_minute}m
                  </span>
                  <span>{inject.description}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">No injects defined.</p>
          )}
        </div>
        <div className="rounded-lg border p-4">
          <h4 className="mb-3 text-sm font-medium">Expected actions</h4>
          {scenario.expected_actions?.length ? (
            <ul className="space-y-2">
              {scenario.expected_actions.map((a) => (
                <li key={a} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {a}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No expected actions defined.</p>
          )}
        </div>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit scenario</DialogTitle>
            <DialogDescription>
              Fields: <code>summary</code>, <code>injects</code> (
              <code>{"{ at_minute, description }"}</code>), <code>expected_actions</code>.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={json}
            onChange={(e) => {
              setJson(e.target.value);
              setError(null);
            }}
            rows={18}
            spellCheck={false}
            className="font-mono text-xs"
            aria-label="Scenario JSON"
          />
          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={save.pending}
              onClick={() =>
                save.run(() => updateDrillScenario(drillId, json), {
                  success: "Scenario saved",
                  onSuccess: () => setOpen(false),
                  onError: setError,
                })
              }
            >
              {save.pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save scenario
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
