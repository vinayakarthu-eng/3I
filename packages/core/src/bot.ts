import {
  and,
  asc,
  count,
  db,
  desc,
  drillEvents,
  drillInjects,
  drillObjectives,
  drillParticipants,
  drills,
  eq,
  inArray,
  isNull,
  sql,
  users,
  type Drill,
} from "@drillforce/db";
import type { EventType } from "@drillforce/shared";
import type { Ctx } from "./context";

/**
 * System-level operations for trusted in-process integrations (the Slack IC bot). Unlike the
 * rest of core these aren't org-scoped by a caller's key: the bot serves every org and finds
 * drills by id/channel. Org-scoped writes (status, injects) still go through the normal
 * operations, using `actingCtx` for the drill's org.
 */

/** A Ctx for acting on `drill`: as `userId` when they're an org member, else the drill's creator / an org admin. */
export async function actingCtx(drill: Drill, userId?: string | null): Promise<Ctx> {
  if (userId && /^[0-9a-f-]{36}$/i.test(userId)) {
    const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), eq(users.orgId, drill.orgId)));
    if (u) return { orgId: drill.orgId, userId: u.id };
  }
  if (drill.createdBy) return { orgId: drill.orgId, userId: drill.createdBy };
  const [admin] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.orgId, drill.orgId), eq(users.role, "admin")))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!admin) throw new Error(`Organization ${drill.orgId} has no admin to act as.`);
  return { orgId: drill.orgId, userId: admin.id };
}

/** Accepts a full UUID or a unique prefix of at least 6 characters. */
export async function findDrillByIdPrefix(idOrPrefix: string): Promise<Drill | "ambiguous" | null> {
  const id = idOrPrefix.toLowerCase();
  if (!/^[0-9a-f-]{6,36}$/.test(id)) return null;
  const rows = await db
    .select()
    .from(drills)
    .where(sql`${drills.id}::text like ${id + "%"}`)
    .limit(2);
  if (rows.length > 1) return "ambiguous";
  return rows[0] ?? null;
}

export async function getDrillById(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [drill] = await db.select().from(drills).where(eq(drills.id, id));
  return drill ?? null;
}

export async function listActiveDrills() {
  return db.select().from(drills).where(eq(drills.status, "active"));
}

export async function listDrillObjectives(drillId: string) {
  return db
    .select()
    .from(drillObjectives)
    .where(eq(drillObjectives.drillId, drillId))
    .orderBy(asc(drillObjectives.sortOrder));
}

export async function listDrillParticipantContacts(drillId: string) {
  return db
    .select({ id: drillParticipants.id, role: drillParticipants.role, name: users.name, email: users.email })
    .from(drillParticipants)
    .innerJoin(users, eq(users.id, drillParticipants.userId))
    .where(eq(drillParticipants.drillId, drillId));
}

/** What a session needs on (re)attach: texts of injects already posted, and timed injects still pending. */
export async function getInjectState(drillId: string) {
  const [posted, pending] = await Promise.all([
    db
      .select({ payload: drillEvents.payload })
      .from(drillEvents)
      .where(and(eq(drillEvents.drillId, drillId), eq(drillEvents.eventType, "inject"))),
    db
      .select()
      .from(drillInjects)
      .where(and(eq(drillInjects.drillId, drillId), eq(drillInjects.fired, false)))
      .orderBy(asc(drillInjects.triggerAtMinutes), asc(drillInjects.sortOrder)),
  ]);
  return { postedTexts: new Set(posted.map((p) => String(p.payload.text ?? ""))), pending };
}

export async function getDrillEventStats(drillId: string) {
  const byType = await db
    .select({ type: drillEvents.eventType, value: count() })
    .from(drillEvents)
    .where(eq(drillEvents.drillId, drillId))
    .groupBy(drillEvents.eventType);
  return { total: byType.reduce((a, r) => a + r.value, 0), byType };
}

/** Recent message/inject events, oldest first, with org-member actors resolved to names. */
export async function getRecentTranscript(drillId: string, limit = 40) {
  const rows = await db
    .select()
    .from(drillEvents)
    .where(and(eq(drillEvents.drillId, drillId), inArray(drillEvents.eventType, ["message", "inject"])))
    .orderBy(desc(drillEvents.occurredAt))
    .limit(limit);
  rows.reverse();

  const userIds = [...new Set(rows.map((r) => r.actor).filter((a): a is string => !!a && /^[0-9a-f-]{36}$/.test(a)))];
  const names = new Map<string, string>();
  if (userIds.length) {
    for (const u of await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds))) {
      names.set(u.id, u.name);
    }
  }
  return rows.map((r) => ({ ...r, actorName: names.get(r.actor ?? "") ?? null }));
}

/** Append a raw event (any type, any actor) — for trusted integrations only. */
export async function logDrillEvent(input: {
  drillId: string;
  eventType: EventType;
  actor: string;
  channel?: string;
  payload: Record<string, unknown>;
  occurredAt?: Date;
}) {
  await db.insert(drillEvents).values({
    drillId: input.drillId,
    eventType: input.eventType,
    actor: input.actor,
    channel: input.channel ?? null,
    payload: input.payload,
    occurredAt: input.occurredAt ?? new Date(),
  });
}

export async function findUserByEmail(email: string) {
  const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
  return user ?? null;
}

export async function markParticipantJoined(drillId: string, userId: string) {
  await db
    .update(drillParticipants)
    .set({ joinedAt: new Date() })
    .where(
      and(
        eq(drillParticipants.drillId, drillId),
        eq(drillParticipants.userId, userId),
        isNull(drillParticipants.joinedAt),
      ),
    );
}
