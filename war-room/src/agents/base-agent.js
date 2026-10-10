import { ROLES } from "../roles.js";

/**
 * An autonomous ICS agent. The orchestrator calls `decide(event, state)`; the agent
 * returns `{ text }` to speak or `null` to stay silent. Agents may mutate `state`
 * (phase, roles, proposals) as a side effect of a decision.
 */
export class BaseAgent {
  constructor(role) {
    this.role = role;
    this.meta = ROLES[role];
  }

  decide(_event, _state) {
    return null;
  }

  // Pick one of several phrasings for variety.
  say(...variants) {
    return { text: variants[Math.floor(Math.random() * variants.length)] };
  }
}

export const has = (text, ...needles) => {
  const t = (text || "").toLowerCase();
  return needles.some((n) => t.includes(n));
};
