"use client";

import { CriteriaBadge } from "@/components/drills/drill-badges";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatScore, scoreColor } from "@/lib/format";
import type { DrillDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  CRITERIA_TYPE_LABELS,
  CRITERIA_TYPES,
  DEFAULT_PASS_THRESHOLD,
} from "@drillforce/shared";
import { BarChart3 } from "lucide-react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export function ScoresTab({ drill }: { drill: DrillDetail }) {
  if (drill.status !== "completed") {
    return (
      <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <BarChart3 className="mb-3 h-8 w-8 text-muted-foreground" />
        <h3 className="font-medium">Scoring will be available after drill completion</h3>
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
          Once the drill is completed, scores for each objective appear here.
        </p>
      </div>
    );
  }
  return <ScoreResults drill={drill} />;
}

export function ScoreResults({ drill }: { drill: DrillDetail }) {
  const threshold = Number(drill.config.passThreshold ?? DEFAULT_PASS_THRESHOLD);

  // Latest score per objective.
  const latest = new Map<string, DrillDetail["scores"][number]>();
  for (const s of drill.scores) if (s.objectiveId && !latest.has(s.objectiveId)) latest.set(s.objectiveId, s);

  const rows = drill.objectives.map((o) => {
    const s = latest.get(o.id);
    return { objective: o, score: s?.normalizedScore == null ? null : Number(s.normalizedScore), entry: s };
  });

  const radarData = CRITERIA_TYPES.map((c) => {
    const scored = rows.filter((r) => r.objective.criteriaType === c && r.score != null);
    return {
      criteria: CRITERIA_TYPE_LABELS[c],
      score: scored.length ? Math.round(scored.reduce((a, r) => a + r.score!, 0) / scored.length) : 0,
      hasData: scored.length > 0,
    };
  });

  const composite = drill.score;
  const passed = composite != null && composite >= threshold;

  if (composite == null) {
    return (
      <div className="rounded-lg border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
        No scores have been recorded for this drill yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Composite score</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className={cn("text-6xl font-semibold tabular-nums tracking-tight", scoreColor(composite))}>
              {formatScore(composite)}
            </div>
            <div className="flex items-center gap-2">
              <Badge
                className={cn(
                  "border-transparent",
                  passed
                    ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                    : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                )}
              >
                {passed ? "PASS" : "FAIL"}
              </Badge>
              <span className="text-xs text-muted-foreground">Threshold {threshold}</span>
            </div>
            <p className="text-xs text-muted-foreground">Weighted average across {rows.filter((r) => r.score != null).length} scored objectives.</p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Score by criteria</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="criteria" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, item) => [item.payload.hasData ? v : "Not scored", "Score"]}
                />
                <Radar dataKey="score" stroke="hsl(var(--chart-2))" fill="hsl(var(--chart-2))" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-objective breakdown</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-6">Objective</TableHead>
                <TableHead>Criteria</TableHead>
                <TableHead className="text-center">Weight</TableHead>
                <TableHead className="hidden md:table-cell">Evidence</TableHead>
                <TableHead className="pr-6 text-right">Score</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ objective, score, entry }) => (
                <TableRow key={objective.id}>
                  <TableCell className="pl-6 font-medium">{objective.description}</TableCell>
                  <TableCell>
                    <CriteriaBadge criteria={objective.criteriaType} />
                  </TableCell>
                  <TableCell className="text-center tabular-nums">{objective.weight}</TableCell>
                  <TableCell className="hidden max-w-xs text-xs text-muted-foreground md:table-cell">
                    {entry?.evidence ? summarizeEvidence(entry.evidence) : "—"}
                    {entry?.scoredBy && (
                      <span className="block opacity-70">
                        by {drill.actorNames[entry.scoredBy] ?? entry.scoredBy}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className={cn("pr-6 text-right font-semibold tabular-nums", scoreColor(score))}>
                    {formatScore(score)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export function summarizeEvidence(evidence: Record<string, unknown>) {
  if (typeof evidence.note === "string") return evidence.note;
  if (typeof evidence.summary === "string") return evidence.summary;
  return Object.entries(evidence)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`)
    .join(" · ");
}
