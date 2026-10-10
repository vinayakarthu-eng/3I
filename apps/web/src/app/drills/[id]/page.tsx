import { DrillHeader } from "@/components/drills/detail/drill-header";
import { EventsTab } from "@/components/drills/detail/events-tab";
import { ObjectivesTab } from "@/components/drills/detail/objectives-tab";
import { OverviewTab } from "@/components/drills/detail/overview-tab";
import { ParticipantsTab } from "@/components/drills/detail/participants-tab";
import { ScoresTab } from "@/components/drills/detail/scores-tab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import { getDrill, listOrgUsers } from "@/lib/queries";
import { ArrowLeft } from "lucide-react";
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
  const [drill, orgUsers] = await Promise.all([getDrill(org.id, params.id), listOrgUsers(org.id)]);
  if (!drill) notFound();

  const tab = TABS.includes(searchParams.tab as (typeof TABS)[number]) ? searchParams.tab! : "overview";

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
        <Link href="/drills">
          <ArrowLeft className="h-4 w-4" />
          All drills
        </Link>
      </Button>

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
          <ObjectivesTab drill={drill} />
        </TabsContent>
        <TabsContent value="participants">
          <ParticipantsTab drill={drill} orgUsers={orgUsers} />
        </TabsContent>
        <TabsContent value="events">
          <EventsTab drill={drill} />
        </TabsContent>
        <TabsContent value="scores">
          <ScoresTab drill={drill} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
