import { ROLES } from "../roles.js";
import { SEVERITIES } from "../state.js";
import { brainEnabled, compose } from "./brain.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, Math.max(0, ms)));
const MAX_DEPTH = 2; // agent → agent reaction waves (proposal → risk check → go/no-go)

// Cadences in drill minutes (scaled by speed). See skills/index.js.
const CADENCE = {
  statusEveryMin: 5, // IC status update
  digestEveryMin: 10, // Scribe milestone digest
  liaisonAtMin: 5, // Liaison stakeholder check
  commsDecisionAtMin: 10, // Comms: internal vs external
  chaseEveryMin: 1, // Deputy looks for overdue actions (re-chases each after 3 min)
  quietAfterMin: 4, // Scribe nudges a quiet channel
};

/**
 * Runs the War Room team. Every human message is acknowledged by the IC in its thread; other roles
 * add to it when their skill applies; agents react to each other (bounded); and a cadence engine
 * drives the timeline duties (status updates, stakeholder check, comms decision, milestone digests,
 * chasing overdue actions). In Claude mode each message is written by `compose`.
 */
export class Orchestrator {
  constructor({ state, agents, send, speed, onClose }) {
    this.state = state;
    this.agents = agents;
    this.send = send; // (message, exceptAdapter?) => Promise
    this.speed = Math.max(1, speed || 1);
    this.onClose = onClose;
    this.lastQuietNudgeAt = 0;
    this.lastPhase = state.phase;
    this.busy = Promise.resolve(); // serialize speech so replies stay in order
  }

  // ─── speaking ────────────────────────────────────────────────────────────────
  /** Have `role` post `out` ({ text, job, thread }) — composed by Claude when enabled. */
  async speak(role, out, cause = {}) {
    if (!out?.text) return null;
    const m = ROLES[role];
    const text = brainEnabled() ? await compose(role, out.job ?? "Say this in your own words.", this._context(cause), out.text) : out.text;
    const message = {
      role,
      name: m.name,
      emoji: m.emoji,
      color: m.color,
      text,
      kind: "agent",
      ...(out.thread && cause.threadTs ? { threadTs: cause.threadTs } : {}),
    };
    this.state.record(message);
    await this.send(message);
    return message;
  }

  /** Incident state + recent transcript, for Claude mode. */
  _context(cause) {
    const s = this.state;
    const transcript = s.events
      .slice(-15)
      .map((e) => `${s.t(e.at * s.speed).slice(0, 7)} ${e.name}${e.role ? ` (${e.role})` : ""}: ${e.text}`)
      .join("\n");
    return [
      `Incident: ${s.scenario.title} — ${s.scenario.summary}`,
      `Severity ${s.severity}, phase ${s.phase}, now ${s.t().slice(0, 7)} (drill time).`,
      `Services: ${s.services.map((x) => `${x.name}=${x.status}`).join(", ")}`,
      `Roles: ${Object.entries(s.roles).map(([k, v]) => `${k}=${v}`).join(", ") || "none claimed"}; comms owner: ${s.commsOwner ?? "Comms agent"}`,
      `People (name → slack id): ${[...s.people].map(([n, p]) => `${n}→${p.slackId ?? "?"}`).join(", ") || "none yet"}`,
      `Open actions: ${s.openTasks().map((t) => `${t.text} [${t.owner}, due ${s.t(t.dueAt).slice(0, 7)}]`).join("; ") || "none"}`,
      `Pending proposals: ${s.proposals.map((p) => `${p.text} (${p.by})`).join("; ") || "none"}`,
      `Recent channel transcript:\n${transcript}`,
      cause.text ? `Message you are responding to (from ${cause.name}): ${cause.text}` : "",
    ].join("\n");
  }

  _queue(fn) {
    this.busy = this.busy.then(fn).catch((err) => console.error("[orchestrator]", err));
    return this.busy;
  }

  async emitInject(inject) {
    for (const [name, status] of inject.affects ?? []) this.state.degradeService(name, status);
    this.state.injectsFired += 1;
    this.state.milestone(`Signal: ${inject.text}`);
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
    const message = {
      role: null,
      name: user.name,
      emoji: "🧑",
      color: "#e2e8f0",
      text: user.text,
      kind: "user",
      meta: { userId: user.userId },
    };
    this.state.record(message);
    await this.send(message, exceptAdapter);
  }

  // ─── entry points ────────────────────────────────────────────────────────────
  declare() {
    return this._queue(async () => {
      await sleep(ROLES.ic.delay / this.speed);
      await this.speak("ic", this.agents.ic.decide({ type: "declare" }, this.state));
      this._checkPhase();
    });
  }

  /** A human message: the IC always acknowledges it in-thread; other roles chime in if relevant. */
  handleUser(user, exceptAdapter) {
    if (this.state.closed) return Promise.resolve();
    this.state.person(user.name, user.userId);
    this.state.cadence.lastHumanAt = this.state.drillMs();
    // Any message from an owner counts as their report-back: reset their clock.
    // Any message from an owner is a report-back: it closes their "first report" and resets the clock on the rest.
    for (const t of this.state.openTasks(user.name)) {
      if (t.text.endsWith("first report")) {
        t.status = "done";
        continue;
      }
      t.dueAt = Math.max(t.dueAt, this.state.inMinutes(5));
      t.chases = 0;
    }
    const event = { type: "user", text: user.text, name: user.name, threadTs: user.threadTs ?? user.ts };
    return this._queue(async () => {
      await this.emitUser(user, exceptAdapter);
      await sleep(Math.min(ROLES.ic.delay, 1500)); // quick acknowledgement
      const ack = await this.speak("ic", this.agents.ic.decide(event, this.state), event);
      this._checkPhase();
      for (const role of ["deputy", "comms", "liaison", "sme"]) {
        const out = this.agents[role].decide(event, this.state);
        if (!out) continue;
        await sleep(ROLES[role].delay / this.speed / 2);
        await this.speak(role, out, event);
      }
      if (ack) await this._react({ type: "agent", role: "ic", text: ack.text });
      await this._phaseFanout();
    });
  }

  onInject(inject) {
    if (this.state.closed) return Promise.resolve();
    return this._queue(async () => {
      await this.emitInject(inject);
      const event = { type: "inject", text: inject.text, meta: inject };
      for (const role of ["deputy", "sme", "liaison", "comms", "ic"]) {
        const out = this.agents[role].decide(event, this.state);
        if (!out) continue;
        await sleep(ROLES[role].delay / this.speed);
        await this.speak(role, out);
      }
    });
  }

  sitrep() {
    return this._queue(() => this.speak("ic", this.agents.ic.decide({ type: "sitrep" }, this.state)));
  }

  /** Cadence engine — call every few seconds. */
  tick() {
    const s = this.state;
    if (s.closed) return;
    const min = s.drillMinutes();
    const c = s.cadence;
    const due = [];
    if (!c.liaisonAsked && min >= CADENCE.liaisonAtMin) {
      c.liaisonAsked = true;
      due.push(["liaison", { type: "stakeholder_check" }]);
    }
    if (!c.commsAsked && min >= CADENCE.commsDecisionAtMin) {
      c.commsAsked = true;
      due.push(["comms", { type: "comms_decision" }]);
    }
    if (min - c.lastStatusAt / 60_000 >= CADENCE.statusEveryMin) {
      c.lastStatusAt = s.drillMs();
      due.push(["ic", { type: "status_update" }]);
    }
    if (min - c.lastDigestAt / 60_000 >= CADENCE.digestEveryMin) {
      due.push(["scribe", { type: "digest", since: c.lastDigestAt }]);
      c.lastDigestAt = s.drillMs();
    }
    if (min - c.lastChaseAt / 60_000 >= CADENCE.chaseEveryMin) {
      c.lastChaseAt = s.drillMs();
      due.push(["deputy", { type: "chase" }]);
    }
    const quietFor = (s.drillMs() - Math.max(c.lastHumanAt, this.lastQuietNudgeAt)) / 60_000;
    if (c.lastHumanAt && quietFor >= CADENCE.quietAfterMin) {
      this.lastQuietNudgeAt = s.drillMs();
      due.push(["scribe", { type: "quiet" }]);
    }
    if (!due.length) return;
    this._queue(async () => {
      for (const [role, event] of due) {
        const out = this.agents[role].decide(event, s);
        if (out) await this.speak(role, out);
      }
    });
  }

  afterAction() {
    return this._queue(async () => {
      if (this.state.closed) return;
      await this.speak("scribe", this.agents.scribe.decide({ type: "afteraction" }, this.state));
      this.state.closed = true;
      this.state.setPhase("closed");
      await this.onClose?.();
    });
  }

  // ─── internals ───────────────────────────────────────────────────────────────
  /** Bounded agent-to-agent reactions (e.g. IC asks for a risk check → Deputy → IC go/no-go). */
  async _react(event, depth = 0) {
    if (depth >= MAX_DEPTH || this.state.closed) return;
    for (const role of ["deputy", "ic"]) {
      if (role === event.role) continue;
      const out = this.agents[role].decide(event, this.state);
      if (!out) continue;
      await sleep(ROLES[role].delay / this.speed);
      const said = await this.speak(role, out);
      this._checkPhase();
      if (said) await this._react({ type: "agent", role, text: said.text }, depth + 1);
    }
  }

  _checkPhase() {
    if (this.state.phase === "resolved" && !this.state.closed) {
      // Close out after the current replies.
      setTimeout(() => this.afterAction(), ROLES.scribe.delay / this.speed);
    }
  }

  /** On a phase change, Comms drafts the matching update. */
  async _phaseFanout() {
    if (this.state.phase === this.lastPhase) return;
    this.lastPhase = this.state.phase;
    const out = this.agents.comms.decide({ type: "phase", meta: { phase: this.state.phase } }, this.state);
    if (out) {
      await sleep(ROLES.comms.delay / this.speed);
      await this.speak("comms", out);
    }
  }
}
