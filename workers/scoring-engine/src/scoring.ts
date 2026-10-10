import type { DrillEvent } from "@drillforce/db";
import { mentions, mentionsPhrase } from "./text-match";

export interface ScoreResult {
  rawValue: number | null;
  normalizedScore: number;
  evidence: Record<string, unknown>;
}

const SYSTEM_ACTORS = new Set(["bot", "system", "auto"]);
const round1 = (n: number) => Math.round(n * 10) / 10;

function eventText(e: DrillEvent) {
  const p = e.payload ?? {};
  return [p.text, p.description, p.reaction].filter((v) => typeof v === "string").join(" ");
}

function cite(e: DrillEvent, startedAt: Date | null) {
  const mins = startedAt ? round1((e.occurredAt.getTime() - startedAt.getTime()) / 60000) : null;
  return { eventId: e.id, at: e.occurredAt.toISOString(), tPlusMinutes: mins, actor: e.actor, text: eventText(e) };
}

/** Human-authored messages/actions (not the bot or system). */
export function humanEvents(events: DrillEvent[]) {
  return events.filter(
    (e) => (e.eventType === "message" || e.eventType === "action") && e.actor && !SYSTEM_ACTORS.has(e.actor),
  );
}

/**
 * Time-to-action: minutes from the first inject/signal to the first responder message/action.
 * ≤ target → 100; ≤ 2× target → 99…50 linearly; beyond that → 49…0, reaching 0 at 4× target.
 */
export function scoreTimeToAction(
  events: DrillEvent[],
  target: { max_minutes?: unknown },
  opts: { responderIds: Set<string>; startedAt: Date | null },
): ScoreResult {
  const targetMin = Number(target.max_minutes);
  if (!Number.isFinite(targetMin) || targetMin <= 0) {
    return { rawValue: null, normalizedScore: 0, evidence: { note: "Objective has no valid max_minutes target" } };
  }

  const sorted = [...events].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const trigger = sorted.find((e) => e.eventType === "inject" || e.eventType === "signal");
  const triggerAt = trigger?.occurredAt ?? opts.startedAt;
  if (!triggerAt) {
    return { rawValue: null, normalizedScore: 0, evidence: { note: "No trigger event and the drill has no start time" } };
  }

  const humans = humanEvents(sorted).filter((e) => e.occurredAt >= triggerAt);
  // Prefer responders/incident commanders; fall back to any human if no roles matched.
  const response =
    humans.find((e) => opts.responderIds.has(e.actor!)) ?? (opts.responderIds.size ? undefined : humans[0]);

  if (!response) {
    return {
      rawValue: null,
      normalizedScore: 0,
      evidence: {
        note: "No responder action after the trigger",
        trigger: trigger ? cite(trigger, opts.startedAt) : { at: triggerAt.toISOString(), text: "Drill start" },
        targetMinutes: targetMin,
      },
    };
  }

  const minutes = (response.occurredAt.getTime() - triggerAt.getTime()) / 60000;
  let score: number;
  if (minutes <= targetMin) score = 100;
  else if (minutes <= 2 * targetMin) score = 99 - ((minutes - targetMin) / targetMin) * 49;
  else score = Math.max(0, 49 * (1 - (minutes - 2 * targetMin) / (2 * targetMin)));

  return {
    rawValue: round1(minutes),
    normalizedScore: round1(score),
    evidence: {
      note: `First responder action ${round1(minutes)} min after the trigger (target ${targetMin} min)`,
      trigger: trigger ? cite(trigger, opts.startedAt) : { at: triggerAt.toISOString(), text: "Drill start" },
      response: cite(response, opts.startedAt),
      targetMinutes: targetMin,
    },
  };
}

/** Completeness: share of checklist items mentioned in human messages/actions. */
export function scoreCompleteness(
  events: DrillEvent[],
  target: { checklist?: unknown },
  opts: { startedAt: Date | null },
): ScoreResult {
  const checklist = Array.isArray(target.checklist) ? target.checklist.map(String).filter(Boolean) : [];
  if (!checklist.length) {
    return { rawValue: null, normalizedScore: 0, evidence: { note: "Objective has no checklist" } };
  }
  const humans = humanEvents(events);
  const matched: { item: string; keywords: string[]; event: ReturnType<typeof cite> }[] = [];
  const missing: string[] = [];

  for (const item of checklist) {
    const hit = humans
      .map((e) => ({ e, m: mentions(eventText(e), item) }))
      .find(({ m }) => m.matched);
    if (hit) matched.push({ item, keywords: hit.m.hits, event: cite(hit.e, opts.startedAt) });
    else missing.push(item);
  }

  return {
    rawValue: matched.length,
    normalizedScore: round1((matched.length / checklist.length) * 100),
    evidence: {
      note: `${matched.length} of ${checklist.length} checklist items observed`,
      matched,
      missing,
    },
  };
}

/** Coordination: share of stakeholders mentioned or @-tagged in human messages. */
export function scoreCoordination(
  events: DrillEvent[],
  target: { stakeholders?: unknown },
  opts: { startedAt: Date | null; mentionNames?: Map<string, string> },
): ScoreResult {
  const stakeholders = Array.isArray(target.stakeholders) ? target.stakeholders.map(String).filter(Boolean) : [];
  if (!stakeholders.length) {
    return { rawValue: null, normalizedScore: 0, evidence: { note: "Objective has no stakeholder list" } };
  }
  const humans = humanEvents(events).filter((e) => e.eventType === "message");
  const contacted: { stakeholder: string; event: ReturnType<typeof cite> }[] = [];
  const notContacted: string[] = [];

  for (const stakeholder of stakeholders) {
    const hit = humans.find((e) => {
      let text = eventText(e);
      // Expand Slack @-mentions (<@U123>) to display names when we know them.
      if (opts.mentionNames) {
        text = text.replace(/<@([A-Z0-9]+)>/g, (_, id) => ` ${opts.mentionNames!.get(id) ?? ""} `);
      }
      // Names must appear as a phrase, so "support lead … VP Engineering" ≠ "Engineering Lead".
      return mentionsPhrase(text, stakeholder);
    });
    if (hit) contacted.push({ stakeholder, event: cite(hit, opts.startedAt) });
    else notContacted.push(stakeholder);
  }

  return {
    rawValue: contacted.length,
    normalizedScore: round1((contacted.length / stakeholders.length) * 100),
    evidence: {
      note: `${contacted.length} of ${stakeholders.length} stakeholders contacted`,
      contacted,
      notContacted,
    },
  };
}

/** Quality: mean of rubric ratings, each normalized by its scale. */
export function scoreQuality(ratings: { dimension: string; rating: number; scale: number }[]): ScoreResult {
  if (!ratings.length) return { rawValue: null, normalizedScore: 0, evidence: {} };
  const mean = ratings.reduce((a, r) => a + r.rating / r.scale, 0) / ratings.length;
  const avgRating = ratings.reduce((a, r) => a + r.rating, 0) / ratings.length;
  return { rawValue: round1(avgRating), normalizedScore: round1(mean * 100), evidence: { ratings } };
}

export const ACCURACY_SCORES = { correct: 100, partial: 50, incorrect: 0 } as const;
export type AccuracyVerdict = keyof typeof ACCURACY_SCORES;
