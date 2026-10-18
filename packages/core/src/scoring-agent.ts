import Anthropic from "@anthropic-ai/sdk";
import {
  and,
  asc,
  awardCertifications,
  db,
  drillComposites,
  drillEvents,
  drillObjectives,
  drills,
  drillScores,
  eq,
  evaluateDrillCompliance,
  sql,
  type Drill,
  type DrillObjective,
} from "@drillforce/db";
import { autoScoreDrill, recordManualScores, type ManualScoreInput } from "@drillforce/scoring-engine";
import { actingCtx } from "./bot";
import { dispatchWebhookEvent } from "./webhooks";

/**
 * The scoring agent: after a drill concludes and its post-drill window passes
 * (config.scoring.dueAt, SCORING_DELAY_MINUTES), it reviews the responses and scores the drill.
 *
 * - Auto-scorable objectives (time to action, checklists, coordination) → the scoring engine.
 * - Judgement objectives (accuracy of the diagnosis, quality of decisions/comms) → judged from what
 *   responders actually said: by Claude when ANTHROPIC_API_KEY is set, else by a transparent
 *   heuristic. Every judgement carries its reasoning in the score notes.
 */

const MODEL = process.env.SCORING_AGENT_MODEL || "claude-opus-5-5";
const AGENT = "agent";

type Judged = ManualScoreInput & { notes: string };

/** Drills whose scoring window has passed and that the agent hasn't scored yet. */
async function dueDrills(now: Date) {
  return db
    .select()
    .from(drills)
    .where(
      and(
        eq(drills.status, "scoring"),
        sql`(${drills.config} -> 'scoring' ->> 'agentScoredAt') is null`,
        sql`coalesce((${drills.config} -> 'scoring' ->> 'dueAt')::timestamptz, ${drills.endedAt}, now()) <= ${now.toISOString()}::timestamptz`,
      ),
    );
}

/** Score every due drill. Returns what was scored (for logs). */
export async function runDueScoring(now = new Date()) {
  const results: { drillId: string; name: string; composite: number | null; judge: string }[] = [];
  for (const drill of await dueDrills(now)) {
    try {
      results.push(await scoreDrill(drill));
    } catch (err) {
      console.error(`Scoring agent failed for "${drill.name}":`, err);
    }
  }
  return results;
}

async function scoreDrill(drill: Drill) {
  const ctx = await actingCtx(drill);
  const auto = await autoScoreDrill(drill.id);

  const [objectives, scored, events] = await Promise.all([
    db.select().from(drillObjectives).where(eq(drillObjectives.drillId, drill.id)).orderBy(asc(drillObjectives.sortOrder)),
    db.select({ objectiveId: drillScores.objectiveId }).from(drillScores).where(eq(drillScores.drillId, drill.id)),
    db.select().from(drillEvents).where(eq(drillEvents.drillId, drill.id)).orderBy(asc(drillEvents.occurredAt)),
  ]);
  const done = new Set(scored.map((s) => s.objectiveId));
  const pending = objectives.filter((o) => !done.has(o.id) && (o.criteriaType === "quality" || o.criteriaType === "accuracy"));
  const transcript = events
    .filter((e) => ["message", "action", "observation", "signal", "inject"].includes(e.eventType))
    .map((e) => ({ at: e.occurredAt, who: humanName(e.actor, e.payload), human: isHuman(e.actor), text: String(e.payload.text ?? "") }));

  let judge = "none needed";
  let result = auto.finalized ? { composite: null as number | null } : null;
  if (pending.length) {
    const { judged, by } = await judgeObjectives(drill, pending, transcript);
    judge = by;
    const recorded = await recordManualScores(drill.id, AGENT, judged);
    result = recorded ? { composite: recorded.composite } : null;
  }

  const [composite] = await db.select({ score: drillComposites.compositeScore }).from(drillComposites).where(eq(drillComposites.drillId, drill.id));
  const score = composite?.score == null ? (result?.composite ?? null) : Number(composite.score);
  const humans = new Set(transcript.filter((t) => t.human).map((t) => t.who)).size;
  await db.insert(drillEvents).values({
    drillId: drill.id,
    eventType: "score",
    actor: AGENT,
    payload: {
      kind: "scoring_agent",
      text: `Scoring agent reviewed ${transcript.filter((t) => t.human).length} responder message(s) from ${humans} responder(s): ${auto.scored} objective(s) auto-scored, ${pending.length} judged (${judge})${score != null ? ` — composite ${score}` : ""}.`,
    },
  });
  await db
    .update(drills)
    .set({ config: sql`jsonb_set(${drills.config}, '{scoring,agentScoredAt}', to_jsonb(${new Date().toISOString()}::text), true)` })
    .where(eq(drills.id, drill.id));

  await awardCertifications(db, ctx.orgId);
  await evaluateDrillCompliance(db, ctx.orgId, drill.id);
  await dispatchWebhookEvent(ctx.orgId, "drill.scored", { drillId: drill.id, name: drill.name });
  return { drillId: drill.id, name: drill.name, composite: score, judge };
}

const isHuman = (actor: string | null) => !!actor && (/^[0-9a-f-]{36}$/i.test(actor) || actor.startsWith("slack:"));
const humanName = (actor: string | null, payload: Record<string, unknown>) =>
  String(payload.user_name ?? (actor?.startsWith("agent:") ? actor.slice(6) : actor ?? "system"));

interface Line {
  at: Date;
  who: string;
  human: boolean;
  text: string;
}

async function judgeObjectives(drill: Drill, objectives: DrillObjective[], transcript: Line[]) {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN) {
    try {
      return { judged: await judgeWithClaude(drill, objectives, transcript), by: `Claude ${MODEL}` };
    } catch (err) {
      console.warn("Scoring agent: Claude judgement failed, using the heuristic:", (err as Error).message);
    }
  }
  return { judged: objectives.map((o) => judgeHeuristic(o, transcript, drill)), by: "heuristic" };
}

// ─── heuristic judge (no API key) ─────────────────────────────────────────────
const STOP = new Set(["the", "a", "an", "is", "are", "of", "to", "and", "or", "on", "in", "for", "but", "be", "by", "it", "its", "with", "that", "this"]);
const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9-]{3,}/g)?.filter((w) => !STOP.has(w)) ?? []);

export function judgeHeuristic(o: DrillObjective, transcript: Line[], drill: Pick<Drill, "startedAt">): Judged {
  const human = transcript.filter((t) => t.human);
  const said = human.map((t) => t.text).join(" ");
  if (o.criteriaType === "accuracy") {
    const expected = String((o.targetValue as { expected_outcome?: string }).expected_outcome ?? "");
    const want = words(expected);
    const got = words(said);
    const hit = [...want].filter((w) => got.has(w));
    const ratio = want.size ? hit.length / want.size : 0;
    const verdict = !human.length ? "incorrect" : ratio >= 0.5 ? "correct" : ratio >= 0.25 ? "partial" : "incorrect";
    return {
      objectiveId: o.id,
      verdict,
      notes: human.length
        ? `Heuristic: responders' messages cover ${hit.length}/${want.size} key terms of the expected outcome (${hit.slice(0, 6).join(", ") || "none"}).`
        : "Heuristic: no responder messages to judge.",
    };
  }
  const rubric = ((o.targetValue as { rubric?: { dimension: string; scale: number }[] }).rubric ?? [{ dimension: "Overall", scale: 5 }]);
  const firstReplyMin = human.length && drill.startedAt ? (human[0].at.getTime() - new Date(drill.startedAt).getTime()) / 60_000 : null;
  const decided = /\b(propose|go\b|fail ?over|roll ?back|decid|mitigat)/i.test(said);
  const owned = /\b(i'?ll take|i'?m on|i own|investigating|i'?ll handle)/i.test(said);
  const points = (human.length >= 5 ? 1 : 0) + (decided ? 1 : 0) + (owned ? 1 : 0) + (firstReplyMin != null && firstReplyMin <= 3 ? 1 : 0);
  const ratings = rubric.map((r) => ({ dimension: r.dimension, scale: r.scale, rating: Math.max(1, Math.min(r.scale, Math.round(1 + (points / 4) * (r.scale - 1)))) }));
  return {
    objectiveId: o.id,
    ratings,
    notes: `Heuristic: ${human.length} responder message(s); ${owned ? "took ownership" : "no explicit ownership"}; ${decided ? "made a mitigation decision" : "no clear decision"}; ${firstReplyMin == null ? "no first response" : `first response at T+${firstReplyMin.toFixed(1)}m`}.`,
  };
}

// ─── Claude judge ─────────────────────────────────────────────────────────────
async function judgeWithClaude(drill: Drill, objectives: DrillObjective[], transcript: Line[]): Promise<Judged[]> {
  const client = new Anthropic({ timeout: 120_000, maxRetries: 1 });
  const schema = {
    type: "object",
    properties: {
      judgements: {
        type: "array",
        items: {
          type: "object",
          properties: {
            objectiveId: { type: "string" },
            verdict: { type: "string", enum: ["correct", "partial", "incorrect", "n/a"] },
            ratings: {
              type: "array",
              items: {
                type: "object",
                properties: { dimension: { type: "string" }, rating: { type: "integer" } },
                required: ["dimension", "rating"],
                additionalProperties: false,
              },
            },
            notes: { type: "string" },
          },
          required: ["objectiveId", "verdict", "ratings", "notes"],
          additionalProperties: false,
        },
      },
    },
    required: ["judgements"],
    additionalProperties: false,
  };
  const lines = transcript.map((t) => `[${t.at.toISOString().slice(11, 19)}] ${t.human ? "RESPONDER" : "team/system"} ${t.who}: ${t.text}`).join("\n");
  const objectiveText = objectives
    .map((o) =>
      o.criteriaType === "accuracy"
        ? `- id ${o.id} (accuracy): "${o.description}". Expected outcome: ${(o.targetValue as { expected_outcome?: string }).expected_outcome}. Give verdict correct/partial/incorrect and ratings [].`
        : `- id ${o.id} (quality): "${o.description}". Rate each dimension 1..scale: ${JSON.stringify((o.targetValue as { rubric?: unknown }).rubric)}. Give verdict "n/a".`,
    )
    .join("\n");
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16_000,
    output_config: { effort: "medium", format: { type: "json_schema", schema } },
    system:
      "You are the scoring agent for an incident-response drill. Judge only what RESPONDER lines show (team/system lines are the simulated incident team and injected alerts). Be fair and specific; cite what responders said or failed to do in one or two sentences of notes per objective.",
    messages: [{ role: "user", content: `Drill: ${drill.name}\nScenario: ${drill.scenario?.summary ?? ""}\n\nObjectives to judge:\n${objectiveText}\n\nTranscript:\n${lines || "(no messages)"}` }],
  });
  if (response.stop_reason === "refusal") throw new Error("refusal");
  const block = response.content.find((b) => b.type === "text");
  const parsed = JSON.parse(block && block.type === "text" ? block.text : "{}") as { judgements: { objectiveId: string; verdict: string; ratings: { dimension: string; rating: number }[]; notes: string }[] };
  return objectives.map((o) => {
    const j = parsed.judgements?.find((x) => x.objectiveId === o.id);
    if (!j) return judgeHeuristic(o, transcript, drill);
    if (o.criteriaType === "accuracy") {
      const verdict = ["correct", "partial", "incorrect"].includes(j.verdict) ? (j.verdict as Judged["verdict"]) : "incorrect";
      return { objectiveId: o.id, verdict, notes: `Claude: ${j.notes}` };
    }
    const rubric = (o.targetValue as { rubric?: { dimension: string; scale: number }[] }).rubric ?? [];
    const ratings = rubric.map((r) => {
      const hit = j.ratings.find((x) => x.dimension.toLowerCase() === r.dimension.toLowerCase());
      return { dimension: r.dimension, scale: r.scale, rating: Math.max(1, Math.min(r.scale, hit?.rating ?? 1)) };
    });
    return { objectiveId: o.id, ratings, notes: `Claude: ${j.notes}` };
  });
}
