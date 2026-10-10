"use client";

import { rerunAutoScoring, submitManualScores } from "@/app/drills/[id]/scoring-actions";
import { CriteriaBadge } from "@/components/drills/drill-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatDate, formatScore, scoreColor } from "@/lib/format";
import type { CompetencyStat, DrillDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { DEFAULT_PASS_THRESHOLD, type CriteriaType } from "@drillforce/shared";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CheckCircle2,
  Circle,
  ClipboardCheck,
  FileText,
  Loader2,
  Minus,
  RefreshCw,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Objective = DrillDetail["objectives"][number];
type Score = DrillDetail["scores"][number];
export interface TrendPoint {
  drillId: string;
  name: string;
  score: number;
  passed: boolean;
  at: Date;
}

const AUTO: CriteriaType[] = ["time_to_action", "completeness", "coordination"];
const SCORED_STATUSES = ["scoring", "debriefing", "completed"];

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};

/** Latest score per objective (scores arrive newest-first). */
function latestScores(scores: Score[]) {
  const map = new Map<string, Score>();
  for (const s of scores) if (s.objectiveId && !map.has(s.objectiveId)) map.set(s.objectiveId, s);
  return map;
}

export function ScoresTab({
  drill,
  trend,
  competencyStats,
}: {
  drill: DrillDetail;
  trend: TrendPoint[];
  competencyStats: CompetencyStat[];
}) {
  if (!SCORED_STATUSES.includes(drill.status)) {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <BarChart3 className="mb-3 h-8 w-8 text-muted-foreground" />
        <h3 className="font-medium">Scoring will be available after drill completion</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          When the drill ends it moves to Scoring: objectives are auto-scored from events, and evaluators score the rest here.
        </p>
      </div>
    );
  }

  const latest = latestScores(drill.scores);
  const manualObjectives = drill.objectives.filter((o) => !AUTO.includes(o.criteriaType));
  const allScored = drill.objectives.length > 0 && drill.objectives.every((o) => latest.has(o.id));

  return (
    <div className="space-y-4">
      {drill.status === "scoring" && <ScoringPoller />}
      {drill.status !== "completed" && <AutoScoringStatus drill={drill} latest={latest} />}
      {drill.status !== "completed" && manualObjectives.length > 0 && (
        <EvaluatorForm drillId={drill.id} objectives={manualObjectives} latest={latest} />
      )}
      {latest.size > 0 ? (
        <ScoreResults
          drill={drill}
          latest={latest}
          trend={trend}
          complete={allScored}
          competencyStats={competencyStats}
        />
      ) : (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No scores yet.
        </div>
      )}
    </div>
  );
}

/** Refreshes server data every 5s while the drill is being scored. */
function ScoringPoller() {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [router]);
  return null;
}

function AutoScoringStatus({ drill, latest }: { drill: DrillDetail; latest: Map<string, Score> }) {
  const rerun = useAction();
  const autoObjectives = drill.objectives.filter((o) => AUTO.includes(o.criteriaType));
  const autoScoredAt = (drill.config.scoring as { autoScoredAt?: string } | undefined)?.autoScoredAt;
  const pending = drill.status === "scoring" && !autoScoredAt && autoObjectives.length > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2 text-base">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
            Auto-scoring
          </CardTitle>
          <CardDescription>
            {pending
              ? "The scoring engine is analysing drill events. This page updates automatically."
              : autoObjectives.length
                ? `Time-to-action, completeness, and coordination objectives were scored from events${autoScoredAt ? ` on ${formatDate(autoScoredAt)}` : ""}.`
                : "This drill has no auto-scored objectives."}
          </CardDescription>
        </div>
        {autoObjectives.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            disabled={rerun.pending}
            onClick={() => rerun.run(() => rerunAutoScoring(drill.id), { success: "Auto-scoring re-run" })}
          >
            {rerun.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {pending ? "Run now" : "Re-run"}
          </Button>
        )}
      </CardHeader>
      {autoObjectives.length > 0 && (
        <CardContent className="space-y-2">
          {autoObjectives.map((o) => {
            const s = latest.get(o.id);
            return (
              <div key={o.id} className="flex items-center gap-3 text-sm">
                {s ? <Check className="h-4 w-4 text-green-600" /> : <Circle className="h-4 w-4 text-muted-foreground" />}
                <span className="flex-1">{o.description}</span>
                <span className={cn("font-medium tabular-nums", scoreColor(s ? Number(s.normalizedScore) : null))}>
                  {s ? formatScore(Number(s.normalizedScore)) : "pending"}
                </span>
              </div>
            );
          })}
        </CardContent>
      )}
    </Card>
  );
}

// ─── evaluator form ─────────────────────────────────────────────────────────

type Verdict = "correct" | "partial" | "incorrect";
interface ManualDraft {
  ratings: Record<string, number>;
  verdict?: Verdict;
  notes: string;
}

function rubricOf(o: Objective) {
  const rubric = (o.targetValue as { rubric?: { dimension: string; scale: number }[] } | null)?.rubric ?? [];
  return rubric.length ? rubric : [{ dimension: "Overall", scale: 5 }];
}

function EvaluatorForm({
  drillId,
  objectives,
  latest,
}: {
  drillId: string;
  objectives: Objective[];
  latest: Map<string, Score>;
}) {
  const submit = useAction();
  const [errors, setErrors] = useState<Record<string, string>>({});
  // Start from the latest evaluator score so re-scoring edits rather than restarts.
  const [drafts, setDrafts] = useState<Record<string, ManualDraft>>(() =>
    Object.fromEntries(
      objectives.map((o) => {
        const s = latest.get(o.id);
        const ev = (s && s.scoredBy !== "auto" ? s.evidence : null) ?? {};
        const ratings = Object.fromEntries(
          ((ev.ratings as { dimension: string; rating: number }[] | undefined) ?? []).map((r) => [r.dimension, r.rating]),
        );
        return [o.id, { ratings, verdict: ev.verdict as Verdict | undefined, notes: (ev.notes as string) ?? "" }];
      }),
    ),
  );

  const set = (id: string, patch: Partial<ManualDraft>) =>
    setDrafts((d) => ({ ...d, [id]: { ...d[id], ...patch } }));

  function onSubmit() {
    const nextErrors: Record<string, string> = {};
    const payload = objectives.map((o) => {
      const d = drafts[o.id];
      if (o.criteriaType === "quality") {
        const rubric = rubricOf(o);
        const missing = rubric.filter((r) => !d.ratings[r.dimension]);
        if (missing.length) nextErrors[o.id] = `Rate ${missing.map((m) => m.dimension).join(", ")}`;
        return {
          objectiveId: o.id,
          notes: d.notes,
          ratings: rubric.map((r) => ({ dimension: r.dimension, rating: d.ratings[r.dimension] ?? 0, scale: r.scale })),
        };
      }
      if (!d.verdict) nextErrors[o.id] = "Choose a verdict";
      return { objectiveId: o.id, notes: d.notes, verdict: d.verdict };
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    submit.run(() => submitManualScores(drillId, payload), { success: "Scores submitted" });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="h-4 w-4" />
          Evaluator scoring
        </CardTitle>
        <CardDescription>Quality and accuracy objectives need an evaluator’s judgement.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {objectives.map((o) => {
          const d = drafts[o.id];
          return (
            <div key={o.id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <CriteriaBadge criteria={o.criteriaType} />
                <span className="font-medium">{o.description}</span>
              </div>

              {o.criteriaType === "quality" ? (
                <div className="space-y-3">
                  {rubricOf(o).map((r) => (
                    <div key={r.dimension} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-sm">{r.dimension}</span>
                      <div className="flex gap-1" role="radiogroup" aria-label={`${r.dimension} rating`}>
                        {Array.from({ length: r.scale }, (_, i) => i + 1).map((n) => (
                          <button
                            key={n}
                            type="button"
                            role="radio"
                            aria-checked={d.ratings[r.dimension] === n}
                            aria-label={`${r.dimension} ${n} of ${r.scale}`}
                            onClick={() => set(o.id, { ratings: { ...d.ratings, [r.dimension]: n } })}
                            className={cn(
                              "h-8 w-8 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              d.ratings[r.dimension] === n
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-accent",
                            )}
                          >
                            {n}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Expected outcome: </span>
                    {String((o.targetValue as { expected_outcome?: string } | null)?.expected_outcome ?? "—")}
                  </p>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Accuracy verdict">
                    {(
                      [
                        ["correct", "Correct"],
                        ["partial", "Partially correct"],
                        ["incorrect", "Incorrect"],
                      ] as const
                    ).map(([value, label]) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        role="radio"
                        aria-checked={d.verdict === value}
                        variant={d.verdict === value ? "default" : "outline"}
                        onClick={() => set(o.id, { verdict: value })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor={`notes-${o.id}`} className="text-xs text-muted-foreground">
                  Evidence / notes
                </Label>
                <Textarea
                  id={`notes-${o.id}`}
                  rows={2}
                  placeholder="What did you observe? Cite times or messages."
                  value={d.notes}
                  onChange={(e) => set(o.id, { notes: e.target.value })}
                />
              </div>
              {errors[o.id] && <p className="text-xs font-medium text-destructive">{errors[o.id]}</p>}
            </div>
          );
        })}
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={submit.pending}>
            {submit.pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit Scores
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── results ────────────────────────────────────────────────────────────────

function ScoreResults({
  drill,
  latest,
  trend,
  complete,
  competencyStats,
}: {
  drill: DrillDetail;
  latest: Map<string, Score>;
  trend: TrendPoint[];
  complete: boolean;
  competencyStats: CompetencyStat[];
}) {
  const threshold = drill.composite?.passThreshold ?? Number(drill.config.passThreshold ?? DEFAULT_PASS_THRESHOLD);
  const composite = drill.composite ? Number(drill.composite.compositeScore) : drill.score;
  const passed = composite != null && composite >= threshold;

  const radarData = useMemo(
    () =>
      competencyStats.map((c) => ({
        criteria: c.name,
        score: Math.round(c.score),
        hasData: true,
      })),
    [competencyStats],
  );

  const trendData = trend.map((t) => ({ ...t, label: formatDate(t.at), isCurrent: t.drillId === drill.id }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>{complete ? "Composite score" : "Provisional score"}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={cn("text-6xl font-semibold tabular-nums tracking-tight", scoreColor(composite))}>
              {formatScore(composite)}
            </div>
            {complete ? (
              <div className="flex items-center gap-2">
                <Badge
                  className={cn(
                    "border-transparent",
                    passed
                      ? "bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300"
                      : "bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-950 dark:text-red-300",
                  )}
                >
                  {passed ? "PASS" : "FAIL"}
                </Badge>
                <span className="text-xs text-muted-foreground">Threshold {threshold}</span>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Waiting on {drill.objectives.length - latest.size} objective(s) before pass/fail is decided.
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Weighted average of {latest.size} scored objective{latest.size === 1 ? "" : "s"}.
            </p>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/drills/${drill.id}/aar`}>
                <FileText className="h-4 w-4" />
                Generate AAR
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="w-full">
              <Link href={`/drills/${drill.id}/report`}>
                <FileText className="h-4 w-4" />
                Full Report
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Score by competency</CardTitle>
            <CardDescription>Objective scores grouped into the six competency areas.</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {radarData.length >= 3 ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke="hsl(var(--border))" />
                  <PolarAngleAxis dataKey="criteria" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [v, "Score"]} />
                  <Radar dataKey="score" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.3} />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                A radar needs at least three scored competencies.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {competencyStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competency breakdown</CardTitle>
            <CardDescription>
              Average per competency, objectives assessed, and the trend versus your previous drill.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {competencyStats.map((c) => (
              <div key={c.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{c.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {c.objectives} objective{c.objectives === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className={cn("text-2xl font-semibold tabular-nums", scoreColor(c.score))}>
                    {formatScore(c.score)}
                  </span>
                </div>
                <TrendArrow delta={c.delta} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-objective breakdown</CardTitle>
          <CardDescription>Scores with the evidence they were based on.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {drill.objectives.map((o) => {
            const s = latest.get(o.id);
            const score = s?.normalizedScore == null ? null : Number(s.normalizedScore);
            return (
              <div key={o.id} className="rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <CriteriaBadge criteria={o.criteriaType} />
                      <span className="text-xs text-muted-foreground">Weight {o.weight}</span>
                      {s?.scoredBy && (
                        <span className="text-xs text-muted-foreground">
                          · scored by {drill.actorNames[s.scoredBy] ?? s.scoredBy}
                        </span>
                      )}
                    </div>
                    <p className="font-medium">{o.description}</p>
                  </div>
                  <span className={cn("text-2xl font-semibold tabular-nums", scoreColor(score))}>
                    {score == null ? "—" : formatScore(score)}
                  </span>
                </div>
                {s?.evidence && (
                  <EvidenceView criteria={o.criteriaType} evidence={s.evidence} actorNames={drill.actorNames} />
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {trendData.length > 1 && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Score trend</CardTitle>
            <CardDescription>Composite scores of scored drills in your organization. Dashed line: pass threshold.</CardDescription>
          </CardHeader>
          <CardContent className="h-64 pt-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendData} margin={{ left: -20, right: 12, top: 8 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <ReferenceLine y={threshold} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(_l, items) => items?.[0]?.payload?.name ?? ""}
                  formatter={(v: number) => [Math.round(v), "Composite"]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  dot={(props: { cx?: number; cy?: number; index?: number; payload?: { isCurrent: boolean } }) => (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={props.payload?.isCurrent ? 6 : 3.5}
                      fill={props.payload?.isCurrent ? "hsl(var(--chart-1))" : "hsl(var(--background))"}
                      stroke="hsl(var(--chart-1))"
                      strokeWidth={2}
                    />
                  )}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function TrendArrow({ delta }: { delta: number | null }) {
  if (delta == null) {
    return <p className="mt-2 text-xs text-muted-foreground">No prior drill to compare.</p>;
  }
  if (Math.abs(delta) < 0.5) {
    return (
      <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="h-3.5 w-3.5" /> Steady vs. last drill
      </p>
    );
  }
  const up = delta > 0;
  return (
    <p
      className={cn(
        "mt-2 flex items-center gap-1 text-xs font-medium",
        up ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
      )}
    >
      {up ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
      {up ? "+" : ""}
      {delta} vs. last drill
    </p>
  );
}

interface Citation {
  text?: string;
  tPlusMinutes?: number | null;
  actor?: string | null;
}

function Quote({ c, actorNames }: { c?: Citation; actorNames: Record<string, string> }) {
  if (!c) return null;
  return (
    <span className="text-muted-foreground">
      {c.tPlusMinutes != null && <span className="mr-1 font-mono text-xs">T+{Math.round(c.tPlusMinutes)}m</span>}
      {c.actor && <span className="mr-1 font-medium text-foreground">{actorNames[c.actor] ?? c.actor}:</span>}“{c.text}”
    </span>
  );
}

function EvidenceView({
  criteria,
  evidence,
  actorNames,
}: {
  criteria: CriteriaType;
  evidence: Record<string, unknown>;
  actorNames: Record<string, string>;
}) {
  const note = typeof evidence.note === "string" ? evidence.note : null;
  const notes = typeof evidence.notes === "string" && evidence.notes ? evidence.notes : null;

  return (
    <div className="mt-3 space-y-1.5 border-t pt-3 text-sm">
      {note && <p className="text-muted-foreground">{note}</p>}

      {criteria === "time_to_action" && (
        <>
          {evidence.trigger ? (
            <p>
              <span className="mr-2 text-xs font-medium uppercase text-muted-foreground">Trigger</span>
              <Quote c={evidence.trigger as Citation} actorNames={actorNames} />
            </p>
          ) : null}
          {evidence.response ? (
            <p>
              <span className="mr-2 text-xs font-medium uppercase text-muted-foreground">Response</span>
              <Quote c={evidence.response as Citation} actorNames={actorNames} />
            </p>
          ) : null}
        </>
      )}

      {criteria === "completeness" && Array.isArray(evidence.matched) && (
        <ul className="space-y-1">
          {(evidence.matched as { item: string; event: Citation }[]).map((m) => (
            <li key={m.item} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                <span className="font-medium">{m.item}</span> — <Quote c={m.event} actorNames={actorNames} />
              </span>
            </li>
          ))}
          {((evidence.missing as string[]) ?? []).map((m) => (
            <li key={m} className="flex gap-2 text-muted-foreground">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              {m}
            </li>
          ))}
        </ul>
      )}

      {criteria === "coordination" && Array.isArray(evidence.contacted) && (
        <ul className="space-y-1">
          {(evidence.contacted as { stakeholder: string; event: Citation }[]).map((m) => (
            <li key={m.stakeholder} className="flex gap-2">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              <span>
                <span className="font-medium">{m.stakeholder}</span> — <Quote c={m.event} actorNames={actorNames} />
              </span>
            </li>
          ))}
          {((evidence.notContacted as string[]) ?? []).map((m) => (
            <li key={m} className="flex gap-2 text-muted-foreground">
              <X className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
              {m}
            </li>
          ))}
        </ul>
      )}

      {criteria === "quality" && Array.isArray(evidence.ratings) && (
        <div className="flex flex-wrap gap-2">
          {(evidence.ratings as { dimension: string; rating: number; scale: number }[]).map((r) => (
            <Badge key={r.dimension} variant="secondary" className="font-normal">
              {r.dimension}: {r.rating}/{r.scale}
            </Badge>
          ))}
        </div>
      )}

      {criteria === "accuracy" && typeof evidence.verdict === "string" && (
        <Badge variant="secondary" className="font-normal capitalize">
          Verdict: {evidence.verdict}
        </Badge>
      )}

      {notes && <p className="italic text-muted-foreground">“{notes}”</p>}
    </div>
  );
}
