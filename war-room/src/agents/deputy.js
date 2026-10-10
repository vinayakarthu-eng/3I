import { BaseAgent, has } from "./base-agent.js";

const DANGEROUS = ["delete", "drop", "truncate", "wipe", "force", "rm -rf", "prod data", "purge", "disable backups"];

export class Deputy extends BaseAgent {
  constructor() {
    super("deputy");
  }

  decide(event, state) {
    if (state.closed) return null;

    if (event.type === "inject" && event.meta?.affects?.length) {
      const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
      const degraded = state.services.filter((s) => s.status === "degraded").map((s) => s.name);
      const plan = this._rollback(state);
      return this.say(
        `Blast radius: *${down.length} down* (${down.join(", ") || "—"}), ${degraded.length} degraded. ${plan}`,
      );
    }

    // Proactively flag dangerous human proposals.
    if (event.type === "user" && has(event.text, "i propose", "i recommend", "i suggest", "let's ", "we should")) {
      if (DANGEROUS.some((d) => event.text.toLowerCase().includes(d))) {
        return this.say(
          `:warning: Flagging that — "${event.text}" risks data loss. Recommend we snapshot first and stage it behind a review.`,
        );
      }
    }

    // Risk verdict when the IC asks for a check (go/no-go gate).
    if (event.type === "agent" && event.role === "ic" && has(event.text, "risk check", "risk on", "rollback ready")) {
      const proposal = state.proposals[state.proposals.length - 1]?.text ?? "";
      if (DANGEROUS.some((d) => proposal.toLowerCase().includes(d))) {
        return this.say(`*Hold* — that carries data-loss risk. Let's take a snapshot and define a rollback before we proceed.`);
      }
      return this.say(`*No objection* — replica is in sync and we have a rollback path. Safe to proceed.`);
    }

    return null;
  }

  _rollback(state) {
    switch (state.scenario.domain) {
      case "db":
        return "Rollback: promote the in-sync replica, repoint the app, keep the old primary for forensics.";
      case "security":
        return "Containment: rate-limit the attack range at the WAF, force-reset affected sessions.";
      case "k8s":
        return "Rollback: scale the canary to zero and pin traffic to the last-good stable revision.";
      default:
        return "Rollback: revert to the last known-good state and verify before reopening traffic.";
    }
  }
}
