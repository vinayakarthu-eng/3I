import {
  CRITERIA_TYPES,
  DRILL_TYPES,
  PARTICIPANT_ROLES,
  SECTORS,
  type CriteriaType,
  type DrillScenario,
  type DrillType,
  type ParticipantRole,
  type Sector,
} from "@drillforce/shared";
import { z } from "zod";

/**
 * Shared shape + validation for the drill create/edit wizard.
 * Used on the client (per-step validation) and in server actions.
 */

export interface ObjectiveFormValue {
  /** Stable client key for React lists / drag-and-drop. */
  key: string;
  /** Present when editing an existing objective. */
  id?: string;
  description: string;
  criteriaType: CriteriaType;
  targetValue: Record<string, unknown>;
  weight: number;
}

export interface ParticipantFormValue {
  key: string;
  userId?: string;
  email: string;
  name: string;
  role: ParticipantRole;
}

export interface DrillFormValues {
  name: string;
  type: DrillType | "";
  sector: Sector;
  description: string;
  /** ISO string or empty. */
  scheduledAt: string;
  scenario: DrillScenario | null;
  templateId: string | null;
  objectives: ObjectiveFormValue[];
  participants: ParticipantFormValue[];
}

export function newKey() {
  return Math.random().toString(36).slice(2, 10);
}

export function defaultTargetFor(criteria: CriteriaType): Record<string, unknown> {
  switch (criteria) {
    case "time_to_action":
      return { max_minutes: 5 };
    case "completeness":
      return { checklist: [""] };
    case "quality":
      return { rubric: [{ dimension: "", scale: 5 }] };
    case "accuracy":
      return { expected_outcome: "" };
    case "coordination":
      return { stakeholders: [""] };
  }
}

export function emptyObjective(): ObjectiveFormValue {
  return {
    key: newKey(),
    description: "",
    criteriaType: "time_to_action",
    targetValue: defaultTargetFor("time_to_action"),
    weight: 1,
  };
}

// ─── schemas ────────────────────────────────────────────────────────────────

const nonEmptyList = (label: string) =>
  z
    .array(z.string().trim())
    .transform((items) => items.filter(Boolean))
    .refine((items) => items.length > 0, `Add at least one ${label}`);

const targetSchemas = {
  time_to_action: z.object({
    max_minutes: z.coerce
      .number({ invalid_type_error: "Enter a number of minutes" })
      .positive("Max minutes must be greater than 0")
      .max(24 * 60, "Max minutes must be under 24 hours"),
  }),
  completeness: z.object({ checklist: nonEmptyList("checklist item") }),
  quality: z.object({
    rubric: z
      .array(z.object({ dimension: z.string().trim(), scale: z.coerce.number().int().min(2).max(10) }))
      .transform((dims) => dims.filter((d) => d.dimension))
      .refine((dims) => dims.length > 0, "Add at least one rubric dimension"),
  }),
  accuracy: z.object({
    expected_outcome: z.string().trim().min(1, "Describe the expected outcome"),
  }),
  coordination: z.object({ stakeholders: nonEmptyList("stakeholder") }),
} satisfies Record<CriteriaType, z.ZodTypeAny>;

export const basicInfoSchema = z.object({
  name: z.string().trim().min(1, "Drill name is required").max(200),
  type: z.enum(DRILL_TYPES, { errorMap: () => ({ message: "Select a drill type" }) }),
  sector: z.enum(SECTORS),
  description: z.string().trim().max(5000).optional().default(""),
  scheduledAt: z
    .string()
    .optional()
    .default("")
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date and time"),
});

export const objectiveSchema = z
  .object({
    id: z.string().uuid().optional(),
    description: z.string().trim().min(1, "Description is required").max(1000),
    criteriaType: z.enum(CRITERIA_TYPES),
    competencyAreaId: z.string().uuid().nullable().optional(),
    targetValue: z.record(z.unknown()),
    weight: z.coerce.number().int().min(1).max(5),
  })
  .transform((o, ctx) => {
    const parsed = targetSchemas[o.criteriaType].safeParse(o.targetValue);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        ctx.addIssue({ ...issue, path: ["targetValue", ...issue.path] });
      }
      return z.NEVER;
    }
    return { ...o, targetValue: parsed.data as Record<string, unknown> };
  });

export const objectivesSchema = z
  .array(objectiveSchema)
  .min(1, "Add at least one objective");

export const participantSchema = z.object({
  userId: z.string().uuid().optional(),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  name: z.string().trim().max(200).optional().default(""),
  role: z.enum(PARTICIPANT_ROLES),
});

export const participantsSchema = z
  .array(participantSchema)
  .min(1, "Add at least one participant")
  .refine(
    (ps) => new Set(ps.map((p) => p.email)).size === ps.length,
    "Each participant can only be added once",
  );

export const drillInputSchema = basicInfoSchema.extend({
  scenario: z
    .object({
      summary: z.string().optional(),
      injects: z.array(z.object({ at_minute: z.number(), description: z.string() })).optional(),
      expected_actions: z.array(z.string()).optional(),
    })
    .nullable()
    .optional(),
  templateId: z.string().nullable().optional(),
  objectives: objectivesSchema,
  participants: participantsSchema,
  intent: z.enum(["draft", "schedule", "save"]),
});

export type DrillInput = z.input<typeof drillInputSchema>;
export type ParsedDrillInput = z.output<typeof drillInputSchema>;

/** Flattens zod issues into "path → message" for inline display. */
export function issuesToErrors(error: z.ZodError, prefix: (string | number)[] = []) {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = [...prefix, ...issue.path].join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function validateStep(step: number, values: DrillFormValues) {
  if (step === 0) {
    const r = basicInfoSchema.safeParse(values);
    return r.success ? {} : issuesToErrors(r.error);
  }
  if (step === 1) {
    const r = objectivesSchema.safeParse(values.objectives);
    return r.success ? {} : issuesToErrors(r.error, ["objectives"]);
  }
  const r = participantsSchema.safeParse(values.participants);
  return r.success ? {} : issuesToErrors(r.error, ["participants"]);
}

/** Date → value for <input type="datetime-local"> in the browser's local time. */
export function toLocalInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
