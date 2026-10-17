import { DrillHeader } from "@/components/drills/detail/drill-header";
import { DrillLifecycle, type LifecycleProps } from "@/components/drills/lifecycle/drill-lifecycle";
import { InjectionMatrix } from "@/components/drills/lifecycle/injection-matrix";
import { EventsTab } from "@/components/drills/detail/events-tab";
import { ObjectivesTab } from "@/components/drills/detail/objectives-tab";
import { OverviewTab } from "@/components/drills/detail/overview-tab";
import { ParticipantsTab } from "@/components/drills/detail/participants-tab";
import { ScoresTab } from "@/components/drills/detail/scores-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import { lifecycleStages } from "@/lib/lifecycle";
import { signalRowToPlan, telemetrySink, warRoomConfigured } from "@drillforce/core";
import {
  getDrill,
  getDrillCompetencyStats,
  getInjectionPlan,
  getScoreTrend,
  listCompetencyAreas,
  listOrgUsers,
} from "@/lib/queries";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { id: string }; searchParams: { tab?: string } };

const TABS = ["overview", "objectives", "injection", "participants", "events", "scores"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill?.name ?? "Drill not found" };
}

export default async function DrillDetailPage({ params, searchParams }: Props) {
  const { org } = await getCurrentUser();
  const [drill, orgUsers, trend, competencyStats, competencyAreas, plan] = await Promise.all([
    getDrill(org.id, params.id),
    listOrgUsers(org.id),
    getScoreTrend(org.id),
    getDrillCompetencyStats(org.id, params.id),
    listCompetencyAreas(),
    getInjectionPlan(params.id),
  ]);
  if (!drill) notFound();

  const config = drill.config as {
    execution?: LifecycleProps["execution"];
    slack?: { channelName?: string; url?: string | null; mode?: "live" | "simulator" };
    scoring?: { dueAt?: string; agentScoredAt?: string };
  };
  const lifecycle: LifecycleProps = {
    drillId: drill.id,
    status: drill.status,
    stages: lifecycleStages(drill),
    scheduledAt: drill.scheduledAt?.toISOString() ?? null,
    objectives: drill.objectives.length,
    isMonitoring: !!drill.scenario?.monitoringDomain || (plan?.signals.length ?? 0) > 0,
    signals: (plan?.signals ?? []).map((s) => ({
      id: s.id,
      kind: s.kind,
      service: s.service,
      description: s.description,
      status: s.status,
      expected: s.expected,
      stats: s.stats,
      lastError: s.lastError,
    })),
    totals: plan?.totals ?? { volume: 0, failures: 0, spans: 0, logs: 0, metricPoints: 0, events: 0 },
    runsForMinutes: plan?.runsForMinutes ?? 0,
    sink: telemetrySink(),
    warRoomReady: warRoomConfigured(),
    startedAt: drill.startedAt?.toISOString() ?? null,
    endedAt: drill.endedAt?.toISOString() ?? null,
    execution: config.execution ?? null,
    slack: config.slack?.channelName
      ? { channelName: config.slack.channelName, url: config.slack.url ?? null, mode: config.slack.mode ?? "live" }
      : null,
    scoringDueAt: config.scoring?.dueAt && !config.scoring.agentScoredAt ? config.scoring.dueAt : null,
    score: drill.score,
  };
  const editableSignals = ["draft", "scheduled", "briefing"].includes(drill.status);

  const tab = TABS.includes(searchParams.tab as (typeof TABS)[number]) ? searchParams.tab! : "overview";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link href="/drills">
            <ArrowLeft className="h-4 w-4" />
            All drills
          </Link>
        </Button>
        {drill.status === "briefing" && (
          <Button asChild size="sm">
            <Link href={`/drills/${drill.id}/briefing`}>
              <MonitorPlay className="h-4 w-4" />
              Open Briefing
            </Link>
          </Button>
        )}
        {drill.status === "active" && (
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/drills/${drill.id}/simulate`}>
                <MonitorPlay className="h-4 w-4" />
                Simulation
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/drills/${drill.id}/live`}>
                <MonitorPlay className="h-4 w-4" />
                Enter Live Drill
              </Link>
            </Button>
          </div>
        )}
      </div>

      <DrillHeader
        drill={{ id: drill.id, name: drill.name, type: drill.type, status: drill.status, score: drill.score }}
      />

      <DrillLifecycle {...lifecycle} />

      <Tabs defaultValue={tab} className="space-y-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="objectives">Objectives ({drill.objectives.length})</TabsTrigger>
            <TabsTrigger value="injection">Injection ({plan?.signals.length ?? 0})</TabsTrigger>
            <TabsTrigger value="participants">Participants ({drill.participants.length})</TabsTrigger>
            <TabsTrigger value="events">Events ({drill.events.length})</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab drill={drill} />
        </TabsContent>
        <TabsContent value="objectives">
          <ObjectivesTab
            drill={drill}
            competencyAreas={competencyAreas.map((a) => ({ id: a.id, name: a.name }))}
          />
        </TabsContent>
        <TabsContent value="injection">
          <InjectionMatrix
            key={(plan?.signals ?? []).map((s) => s.id).join(",")}
            drillId={drill.id}
            initial={(plan?.signals ?? []).map(signalRowToPlan)}
            editable={editableSignals}
          />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsTab drill={drill} orgUsers={orgUsers} />
        </TabsContent>
        <TabsContent value="events">
          <EventsTab drill={drill} />
        </TabsContent>
        <TabsContent value="scores">
          <ScoresTab drill={drill} trend={trend} competencyStats={competencyStats} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
