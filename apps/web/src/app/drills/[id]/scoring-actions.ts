"use server";

import type { ActionResult } from "@/app/drills/actions";
import { evaluateCertifications } from "@/lib/certifications";
import { evaluateCompliance } from "@/lib/compliance";
import { getCurrentUser } from "@/lib/current-user";
import { and, db, drills, eq } from "@drillforce/db";
import { autoScoreDrill, recordManualScores } from "@drillforce/scoring-engine";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const manualSchema = z.array(
  z.object({
    objectiveId: z.string().uuid(),
    notes: z.string().max(5000).optional(),
    ratings: z
      .array(
        z.object({
          dimension: z.string().min(1),
          rating: z.number().int().min(1),
          scale: z.number().int().min(2).max(10),
        }),
      )
      .optional()
      .refine((rs) => !rs || rs.every((r) => r.rating <= r.scale), "Rating exceeds its scale"),
    verdict: z.enum(["correct", "partial", "incorrect"]).optional(),
  }),
);

async function scorableDrill(drillId: string) {
  const { user, org } = await getCurrentUser();
  if (!z.string().uuid().safeParse(drillId).success) return null;
  const [drill] = await db
    .select()
    .from(drills)
    .where(and(eq(drills.id, drillId), eq(drills.orgId, org.id)));
  return drill ? { drill, user } : null;
}

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/drills");
  revalidatePath("/");
}

export async function submitManualScores(
  drillId: string,
  input: z.input<typeof manualSchema>,
): Promise<ActionResult<{ finalized: boolean; composite: number | null }>> {
  const parsed = manualSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const ctx = await scorableDrill(drillId);
  if (!ctx) return { ok: false, error: "Drill not found." };
  if (ctx.drill.status !== "scoring" && ctx.drill.status !== "debriefing") {
    return { ok: false, error: "Scores can only be submitted while the drill is in Scoring or Debriefing." };
  }
  try {
    const result = await recordManualScores(drillId, ctx.user.id, parsed.data);
    if (result) {
      await evaluateCertifications(ctx.drill.orgId);
      await evaluateCompliance(ctx.drill.orgId, drillId);
    }
    refresh(drillId);
    return { ok: true, data: { finalized: !!result, composite: result?.composite ?? null } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export async function rerunAutoScoring(drillId: string): Promise<ActionResult<{ scored: number }>> {
  const ctx = await scorableDrill(drillId);
  if (!ctx) return { ok: false, error: "Drill not found." };
  if (!["scoring", "debriefing", "completed"].includes(ctx.drill.status)) {
    return { ok: false, error: "Auto-scoring runs once the drill has ended." };
  }
  try {
    const result = await autoScoreDrill(drillId);
    if (result.finalized) {
      await evaluateCertifications(ctx.drill.orgId);
      await evaluateCompliance(ctx.drill.orgId, drillId);
    }
    refresh(drillId);
    return { ok: true, data: { scored: result.scored } };
  } catch (err) {
    console.error("rerunAutoScoring failed", err);
    return { ok: false, error: "Auto-scoring failed. Check the server logs." };
  }
}
