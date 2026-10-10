import { BaseAgent } from "./base-agent.js";

export class Scribe extends BaseAgent {
  constructor() {
    super("scribe");
  }

  decide(event, state) {
    if (event.type === "timeline") return { text: this._timeline(state) };
    if (event.type === "afteraction") return { text: this._afterAction(state) };
    return null;
  }

  _timeline(state) {
    const recent = state.events
      .filter((e) => e.kind === "inject" || e.kind === "user")
      .slice(-3)
      .map((e) => `  • T+${clock(e.at)} — ${e.name}: ${truncate(e.text)}`);
    return [`:memo: *Timeline* (phase ${state.phase})`, ...recent].join("\n");
  }

  _afterAction(state) {
    const injects = state.events.filter((e) => e.kind === "inject");
    const humans = [...new Set(state.events.filter((e) => e.kind === "user").map((e) => e.name))];
    const roles = Object.entries(state.roles).map(([k, v]) => `${k}: ${v}`).join(", ") || "—";
    return [
      `:page_facing_up: *After-Action Report — ${state.scenario.title}*`,
      `Severity *${state.severity}* · duration *${state.elapsedClock()}* · final phase *${state.phase}*`,
      `Responders: ${humans.join(", ") || "agents only"} · roles: ${roles}`,
      `Injects handled: ${injects.length}`,
      `What happened: ${state.scenario.summary}`,
      `Follow-ups: 1) add an automated check for this failure mode, 2) rehearse the rollback path, 3) pre-draft the status-page copy.`,
    ].join("\n");
  }
}

const clock = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
const truncate = (t) => (t.length > 80 ? t.slice(0, 77) + "…" : t);
