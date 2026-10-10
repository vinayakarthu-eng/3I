import { ROLES, ROLE_ORDER } from "../roles.js";
import { SEVERITIES } from "../state.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const MAX_DEPTH = 2; // cross-agent observation waves
const MAX_SPEAKS = 6; // per root event, prevents storms

/**
 * Routes events (human messages, injects, timers) through the agents in
 * IC → Deputy → SME → Comms → Liaison → Scribe order, with per-role delays,
 * min-speak throttles, and bounded cross-agent observation (loop prevention).
 */
export class Orchestrator {
  constructor({ state, agents, send, speed }) {
    this.state = state;
    this.agents = agents;
    this.send = send; // (message, exceptAdapter?) => Promise
    this.speed = Math.max(1, speed || 1);
    this.lastSpoke = {};
    this.beats = 0;
  }

  async speak(role, text, kind = "agent") {
    const m = ROLES[role];
    const message = { role, name: m.name, emoji: m.emoji, color: m.color, text, kind };
    this.state.record(message);
    this.lastSpoke[role] = Date.now();
    await this.send(message);
  }

  async emitInject(inject) {
    for (const [name, status] of inject.affects ?? []) this.state.degradeService(name, status);
    this.state.injectsFired += 1;
    const message = {
      role: null,
      name: "Scenario Control",
      emoji: "⚠️",
      color: SEVERITIES[inject.severity ?? this.state.severity].tone,
      text: inject.text,
      kind: "inject",
      severity: inject.severity ?? this.state.severity,
    };
    this.state.record(message);
    await this.send(message);
  }

  async emitUser(user, exceptAdapter) {
    const message = { role: null, name: user.name, emoji: "🧑", color: "#e2e8f0", text: user.text, kind: "user" };
    this.state.record(message);
    await this.send(message, exceptAdapter);
  }

  // ─── entry points ───────────────────────────────────────────────────────────
  async declare() {
    const before = this.state.phase;
    const out = this.agents.ic.decide({ type: "declare" }, this.state);
    if (out) {
      await sleep(ROLES.ic.delay / this.speed);
      await this.speak("ic", out.text);
    }
    await this._phaseFanout(before);
  }

  async handleUser(user, exceptAdapter) {
    if (this.state.closed) return;
    await this.emitUser(user, exceptAdapter);
    await this._dispatch({ type: "user", text: user.text, name: user.name });
    await this._beat();
  }

  async onInject(inject) {
    if (this.state.closed) return;
    await this.emitInject(inject);
    await this._dispatch({ type: "inject", text: inject.text, meta: inject });
    await this._beat();
  }

  async statusCheck() {
    if (this.state.closed) return;
    const out = this.agents.ic.decide({ type: "status_check" }, this.state);
    if (out) await this.speak("ic", out.text);
  }

  async sitrep() {
    const out = this.agents.ic.decide({ type: "sitrep" }, this.state);
    if (out) await this.speak("ic", out.text);
  }

  async afterAction() {
    if (this.state.closed) return;
    const out = this.agents.scribe.decide({ type: "afteraction" }, this.state);
    if (out) await this.speak("scribe", out.text);
    this.state.closed = true;
    this.state.setPhase("closed");
  }

  // ─── routing ─────────────────────────────────────────────────────────────────
  async _dispatch(event, depth = 0, budget = { n: 0 }) {
    for (const role of ROLE_ORDER) {
      if (role === event.role) continue; // never react to self
      if (role === "scribe") continue; // Scribe logs via beats, not reactive chatter
      const throttle = ROLES[role].minSpeak / this.speed;
      if (Date.now() - (this.lastSpoke[role] ?? 0) < throttle) continue;

      const before = this.state.phase;
      const out = this.agents[role].decide(event, this.state);
      if (this.state.phase !== before) await this._phaseFanout(before);
      if (!out || budget.n >= MAX_SPEAKS) continue;

      budget.n += 1;
      await sleep(ROLES[role].delay / this.speed);
      await this.speak(role, out.text);
      await this._maybeResolve();

      if (depth < MAX_DEPTH && !this.state.closed) {
        await this._dispatch({ type: "agent", role, text: out.text }, depth + 1, budget);
      }
    }
  }

  async _phaseFanout(before) {
    if (this.state.phase === before) return;
    // Let Comms draft a status-page update for the new phase.
    const out = this.agents.comms.decide({ type: "phase", meta: { phase: this.state.phase } }, this.state);
    if (out) {
      await sleep(ROLES.comms.delay / this.speed);
      await this.speak("comms", out.text);
    }
  }

  async _maybeResolve() {
    if (this.state.phase === "resolved" && !this.state.closed) {
      await sleep(ROLES.scribe.delay / this.speed);
      await this.afterAction();
    }
  }

  async _beat() {
    if (this.state.closed) return;
    this.beats += 1;
    if (this.beats % 3 === 0) {
      const out = this.agents.scribe.decide({ type: "timeline" }, this.state);
      if (out) await this.speak("scribe", out.text);
    }
  }
}
