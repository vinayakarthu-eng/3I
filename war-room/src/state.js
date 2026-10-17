import { v4 as uuid } from "uuid";

// Severity lifecycle (PagerDuty/Rootly/FireHydrant style).
export const PHASES = ["declared", "investigating", "mitigating", "monitoring", "resolved", "closed"];

export const SEVERITIES = {
  SEV1: { key: "SEV1", label: "SEV-1", tone: "#f87171", blurb: "Critical — major customer impact" },
  SEV2: { key: "SEV2", label: "SEV-2", tone: "#fbbf24", blurb: "Significant — partial impact" },
  SEV3: { key: "SEV3", label: "SEV-3", tone: "#60a5fa", blurb: "Minor — limited impact" },
};

/** Live state of one drill; mutated by the orchestrator and read by the dashboard. */
export class DrillState {
  constructor(scenario, speed = 2) {
    this.id = uuid().slice(0, 8);
    this.scenario = scenario;
    this.speed = speed;
    this.severity = scenario.severity;
    this.phase = "declared";
    this.startedAt = Date.now();
    this.channelName = `inc-${this.id}-${scenario.slug}`;
    this.roles = {}; // role/function -> assignee display name
    this.proposals = []; // pending go/no-go items
    this.services = scenario.services.map((s) => ({ ...s }));
    this.events = []; // { at, kind, role, name, text, severity }
    this.injectsFired = 0;
    this.closed = false;
    // Team-coordination state (see skills/): who's here, who owns what, what's due.
    this.people = new Map(); // display name → { slackId, function }
    this.tasks = []; // { id, owner, slackId, text, createdAt, dueAt, status, chasedAt }
    this.milestones = []; // { at, text }
    this.decisions = []; // { at, text }
    this.commsOwner = null; // a human who claimed comms; null = the Comms agent holds it
    this.cadence = { lastStatusAt: 0, lastDigestAt: 0, lastChaseAt: 0, liaisonAsked: false, commsAsked: false, lastHumanAt: 0 };
  }

  /** Drill time (scaled by speed) in ms — what T+ labels and cadences use. */
  drillMs() {
    return this.elapsedMs() * this.speed;
  }

  drillMinutes() {
    return this.drillMs() / 60_000;
  }

  /** "T+07:30" for a drill-time offset (defaults to now). */
  t(ms = this.drillMs()) {
    const s = Math.floor(ms / 1000);
    return `T+${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  /** Drill-time ms `minutes` from now. */
  inMinutes(minutes) {
    return this.drillMs() + minutes * 60_000;
  }

  /** Record a responder (by display name) and their Slack id when known. */
  person(name, slackId) {
    const p = this.people.get(name) ?? { slackId: null, function: null };
    if (slackId && /^[UW][A-Z0-9]+$/.test(slackId)) p.slackId = slackId;
    this.people.set(name, p);
    return p;
  }

  /** "<@U123>" when we know their Slack id, else their name in bold. */
  mention(name) {
    const id = this.people.get(name)?.slackId;
    return id ? `<@${id}>` : `*${name}*`;
  }

  milestone(text) {
    this.milestones.push({ at: this.drillMs(), text });
  }

  addTask(owner, text, dueInMinutes = 5) {
    const task = {
      id: this.tasks.length + 1,
      owner,
      text,
      createdAt: this.drillMs(),
      dueAt: this.inMinutes(dueInMinutes),
      status: "open",
      chasedAt: 0,
    };
    this.tasks.push(task);
    return task;
  }

  openTasks(owner) {
    return this.tasks.filter((t) => t.status === "open" && (!owner || t.owner === owner));
  }

  /** Functions nobody (human) owns yet, in the order the IC should ask about them. */
  unownedFunctions() {
    return ["ops", "comms"].filter((f) => !Object.keys(this.roles).some((k) => k === f || (f === "ops" && ["database", "infra", "security"].includes(k))));
  }

  elapsedMs() {
    return Date.now() - this.startedAt;
  }

  elapsedClock() {
    const s = Math.floor(this.elapsedMs() / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  setPhase(phase) {
    if (!PHASES.includes(phase) || phase === this.phase) return;
    this.phase = phase;
    if (this.milestones) this.milestone(`Phase → *${phase}*`);
  }

  degradeService(name, status) {
    const svc = this.services.find((s) => s.name.toLowerCase().includes(name.toLowerCase()));
    if (svc) svc.status = status;
  }

  record(message) {
    this.events.push({
      at: this.elapsedMs(),
      kind: message.kind,
      role: message.role ?? null,
      name: message.name,
      text: message.text,
      severity: message.severity ?? null,
    });
  }

  snapshot() {
    return {
      id: this.id,
      scenario: { slug: this.scenario.slug, title: this.scenario.title },
      severity: this.severity,
      severityMeta: SEVERITIES[this.severity],
      phase: this.phase,
      phases: PHASES,
      elapsed: this.elapsedClock(),
      channelName: this.channelName,
      roles: this.roles,
      services: this.services,
      injectsFired: this.injectsFired,
      proposals: this.proposals,
      closed: this.closed,
    };
  }
}
