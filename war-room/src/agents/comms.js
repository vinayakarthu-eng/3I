import { classify } from "../intents.js";
import { BaseAgent } from "./base-agent.js";

const STATUS_COPY = {
  investigating: "We are investigating reports of errors affecting some requests. Updates to follow.",
  mitigating: "We have identified the cause and are actively applying a fix.",
  monitoring: "A fix has been deployed and we are monitoring systems for full recovery.",
  resolved: "This incident has been resolved. All systems are operating normally.",
};

/**
 * Comms lead (skills/index.js → comms): owned separately from the IC. At T+10 puts the
 * internal-vs-external decision to the IC; drafts updates on phase changes; hands over to a
 * human who claims comms.
 */
export class Comms extends BaseAgent {
  constructor() {
    super("comms");
  }

  decide(event, state) {
    if (state.closed) return null;
    const owner = state.commsOwner;

    // A human claimed comms: acknowledge the handover in their thread.
    if (event.type === "user" && classify(event.text).intent === "claim" && classify(event.text).function === "comms") {
      return {
        text: `${state.mention(event.name)} you own comms now — I'll draft, you decide and send (with IC approval). First call coming at ${state.t(10 * 60_000).slice(0, 7)}: internal vs external.`,
        job: "Acknowledge the human comms owner and explain how you'll support them.",
        thread: true,
      };
    }

    // T+10: the internal vs external decision.
    if (event.type === "comms_decision") {
      const customerImpact = state.services.some((s) => s.status === "down") || state.scenario.paymentsAffected;
      const rec = customerImpact
        ? "I recommend *external* — customers are affected (failed requests/payments). Status page now, internal update in parallel."
        : "I recommend *internal only* for now — no confirmed customer impact.";
      const ownerLine = owner ? `${state.mention(owner)} (comms owner) and IC` : "IC";
      return {
        text: `:loudspeaker: It's ${state.t().slice(0, 7)} — ${ownerLine}: *do we need external comms (status page / customers) or internal comms only?* ${rec} Reply “external” or “internal” and I'll have the draft ready.`,
        job: "Ask the IC (and comms owner) to decide internal vs external comms, with your recommendation based on customer impact.",
      };
    }

    // Leadership pressure: draft the exec one-liner.
    if (event.type === "inject" && /\b(ceo|exec|board|leadership)\b/i.test(event.text)) {
      return {
        text: `Exec line draft: “${state.severity} in progress: ${state.scenario.summary} Team engaged; phase *${state.phase}*; next update in 15 min.” — ${owner ? `${state.mention(owner)}, ` : ""}IC, OK to send to #exec?`,
        job: "Draft a one-line executive status update for approval.",
      };
    }

    // Phase change: draft the matching update.
    if (event.type === "phase") {
      const copy = STATUS_COPY[event.meta.phase];
      if (!copy) return null;
      return {
        text: `:newspaper: *Draft update (${event.meta.phase})*: “${copy}” — ${owner ? `${state.mention(owner)}, ` : ""}IC, approve to send?`,
        job: "Draft the communication matching the new phase and ask for approval.",
      };
    }

    // Someone answered the decision or asked about comms.
    if (event.type === "user" && /\b(external|internal)\b/i.test(event.text) && state.cadence.commsAsked) {
      const external = /\bexternal\b/i.test(event.text);
      state.decisions.push({ at: state.drillMs(), text: `Comms: ${external ? "external + internal" : "internal only"}` });
      state.milestone(`Comms decision: ${external ? "external + internal" : "internal only"}`);
      return {
        text: external
          ? `On it. *Status page draft:* “We're investigating elevated errors affecting checkout. Next update in 30 minutes.” *Internal:* summary to #incidents. Approve?`
          : `Understood — internal only. *Internal update:* “SEV in progress, impact contained to internal services, next update in 15 minutes.” Approve?`,
        job: "Acknowledge the comms decision and post the matching draft for approval.",
        thread: true,
      };
    }

    return null;
  }
}
