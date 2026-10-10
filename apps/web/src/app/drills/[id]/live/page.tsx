import type { ChatMessage } from "@/app/drills/[id]/simulate/actions";
import { WarRoom, type InjectItem, type LiveConfig } from "@/components/drills/simulate/war-room";
import { getCurrentUser } from "@/lib/current-user";
import { getDrill, listDrillInjects } from "@/lib/queries";
import { SCENARIO_TYPES, type ScenarioType } from "@drillforce/shared";
import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill ? `Live · ${drill.name}` : "Drill not found" };
}

export default async function LivePage({ params }: Props) {
  const { user, org } = await getCurrentUser();
  const [drill, injects] = await Promise.all([
    getDrill(org.id, params.id),
    listDrillInjects(params.id),
  ]);
  if (!drill) notFound();

  // Before execution the briefing page owns the flow; after it, the report does.
  if (drill.status === "briefing") redirect(`/drills/${params.id}/briefing`);
  if (["scoring", "debriefing", "completed"].includes(drill.status)) {
    redirect(`/drills/${params.id}/complete`);
  }

  const scenarioType: ScenarioType = SCENARIO_TYPES.includes(
    drill.scenario?.scenarioType as ScenarioType,
  )
    ? (drill.scenario!.scenarioType as ScenarioType)
    : "generic";

  const injectItems: InjectItem[] = injects.map((i) => ({
    id: i.id,
    description: i.description,
    triggerAtMinutes: i.triggerAtMinutes,
    injectType: i.injectType,
    payload: i.payload ?? {},
    fired: i.fired,
  }));

  const initialMessages: ChatMessage[] = drill.events
    .filter((e) => e.eventType === "message" || e.eventType === "inject")
    .map((e) => ({
      id: e.id,
      actor: e.actor,
      actorName: e.actor ? (drill.actorNames[e.actor] ?? "Participant") : "Scenario Control",
      text: String((e.payload as { text?: string })?.text ?? ""),
      kind: e.eventType === "inject" ? ("inject" as const) : ("message" as const),
      occurredAt: new Date(e.occurredAt).toISOString(),
    }))
    .filter((m) => m.text.length > 0);

  const participant = drill.participants.find((p) => p.user.id === user.id);
  const role = participant?.role ?? "responder";
  const isIC = role === "incident_commander" || drill.createdBy === user.id;

  const live: LiveConfig = {
    isIC,
    role,
    objectives: drill.objectives.map((o) => ({ id: o.id, description: o.description })),
  };

  return (
    <WarRoom
      drillId={drill.id}
      scenarioType={scenarioType}
      severity={drill.scenario?.severity ?? "SEV-1"}
      scenarioSummary={drill.scenario?.summary ?? drill.name}
      injects={injectItems}
      initialMessages={initialMessages}
      currentUser={{ id: user.id, name: user.name }}
      live={live}
    />
  );
}
