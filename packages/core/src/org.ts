import { asc, competencyAreas, db, desc, drills, eq, improvementActions, users } from "@drillforce/db";
import type { Ctx } from "./context";

/** The six competency areas (global catalog). */
export async function listCompetencyAreas() {
  return db.select().from(competencyAreas).orderBy(asc(competencyAreas.sortOrder));
}

/** Improvement actions across the org's drills. */
export async function listImprovementActions(ctx: Ctx) {
  return db
    .select({
      action: improvementActions,
      drill: { id: drills.id, name: drills.name },
      owner: { id: users.id, name: users.name },
    })
    .from(improvementActions)
    .innerJoin(drills, eq(drills.id, improvementActions.drillId))
    .leftJoin(users, eq(users.id, improvementActions.ownerId))
    .where(eq(drills.orgId, ctx.orgId))
    .orderBy(asc(improvementActions.dueDate), desc(improvementActions.createdAt));
}
