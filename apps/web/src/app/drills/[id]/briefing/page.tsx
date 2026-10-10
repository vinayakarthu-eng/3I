import { BriefingPanel } from "@/components/drills/briefing/briefing-panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { getDrill } from "@/lib/queries";
import { CRITERIA_TYPE_LABELS } from "@drillforce/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill ? `Briefing · ${drill.name}` : "Drill not found" };
}

const RULES_OF_ENGAGEMENT = [
  "Treat the simulation as a real incident — communicate as you normally would.",
  "The Incident Commander owns decisions and delegation; everyone else follows IC direction.",
  "Observers and evaluators do not intervene; they record observations.",
  "Injects arrive automatically — react to them as new information.",
];

export default async function BriefingPage({ params }: Props) {
  const { user, org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  if (!drill) notFound();

  if (drill.status === "active") redirect(`/drills/${params.id}/live`);
  if (["scoring", "debriefing", "completed"].includes(drill.status)) {
    redirect(`/drills/${params.id}/complete`);
  }

  const readyIds = new Set(((drill.config.ready as string[]) ?? []).filter(Boolean));
  const participants = drill.participants.map((p) => ({
    userId: p.user.id,
    name: p.user.name,
    role: p.role,
    ready: readyIds.has(p.user.id),
  }));
  const isIC =
    drill.participants.some((p) => p.user.id === user.id && p.role === "incident_commander") ||
    drill.createdBy === user.id;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
        <Link href={`/drills/${drill.id}`}>
          <ArrowLeft className="h-4 w-4" />
          {drill.name}
        </Link>
      </Button>

      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Pre-drill briefing</p>
        <h1 className="text-2xl font-semibold tracking-tight">{drill.name}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scenario</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {drill.scenario?.summary ?? drill.description ?? "No scenario description provided."}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Objectives</CardTitle>
              <CardDescription>What this drill will evaluate.</CardDescription>
            </CardHeader>
            <CardContent>
              {drill.objectives.length === 0 ? (
                <p className="text-sm text-muted-foreground">No objectives defined.</p>
              ) : (
                <ol className="space-y-2">
                  {drill.objectives.map((o, i) => (
                    <li key={o.id} className="flex gap-3 text-sm">
                      <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                      <span className="flex-1">{o.description}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {CRITERIA_TYPE_LABELS[o.criteriaType]}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rules of engagement</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm text-muted-foreground">
                {RULES_OF_ENGAGEMENT.map((r) => (
                  <li key={r} className="flex gap-2">
                    <span className="text-foreground">•</span>
                    {r}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-6 lg:self-start">
          <CardHeader>
            <CardTitle className="text-base">Roster &amp; readiness</CardTitle>
            <CardDescription>Everyone marks ready, then the IC starts the drill.</CardDescription>
          </CardHeader>
          <CardContent>
            <BriefingPanel
              drillId={drill.id}
              status={drill.status}
              participants={participants}
              currentUserId={user.id}
              isIC={isIC}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
