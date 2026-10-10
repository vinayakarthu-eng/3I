import {
  and,
  asc,
  db,
  drillComposites,
  drillEvents,
  drillObjectives,
  drillParticipants,
  drills,
  drillScores,
  eq,
  inArray,
  type DrillObjective,
} from "@drillforce/db";
import {
  DEFAULT_PASS_THRESHOLD,
  DRILL_STATUS_LABELS,
  type CriteriaType,
} from "@drillforce/shared";
import {
  ACCURACY_SCORES,
  scoreCompleteness,
  scoreCoordination,
  scoreQuality,
  scoreTimeToAction,
  type AccuracyVerdict,
  type ScoreResult,
} from "./scoring";

/** Criteria the engine scores from events; the rest need an evaluator. */
export const AUTO_CRITERIA: CriteriaType[] = ["time_to_action", "completeness", "coordination"];
export const MANUAL_CRITERIA: CriteriaType[] = ["quality", "accuracy"];

export const isAutoScored = (o: Pick<DrillObjective, "criteriaType">) => AUTO_CRITERIA.includes(o.criteriaType);

/**
 * Scores every auto-scorable objective of a drill from its events, replacing any
 * previous auto scores, then finalizes the drill if nothing is left to score.
 */
export async function autoScoreDrill(drillId: string) {
  const [drill] = await db.select().from(drills).where(eq(drills.id, drillId));
  if (!drill) throw new Error(`Drill ${drillId} not found`);

  const [objectives, events, participants] = await Promise.all([
    db.select().from(drillObjectives).where(eq(drillObjectives.drillId, drillId)).orderBy(asc(drillObjectives.sortOrder)),
    db.select().from(drillEvents).where(eq(drillEvents.drillId, drillId)).orderBy(asc(drillEvents.occurredAt)),
    db.select().from(drillParticipants).where(eq(drillParticipants.drillId, drillId)),
  ]);

  const responderIds = new Set(
    participants.filter((p) => p.role === "responder" || p.role === "incident_commander").map((p) => p.userId),
  );
  // Slack user id → display name, learned from the messages they posted.
  const mentionNames = new Map<string, string>();
  for (const e of events) {
    if (typeof e.payload.user === "string" && typeof e.payload.user_name === "string") {
      mentionNames.set(e.payload.user, e.payload.user_name);
    }
  }

  const scored: { objective: DrillObjective; result: ScoreResult }[] = [];
  for (const o of objectives.filter(isAutoScored)) {
    const target = (o.targetValue ?? {}) as Record<string, unknown>;
    const result =
      o.criteriaType === "time_to_action"
        ? scoreTimeToAction(events, target, { responderIds, startedAt: drill.startedAt })
        : o.criteriaType === "completeness"
          ? scoreCompleteness(events, target, { startedAt: drill.startedAt })
          : scoreCoordination(events, target, { startedAt: drill.startedAt, mentionNames });
    scored.push({ objective: o, result });
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    const ids = scored.map((s) => s.objective.id);
    if (ids.length) {
      await tx
        .delete(drillScores)
        .where(and(inArray(drillScores.objectiveId, ids), eq(drillScores.scoredBy, "auto")));
      await tx.insert(drillScores).values(
        scored.map(({ objective, result }) => ({
          drillId,
          objectiveId: objective.id,
          criteriaType: objective.criteriaType,
          rawValue: result.rawValue == null ? null : String(result.rawValue),
          normalizedScore: String(result.normalizedScore),
          evidence: result.evidence,
          scoredBy: "auto",
          scoredAt: now,
        })),
      );
    }
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "score",
      actor: "auto",
      payload: {
        kind: "auto_scoring_complete",
        text: ids.length
          ? `Auto-scoring completed: ${ids.length} objective${ids.length === 1 ? "" : "s"} scored`
          : "Auto-scoring found no auto-scorable objectives",
        scores: scored.map((s) => ({ objectiveId: s.objective.id, score: s.result.normalizedScore })),
      },
      occurredAt: now,
    });
    await tx
      .update(drills)
      .set({ config: { ...drill.config, scoring: { ...(drill.config.scoring as object), autoScoredAt: now.toISOString() } } })
      .where(eq(drills.id, drillId));
  });

  const finalized = await finalizeIfComplete(drillId);
  return { scored: scored.length, finalized };
}

export interface ManualScoreInput {
  objectiveId: string;
  notes?: string;
  ratings?: { dimension: string; rating: number; scale: number }[];
  verdict?: AccuracyVerdict;
}

/** Stores evaluator scores for quality/accuracy objectives, replacing that evaluator's earlier ones. */
export async function recordManualScores(drillId: string, evaluatorId: string, inputs: ManualScoreInput[]) {
  const objectives = await db.select().from(drillObjectives).where(eq(drillObjectives.drillId, drillId));
  const byId = new Map(objectives.map((o) => [o.id, o]));
  const now = new Date();

  const rows = inputs.map((input) => {
    const o = byId.get(input.objectiveId);
    if (!o) throw new Error("Objective does not belong to this drill");
    if (o.criteriaType === "quality") {
      if (!input.ratings?.length) throw new Error(`Rate every dimension for “${o.description}”`);
      const r = scoreQuality(input.ratings);
      return { o, rawValue: r.rawValue, score: r.normalizedScore, evidence: { ...r.evidence, notes: input.notes ?? "" } };
    }
    if (o.criteriaType === "accuracy") {
      if (!input.verdict) throw new Error(`Choose a verdict for “${o.description}”`);
      return {
        o,
        rawValue: null,
        score: ACCURACY_SCORES[input.verdict],
        evidence: { verdict: input.verdict, notes: input.notes ?? "" },
      };
    }
    throw new Error(`“${o.description}” is scored automatically`);
  });

  await db.transaction(async (tx) => {
    const ids = rows.map((r) => r.o.id);
    if (ids.length) {
      await tx
        .delete(drillScores)
        .where(and(inArray(drillScores.objectiveId, ids), eq(drillScores.scoredBy, evaluatorId)));
      await tx.insert(drillScores).values(
        rows.map((r) => ({
          drillId,
          objectiveId: r.o.id,
          criteriaType: r.o.criteriaType,
          rawValue: r.rawValue == null ? null : String(r.rawValue),
          normalizedScore: String(r.score),
          evidence: r.evidence,
          scoredBy: evaluatorId,
          scoredAt: now,
        })),
      );
    }
    await tx.insert(drillEvents).values({
      drillId,
      eventType: "score",
      actor: evaluatorId,
      payload: { kind: "manual_scores", text: `Evaluator scored ${rows.length} objective${rows.length === 1 ? "" : "s"}` },
      occurredAt: now,
    });
  });

  return finalizeIfComplete(drillId);
}

/**
 * When every objective has at least one score: computes the weighted composite
 * (latest score per objective), stores it in drill_composite, and moves a drill
 * that is still in Scoring to Debriefing.
 */
export async function finalizeIfComplete(drillId: string) {
  const [drill] = await db.select().from(drills).where(eq(drills.id, drillId));
  if (!drill) return null;
  const objectives = await db.select().from(drillObjectives).where(eq(drillObjectives.drillId, drillId));
  if (!objectives.length) return null;

  const scores = await db.select().from(drillScores).where(eq(drillScores.drillId, drillId));
  const latest = new Map<string, number>();
  for (const s of [...scores].sort((a, b) => (a.scoredAt?.getTime() ?? 0) - (b.scoredAt?.getTime() ?? 0))) {
    if (s.objectiveId && s.normalizedScore != null) latest.set(s.objectiveId, Number(s.normalizedScore));
  }
  if (objectives.some((o) => !latest.has(o.id))) return null;

  const totalWeight = objectives.reduce((a, o) => a + o.weight, 0);
  const composite = objectives.reduce((a, o) => a + latest.get(o.id)! * o.weight, 0) / totalWeight;
  const rounded = Math.round(composite * 10) / 10;

  const byCriteria: Record<string, number[]> = {};
  for (const o of objectives) (byCriteria[o.criteriaType] ??= []).push(latest.get(o.id)!);
  const threshold = Number(drill.config.passThreshold ?? DEFAULT_PASS_THRESHOLD);

  const values = {
    compositeScore: String(rounded),
    passThreshold: threshold,
    passed: rounded >= threshold,
    breakdown: {
      byCriteria: Object.fromEntries(
        Object.entries(byCriteria).map(([c, v]) => [c, Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10]),
      ),
      objectives: objectives.map((o) => ({ objectiveId: o.id, score: latest.get(o.id)!, weight: o.weight })),
    },
    computedAt: new Date(),
  };

  await db.transaction(async (tx) => {
    await tx
      .insert(drillComposites)
      .values({ drillId, ...values })
      .onConflictDoUpdate({ target: drillComposites.drillId, set: values });

    if (drill.status === "scoring") {
      await tx.update(drills).set({ status: "debriefing" }).where(eq(drills.id, drillId));
      await tx.insert(drillEvents).values({
        drillId,
        eventType: "system",
        actor: "auto",
        payload: {
          kind: "status_change",
          from: "scoring",
          to: "debriefing",
          text: `All objectives scored (composite ${rounded}). Status changed from ${DRILL_STATUS_LABELS.scoring} to ${DRILL_STATUS_LABELS.debriefing}`,
        },
      });
    }
  });

  return { composite: rounded, passed: values.passed };
}
