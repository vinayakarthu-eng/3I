import { PageHeader } from "@/components/layout/page-header";
import { CompetencyLineChart } from "@/components/readiness/competency-line-chart";
import { CompetencyRadar } from "@/components/readiness/competency-radar";
import { SkillBadge } from "@/components/readiness/skill-badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { listUserCertifications } from "@/lib/certifications";
import { getCurrentUser } from "@/lib/current-user";
import { formatDate, formatScore, initials, scoreColor } from "@/lib/format";
import { listCompetencyAreas } from "@/lib/queries";
import { getUserReadiness } from "@/lib/readiness";
import { cn } from "@/lib/utils";
import { PARTICIPANT_ROLE_LABELS, type ParticipantRole } from "@drillforce/shared";
import { ArrowLeft, Award, TrendingDown, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { userId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const data = await getUserReadiness(org.id, params.userId);
  return { title: data ? `${data.user.name} · Readiness` : "Member not found" };
}

export default async function UserReadinessPage({ params }: Props) {
  const { org } = await getCurrentUser();
  const [data, competencies, certs] = await Promise.all([
    getUserReadiness(org.id, params.userId),
    listCompetencyAreas(),
    listUserCertifications(params.userId),
  ]);
  if (!data) notFound();

  const { user, drills, byCompetency } = data;
  const compNames = competencies.map((c) => c.name);

  const radarData = compNames
    .filter((n) => byCompetency[n])
    .map((n) => ({ name: n, score: Math.round(byCompetency[n].score) }));

  // Strengths & gaps (top/bottom 2 by score).
  const ranked = compNames
    .filter((n) => byCompetency[n])
    .map((n) => ({ name: n, score: byCompetency[n].score }))
    .sort((a, b) => b.score - a.score);
  const strengths = ranked.slice(0, 2);
  const gaps = [...ranked].reverse().slice(0, 2);

  // Trend: chronological drill points keyed by competency.
  const trendData = [...drills]
    .reverse()
    .map((d) => ({ label: formatDate(d.at), ...d.byCompetency }));

  return (
    <div className="space-y-8">
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
        <Link href="/readiness">
          <ArrowLeft className="h-4 w-4" />
          Team readiness
        </Link>
      </Button>

      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarFallback>{initials(user.name)}</AvatarFallback>
            </Avatar>
            {user.name}
          </span>
        }
        description={
          <span className="capitalize">
            {user.role.replace(/_/g, " ")} · {drills.length} drill
            {drills.length === 1 ? "" : "s"} participated
          </span>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-0">
            <CardTitle className="text-base">Competency profile</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <CompetencyRadar data={radarData} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4 text-green-600" /> Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {strengths.length ? (
                strengths.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span>{s.name}</span>
                    <span className={cn("font-semibold tabular-nums", scoreColor(s.score))}>
                      {formatScore(s.score)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingDown className="h-4 w-4 text-red-600" /> Gaps
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {gaps.length ? (
                gaps.map((s) => (
                  <div key={s.name} className="flex items-center justify-between text-sm">
                    <span>{s.name}</span>
                    <span className={cn("font-semibold tabular-nums", scoreColor(s.score))}>
                      {formatScore(s.score)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No data yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Skill levels</CardTitle>
          <CardDescription>Aggregate skill level per competency across all drills.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {competencies.map((c) => {
            const stat = byCompetency[c.name];
            return (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {stat ? `${formatScore(stat.score)} · ${stat.drills} drill(s)` : "Not assessed"}
                  </p>
                </div>
                <SkillBadge score={stat?.score ?? null} />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {certs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Certifications</CardTitle>
            <CardDescription>Certifications this member has earned.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            {certs.map((c) => (
              <Link
                key={c.id}
                href={`/certifications/${c.certificationId}/${user.id}`}
                className="flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <Award className="h-4 w-4 text-amber-500" />
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{formatDate(c.earnedAt)}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drill history</CardTitle>
        </CardHeader>
        <CardContent>
          {drills.length === 0 ? (
            <p className="text-sm text-muted-foreground">No drills yet.</p>
          ) : (
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Drill</th>
                    <th className="px-3 py-2 font-medium">Role</th>
                    <th className="px-3 py-2 font-medium">Date</th>
                    {compNames.map((n) => (
                      <th key={n} className="px-3 py-2 text-center font-medium">
                        {n.split(" ")[0]}
                      </th>
                    ))}
                    <th className="px-3 py-2 text-center font-medium">Composite</th>
                  </tr>
                </thead>
                <tbody>
                  {drills.map((d) => (
                    <tr key={d.drillId} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/drills/${d.drillId}`} className="font-medium hover:underline">
                          {d.name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {PARTICIPANT_ROLE_LABELS[d.role as ParticipantRole] ?? d.role}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(d.at)}</td>
                      {compNames.map((n) => {
                        const v = d.byCompetency[n];
                        return (
                          <td
                            key={n}
                            className={cn(
                              "px-3 py-2 text-center tabular-nums",
                              v != null ? scoreColor(v) : "text-muted-foreground",
                            )}
                          >
                            {v == null ? "—" : Math.round(v)}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center">
                        <span className={cn("font-semibold tabular-nums", scoreColor(d.composite))}>
                          {formatScore(d.composite)}
                        </span>
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
          <CardTitle className="text-base">Competency trend</CardTitle>
          <CardDescription>This member’s competency scores over time.</CardDescription>
        </CardHeader>
        <CardContent>
          <CompetencyLineChart data={trendData} competencies={compNames} />
        </CardContent>
      </Card>
    </div>
  );
}
