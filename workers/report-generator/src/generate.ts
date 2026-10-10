import { and, count, db, desc, drillReports, eq, improvementActions, type DrillReport } from "@drillforce/db";
import { AAR_MODEL, generateWithClaude } from "./claude";
import { collectDrillData, type DrillData } from "./collect";
import type { AarContent, AarSections } from "./schema";
import { generateFromTemplate } from "./template";

const claudeConfigured = () => !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);

/**
 * Generates and stores an AAR for a drill. The first AAR for a drill also
 * auto-creates improvement actions from its corrective actions.
 */
export async function generateAar(drillId: string) {
  const data = await collectDrillData(drillId);

  let sections: AarSections;
  let generator: AarContent["meta"]["generator"] = "template";
  let fallbackReason: string | undefined;
  if (claudeConfigured()) {
    try {
      sections = await generateWithClaude(data);
      generator = "claude";
    } catch (err) {
      fallbackReason = (err as Error).message;
      console.error("Claude AAR generation failed; using the template instead:", fallbackReason);
      sections = generateFromTemplate(data);
    }
  } else {
    sections = generateFromTemplate(data);
  }

  const content: AarContent & { meta: { fallbackReason?: string } } = {
    ...sections,
    meta: {
      drillName: data.drill.name,
      compositeScore: data.composite ? Number(data.composite.compositeScore) : null,
      passed: data.composite?.passed ?? null,
      passThreshold: data.passThreshold,
      durationMinutes: data.durationMinutes,
      generator,
      ...(generator === "claude" ? { model: AAR_MODEL } : {}),
      ...(fallbackReason ? { fallbackReason } : {}),
      actionIds: {},
    },
  };

  const [{ value: previous }] = await db
    .select({ value: count() })
    .from(drillReports)
    .where(and(eq(drillReports.drillId, drillId), eq(drillReports.reportType, "aar")));

  const [report] = await db
    .insert(drillReports)
    .values({
      drillId,
      reportType: "aar",
      content: content as unknown as Record<string, unknown>,
      generatedBy: generator === "claude" ? AAR_MODEL : "template",
    })
    .returning();

  if (previous === 0) {
    for (let i = 0; i < sections.correctiveActions.length; i++) {
      await createActionFromReport(report.id, i, data);
    }
  }
  return report;
}

function resolveOwner(data: DrillData, ownerName: string) {
  const name = ownerName.trim().toLowerCase();
  const match =
    data.participants.find((p) => p.name.toLowerCase() === name) ??
    data.participants.find((p) => name && (p.name.toLowerCase().includes(name) || name.includes(p.name.toLowerCase())));
  return (
    match?.userId ??
    data.participants.find((p) => p.role === "incident_commander")?.userId ??
    data.drill.createdBy ??
    null
  );
}

/** Creates (once) the improvement action for corrective action #index of a report. */
export async function createActionFromReport(reportId: string, index: number, preloaded?: DrillData) {
  const [report] = await db.select().from(drillReports).where(eq(drillReports.id, reportId));
  if (!report) throw new Error("Report not found");
  const content = report.content as unknown as AarContent;
  const ca = content.correctiveActions[index];
  if (!ca) throw new Error("Corrective action not found");

  const existingId = content.meta.actionIds?.[String(index)];
  if (existingId) {
    const [existing] = await db.select().from(improvementActions).where(eq(improvementActions.id, existingId));
    if (existing) return existing;
  }

  const data = preloaded ?? (await collectDrillData(report.drillId));
  const due = new Date(Date.now() + Math.max(1, ca.dueInDays) * 86_400_000);

  return db.transaction(async (tx) => {
    const [action] = await tx
      .insert(improvementActions)
      .values({
        drillId: report.drillId,
        reportId,
        gapDescription: ca.gap,
        actionDescription: ca.action,
        category: ca.category,
        severity: ca.severity,
        ownerId: resolveOwner(data, ca.owner),
        dueDate: due.toISOString().slice(0, 10),
        verificationMethod: ca.verificationMethod,
      })
      .returning();

    // Re-read inside the transaction so concurrent creations don't drop each other's ids.
    const [fresh] = await tx.select().from(drillReports).where(eq(drillReports.id, reportId)).for("update");
    const freshContent = fresh.content as unknown as AarContent;
    freshContent.meta.actionIds = { ...freshContent.meta.actionIds, [String(index)]: action.id };
    await tx
      .update(drillReports)
      .set({ content: freshContent as unknown as Record<string, unknown> })
      .where(eq(drillReports.id, reportId));
    return action;
  });
}

export async function approveReport(reportId: string, userId: string) {
  const [report] = await db
    .update(drillReports)
    .set({ approvedBy: userId, approvedAt: new Date() })
    .where(eq(drillReports.id, reportId))
    .returning();
  return report;
}

export async function latestAar(drillId: string): Promise<DrillReport | null> {
  const [report] = await db
    .select()
    .from(drillReports)
    .where(and(eq(drillReports.drillId, drillId), eq(drillReports.reportType, "aar")))
    .orderBy(desc(drillReports.generatedAt))
    .limit(1);
  return report ?? null;
}
