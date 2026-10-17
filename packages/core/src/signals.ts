import { asc, db, drillSignals, eq } from "@drillforce/db";
import {
  SIGNAL_KINDS,
  SIGNAL_PATTERNS,
  describeSignal,
  planTotals,
  signalTotals,
  type SignalPlan,
} from "@drillforce/shared";
import { z } from "zod";
import type { Ctx } from "./context";
import { loadOwnedDrill } from "./drill-writes";
import { badRequest } from "./errors";
import { flatten } from "./validation";

/**
 * A drill's injection matrix (drill_signals). Planned while the drill is a draft or scheduled;
 * executed by the injection engine once a responder clicks Execute.
 */

const EDITABLE = ["draft", "scheduled", "briefing"];

export const signalPlanInput = z.object({
  kind: z.enum(SIGNAL_KINDS),
  service: z.string().trim().min(1).max(80),
  ratePerMinute: z.number().int().min(1).max(100_000),
  failuresPerMinute: z.number().int().min(0).max(100_000),
  durationMinutes: z.number().int().min(1).max(240),
  startOffsetMinutes: z.number().int().min(0).max(240),
  pattern: z.enum(SIGNAL_PATTERNS),
  params: z
    .object({
      statusCode: z.number().int().min(100).max(599).optional(),
      endpoint: z.string().max(200).optional(),
      latencyMs: z.number().int().min(1).max(600_000).optional(),
      dbName: z.string().max(80).optional(),
      errorMessage: z.string().max(500).optional(),
      poolSize: z.number().int().min(1).max(100_000).optional(),
      lagSeconds: z.number().min(0).max(86_400).optional(),
      monitorName: z.string().max(200).optional(),
      priority: z.string().max(10).optional(),
    })
    .strict()
    .default({}),
});
export const signalMatrixInput = z
  .array(signalPlanInput)
  .max(20)
  .superRefine((plans, ctx) =>
    plans.forEach((p, i) => {
      if (p.failuresPerMinute > p.ratePerMinute) {
        ctx.addIssue({ code: "custom", path: [i, "failuresPerMinute"], message: "Failures per minute can't exceed the rate." });
      }
    }),
  );
export type SignalPlanInput = z.input<typeof signalPlanInput>;

type Row = typeof drillSignals.$inferSelect;

function toPlan(row: Row): SignalPlan {
  return {
    kind: row.kind,
    service: row.service,
    ratePerMinute: row.ratePerMinute,
    failuresPerMinute: row.failuresPerMinute,
    durationMinutes: row.durationMinutes,
    startOffsetMinutes: row.startOffsetMinutes,
    pattern: row.pattern,
    params: row.params,
  };
}

/** A signal row plus what it means: the plain-English line and the expected telemetry. */
function present(row: Row) {
  const plan = toPlan(row);
  return { ...row, description: describeSignal(plan), expected: signalTotals(plan) };
}

export async function listDrillSignals(ctx: Ctx, drillId: string) {
  await loadOwnedDrill(ctx, drillId);
  const rows = await db.select().from(drillSignals).where(eq(drillSignals.drillId, drillId)).orderBy(asc(drillSignals.sortOrder));
  return rows.map(present);
}

/** The preparation view: every stream described, plus totals and how long injection runs. */
export async function getInjectionPlan(ctx: Ctx, drillId: string) {
  const signals = await listDrillSignals(ctx, drillId);
  const plans = signals.map(toPlan);
  const runsForMinutes = plans.reduce((m, p) => Math.max(m, p.startOffsetMinutes + p.durationMinutes), 0);
  return { signals, totals: planTotals(plans), runsForMinutes };
}

/** Replace the whole matrix (the planner saves it as one document). */
export async function replaceDrillSignals(ctx: Ctx, drillId: string, raw: unknown) {
  const parsed = signalMatrixInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, flatten(parsed.error));
  const drill = await loadOwnedDrill(ctx, drillId);
  if (!EDITABLE.includes(drill.status)) {
    throw badRequest("Signals can only be changed while the drill is being planned or prepared.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(drillSignals).where(eq(drillSignals.drillId, drillId));
    if (parsed.data.length) {
      await tx.insert(drillSignals).values(parsed.data.map((p, i) => ({ ...p, drillId, sortOrder: i })));
    }
  });
  return listDrillSignals(ctx, drillId);
}

/** Copy a template's default matrix onto a new drill (called inside createDrill's transaction). */
export async function seedSignalsFromTemplate(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  drillId: string,
  plans: SignalPlan[] | undefined,
) {
  if (!plans?.length) return;
  await tx.insert(drillSignals).values(plans.map((p, i) => ({ ...p, drillId, sortOrder: i })));
}

export { toPlan as signalRowToPlan };
