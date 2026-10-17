"use client";

import {
  completeDrillAction,
  concludeDrillAction,
  executeDrillAction,
  scheduleDrillAction,
} from "@/app/drills/[id]/lifecycle-actions";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useAction } from "@/hooks/use-action";
import { formatDateTime, formatScore, scoreColor } from "@/lib/format";
import type { StageView } from "@/lib/lifecycle";
import { cn } from "@/lib/utils";
import { SIGNAL_KIND_META, type DrillStatus, type SignalKind } from "@drillforce/shared";
import {
  Check,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Flag,
  Hash,
  Loader2,
  Radio,
  Rocket,
  Timer,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export interface LifecycleSignal {
  id: string;
  kind: SignalKind;
  service: string;
  description: string;
  status: "planned" | "running" | "completed" | "stopped" | "failed";
  expected: { volume: number; spans: number; logs: number; events: number };
  stats: { volume: number; failures: number; spans: number; logs: number; metricPoints: number; events: number; samples?: string[] } | null;
  lastError: string | null;
}

export interface SlackInfo {
  channelName: string;
  url: string | null;
  mode: "live" | "simulator";
}

export interface LifecycleProps {
  drillId: string;
  status: DrillStatus;
  stages: StageView[];
  scheduledAt: string | null;
  objectives: number;
  isMonitoring: boolean;
  signals: LifecycleSignal[];
  totals: { volume: number; failures: number; spans: number; logs: number; metricPoints: number; events: number };
  runsForMinutes: number;
  sink: "datadog" | "dry_run";
  warRoomReady: boolean;
  startedAt: string | null;
  endedAt: string | null;
  execution: { executedAt: string; sink: "datadog" | "dry_run"; links: Record<string, string>; slackError?: string } | null;
  slack: SlackInfo | null;
  scoringDueAt: string | null;
  score: number | null;
}

const STAGE_ICONS = [ClipboardList, Rocket, Radio, Flag, CheckCircle2, Check];
const n = (v: number) => v.toLocaleString("en-US");

export function DrillLifecycle(props: LifecycleProps) {
  const router = useRouter();
  const live = props.status === "active" || props.status === "scoring";

  // Keep live stages fresh (injection progress, scoring agent arrival).
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [live, router]);

  if (props.status === "cancelled") {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">This drill was cancelled.</CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <Stepper stages={props.stages} />
      <div className="border-t p-4 md:p-5">
        <StagePanel {...props} />
      </div>
    </Card>
  );
}

// ─── stepper ──────────────────────────────────────────────────────────────────
function Stepper({ stages }: { stages: StageView[] }) {
  return (
    <ol className="flex overflow-x-auto px-2 py-4 md:px-4" aria-label="Drill lifecycle">
      {stages.map((s, i) => {
        const Icon = STAGE_ICONS[i];
        return (
          <li key={s.key} className="flex min-w-[8.5rem] flex-1 items-start" aria-current={s.state === "current" ? "step" : undefined}>
            <div className="flex w-full flex-col items-center gap-1.5 px-1 text-center">
              <div className="flex w-full items-center">
                <span className={cn("h-0.5 flex-1", i === 0 ? "invisible" : stages[i - 1].state === "done" ? "bg-green-500" : "bg-border")} />
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                    s.state === "done" && "border-green-500 bg-green-500 text-white animate-in zoom-in-50",
                    s.state === "current" && "border-primary bg-primary/10 text-primary ring-4 ring-primary/15",
                    s.state === "upcoming" && "border-border text-muted-foreground",
                  )}
                >
                  {s.state === "done" ? <Check className="h-4 w-4" strokeWidth={3} /> : <Icon className="h-4 w-4" />}
                </span>
                <span className={cn("h-0.5 flex-1", i === stages.length - 1 ? "invisible" : s.state === "done" ? "bg-green-500" : "bg-border")} />
              </div>
              <span className={cn("text-sm font-medium", s.state === "upcoming" && "text-muted-foreground")}>
                {s.label}
                {s.state === "current" && <span className="ml-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-primary align-middle" />}
              </span>
              <span className="text-[11px] leading-tight text-muted-foreground">
                {s.state === "done" ? (s.completedAt ? `✓ ${formatDateTime(s.completedAt)}` : "✓ Complete") : s.blurb}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ─── current stage ────────────────────────────────────────────────────────────
function StagePanel(p: LifecycleProps) {
  switch (p.status) {
    case "draft":
      return <PlanningPanel {...p} />;
    case "scheduled":
    case "briefing":
      return <PreparationPanel {...p} />;
    case "active":
      return <ExecutionPanel {...p} />;
    case "scoring":
      return <ConcludedPanel {...p} />;
    case "debriefing":
      return <ScoredPanel {...p} />;
    case "completed":
      return <CompletedPanel {...p} />;
    default:
      return null;
  }
}

function NextStep({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Next step</p>
        <p className="font-semibold">{title}</p>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Checklist({ items }: { items: [string, boolean][] }) {
  return (
    <ul className="mt-3 grid gap-1.5 text-sm sm:grid-cols-3">
      {items.map(([label, ok]) => (
        <li key={label} className="flex items-center gap-2">
          {ok ? <CheckCircle2 className="h-4 w-4 text-green-600" /> : <TriangleAlert className="h-4 w-4 text-amber-500" />}
          <span className={cn(!ok && "text-muted-foreground")}>{label}</span>
        </li>
      ))}
    </ul>
  );
}

function PlanningPanel(p: LifecycleProps) {
  const action = useAction();
  const items: [string, boolean][] = [
    [p.scheduledAt ? `Scheduled for ${formatDateTime(p.scheduledAt)}` : "Set a scheduled date", !!p.scheduledAt],
    [`${p.objectives} objective${p.objectives === 1 ? "" : "s"} defined`, p.objectives > 0],
    ...(p.isMonitoring ? ([[`${p.signals.length} signal stream${p.signals.length === 1 ? "" : "s"} in the injection matrix`, p.signals.length > 0]] as [string, boolean][]) : []),
  ];
  return (
    <div>
      <NextStep title="Finish planning, then schedule the drill">
        {p.isMonitoring && (
          <Button asChild variant="outline" size="sm">
            <Link href={`/drills/${p.drillId}?tab=injection`}>Edit injection matrix</Link>
          </Button>
        )}
        <Button
          size="sm"
          disabled={action.pending}
          onClick={() => action.run(() => scheduleDrillAction(p.drillId), { success: "✓ Planning complete — drill scheduled" })}
        >
          {action.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Schedule drill
        </Button>
      </NextStep>
      <Checklist items={items} />
    </div>
  );
}

function PreparationPanel(p: LifecycleProps) {
  const action = useAction();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-4">
      <NextStep title="Review what will be injected, then execute">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Rocket className="h-4 w-4" />
          Review &amp; execute
        </Button>
      </NextStep>
      <InjectionSummary {...p} />
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Execute this drill?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p className="font-medium text-foreground">We are going to inject:</p>
                {p.signals.length ? (
                  <ul className="list-disc space-y-1 pl-5">
                    {p.signals.map((s) => (
                      <li key={s.id}>{s.description}</li>
                    ))}
                  </ul>
                ) : (
                  <p>No signals — this drill runs without telemetry injection.</p>
                )}
                <Destinations sink={p.sink} warRoomReady={p.warRoomReady} />
                <p>Responders will be told clearly that <strong>this is a drill</strong>.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              disabled={action.pending}
              onClick={() =>
                action.run(() => executeDrillAction(p.drillId), {
                  success: "✓ Drill executed — injection started",
                })
              }
            >
              {action.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
              Yes, execute now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Destinations({ sink, warRoomReady }: { sink: "datadog" | "dry_run"; warRoomReady: boolean }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="rounded-md border p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Telemetry destination</p>
        {sink === "datadog" ? (
          <p className="mt-1">Datadog — APM traces, metrics, logs and events (tagged <code>env:drill</code>)</p>
        ) : (
          <p className="mt-1">
            <strong>Dry run</strong> — the same telemetry is generated and counted, but not sent. Add <code>DD_API_KEY</code> to send it to Datadog.
          </p>
        )}
      </div>
      <div className="rounded-md border p-3">
        <p className="text-xs font-medium uppercase text-muted-foreground">Slack</p>
        <p className="mt-1">
          {warRoomReady
            ? "The War Room opens an incident channel, invites on-call and runs the IC / Deputy / Comms / Liaison / Scribe team."
            : "No Slack channel — the War Room isn't connected (WAR_ROOM_URL / WAR_ROOM_TOKEN)."}
        </p>
      </div>
    </div>
  );
}

function InjectionSummary(p: LifecycleProps) {
  if (!p.signals.length) return <p className="text-sm text-muted-foreground">No signals planned for this drill.</p>;
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Signals requested ({p.signals.length}) · runs {p.runsForMinutes} min</p>
      <ul className="space-y-1.5 text-sm">
        {p.signals.map((s) => (
          <li key={s.id} className="flex gap-2">
            <Badge variant="outline" className="h-fit shrink-0">{SIGNAL_KIND_META[s.kind].label}</Badge>
            <span className="text-muted-foreground">{s.description}</span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Expected telemetry: ~{n(p.totals.spans)} spans · {n(p.totals.logs)} log lines · {n(p.totals.metricPoints)} metric points · {p.totals.events} event{p.totals.events === 1 ? "" : "s"}
      </p>
    </div>
  );
}

function ExecutionPanel(p: LifecycleProps) {
  const action = useAction();
  const [confirm, setConfirm] = useState(false);
  const allDone = p.signals.length > 0 && p.signals.every((s) => s.status !== "running" && s.status !== "planned");
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950/40 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-600" />
          </span>
          <div>
            <p className="font-semibold text-red-800 dark:text-red-200">The drill has started — it is live</p>
            <p className="text-sm text-red-700/80 dark:text-red-300/80">
              Executed {formatDateTime(p.execution?.executedAt ?? p.startedAt)} · <Elapsed since={p.execution?.executedAt ?? p.startedAt} />
            </p>
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setConfirm(true)}>
          <Flag className="h-4 w-4" />
          Conclude drill
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <SlackCard slack={p.slack} error={p.execution?.slackError} />
        <TelemetryCard sink={p.execution?.sink ?? p.sink} links={p.execution?.links ?? {}} allDone={allDone} />
      </div>

      {p.signals.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">
            {allDone ? "✓ Injection completed" : "Injecting signals"} ({p.signals.filter((s) => s.status === "completed").length}/{p.signals.length} streams done)
          </p>
          {p.signals.map((s) => (
            <SignalProgress key={s.id} s={s} />
          ))}
        </div>
      )}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Conclude the drill?</AlertDialogTitle>
            <AlertDialogDescription>
              Remaining injection stops, the Slack channel is told <strong>“This was a drill — the drill has now concluded”</strong>, and the scoring
              agent reviews the responses after the post-drill window.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep running</AlertDialogCancel>
            <AlertDialogAction
              disabled={action.pending}
              onClick={() => action.run(() => concludeDrillAction(p.drillId), { success: "✓ Drill concluded" })}
            >
              Conclude drill
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SlackCard({ slack, error }: { slack: SlackInfo | null; error?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase text-muted-foreground">
        <Hash className="h-3.5 w-3.5" /> Slack channel
      </p>
      {slack ? (
        <div className="mt-1 space-y-1">
          <p className="font-mono text-sm font-semibold">#{slack.channelName}</p>
          {slack.url ? (
            <a className="inline-flex items-center gap-1 text-sm text-primary hover:underline" href={slack.url} target="_blank" rel="noreferrer">
              Open in Slack <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ) : (
            <p className="text-xs text-muted-foreground">{slack.mode === "simulator" ? "Simulated (War Room dashboard)" : ""}</p>
          )}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{error ?? "No Slack channel for this drill."}</p>
      )}
    </div>
  );
}

function TelemetryCard({ sink, links, allDone }: { sink: "datadog" | "dry_run"; links: Record<string, string>; allDone: boolean }) {
  const labels: Record<string, string> = { traces: "APM traces", logs: "Logs", events: "Events", services: "Services", databases: "Databases" };
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium uppercase text-muted-foreground">Telemetry {allDone ? "· injection complete" : "· injecting"}</p>
      {sink === "datadog" ? (
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {Object.entries(links).map(([k, url]) => (
            <a key={k} className="inline-flex items-center gap-1 text-primary hover:underline" href={url} target="_blank" rel="noreferrer">
              Datadog {labels[k] ?? k} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          ))}
        </div>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">Dry run — telemetry generated and counted, not sent (no DD_API_KEY).</p>
      )}
    </div>
  );
}

const STATUS_BADGE: Record<LifecycleSignal["status"], string> = {
  planned: "bg-muted text-muted-foreground",
  running: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  stopped: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  failed: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

function SignalProgress({ s }: { s: LifecycleSignal }) {
  const sent = s.stats?.volume ?? 0;
  const pct = s.expected.volume ? Math.min(100, Math.round((sent / s.expected.volume) * 100)) : s.status === "completed" ? 100 : 0;
  return (
    <div className="rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {SIGNAL_KIND_META[s.kind].label} · <span className="font-mono text-xs">{s.service}</span>
        </span>
        <Badge variant="outline" className={cn("border-transparent capitalize", STATUS_BADGE[s.status])}>
          {s.status === "running" && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
          {s.status}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{s.description}</p>
      <Progress value={pct} className="mt-2 h-1.5" />
      <p className="mt-1 text-xs text-muted-foreground">
        {n(sent)} / {n(s.expected.volume)} {SIGNAL_KIND_META[s.kind].unit} · {n(s.stats?.spans ?? 0)} spans · {n(s.stats?.logs ?? 0)} logs ·{" "}
        {n(s.stats?.events ?? 0)} events{s.stats?.failures ? ` · ${n(s.stats.failures)} failing` : ""}
      </p>
      {s.lastError && <p className="mt-1 text-xs text-red-600">{s.lastError}</p>}
      {s.stats?.samples?.[0] && <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">e.g. {s.stats.samples[0]}</p>}
    </div>
  );
}

function ConcludedPanel(p: LifecycleProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-3 dark:border-green-900 dark:bg-green-950/40">
        <Flag className="mt-0.5 h-5 w-5 text-green-700 dark:text-green-300" />
        <div>
          <p className="font-semibold text-green-800 dark:text-green-200">This was a drill — the drill has concluded.</p>
          <p className="text-sm text-green-700/80 dark:text-green-300/80">Concluded {formatDateTime(p.endedAt)}. Injection stopped; responders were notified{p.slack ? ` in #${p.slack.channelName}` : ""}.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm">
        <Timer className="h-4 w-4 text-muted-foreground" />
        {p.scoringDueAt ? (
          <span>
            The scoring agent reviews the responses at <strong>{formatDateTime(p.scoringDueAt)}</strong> (<Countdown to={p.scoringDueAt} />).
          </span>
        ) : (
          <span>Scoring in progress…</span>
        )}
      </div>
    </div>
  );
}

function ScoredPanel(p: LifecycleProps) {
  const action = useAction();
  return (
    <NextStep title="Review the scores and AAR, then complete the drill">
      <span className={cn("self-center text-2xl font-bold", scoreColor(p.score))}>{formatScore(p.score)}</span>
      <Button asChild variant="outline" size="sm">
        <Link href={`/drills/${p.drillId}/aar`}>Open AAR</Link>
      </Button>
      <Button size="sm" disabled={action.pending} onClick={() => action.run(() => completeDrillAction(p.drillId), { success: "✓ Drill completed" })}>
        {action.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Complete drill
      </Button>
    </NextStep>
  );
}

function CompletedPanel(p: LifecycleProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="flex items-center gap-2 font-semibold">
        <CheckCircle2 className="h-5 w-5 text-green-600" /> Drill completed — final score{" "}
        <span className={scoreColor(p.score)}>{formatScore(p.score)}</span>
      </p>
      <Button asChild variant="outline" size="sm">
        <Link href={`/drills/${p.drillId}/report`}>View report</Link>
      </Button>
    </div>
  );
}

// ─── time helpers ─────────────────────────────────────────────────────────────
function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function Elapsed({ since }: { since: string | null }) {
  const now = useNow();
  if (!since) return null;
  const s = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  return <span>running {Math.floor(s / 60)}m {String(s % 60).padStart(2, "0")}s</span>;
}

function Countdown({ to }: { to: string }) {
  const now = useNow();
  const s = Math.floor((new Date(to).getTime() - now) / 1000);
  if (s <= 0) return <span>any moment now</span>;
  return <span>in {Math.floor(s / 60)}m {String(s % 60).padStart(2, "0")}s</span>;
}
