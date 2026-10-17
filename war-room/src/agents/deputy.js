import { BaseAgent, has } from "./base-agent.js";

const DANGEROUS = ["delete", "drop", "truncate", "wipe", "force", "rm -rf", "prod data", "purge", "disable backups"];

/**
 * Deputy IC (skills/index.js → deputy): tracks action items, chases overdue ones, runs the risk
 * check on proposals, reports blast radius, and nudges the IC when updates are late.
 */
export class Deputy extends BaseAgent {
  constructor() {
    super("deputy");
  }

  decide(event, state) {
    if (state.closed) return null;

    // Blast radius when a signal changes service health.
    if (event.type === "inject" && event.meta?.affects?.length) {
      const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
      const degraded = state.services.filter((s) => s.status === "degraded").map((s) => s.name);
      return {
        text: `Blast radius now: *${down.length} down* (${down.join(", ") || "—"}), ${degraded.length} degraded. ${this._rollback(state)}`,
        job: "Report the current blast radius and the rollback/containment option.",
      };
    }

    // Flag dangerous human proposals proactively.
    if (event.type === "user" && has(event.text, "i propose", "i recommend", "i suggest", "let's ", "we should")) {
      if (DANGEROUS.some((d) => event.text.toLowerCase().includes(d))) {
        return {
          text: `:warning: Flagging that — “${event.text}” risks data loss. Snapshot first and stage it behind a review.`,
          job: "Flag the data-loss risk in the proposal and the safer path.",
          thread: true,
        };
      }
    }

    // Risk verdict when the IC asks for one.
    if (event.type === "agent" && event.role === "ic" && state.proposals.length && has(event.text, "risk check")) {
      const proposal = state.proposals.at(-1)?.text ?? "";
      if (DANGEROUS.some((d) => proposal.toLowerCase().includes(d))) {
        return { text: `*Hold* — that carries data-loss risk. Snapshot and define a rollback first.`, job: "Give a HOLD verdict with the reason." };
      }
      return {
        text: `*No objection* — blast radius is contained and we have a rollback path (${this._rollback(state).replace(/^\w+: /, "")}). Safe to proceed.`,
        job: "Give a NO OBJECTION verdict with the rollback path.",
      };
    }

    // Cadence: chase overdue tasks (every 3 drill-minutes), and keep the IC on schedule.
    // Each overdue action is chased at most twice (5 min apart), then escalated to the IC once.
    if (event.type === "chase") {
      const now = state.drillMs();
      const overdue = state.openTasks().filter((t) => !t.escalated && t.dueAt <= now && now - t.chasedAt >= 5 * 60_000);
      if (!overdue.length) return null;
      const chase = overdue.filter((t) => (t.chases ?? 0) < 2);
      const escalate = overdue.filter((t) => (t.chases ?? 0) >= 2);
      for (const t of chase) (t.chasedAt = now), (t.chases = (t.chases ?? 0) + 1);
      for (const t of escalate) t.escalated = true;
      const lines = [
        ...chase.map((t) => `${state.mention(t.owner)} — “${t.text}” was due ${state.t(t.dueAt).slice(0, 7)}. Status?`),
        ...escalate.map((t) => `IC — no update from ${state.mention(t.owner)} on “${t.text}” after two check-ins. Reassign or pair someone?`),
      ];
      return {
        text: `:hourglass: ${chase.length ? "Checking in on overdue actions" : "Escalating stalled actions"}:\n${lines.join("\n")}`,
        job: "Chase overdue actions by owner (or escalate stalled ones to the IC), asking for status.",
      };
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
