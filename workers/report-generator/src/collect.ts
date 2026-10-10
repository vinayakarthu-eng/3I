import {
  asc,
  db,
  drillComposites,
  drillEvents,
  drillObjectives,
  drillParticipants,
  drills,
  drillScores,
  eq,
  users,
} from "@drillforce/db";
import { DEFAULT_PASS_THRESHOLD } from "@drillforce/shared";

/** Everything the AAR needs about a drill, in one place. */
export async function collectDrillData(drillId: string) {
  const [drill] = await db.select().from(drills).where(eq(drills.id, drillId));
  if (!drill) throw new Error(`Drill ${drillId} not found`);

  const [objectives, events, scores, participants, [composite], orgUsers] = await Promise.all([
    db.select().from(drillObjectives).where(eq(drillObjectives.drillId, drillId)).orderBy(asc(drillObjectives.sortOrder)),
    db.select().from(drillEvents).where(eq(drillEvents.drillId, drillId)).orderBy(asc(drillEvents.occurredAt)),
    db.select().from(drillScores).where(eq(drillScores.drillId, drillId)).orderBy(asc(drillScores.scoredAt)),
    db
      .select({ userId: drillParticipants.userId, role: drillParticipants.role, name: users.name, email: users.email })
      .from(drillParticipants)
      .innerJoin(users, eq(users.id, drillParticipants.userId))
      .where(eq(drillParticipants.drillId, drillId)),
    db.select().from(drillComposites).where(eq(drillComposites.drillId, drillId)),
    db.select({ id: users.id, name: users.name }).from(users).where(eq(users.orgId, drill.orgId)),
  ]);

  const names = new Map<string, string>([
    ["bot", "IC Bot"],
    ["system", "System"],
    ["auto", "Auto-scorer"],
  ]);
  for (const u of orgUsers) names.set(u.id, u.name);
  const actorName = (a: string | null) => (a ? (names.get(a) ?? a.replace(/^slack:/, "Slack user ")) : "Unknown");

  // Latest score per objective.
  const latest = new Map<string, (typeof scores)[number]>();
  for (const s of scores) if (s.objectiveId) latest.set(s.objectiveId, s);

  const start = drill.startedAt ?? events[0]?.occurredAt ?? null;
  const tPlus = (d: Date) => (start ? Math.round((d.getTime() - start.getTime()) / 60000) : 0);
  const durationMinutes =
    drill.startedAt && drill.endedAt ? Math.round((drill.endedAt.getTime() - drill.startedAt.getTime()) / 60000) : null;

  return {
    drill,
    objectives,
    events,
    participants,
    latest,
    composite: composite ?? null,
    passThreshold: composite?.passThreshold ?? Number(drill.config.passThreshold ?? DEFAULT_PASS_THRESHOLD),
    durationMinutes,
    actorName,
    tPlus,
    /** Events during the drill itself (excludes planning-time status changes). */
    drillEvents: events.filter(
      (e) => !start || (e.occurredAt >= start && (!drill.endedAt || e.occurredAt <= drill.endedAt)),
    ),
  };
}

export type DrillData = Awaited<ReturnType<typeof collectDrillData>>;
