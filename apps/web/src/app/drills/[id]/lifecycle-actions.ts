"use server";

import type { ActionResult } from "@/app/drills/actions";
import { discard, runCore } from "@/lib/core-action";
import {
  completeDrill,
  concludeDrill,
  executeDrill,
  replaceDrillSignals,
  scheduleDrill,
  type ExecutionRecord,
  type SignalPlanInput,
} from "@drillforce/core";
import { revalidatePath } from "next/cache";

function refresh(drillId: string) {
  revalidatePath(`/drills/${drillId}`);
  revalidatePath("/drills");
  revalidatePath("/");
}

async function step<T>(drillId: string, fn: Parameters<typeof runCore<T>>[0], fallback?: string) {
  const result = await runCore(fn, fallback);
  if (result.ok) refresh(drillId);
  return result;
}

export async function scheduleDrillAction(drillId: string): Promise<ActionResult> {
  return discard(await step(drillId, (ctx) => scheduleDrill(ctx, drillId)));
}

export async function executeDrillAction(drillId: string): Promise<ActionResult<ExecutionRecord>> {
  return step(drillId, (ctx) => executeDrill(ctx, drillId), "Couldn't execute the drill. Check the server logs.");
}

export async function concludeDrillAction(drillId: string): Promise<ActionResult> {
  return discard(await step(drillId, (ctx) => concludeDrill(ctx, drillId)));
}

export async function completeDrillAction(drillId: string): Promise<ActionResult> {
  return discard(await step(drillId, (ctx) => completeDrill(ctx, drillId)));
}

export async function saveSignalsAction(drillId: string, signals: SignalPlanInput[]): Promise<ActionResult> {
  return discard(await step(drillId, (ctx) => replaceDrillSignals(ctx, drillId, signals)));
}
