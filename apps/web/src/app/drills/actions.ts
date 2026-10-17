"use server";

import { runCore } from "@/lib/core-action";
import { drillInputSchema, issuesToErrors, type DrillInput, type ParsedDrillInput } from "@/lib/drill-form";
import { createDrill as create, updateDrill as update } from "@drillforce/core";
import { revalidatePath } from "next/cache";

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

const SAVE_FAILED = "Something went wrong while saving the drill.";

/** Wizard values → the core drill payload (shared by create and update). */
function toCore(values: ParsedDrillInput) {
  return {
    name: values.name,
    type: values.type,
    sector: values.sector,
    description: values.description || undefined,
    scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : undefined,
    scenario: values.scenario ?? undefined,
    objectives: values.objectives.map((o) => ({
      id: o.id,
      description: o.description,
      criteriaType: o.criteriaType,
      targetValue: o.targetValue,
      weight: o.weight,
      competencyAreaId: o.competencyAreaId,
    })),
    participants: values.participants.map((p) => ({ email: p.email, name: p.name || undefined, role: p.role })),
  };
}

function parseForm(input: DrillInput) {
  const parsed = drillInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: { ok: false as const, error: "Please fix the highlighted fields.", fieldErrors: issuesToErrors(parsed.error) },
    };
  }
  return { values: parsed.data };
}

export async function createDrill(input: DrillInput): Promise<ActionResult<{ id: string }>> {
  const { values, error } = parseForm(input);
  if (error) return error;
  if (values.intent === "schedule" && !values.scheduledAt) {
    return {
      ok: false,
      error: "Pick a date and time to schedule this drill.",
      fieldErrors: { scheduledAt: "Required to schedule" },
    };
  }

  const { objectives, ...rest } = toCore(values);
  const result = await runCore(
    (ctx) =>
      create(ctx, {
        ...rest,
        objectives: objectives.map(({ id: _id, ...o }) => o),
        templateId: values.templateId ?? undefined,
        status: values.intent === "schedule" ? "scheduled" : "draft",
      }),
    SAVE_FAILED,
  );
  if (result.ok) {
    revalidatePath("/drills");
    revalidatePath("/");
  }
  return result;
}

export async function updateDrill(drillId: string, input: DrillInput): Promise<ActionResult<{ id: string }>> {
  const { values, error } = parseForm(input);
  if (error) return error;

  const status = values.intent === "draft" ? "draft" : values.intent === "schedule" ? "scheduled" : undefined;
  const result = await runCore((ctx) => update(ctx, drillId, { ...toCore(values), status }), SAVE_FAILED);
  if (result.ok) {
    revalidatePath("/drills");
    revalidatePath(`/drills/${drillId}`);
    revalidatePath("/");
  }
  return result;
}
