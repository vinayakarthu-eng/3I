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
