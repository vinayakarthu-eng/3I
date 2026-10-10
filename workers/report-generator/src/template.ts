import { CRITERIA_TYPE_LABELS, PARTICIPANT_ROLE_LABELS, type ActionCategory, type ActionSeverity, type CriteriaType } from "@drillforce/shared";
import type { DrillData } from "./collect";
import type { AarSections } from "./schema";

const CATEGORY_FOR: Record<CriteriaType, ActionCategory> = {
  time_to_action: "process",
  completeness: "process",
  coordination: "process",
  quality: "knowledge",
  accuracy: "knowledge",
};

const ROOT_CAUSE_FOR: Record<CriteriaType, string> = {
  time_to_action: "Detection and acknowledgement depend on someone noticing the alert; there is no explicit first-responder rotation or paging escalation for this scenario.",
  completeness: "Runbook steps were executed from memory rather than from a checklist, so verification steps were skipped under pressure.",
  coordination: "There is no predefined stakeholder notification list for this incident type, so communication depended on who the responders remembered.",
  quality: "Communication templates for this scenario don't exist, so updates were written from scratch while handling the incident.",
  accuracy: "Responders lacked the context or tooling to confirm impact before reporting it.",
};

const ACTION_FOR: Record<CriteriaType, (o: string) => string> = {
  time_to_action: (o) => `Add an explicit paging escalation and first-responder acknowledgement SLA for “${o}”.`,
  completeness: (o) => `Turn the runbook behind “${o}” into a step-by-step checklist used during incidents, including verification steps.`,
  coordination: (o) => `Create a stakeholder notification list and template for “${o}” and link it from the runbook.`,
  quality: (o) => `Write pre-approved communication templates and run a short training on “${o}”.`,
  accuracy: (o) => `Document how to confirm impact for “${o}” and add the relevant dashboards to the runbook.`,
};

const severityFor = (score: number): ActionSeverity => (score < 40 ? "P1" : score < 55 ? "P2" : score < 70 ? "P3" : "P4");
const round = (n: number) => Math.round(n);

/** Deterministic AAR used when Claude isn't configured (or fails). */
export function generateFromTemplate(data: DrillData): AarSections {
  const { drill, objectives, latest, composite, participants, actorName, tPlus } = data;
  const ic = participants.find((p) => p.role === "incident_commander") ?? participants[0];
  const ownerName = ic?.name ?? "Drill manager";

  const scored = objectives
    .map((o) => ({ o, score: latest.get(o.id)?.normalizedScore != null ? Number(latest.get(o.id)!.normalizedScore) : null }))
    .filter((x): x is { o: (typeof objectives)[number]; score: number } => x.score != null);
  const strong = scored.filter((x) => x.score >= 80);
  const weak = scored.filter((x) => x.score < 70).sort((a, b) => a.score - b.score);

  const compositeText = composite
    ? `a composite score of ${round(Number(composite.compositeScore))} (${composite.passed ? "pass" : "fail"} against a threshold of ${data.passThreshold})`
    : "no composite score yet";

  const executiveSummary = [
    `${drill.name} exercised the team's response to: ${(drill.scenario?.summary ?? drill.description ?? "the planned scenario").replace(/[.\s]+$/, "")}. ` +
      `The drill ran for ${data.durationMinutes ?? "an unknown number of"} minutes with ${participants.length} participant${participants.length === 1 ? "" : "s"} and ${data.drillEvents.length} recorded events.`,
    `The team achieved ${compositeText}. ` +
      (strong.length
        ? `Strongest areas: ${strong.map((x) => `${x.o.description} (${round(x.score)})`).join("; ")}.`
        : "No objective reached the 80-point mark."),
    weak.length
      ? `The main gaps were ${weak.map((x) => `${x.o.description.toLowerCase()} (${round(x.score)})`).join("; ")}. Corrective actions below address each one.`
      : "No objective scored below 70; the corrective actions below are refinements rather than urgent fixes.",
  ].join("\n\n");

  const interesting = data.drillEvents.filter((e) => e.eventType !== "score");
  const timeline = interesting.slice(0, 15).map((e) => ({
    tPlusMinutes: tPlus(e.occurredAt),
    actor: actorName(e.actor),
    event: String(e.payload.text ?? e.eventType),
    annotation:
      e.eventType === "inject"
        ? "Scenario inject — tests how the team adapts."
        : e.eventType === "signal"
          ? "Signal available to responders."
          : e.eventType === "system"
            ? "Drill lifecycle change."
            : e.eventType === "action"
              ? "Responder action recorded."
              : "Responder communication.",
  }));

  const objectivesAnalysis = objectives.map((o) => {
    const s = latest.get(o.id);
    const score = s?.normalizedScore != null ? Number(s.normalizedScore) : null;
    const ev = (s?.evidence ?? {}) as Record<string, unknown>;
    return {
      objectiveId: o.id,
      objective: o.description,
      score,
      evidence: typeof ev.note === "string" ? ev.note : typeof ev.notes === "string" && ev.notes ? ev.notes : "No evidence recorded.",
      assessment:
        score == null
          ? "Not scored."
          : score >= 80
            ? `Met: ${CRITERIA_TYPE_LABELS[o.criteriaType].toLowerCase()} was strong.`
            : score >= 70
              ? "Largely met, with room to tighten."
              : "Not met; see corrective actions.",
    };
  });

  const strengths = (strong.length ? strong : scored.slice().sort((a, b) => b.score - a.score).slice(0, 2)).map((x) => ({
    title: x.o.description,
    detail: `Scored ${round(x.score)} on ${CRITERIA_TYPE_LABELS[x.o.criteriaType].toLowerCase()}.`,
    tPlusMinutes: null,
  }));
  if (participants.length) {
    strengths.push({
      title: "Roles were assigned before the drill",
      detail: participants.map((p) => `${p.name} (${PARTICIPANT_ROLE_LABELS[p.role]})`).join(", "),
      tPlusMinutes: null,
    });
  }

  const improvements = weak.map((x) => ({
    title: x.o.description,
    detail: `Scored ${round(x.score)} on ${CRITERIA_TYPE_LABELS[x.o.criteriaType].toLowerCase()}.`,
    severity: severityFor(x.score),
  }));

  const rootCauses = weak.map((x) => ({ gap: x.o.description, cause: ROOT_CAUSE_FOR[x.o.criteriaType] }));

  const correctiveActions = weak.map((x) => ({
    gap: x.o.description,
    action: ACTION_FOR[x.o.criteriaType](x.o.description),
    category: CATEGORY_FOR[x.o.criteriaType],
    severity: severityFor(x.score),
    owner: ownerName,
    dueInDays: x.score < 40 ? 14 : x.score < 55 ? 30 : 45,
    verificationMethod: `Re-run ${drill.name} and score at least 80 on “${x.o.description}”.`,
  }));

  return { executiveSummary, timeline, objectivesAnalysis, strengths, improvements, rootCauses, correctiveActions };
}
