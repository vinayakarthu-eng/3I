import { classify } from "../intents.js";
import { BaseAgent, has } from "./base-agent.js";

/**
 * Liaison (skills/index.js → liaison): engages people outside the response team — support,
 * vendors, other teams, leadership — and keeps them informed.
 */
export class Liaison extends BaseAgent {
  constructor() {
    super("liaison");
  }

  decide(event, state) {
    if (state.closed) return null;

    // T+5 stakeholder check.
    if (event.type === "stakeholder_check") {
      return {
        text: `:link: Stakeholder check at ${state.t().slice(0, 7)}: *Does support know?* (I'll brief them on what to tell customers.) *Any vendor or dependency team involved?* *Does leadership need an ETA?* Tell me who to loop in and I'll own those conversations.`,
        job: "Ask which stakeholders (support, vendors, dependency teams, leadership) need to be engaged, offering to own it.",
      };
    }

    // Payments / third parties affected.
    const paymentsHit =
      state.scenario.paymentsAffected &&
      !state.cadence.paymentsEscalated &&
      event.type === "inject" &&
      (has(event.text, "payment", "checkout", "charge", "billing") || event.meta?.affects?.some((a) => /payment/i.test(a[0])));
    if (paymentsHit) {
      state.cadence.paymentsEscalated = true;
      state.milestone("Liaison engaged payments vendor + Finance");
      return {
        text: `Escalating to the payments vendor and Finance — flagging possible failed/duplicate charges for reconciliation. I'll own those threads so the team stays on the fix.`,
        job: "Escalate to the payments vendor and Finance and say you own those conversations.",
      };
    }

    // A responder mentions a stakeholder or is blocked.
    if (event.type === "user") {
      const { intent } = classify(event.text);
      if (intent === "stakeholder") {
        return {
          text: `${state.mention(event.name)} I'll take that — who exactly should I contact, and what do they need from us (status, ETA, action)?`,
          job: "Offer to handle the stakeholder and ask who and what they need.",
          thread: true,
        };
      }
    }
    return null;
  }
}
