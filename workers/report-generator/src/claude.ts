import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { CRITERIA_TYPE_LABELS, DRILL_TYPE_LABELS, PARTICIPANT_ROLE_LABELS } from "@drillforce/shared";
import type { DrillData } from "./collect";
import { AarSchema, type AarSections } from "./schema";

export const AAR_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM_PROMPT = `You write After-Action Reports (AARs) for incident-response drills.

Readers are engineering and operations leaders deciding what to fix before a real incident. Be specific and evidence-based: cite times as T+Nm and quote short phrases from the transcript. Never invent events, people, or numbers that are not in the data. If evidence is thin, say so plainly.

Guidance per section:
- executiveSummary: 2-3 short paragraphs — what was tested, how the team performed overall (composite score and pass/fail), and the most important gaps.
- timeline: the 8-15 moments that shaped the response, not every message, each with a one-sentence annotation.
- objectivesAnalysis: one entry per objective, using the provided objective id and score.
- strengths: 3-5 concrete behaviours worth repeating, each tied to a moment when possible.
- improvements: real gaps, with severity P1 (could cause a major outage or harm) to P4 (minor polish).
- rootCauses: why each significant gap happened (process, tooling, knowledge, staffing, or design), not a restatement of the gap.
- correctiveActions: specific, verifiable actions, one or more per significant gap; owner must be one of the listed participants; dueInDays between 7 and 90.`;

function renderInput(data: DrillData) {
  const { drill, objectives, participants, latest, composite, actorName, tPlus } = data;
  const lines: string[] = [];
  lines.push(`# Drill: ${drill.name} (${DRILL_TYPE_LABELS[drill.type]})`);
  if (drill.description) lines.push(drill.description);
  if (drill.scenario?.summary) lines.push(`Scenario: ${drill.scenario.summary}`);
  if (drill.scenario?.expected_actions?.length) lines.push(`Expected actions: ${drill.scenario.expected_actions.join("; ")}`);
  lines.push(`Duration: ${data.durationMinutes ?? "unknown"} minutes`);
  lines.push(
    `Composite score: ${composite ? `${Number(composite.compositeScore)} (${composite.passed ? "PASS" : "FAIL"}, threshold ${data.passThreshold})` : "not computed"}`,
  );

  lines.push("\n# Participants");
  for (const p of participants) lines.push(`- ${p.name}: ${PARTICIPANT_ROLE_LABELS[p.role]}`);

  lines.push("\n# Objectives and scores");
  for (const o of objectives) {
    const s = latest.get(o.id);
    lines.push(
      `- id=${o.id} | ${CRITERIA_TYPE_LABELS[o.criteriaType]} | weight ${o.weight} | "${o.description}" | target ${JSON.stringify(o.targetValue)} | score ${s?.normalizedScore ?? "unscored"}`,
    );
    if (s?.evidence) lines.push(`  evidence: ${JSON.stringify(s.evidence)}`);
  }

  lines.push("\n# Transcript (drill events, oldest first)");
  for (const e of data.drillEvents) {
    const text = String(e.payload.text ?? e.payload.description ?? JSON.stringify(e.payload));
    lines.push(`[T+${tPlus(e.occurredAt)}m] ${e.eventType.toUpperCase()} ${actorName(e.actor)}: ${text}`);
  }
  return lines.join("\n");
}

export class AarGenerationError extends Error {}

/** Generates AAR sections with Claude using structured outputs. */
export async function generateWithClaude(data: DrillData): Promise<AarSections> {
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: AAR_MODEL,
    max_tokens: 64000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "high", format: betaZodOutputFormat(AarSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: `${renderInput(data)}\n\nWrite the After-Action Report.` }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new AarGenerationError(`Claude declined to write this report (${message.stop_details?.category ?? "no category"}).`);
  }
  if (message.stop_reason === "max_tokens") {
    throw new AarGenerationError("The report was cut off before it finished.");
  }
  if (!message.parsed_output) throw new AarGenerationError("Claude returned a report that didn't match the expected format.");
  return message.parsed_output;
}
