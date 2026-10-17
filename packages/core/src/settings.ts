import { db, eq, organizations } from "@drillforce/db";
import { DEFAULT_PASS_THRESHOLD, SECTORS, type Sector } from "@drillforce/shared";
import { z } from "zod";
import type { Ctx } from "./context";
import { badRequest, notFound } from "./errors";
import { listCompetencyAreas } from "./org";
import { flatten } from "./validation";

export interface OrgSettings {
  name: string;
  sector: Sector;
  passThreshold: number;
  defaultDurationMinutes: number;
  notifications: {
    drillScheduled: boolean;
    drillCompleted: boolean;
    actionAssigned: boolean;
    actionOverdue: boolean;
    certificationEarned: boolean;
  };
  /** Competency name → weight (1–5); every catalog competency is present. */
  competencyWeights: Record<string, number>;
}

export const orgSettingsInput = z.object({
  name: z.string().trim().min(1, "Organization name is required").max(120),
  sector: z.enum(SECTORS),
  passThreshold: z.coerce.number().int().min(0).max(100),
  defaultDurationMinutes: z.coerce.number().int().min(5).max(480),
  notifications: z.object({
    drillScheduled: z.boolean(),
    drillCompleted: z.boolean(),
    actionAssigned: z.boolean(),
    actionOverdue: z.boolean(),
    certificationEarned: z.boolean(),
  }),
  competencyWeights: z.record(z.coerce.number().int().min(1).max(5)),
});
export type OrgSettingsInput = z.input<typeof orgSettingsInput>;

async function loadOrg(ctx: Ctx) {
  const [org] = await db.select().from(organizations).where(eq(organizations.id, ctx.orgId));
  if (!org) throw notFound("Organization");
  return org;
}

/** The org's settings with defaults filled in. */
export async function getOrgSettings(ctx: Ctx): Promise<OrgSettings> {
  const [org, competencies] = await Promise.all([loadOrg(ctx), listCompetencyAreas()]);
  const config = org.config;
  const notifications = (config.notifications as Record<string, boolean>) ?? {};
  const weights = (config.competencyWeights as Record<string, number>) ?? {};
  return {
    name: org.name,
    sector: org.sector,
    passThreshold: Number(config.passThreshold ?? DEFAULT_PASS_THRESHOLD),
    defaultDurationMinutes: Number(config.defaultDurationMinutes ?? 45),
    notifications: {
      drillScheduled: notifications.drillScheduled ?? true,
      drillCompleted: notifications.drillCompleted ?? true,
      actionAssigned: notifications.actionAssigned ?? true,
      actionOverdue: notifications.actionOverdue ?? true,
      certificationEarned: notifications.certificationEarned ?? true,
    },
    competencyWeights: Object.fromEntries(competencies.map((c) => [c.name, weights[c.name] ?? 1])),
  };
}

/** Replace the org's settings (full document, as the Settings form submits it). */
export async function updateOrgSettings(ctx: Ctx, raw: unknown): Promise<OrgSettings> {
  const parsed = orgSettingsInput.safeParse(raw);
  if (!parsed.success) throw badRequest(parsed.error.issues[0].message, flatten(parsed.error));
  const org = await loadOrg(ctx);
  const { name, sector, ...rest } = parsed.data;
  await db
    .update(organizations)
    .set({
      name,
      sector,
      config: {
        ...org.config,
        passThreshold: rest.passThreshold,
        defaultDurationMinutes: rest.defaultDurationMinutes,
        notifications: rest.notifications,
        competencyWeights: rest.competencyWeights,
      },
    })
    .where(eq(organizations.id, ctx.orgId));
  return getOrgSettings(ctx);
}
