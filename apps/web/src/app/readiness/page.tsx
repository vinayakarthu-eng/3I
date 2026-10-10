import { CompetencyLineChart } from "@/components/readiness/competency-line-chart";
import { PeriodTabs } from "@/components/readiness/period-tabs";
import { BAND_CLASSES, SkillBadge } from "@/components/readiness/skill-badge";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatDate, formatScore, scoreColor } from "@/lib/format";
import { listCompetencyAreas } from "@/lib/queries";
import {
  getReadinessMembers,
  getReadinessOverview,
  getTeamCompetencyTrend,
  periodSince,
  type ReadinessPeriod,
} from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { scoreBand } from "@drillforce/shared";
import { Activity, Gauge, LayoutGrid, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Readiness" };

const PERIODS: ReadinessPeriod[] = ["7d", "30d", "90d", "all"];

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: { period?: string };
}) {
  const { org } = await getCurrentUser();
  const period = (PERIODS as string[]).includes(searchParams.period ?? "")
    ? (searchParams.period as ReadinessPeriod)
    : "30d";
  const since = periodSince(period);

  const competencies = await listCompetencyAreas();
  const [members, overview, trend] = await Promise.all([
    getReadinessMembers(org.id, since),
    getReadinessOverview(org.id, since, competencies.length),
    getTeamCompetencyTrend(org.id, since),
  ]);

  // Pivot the trend rows into one chart point per drill.
  const points = new Map<string, Record<string, string | number>>();
  for (const r of trend) {
    const p = points.get(r.drillId) ?? { label: formatDate(r.at), name: r.name };
    p[r.compName] = r.score;
    points.set(r.drillId, p);
  }
  const trendData = [...points.values()];

  const cards = [
    { label: "Drills Run", value: String(overview.totalDrills), icon: Activity },
    {
      label: "Average Score",
      value: formatScore(overview.avgScore),
      icon: Gauge,
      className: scoreColor(overview.avgScore),
    },
    { label: "Team Members Active", value: String(overview.activeMembers), icon: Users },
    { label: "Competency Coverage", value: `${overview.competencyCoverage}%`, icon: LayoutGrid },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Team Readiness"
        description="Competency performance across your team, with per-member skill levels."
        actions={<PeriodTabs current={period} />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, className }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-sm font-medium">{label}</CardDescription>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-semibold tabular-nums", className)}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Readiness heatmap</CardTitle>
          <CardDescription>
            Average competency scores per member. Click a member to see their profile.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <div className="rounded-lg border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
              No scored drills with participants in this period.
            </div>
          ) : (
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[720px] border-separate border-spacing-1 text-sm">
                <thead>
                  <tr className="text-left">
                    <th className="px-2 py-1 font-medium">Member</th>
                    {competencies.map((c) => (
                      <th
                        key={c.id}
                        className="px-2 py-1 text-center text-xs font-medium text-muted-foreground"
                      >
                        {c.name}
                      </th>
                    ))}
                    <th className="px-2 py-1 text-center font-medium">Overall</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr key={m.userId}>
                      <td className="px-2 py-1">
                        <Link
                          href={`/readiness/${m.userId}`}
                          className="font-medium hover:underline"
                        >
                          {m.name}
                        </Link>
                        <span className="block text-xs capitalize text-muted-foreground">
                          {m.role.replace(/_/g, " ")}
                        </span>
                      </td>
                      {competencies.map((c) => {
                        const cell = m.byCompetency[c.id];
                        const band = scoreBand(cell?.score ?? null);
                        return (
                          <td key={c.id} className="p-0">
                            <Link
                              href={`/readiness/${m.userId}`}
                              className={cn(
                                "flex h-10 items-center justify-center rounded font-semibold tabular-nums transition-opacity hover:opacity-80",
                                BAND_CLASSES[band],
                              )}
                              title={cell ? `${cell.drills} drill(s)` : "Not assessed"}
                            >
                              {cell ? Math.round(cell.score) : "—"}
                            </Link>
                          </td>
                        );
                      })}
                      <td className="px-2 py-1 text-center">
                        <SkillBadge score={m.overall} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team competency trends</CardTitle>
          <CardDescription>Team average per competency across scored drills over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <CompetencyLineChart data={trendData} competencies={competencies.map((c) => c.name)} />
        </CardContent>
      </Card>
    </div>
  );
}
