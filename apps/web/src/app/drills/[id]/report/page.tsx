import { PrintButton } from "@/components/certifications/print-button";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import { getDrillComplianceEvidence } from "@/lib/compliance";
import { formatDate, formatDateTime, formatScore, scoreColor } from "@/lib/format";
import {
  getDrill,
  getDrillCompetencyStats,
  getOrgCompetencyAverages,
  listDrillActions,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { DEFAULT_PASS_THRESHOLD, DRILL_TYPE_LABELS, type ComplianceStatus } from "@drillforce/shared";
import { ArrowLeft, FileText, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { id: string }; searchParams: { tab?: string } };
const TABS = ["tactical", "executive", "compliance"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill ? `Report · ${drill.name}` : "Drill not found" };
}

const COMPLIANCE_BADGE: Record<ComplianceStatus, string> = {
  met: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  partial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  not_met: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
const COMPLIANCE_LABEL: Record<ComplianceStatus, string> = {
  met: "Met",
  partial: "Partial",
  not_met: "Not met",
};

export default async function ReportPage({ params, searchParams }: Props) {
  const { org } = await getCurrentUser();
  const [drill, competencyStats, orgAverages, actions, evidence] = await Promise.all([
    getDrill(org.id, params.id),
    getDrillCompetencyStats(org.id, params.id),
    getOrgCompetencyAverages(org.id),
    listDrillActions(params.id),
    getDrillComplianceEvidence(org.id, params.id),
  ]);
  if (!drill) notFound();

  const tab = TABS.includes(searchParams.tab as (typeof TABS)[number])
    ? searchParams.tab!
    : "tactical";

  const threshold = drill.composite?.passThreshold ?? DEFAULT_PASS_THRESHOLD;
  const composite = drill.composite ? Number(drill.composite.compositeScore) : drill.score;
  const passed = composite != null && composite >= threshold;

  const ranked = [...competencyStats].sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 3);
  const gaps = [...ranked].reverse().slice(0, 3);

  const timeline = drill.events.filter((e) =>
    ["message", "inject", "action", "system", "signal"].includes(e.eventType),
  );

  // Group compliance evidence by framework.
  const byFramework = new Map<string, typeof evidence>();
  for (const e of evidence) {
    const key = `${e.framework} ${e.version}`;
    byFramework.set(key, [...(byFramework.get(key) ?? []), e]);
  }

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Drills", href: "/drills" },
          { label: drill.name, href: `/drills/${drill.id}` },
          { label: "Report" },
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link href={`/drills/${drill.id}`}>
            <ArrowLeft className="h-4 w-4" />
            {drill.name}
          </Link>
        </Button>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/drills/${drill.id}/aar`}>
              <FileText className="h-4 w-4" />
              After-Action Report
            </Link>
          </Button>
          <PrintButton label="Print Report" />
        </div>
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{drill.name} — Report</h1>
        <p className="text-sm text-muted-foreground">
          {DRILL_TYPE_LABELS[drill.type]} · {formatDate(drill.endedAt ?? drill.scheduledAt)}
        </p>
      </div>

      <Tabs defaultValue={tab} className="space-y-4">
        <TabsList>
          <TabsTrigger value="tactical">Tactical Debrief</TabsTrigger>
          <TabsTrigger value="executive">Executive Summary</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Evidence</TabsTrigger>
        </TabsList>

        {/* ─── Tactical Debrief ─────────────────────────────────────────── */}
        <TabsContent value="tactical" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">What happened</CardTitle>
              <CardDescription>Timeline of key moments during the drill.</CardDescription>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <p className="text-sm text-muted-foreground">No timeline events recorded.</p>
              ) : (
                <ol className="space-y-2">
                  {timeline.map((e) => (
                    <li key={e.id} className="flex gap-3 text-sm">
                      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                        {formatDateTime(e.occurredAt)}
                      </span>
                      <Badge variant="outline" className="h-5 shrink-0 text-[10px] capitalize">
                        {e.eventType}
                      </Badge>
                      <span>{String((e.payload as { text?: string })?.text ?? "")}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-green-600" /> What you did well
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {strengths.filter((s) => s.score >= 70).length ? (
                  strengths
                    .filter((s) => s.score >= 70)
                    .map((s) => (
                      <div key={s.id} className="flex items-center justify-between">
                        <span>{s.name}</span>
                        <span className={cn("font-semibold tabular-nums", scoreColor(s.score))}>
                          {formatScore(s.score)}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground">No standout strengths this drill.</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingDown className="h-4 w-4 text-red-600" /> What to practice
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {gaps.filter((g) => g.score < 80).length ? (
                  gaps
                    .filter((g) => g.score < 80)
                    .map((g) => (
                      <div key={g.id} className="flex items-center justify-between">
                        <span>{g.name}</span>
                        <span className={cn("font-semibold tabular-nums", scoreColor(g.score))}>
                          {formatScore(g.score)}
                        </span>
                      </div>
                    ))
                ) : (
                  <p className="text-muted-foreground">Nothing urgent — keep it up.</p>
                )}
                {actions.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t pt-2 text-muted-foreground">
                    {actions.map((a) => (
                      <li key={a.action.id}>• {a.action.actionDescription}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">This drill vs. team average</CardTitle>
              <CardDescription>Per-competency score compared to your org&apos;s all-time average.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {competencyStats.length === 0 ? (
                <p className="text-sm text-muted-foreground">No competency scores recorded.</p>
              ) : (
                competencyStats.map((c) => {
                  const teamAvg = orgAverages[c.name];
                  return (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span>{c.name}</span>
                        <span className="tabular-nums">
                          <span className={scoreColor(c.score)}>{formatScore(c.score)}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            / team {teamAvg != null ? Math.round(teamAvg) : "—"}
                          </span>
                        </span>
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary/70"
                          style={{ width: `${Math.max(0, Math.min(100, c.score))}%` }}
                        />
                        {teamAvg != null && (
                          <span
                            className="absolute top-0 h-full w-0.5 bg-foreground"
                            style={{ left: `${Math.max(0, Math.min(100, teamAvg))}%` }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Executive Summary ────────────────────────────────────────── */}
        <TabsContent value="executive" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-base">{drill.name}</CardTitle>
                  <CardDescription>
                    {DRILL_TYPE_LABELS[drill.type]} · {formatDate(drill.endedAt ?? drill.scheduledAt)}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className={cn("text-4xl font-semibold tabular-nums", scoreColor(composite))}>
                    {formatScore(composite)}
                  </div>
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
                </div>
              </div>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {composite == null
                ? "This drill has not been fully scored yet."
                : passed
                  ? `The team met the ${threshold}-point pass threshold with a composite of ${Math.round(composite)}. Response was effective overall.`
                  : `The team fell short of the ${threshold}-point pass threshold (composite ${Math.round(composite)}). Focus remediation on the gaps below.`}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 3 strengths</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {strengths.map((s) => (
                  <div key={s.id} className="flex items-center justify-between">
                    <span>{s.name}</span>
                    <span className={cn("font-semibold tabular-nums", scoreColor(s.score))}>
                      {formatScore(s.score)}
                    </span>
                  </div>
                ))}
                {strengths.length === 0 && <p className="text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Top 3 gaps</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {gaps.map((g) => (
                  <div key={g.id} className="flex items-center justify-between">
                    <span>{g.name}</span>
                    <span className={cn("font-semibold tabular-nums", scoreColor(g.score))}>
                      {formatScore(g.score)}
                    </span>
                  </div>
                ))}
                {gaps.length === 0 && <p className="text-muted-foreground">No data.</p>}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Risk impact assessment</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {passed
                ? "Residual risk is low. The team demonstrated it can execute this scenario within tolerances. Maintain cadence to prevent skill decay."
                : "Residual risk is elevated. Gaps in the competencies above could extend time-to-recovery in a real incident. Prioritise the next steps below before the next exercise."}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Recommended next steps</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {actions.length === 0 ? (
                <p className="text-muted-foreground">
                  No improvement actions recorded. Capture follow-ups from the After-Action Report.
                </p>
              ) : (
                <ul className="space-y-2">
                  {actions.map((a) => (
                    <li key={a.action.id} className="flex items-start gap-2">
                      <Badge variant="outline" className="mt-0.5 shrink-0 text-[10px]">
                        {a.action.severity}
                      </Badge>
                      <span>
                        {a.action.actionDescription}
                        {a.owner?.name && (
                          <span className="text-muted-foreground"> — {a.owner.name}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ─── Compliance Evidence ──────────────────────────────────────── */}
        <TabsContent value="compliance" className="space-y-4">
          {byFramework.size === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
              Compliance evidence is generated once the drill is scored.
            </div>
          ) : (
            [...byFramework.entries()].map(([framework, rows]) => (
              <Card key={framework}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{framework}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="-mx-6 overflow-x-auto px-6">
                    <table className="w-full min-w-[560px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Clause</th>
                          <th className="px-3 py-2 font-medium">Requirement</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={r.clause} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-3 font-mono text-xs">{r.clause}</td>
                            <td className="px-3 py-2">{r.description}</td>
                            <td className="px-3 py-2">
                              <Badge className={cn("border-transparent", COMPLIANCE_BADGE[r.status])}>
                                {COMPLIANCE_LABEL[r.status]}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
