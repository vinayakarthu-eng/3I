import { DrillHeader } from "@/components/drills/detail/drill-header";
import { EventsTab } from "@/components/drills/detail/events-tab";
import { ObjectivesTab } from "@/components/drills/detail/objectives-tab";
import { OverviewTab } from "@/components/drills/detail/overview-tab";
import { ParticipantsTab } from "@/components/drills/detail/participants-tab";
import { ScoresTab } from "@/components/drills/detail/scores-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import {
  getDrill,
  getDrillCompetencyStats,
  getScoreTrend,
  listCompetencyAreas,
  listOrgUsers,
} from "@/lib/queries";
import { ArrowLeft, MonitorPlay } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { id: string }; searchParams: { tab?: string } };

const TABS = ["overview", "objectives", "participants", "events", "scores"] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill?.name ?? "Drill not found" };
}

export default async function DrillDetailPage({ params, searchParams }: Props) {
  const { org } = await getCurrentUser();
  const [drill, orgUsers, trend, competencyStats, competencyAreas] = await Promise.all([
    getDrill(org.id, params.id),
    listOrgUsers(org.id),
    getScoreTrend(org.id),
    getDrillCompetencyStats(org.id, params.id),
    listCompetencyAreas(),
  ]);
  if (!drill) notFound();

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
        {(drill.status === "active" || drill.status === "briefing") && (
          <Button asChild size="sm">
            <Link href={`/drills/${drill.id}/simulate`}>
              <MonitorPlay className="h-4 w-4" />
              Enter Simulation
            </Link>
          </Button>
        )}
      </div>

      <DrillHeader
        drill={{ id: drill.id, name: drill.name, type: drill.type, status: drill.status, score: drill.score }}
      />

      <Tabs defaultValue={tab} className="space-y-4">
        <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="objectives">Objectives ({drill.objectives.length})</TabsTrigger>
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
