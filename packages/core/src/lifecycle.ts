import { db, drillObjectives, drillSignals, eq, inArray, and } from "@drillforce/db";
import {
  describeSignal,
  signalAlertText,
  signalImpact,
  SIGNAL_KIND_META,
  type DrillStatus,
} from "@drillforce/shared";
import type { Ctx } from "./context";
import { datadogLinks, telemetrySink } from "./datadog";
import { changeDrillStatus, loadOwnedDrill } from "./drill-writes";
import { badRequest } from "./errors";
import { signalRowToPlan } from "./signals";
import { concludeWarRoomIncident, openWarRoomIncident, warRoomConfigured, type WarRoomIncident } from "./war-room";

/**
 * The drill lifecycle as responders see it — Planning → Preparation → Execution → Concluded →
 * Scored → Completed — with the step that moves each stage forward.
 */

const appUrl = () => (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

export interface ExecutionRecord {
  executedAt: string;
  executedBy: string;
  sink: ReturnType<typeof telemetrySink>;
  links: ReturnType<typeof datadogLinks>;
  streams: number;
  slack?: WarRoomIncident;
  slackError?: string;
}

/** Planning → Preparation: the plan must be complete enough to run. */
export async function scheduleDrill(ctx: Ctx, drillId: string) {
  const drill = await loadOwnedDrill(ctx, drillId);
  if (drill.status !== "draft") throw badRequest("Only a drill in Planning can be scheduled.");
  const missing: string[] = [];
  if (!drill.scheduledAt) missing.push("a scheduled date (Edit drill)");
  const objectives = await db.select({ id: drillObjectives.id }).from(drillObjectives).where(eq(drillObjectives.drillId, drillId));
  if (!objectives.length) missing.push("at least one objective");
  if (drill.scenario?.monitoringDomain) {
    const signals = await db.select({ id: drillSignals.id }).from(drillSignals).where(eq(drillSignals.drillId, drillId));
    if (!signals.length) missing.push("at least one signal in the injection matrix");
  }
  if (missing.length) throw badRequest(`Before scheduling, add ${missing.join(", ")}.`);
  return changeDrillStatus(ctx, drillId, "scheduled", { text: "Planning complete — drill scheduled" });
}

/**
 * Preparation → Execution: start the injection engine on every planned stream, open the Slack
 * incident channel via the War Room, and mark the drill live.
 */
export async function executeDrill(ctx: Ctx, drillId: string): Promise<ExecutionRecord> {
  const drill = await loadOwnedDrill(ctx, drillId);
  if (drill.status !== "scheduled" && drill.status !== "briefing") {
    throw badRequest("A drill can be executed from Preparation (Scheduled or Briefing).");
  }
  const rows = await db.select().from(drillSignals).where(eq(drillSignals.drillId, drillId));
  const plans = rows.map(signalRowToPlan);
  if (drill.status === "scheduled") {
    await changeDrillStatus(ctx, drillId, "briefing", { text: "Preparation reviewed — executing" });
  }

  const now = new Date();
  const links = datadogLinks(drillId);
  const record: ExecutionRecord = {
    executedAt: now.toISOString(),
    executedBy: ctx.userId,
    sink: telemetrySink(),
    links,
    streams: rows.length,
  };

  // Slack: the War Room opens the channel and runs the incident team (optional, fail-soft).
  if (warRoomConfigured()) {
    const services = new Map<string, "degraded" | "down" | "healthy">();
    for (const p of plans) if (p.kind !== "alert_event") services.set(p.service, "healthy");
    try {
      record.slack = await openWarRoomIncident({
        drillId,
        title: drill.name,
        summary: drill.scenario?.summary ?? drill.description ?? drill.name,
        severity: (drill.scenario?.severity ?? "SEV-2").replace("-", ""),
        domain: drill.scenario?.monitoringDomain === "database" ? "db" : "app",
        services: [...services].map(([name, status]) => ({ name, status })),
        injects: plans
          .map((p) => ({
            atMin: p.startOffsetMinutes,
            type: SIGNAL_KIND_META[p.kind].domain === "database" ? "metric" : p.kind === "alert_event" ? "alert" : "metric",
            text: signalAlertText(p),
            affects: signalImpact(p) ? ([[p.service, signalImpact(p)!]] as [string, string][]) : undefined,
          }))
          .sort((a, b) => a.atMin - b.atMin),
        briefing: [
          `*This is a DRILL.* ${drill.scenario?.summary ?? ""}`,
          plans.length ? `*Signals being injected (${record.sink === "datadog" ? "into Datadog" : "dry run"}):*\n${plans.map((p) => `• ${describeSignal(p)}`).join("\n")}` : "",
        ].filter(Boolean).join("\n"),
        links: record.sink === "datadog" ? { "Datadog APM": links.traces, "Datadog Logs": links.logs } : {},
        webUrl: `${appUrl()}/drills/${drillId}`,
      });
    } catch (err) {
      record.slackError = (err as Error).message;
    }
  } else {
    record.slackError = "War Room isn't configured (WAR_ROOM_URL / WAR_ROOM_TOKEN), so no Slack channel was opened.";
  }

  // The injection engine picks up streams marked running.
  if (rows.length) {
    await db
      .update(drillSignals)
      .set({ status: "running", startedAt: now, completedAt: null, stats: null, lastError: null })
      .where(eq(drillSignals.drillId, drillId));
  }

  await changeDrillStatus(ctx, drillId, "active", {
    text: `Drill executed — ${rows.length} signal stream${rows.length === 1 ? "" : "s"} injecting${record.slack ? `; Slack #${record.slack.channelName}` : ""}`,
    occurredAt: now,
    config: { execution: record, ...(record.slack ? { slack: record.slack } : {}) },
  });
  return record;
}

/** Execution → Concluded: stop injection, announce "this was a drill", hand to the scoring agent. */
export async function concludeDrill(ctx: Ctx, drillId: string) {
  const drill = await loadOwnedDrill(ctx, drillId);
  if (drill.status !== "active") throw badRequest("Only a drill in Execution can be concluded.");
  await db
    .update(drillSignals)
    .set({ status: "stopped", completedAt: new Date() })
    .where(and(eq(drillSignals.drillId, drillId), inArray(drillSignals.status, ["planned", "running"])));

  let slackError: string | undefined;
  if (warRoomConfigured() && drill.config.slack) {
    try {
      await concludeWarRoomIncident(
        drillId,
        ":checkered_flag: *This was a drill. The drill has now concluded.* Thank you all — stop any remaining actions. The scoring agent will review the responses shortly.",
      );
    } catch (err) {
      slackError = (err as Error).message;
    }
  }
  const result = await changeDrillStatus(ctx, drillId, "scoring", {
    text: "Drill concluded — this was a drill",
    config: { conclusion: { concludedAt: new Date().toISOString(), concludedBy: ctx.userId, ...(slackError ? { slackError } : {}) } },
  });
  return result;
}

/** Scored → Completed. */
export async function completeDrill(ctx: Ctx, drillId: string) {
  const drill = await loadOwnedDrill(ctx, drillId);
  if (drill.status !== "debriefing") throw badRequest("A drill can be completed once it has been scored.");
  return changeDrillStatus(ctx, drillId, "completed" as DrillStatus, { text: "Debrief complete — drill completed" });
}
