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
  }

  elapsedMs() {
    return Date.now() - this.startedAt;
  }

  elapsedClock() {
    const s = Math.floor(this.elapsedMs() / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  }

  setPhase(phase) {
    if (PHASES.includes(phase)) this.phase = phase;
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
