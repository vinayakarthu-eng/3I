import Anthropic from "@anthropic-ai/sdk";
import type { DrillObjective, Drill } from "@drillforce/core";
import { CRITERIA_TYPE_LABELS } from "@drillforce/shared";
import { env } from "./env";

const client = env.anthropicApiKey ? new Anthropic({ apiKey: env.anthropicApiKey }) : null;

export interface TranscriptLine {
  at: Date;
  who: string;
  kind: "message" | "inject" | "bot";
  text: string;
}

/** The stable, per-drill system prompt (cached across calls). */
export function buildSystemPrompt(drill: Drill, objectives: DrillObjective[]) {
  const scenario = drill.scenario ?? {};
  const injects = (scenario.injects ?? [])
    .map((i) => `- T+${i.at_minute}m: ${i.description}`)
    .join("\n");
  const objectiveLines = objectives
    .map((o) => `- [${CRITERIA_TYPE_LABELS[o.criteriaType]}] ${o.description}`)
    .join("\n");

  return `You are the Incident Commander simulator for a drill exercise.

Drill: ${drill.name}
Description: ${drill.description ?? "—"}
Scenario: ${scenario.summary ?? "—"}
Planned injects:
${injects || "- none"}
Expected actions: ${(scenario.expected_actions ?? []).join("; ") || "—"}
Objectives:
${objectiveLines || "- none"}

Your role: challenge responders, ask for status updates, and simulate stakeholder pressure (executives, customers, support) so the team practices under realistic conditions.

Rules:
- Keep every reply to 1–2 sentences. This is a fast-moving incident channel.
- Stay in character as the IC. Never mention that you are an AI or that this is generated.
- Never solve the incident for the team or reveal the objectives' targets; ask questions that make them act.
- When asked a direct question, answer in character with plausible incident details consistent with the scenario.
- When the channel is quiet, either escalate with a new development (prefer the next planned inject not yet used) or demand a specific status update from a named role.
- Plain text only. You may use Slack *bold* sparingly. Do not prefix replies with "IC:".`;
}

function renderTranscript(lines: TranscriptLine[], start: Date | null) {
  if (!lines.length) return "(no messages yet)";
  return lines
    .map((l) => {
      const mins = start ? Math.max(0, Math.round((l.at.getTime() - start.getTime()) / 60000)) : 0;
      const label = l.kind === "inject" ? "INJECT" : l.who;
      return `[T+${mins}m] ${label}: ${l.text}`;
    })
    .join("\n");
}

export type IcTask =
  | { kind: "reply"; from: string; question: string }
  | { kind: "nudge"; quietMinutes: number; unusedInjects: string[] };

/** Asks Claude for the IC's next line. Falls back to a scripted line on any failure. */
export async function generateIcLine(opts: {
  system: string;
  transcript: TranscriptLine[];
  startedAt: Date | null;
  task: IcTask;
}): Promise<{ text: string; isInject: boolean }> {
  if (!client) return scriptedLine(opts.task);

  const instruction =
    opts.task.kind === "reply"
      ? `${opts.task.from} just asked you: "${opts.task.question}"\nReply in character.`
      : `The channel has been quiet for ${opts.task.quietMinutes} minutes.${
          opts.task.unusedInjects.length
            ? ` Planned injects not yet used: ${opts.task.unusedInjects.map((i) => `"${i}"`).join(", ")}.`
            : ""
        }\nPost your next challenge. If you introduce a new development in the scenario, start your reply with "INJECT:".`;

  try {
    const response = await client.beta.messages.create({
      model: env.anthropicModel,
      max_tokens: 4000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [
        {
          role: "user",
          content: `Channel transcript so far:\n${renderTranscript(opts.transcript, opts.startedAt)}\n\n${instruction}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      console.warn("IC bot request was declined:", response.stop_details?.category ?? "unknown");
      return scriptedLine(opts.task);
    }

    const text = response.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    if (!text) return scriptedLine(opts.task);

    const isInject = /^INJECT:/i.test(text);
    return { text: text.replace(/^INJECT:\s*/i, ""), isInject };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn("Claude rate limited; using a scripted IC line.");
    } else if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}:`, err.message);
    } else {
      console.error("IC bot failed:", err);
    }
    return scriptedLine(opts.task);
  }
}

const SCRIPTED_CHALLENGES = [
  "I need a status update in the next two minutes: what do we know, what are we doing, and when is the next checkpoint?",
  "The VP of Engineering is asking for an ETA. Who owns the customer-facing update?",
  "Support is getting flooded with tickets. What are we telling customers right now?",
  "Have we confirmed the blast radius? Which systems and customers are affected?",
  "Who is documenting the timeline? I want decisions captured as we make them.",
  "What's our rollback plan if the current mitigation doesn't hold?",
];
let scriptedIndex = 0;

function scriptedLine(task: IcTask): { text: string; isInject: boolean } {
  if (task.kind === "reply") {
    return { text: "Good question. What does your data show? Give me your best assessment and we'll decide from there.", isInject: false };
  }
  if (task.unusedInjects.length) return { text: task.unusedInjects[0], isInject: true };
  const text = SCRIPTED_CHALLENGES[scriptedIndex++ % SCRIPTED_CHALLENGES.length];
  return { text, isInject: false };
}
