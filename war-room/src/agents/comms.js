import { BaseAgent, has } from "./base-agent.js";

const STATUS_COPY = {
  investigating: "We are investigating reports of errors affecting some requests. Updates to follow.",
  mitigating: "We have identified the cause and are actively applying a fix.",
  monitoring: "A fix has been deployed and we are monitoring systems for full recovery.",
  resolved: "This incident has been resolved. All systems are operating normally.",
};

export class Comms extends BaseAgent {
  constructor() {
    super("comms");
  }

  decide(event, state) {
    if (state.closed) return null;

    if (event.type === "phase") {
      const copy = STATUS_COPY[event.meta.phase];
      if (!copy) return null;
      return this.say(
        `:newspaper: *Status-page draft (${event.meta.phase})*: "${copy}" — IC, approve to publish?`,
      );
    }

    if (event.type === "inject" && (event.meta?.type === "comms" || has(event.text, "support", "customer", "tickets"))) {
      return this.say(
        `Customers are feeling this. Draft reply: "We're aware of the issue and our team is actively working on it." — holding for IC approval.`,
      );
    }

    return null;
  }
}
