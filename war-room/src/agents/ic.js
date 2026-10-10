import { SEVERITIES } from "../state.js";
import { BaseAgent, has } from "./base-agent.js";

const FUNCTIONS = ["ops", "operations", "comms", "security", "database", "db", "infra", "mitigation", "scribe"];

export class IC extends BaseAgent {
  constructor() {
    super("ic");
  }

  decide(event, state) {
    if (state.closed) return null;

    switch (event.type) {
      case "declare": {
        const sev = SEVERITIES[state.severity];
        state.setPhase("investigating");
        return this.say(
          `I'm Incident Commander on this. Declaring *${sev.label}* — ${state.scenario.summary} Moving to *investigating*. Deputy: blast radius. SME: working theories. Comms: hold a draft.`,
        );
      }

      case "status_check":
        return this.say(
          `:clipboard: Status check at T+${state.elapsedClock()} — phase *${state.phase}*, ${state.severity}. ${this._open(state)} Anyone blocked?`,
        );

      case "sitrep":
        return { text: this._sitrep(state) };

      case "user":
        return this._onHuman(event, state);

      case "inject":
        // The IC tasks Comms on stakeholder pressure; lets SME/Deputy handle telemetry.
        if (has(event.text, "ceo", "exec", "board", "status line", "status update")) {
          return this.say(`Comms — get me a one-line exec update, I'll approve it before it goes out.`);
        }
        return null;

      case "agent":
        // Go/no-go: react to the Deputy's risk verdict on a pending proposal.
        if (event.role === "deputy" && state.proposals.length) {
          if (has(event.text, "hold", "danger", "data loss", "risk", "object")) {
            return this.say(`Holding the go/no-go — let's close that risk first, then proceed.`);
          }
          if (has(event.text, "no objection", "safe", "clear", "green")) {
            const p = state.proposals.shift();
            return this.say(`:white_check_mark: Approved — ${p.by}, you're cleared to proceed: "${p.text}". Go.`);
          }
        }
        return null;

      default:
        return null;
    }
  }

  _onHuman(event, state) {
    const t = event.text;

    if (has(t, "sitrep", "status", "where are we", "where do we stand")) {
      return { text: this._sitrep(state) };
    }

    // Role claim.
    if (has(t, "i'll take", "i will take", "i can take", "i've got", "assign me", "i'll run", "i'll own")) {
      const fn = FUNCTIONS.find((f) => t.toLowerCase().includes(f)) || "ops";
      state.roles[fn] = event.name;
      return this.say(`Thanks ${event.name} — you've got *${fn}*. Keep me posted.`);
    }

    // Root cause → mitigating.
    if (has(t, "root cause", "found the cause", "identified the", "it's the", "caused by") && state.phase !== "mitigating") {
      state.setPhase("mitigating");
      return this.say(
        `Root cause called by ${event.name}. Moving to *mitigating*. Deputy — rollback ready? SME — confirm the remediation.`,
      );
    }

    // Proposal → go/no-go gate.
    if (has(t, "i propose", "i recommend", "i suggest", "proposal:", "let's ", "we should")) {
      state.proposals.push({ by: event.name, text: t });
      return this.say(`Noted, ${event.name}: "${t}". Deputy — risk check on that before I give the go.`);
    }

    // Fix deployed → monitoring.
    if (has(t, "fix deployed", "deployed the fix", "mitigation applied", "failed over", "rolled back", "patch is live")) {
      state.setPhase("monitoring");
      return this.say(
        `Fix is in. Opening a monitoring window. Comms — draft a *monitoring* update. Watching error rates and latency.`,
      );
    }

    // Resolved.
    if (has(t, "all clear", "resolved", "back to normal", "recovered", "we're green", "incident over")) {
      state.setPhase("resolved");
      return this.say(`Calling it — *resolved*. Strong work, team. Scribe, close it out with an after-action.`);
    }

    return null;
  }

  _open(state) {
    const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
    const prop = state.proposals.length ? `${state.proposals.length} proposal(s) awaiting go/no-go.` : "";
    return `${down.length ? `Down: ${down.join(", ")}. ` : ""}${prop}`.trim() || "Holding steady.";
  }

  _sitrep(state) {
    const down = state.services.filter((s) => s.status === "down").map((s) => s.name);
    const degraded = state.services.filter((s) => s.status === "degraded").map((s) => s.name);
    const roles = Object.entries(state.roles).map(([k, v]) => `${k}=${v}`).join(", ") || "none assigned";
    return [
      `:rotating_light: *SITREP* — ${state.scenario.title}`,
      `Severity *${state.severity}* · phase *${state.phase}* · T+${state.elapsedClock()}`,
      `Down: ${down.join(", ") || "none"} · Degraded: ${degraded.join(", ") || "none"}`,
      `Roles: ${roles}`,
      `Injects fired: ${state.injectsFired}${state.proposals.length ? ` · ${state.proposals.length} proposal(s) pending` : ""}`,
    ].join("\n");
  }
}
