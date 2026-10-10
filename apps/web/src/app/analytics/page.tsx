import { SimpleBar, SimpleLine } from "@/components/analytics/charts";
import { DrillCompare } from "@/components/analytics/drill-compare";
import { PageHeader } from "@/components/layout/page-header";
import { CompetencyRadar } from "@/components/readiness/competency-radar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { getDrillAnalytics, getMostImproved } from "@/lib/analytics";
import { formatDate, formatScore, scoreColor } from "@/lib/format";
import { getOrgCompetencyAverages, listCompetencyAreas, listDrills } from "@/lib/queries";
import { getReadinessMembers } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { SCENARIO_TYPE_LABELS, type ScenarioType } from "@drillforce/shared";
import { AlertTriangle, Minus, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Analytics" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export default async function AnalyticsPage() {
  const { org } = await getCurrentUser();
  const [analytics, orgAverages, members, improved, competencies, allDrills] = await Promise.all([
    getDrillAnalytics(org.id),
    getOrgCompetencyAverages(org.id),
    getReadinessMembers(org.id, null),
    getMostImproved(org.id),
    listCompetencyAreas(),
    listDrills(org.id),
  ]);

  // MTTR trend.
  const mttrTrend = analytics
    .filter((d) => d.ttrMins != null)
    .map((d) => ({ label: formatDate(d.at), mttr: d.ttrMins as number }));

  // Drill frequency by month (all drills).
  const freqMap = new Map<string, number>();
  for (const d of allDrills) {
    const date = new Date(d.scheduledAt ?? d.createdAt);
    const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
    freqMap.set(key, (freqMap.get(key) ?? 0) + 1);
  }
  const frequency = [...freqMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, count]) => {
      const [, m] = key.split("-");
      return { label: MONTHS[Number(m)], drills: count };
    });

  // Score distribution.
  const buckets = [
    { label: "<60", min: 0, max: 60 },
    { label: "60–69", min: 60, max: 70 },
    { label: "70–79", min: 70, max: 80 },
    { label: "80–89", min: 80, max: 90 },
    { label: "90+", min: 90, max: 101 },
  ];
  const distribution = buckets.map((b) => ({
    label: b.label,
    count: analytics.filter((d) => d.composite >= b.min && d.composite < b.max).length,
  }));

  // Org competency radar + risk areas.
  const radarData = competencies
    .filter((c) => orgAverages[c.name] != null)
    .map((c) => ({ name: c.name, score: Math.round(orgAverages[c.name]) }));
  const riskAreas = competencies
    .map((c) => ({ name: c.name, score: orgAverages[c.name] }))
    .filter((c) => c.score != null && c.score < 60);

  // TTR by scenario type.
  const ttrByType = new Map<string, { sum: number; n: number }>();
  for (const d of analytics) {
    if (d.ttrMins == null) continue;
    const key = d.scenarioType ?? "generic";
    const cur = ttrByType.get(key) ?? { sum: 0, n: 0 };
    cur.sum += d.ttrMins;
    cur.n += 1;
    ttrByType.set(key, cur);
  }
  const ttrTypeData = [...ttrByType.entries()].map(([k, v]) => ({
    label: SCENARIO_TYPE_LABELS[k as ScenarioType] ?? k,
    minutes: Math.round(v.sum / v.n),
  }));

  // TTR averages.
  const ttfrVals = analytics.map((d) => d.ttfrMins).filter((v): v is number => v != null);
  const ttrVals = analytics.map((d) => d.ttrMins).filter((v): v is number => v != null);
  const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  // Internal benchmarking: this quarter vs. previous quarter avg composite.
  const now = new Date();
  const qStart = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
  const prevQStart = new Date(qStart.getFullYear(), qStart.getMonth() - 3, 1);
  const inRange = (d: Date, a: Date, b: Date) => d >= a && d < b;
  const thisQ = analytics.filter((d) => inRange(d.at, qStart, now));
  const prevQ = analytics.filter((d) => inRange(d.at, prevQStart, qStart));
  const thisQAvg = avg(thisQ.map((d) => Math.round(d.composite)));
  const prevQAvg = avg(prevQ.map((d) => Math.round(d.composite)));

  const topPerformers = members.filter((m) => m.overall != null).slice(0, 5);

  return (
    <div className="space-y-8">
      <PageHeader
        title="Analytics"
        description="Organization-wide drill performance, trends, and internal benchmarking."
      />

      {/* Benchmarking summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Scored drills" value={String(analytics.length)} />
        <StatCard
          label="Avg time to resolution"
          value={avg(ttrVals) == null ? "—" : `${avg(ttrVals)}m`}
        />
        <StatCard
          label="Avg time to first response"
          value={avg(ttfrVals) == null ? "—" : `${avg(ttfrVals)}m`}
        />
        <QuarterCard thisQ={thisQAvg} prevQ={prevQAvg} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">MTTR trend</CardTitle>
            <CardDescription>Mean time-to-resolution across drills over time.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleLine data={mttrTrend} xKey="label" lineKey="mttr" unit="m" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drill frequency</CardTitle>
            <CardDescription>Drills scheduled per month.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBar data={frequency} xKey="label" barKey="drills" color="hsl(var(--chart-3))" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score distribution</CardTitle>
            <CardDescription>Composite scores across all scored drills.</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleBar data={distribution} xKey="label" barKey="count" color="hsl(var(--chart-4))" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Competency radar</CardTitle>
            <CardDescription>Org-wide average across the six competencies.</CardDescription>
          </CardHeader>
          <CardContent>
            <CompetencyRadar data={radarData} height={240} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top performers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topPerformers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scores yet.</p>
            ) : (
              topPerformers.map((m, i) => (
                <div key={m.userId} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="w-4 text-xs text-muted-foreground">{i + 1}</span>
                    {m.name}
                  </span>
                  <span className={cn("font-semibold tabular-nums", scoreColor(m.overall))}>
                    {formatScore(m.overall)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Most improved</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {improved.filter((u) => u.delta > 0).length === 0 ? (
              <p className="text-sm text-muted-foreground">No upward trends yet.</p>
            ) : (
              improved
                .filter((u) => u.delta > 0)
                .slice(0, 5)
                .map((u) => (
                  <div key={u.userId} className="flex items-center justify-between text-sm">
                    <span>{u.name}</span>
                    <span className="flex items-center gap-1 font-medium text-green-600 dark:text-green-400">
                      <TrendingUp className="h-3.5 w-3.5" /> +{u.delta}
                    </span>
                  </div>
                ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-red-600" /> Risk areas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {riskAreas.length === 0 ? (
              <p className="text-sm text-muted-foreground">No competencies below 60.</p>
            ) : (
              riskAreas.map((c) => (
                <div key={c.name} className="flex items-center justify-between text-sm">
                  <span>{c.name}</span>
                  <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">
                    {formatScore(c.score)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time-to-resolution by scenario type</CardTitle>
          <CardDescription>Which scenario types take longest to resolve.</CardDescription>
        </CardHeader>
        <CardContent>
          <SimpleBar data={ttrTypeData} xKey="label" barKey="minutes" unit="m" color="hsl(var(--chart-5))" />
        </CardContent>
      </Card>

      <DrillCompare
        drills={analytics.map((d) => ({
          id: d.id,
          name: d.name,
          composite: d.composite,
          ttrMins: d.ttrMins,
          events: d.events,
          byCompetency: d.byCompetency,
        }))}
        competencies={competencies.map((c) => c.name)}
      />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function QuarterCard({ thisQ, prevQ }: { thisQ: number | null; prevQ: number | null }) {
  const delta = thisQ != null && prevQ != null ? thisQ - prevQ : null;
  const Icon = delta == null || Math.abs(delta) < 1 ? Minus : delta > 0 ? TrendingUp : TrendingDown;
  const color =
    delta == null || Math.abs(delta) < 1
      ? "text-muted-foreground"
      : delta > 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardDescription>This quarter vs. last</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{thisQ == null ? "—" : thisQ}</span>
          <span className={cn("flex items-center gap-0.5 text-sm font-medium", color)}>
            <Icon className="h-4 w-4" />
            {delta == null ? "" : `${delta > 0 ? "+" : ""}${Math.round(delta)}`}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {prevQ == null ? "No prior quarter" : `Last quarter: ${prevQ}`}
        </p>
      </CardContent>
    </Card>
  );
}
