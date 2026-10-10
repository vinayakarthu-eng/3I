import { BaseAgent, has } from "./base-agent.js";

export class Liaison extends BaseAgent {
  constructor() {
    super("liaison");
  }

  decide(event, state) {
    if (state.closed) return null;

    // Engages only when money / vendors / third parties are in play.
    const paymentsHit =
      state.scenario.paymentsAffected &&
      (event.type === "inject"
        ? has(event.text, "payment", "checkout", "charge", "billing") || event.meta?.affects?.some((a) => /payment/i.test(a[0]))
        : false);

    if (paymentsHit) {
      return this.say(
        `:link: Escalating to the payments vendor + Finance — flagging possible failed/duplicate charges for reconciliation. I'll own vendor comms so the team can stay on the fix.`,
      );
    }

    if (event.type === "inject" && has(event.text, "vendor", "third-party", "provider", "upstream")) {
      return this.say(`Opening a bridge with the provider's on-call and getting their incident ID. Will relay anything actionable.`);
    }

    return null;
  }
}
