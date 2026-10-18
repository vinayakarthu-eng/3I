import Anthropic from "@anthropic-ai/sdk";
import { systemPromptFor } from "../skills/index.js";

/**
 * Claude mode: when ANTHROPIC_API_KEY is set, roles write their Slack messages with Claude,
 * grounded in their skill (system prompt), the live incident state, and the recent transcript.
 * The playbook still decides *when* a role speaks and *what job* the message must do; Claude
 * decides the words. Any failure falls back to the playbook text, so the drill never stalls.
 */

const MODEL = process.env.WAR_ROOM_MODEL || "claude-opus-5-5";
const enabled = !!(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = enabled ? new Anthropic({ timeout: 25_000, maxRetries: 1 }) : null;
let fallbacksSupported = true;

export const brainEnabled = () => enabled;
export const brainModel = () => MODEL;

const SCHEMA = {
  type: "object",
  properties: {
    text: { type: "string", description: "The Slack message to post, in Slack mrkdwn." },
  },
  required: ["text"],
  additionalProperties: false,
};

/**
 * Write one message for `role`.
 * @param {string} role       ic | deputy | comms | liaison | scribe | sme
 * @param {string} job        what this message must accomplish (from the playbook)
 * @param {string} context    incident state + transcript, rendered by the caller
 * @param {string} fallback   playbook text, used if Claude is off or fails
 */
export async function compose(role, job, context, fallback) {
  if (!client) return fallback;
  const request = {
    model: MODEL,
    max_tokens: 2000,
    // Chat route: low effort keeps replies quick; thinking stays adaptive.
    output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
    system: systemPromptFor(role),
    messages: [
      {
        role: "user",
        content: `${context}\n\n---\nYour job for this message: ${job}\n\nA playbook draft you may improve on (keep any <@USERID> mentions and T+ times accurate):\n${fallback}`,
      },
    ],
  };
  try {
    const response = await create(request);
    if (response.stop_reason === "refusal") return fallback;
    const block = response.content.find((b) => b.type === "text");
    const text = block ? JSON.parse(block.text).text?.trim() : "";
    return text || fallback;
  } catch (err) {
    console.warn(`[brain] ${role} fell back to playbook: ${err?.status ?? ""} ${err?.message ?? err}`);
    return fallback;
  }
}

async function create(request) {
  if (fallbacksSupported) {
    try {
      // Server-side refusal fallback: a declined request is retried on Anthropic's recommended model.
      return await client.beta.messages.create({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" });
    } catch (err) {
      if (!(err instanceof Anthropic.BadRequestError)) throw err;
      fallbacksSupported = false; // e.g. not available on this account — use the plain request from now on
    }
  }
  return client.messages.create(request);
}

// ─── AI mode: the Incident Commander decides (not just rewords) ───────────────
const IC_RULES = `
How you respond to responders (follow these patterns):
- Someone says they're investigating (no findings yet): thank them, say you'll come back, give a 5-minute ETA and the exact touch-base time from the context. Action: set_eta (5).
- Someone reports what they see ("I see X", "seeing X", "found X"): capture X back in a few words, record it (record_finding), then ask what their next steps are.
- Someone calls it a false alarm / not relevant / noise: push back — it IS relevant — cite concrete evidence from the context (services down, latest signals, reported impact); ask what would prove it's noise.
- Someone says "it's a drill": if they give evidence (tags like env:drill, synthetic traffic, the DrillForce briefing, data) → confirm "yes, it's a drill", thank them, and conclude (action conclude_drill). Without evidence → push back: we run it as real until it's proven.
- Someone reports customer impact: record it (record_impact) once and never ask about impact again.
- Someone asks you to move on / focus on mitigation: agree, set_phase mitigating, propose a concrete mitigation with an owner (propose_mitigation + request_risk_check), and ask for strong objections.
- Someone claims a role: assign_role and ask for their first step + ETA.
- Someone is blocked: give a practical workaround and say who will unblock them.
- A question for you: answer it directly from the context first, then (only if useful) ask one question.
Never repeat or paraphrase a question you already asked (your recent replies are listed). Never ask for something already known (facts are listed). At most one question per reply. Reply in 1–3 short sentences, addressing the person by their <@ID> mention when one is given.`;

const IC_SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string", description: "Your threaded Slack reply (mrkdwn)." },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["assign_role", "set_eta", "record_finding", "record_impact", "record_theory", "set_phase", "propose_mitigation", "request_risk_check", "conclude_drill"],
          },
          person: { type: "string", description: "Display name of the responder this is about." },
          role: { type: "string", description: "ops | comms | database | infra | security | liaison | scribe" },
          minutes: { type: "integer" },
          text: { type: "string", description: "Finding / impact / theory / task / proposal text, or the conclusion reason." },
          phase: { type: "string", enum: ["investigating", "mitigating", "monitoring", "resolved"] },
        },
        required: ["type"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "actions"],
  additionalProperties: false,
};

/**
 * AI mode for the IC: read the incident and the message, decide the reply and the actions.
 * Returns null when Claude is off or fails (the playbook takes over).
 */
export async function icDecide(context, message) {
  if (!client) return null;
  const request = {
    model: MODEL,
    max_tokens: 4000,
    output_config: { effort: "low", format: { type: "json_schema", schema: IC_SCHEMA } },
    system: `${systemPromptFor("ic")}\n\n${IC_RULES}`,
    messages: [{ role: "user", content: `${context}\n\n---\nNew message from ${message.name}${message.mention ? ` (${message.mention})` : ""}: ${message.text}\n\nDecide your reply and actions.` }],
  };
  try {
    const response = await create(request);
    if (response.stop_reason === "refusal") return null;
    const block = response.content.find((b) => b.type === "text");
    const parsed = block ? JSON.parse(block.text) : null;
    if (!parsed?.reply?.trim()) return null;
    return { reply: parsed.reply.trim(), actions: Array.isArray(parsed.actions) ? parsed.actions : [] };
  } catch (err) {
    console.warn(`[brain] IC decision fell back to playbook: ${err?.status ?? ""} ${err?.message ?? err}`);
    return null;
  }
}
