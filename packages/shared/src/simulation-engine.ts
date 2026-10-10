/**
 * Client-side simulation engine for the drill "war room" (/drills/[id]/simulate,
 * /drills/[id]/live). Produces realistic, scenario-specific monitoring telemetry
 * with no real infrastructure.
 *
 * The model is per-service: each scenario names the services it hits, how hard,
 * and after what delay (so dependents cascade after their upstream). Aggregate
 * chart metrics are derived from the services. All functions are pure and
 * deterministic given their inputs (a small seeded PRNG drives jitter).
 */

export const SCENARIO_TYPES = [
  "database_failover",
  "dns_outage",
  "credential_leak",
  "high_traffic",
  "deployment_failure",
  "generic",
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const SCENARIO_TYPE_LABELS: Record<ScenarioType, string> = {
  database_failover: "Database Failover",
  dns_outage: "DNS Outage",
  credential_leak: "Credential Leak",
  high_traffic: "High Traffic / Load",
  deployment_failure: "Deployment Failure",
  generic: "General Incident",
};

export const INJECT_TYPES = ["metric_spike", "log_flood", "alert", "comms"] as const;
export type InjectType = (typeof INJECT_TYPES)[number];

/**
 * Normalized effect an inject applies when it fires. Stored (loosely) in
 * drill_injects.payload; `resolveInjectEffect` fills gaps from the inject type.
 */
export interface InjectEffect {
  /** target service shorts, e.g. ["db-primary"]; empty = the scenario's primary service */
  services: string[];
  /** peak added error % at full ramp */
  error: number;
  /** peak added latency ms at full ramp */
  latency: number;
  /** requests multiplier at full ramp (1 = unchanged, <1 collapse, >1 spike) */
  reqFactor: number;
  /** peak cpu % at full ramp */
  cpu: number;
  /** peak queue depth at full ramp (mq) */
  queue: number;
  /** SEV escalation surfaced in the alert banner, e.g. "SEV-1" */
  severity?: string;
  /** comms injects apply social pressure only (no metric effect); mitigation heals */
  kind: "impact" | "comms" | "mitigation";
}

const INJECT_TYPE_DEFAULTS: Record<InjectType, Partial<InjectEffect>> = {
  metric_spike: { error: 55, latency: 2500, reqFactor: 0.7, cpu: 82, kind: "impact" },
  log_flood: { error: 45, latency: 1200, reqFactor: 0.85, cpu: 62, kind: "impact" },
  alert: { error: 22, latency: 700, reqFactor: 0.9, cpu: 52, kind: "impact" },
  comms: { kind: "comms" },
};

function numOr(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Merge an inject's stored payload with sensible defaults for its type. */
export function resolveInjectEffect(
  injectType: InjectType,
  payload: Record<string, unknown> | null | undefined,
): InjectEffect {
  const d = INJECT_TYPE_DEFAULTS[injectType] ?? {};
  const p = (payload ?? {}) as Record<string, unknown>;
  const services = Array.isArray(p.services) ? (p.services.filter((s) => typeof s === "string") as string[]) : [];
  const kind = p.kind === "comms" || p.kind === "mitigation" || p.kind === "impact" ? p.kind : (d.kind ?? "impact");
  return {
    services,
    error: numOr(p.error, d.error ?? 0),
    latency: numOr(p.latency, d.latency ?? 0),
    reqFactor: numOr(p.reqFactor, d.reqFactor ?? 1),
    cpu: numOr(p.cpu, d.cpu ?? 35),
    queue: numOr(p.queue, d.queue ?? 0),
    severity: typeof p.severity === "string" ? p.severity : d.severity,
    kind,
  };
}

// ─── services ─────────────────────────────────────────────────────────────────
interface ServiceDef {
  name: string;
  short: string;
  baseRpm: number;
  baseLatency: number;
}

export const SERVICES: ServiceDef[] = [
  { name: "API Gateway", short: "api-gateway", baseRpm: 1800, baseLatency: 140 },
  { name: "Database Primary", short: "db-primary", baseRpm: 900, baseLatency: 9 },
  { name: "Database Replica", short: "db-replica", baseRpm: 600, baseLatency: 12 },
  { name: "Cache Layer", short: "cache", baseRpm: 2600, baseLatency: 2 },
  { name: "Message Queue", short: "mq-worker", baseRpm: 1200, baseLatency: 25 },
  { name: "CDN", short: "cdn-edge", baseRpm: 3200, baseLatency: 18 },
];

export const SERVICE_NAMES = SERVICES.map((s) => s.name) as unknown as readonly string[];
export type ServiceName = string;

export type ServiceHealth = "healthy" | "degraded" | "down";

export interface ServiceStatus {
  name: ServiceName;
  status: ServiceHealth;
}

export interface ServiceMetric {
  name: string;
  short: string;
  status: ServiceHealth;
  /** requests per minute */
  rpm: number;
  /** error rate percentage 0-100 */
  errorRate: number;
  /** latency in ms */
  latencyMs: number;
  /** cpu utilization percentage 0-100 */
  cpu: number;
  /** queue depth (meaningful for the message queue) */
  queueDepth: number;
  /** 0..1 incident intensity for this service, for the log generator */
  level: number;
}

export interface MetricSample {
  /** seconds since drill start */
  t: number;
  /** total requests per minute across services */
  requests: number;
  /** aggregate error rate as a percentage 0-100 */
  errorRate: number;
  /** worst-path p99 latency in ms */
  latencyP99: number;
  /** average CPU utilization percentage 0-100 */
  cpu: number;
}

// ─── incident state ───────────────────────────────────────────────────────────
export interface FiredInject {
  /** sim minute the inject fired */
  atMin: number;
  effect: InjectEffect;
}

export interface SimState {
  /** minute the first inject fires (incident onset); null before any inject */
  firstInjectAtMin: number | null;
  /** how many injects have fired (drives ambient scenario pressure) */
  firedCount: number;
  /** fired injects with their targeted effects */
  firedInjects: FiredInject[];
  /** minute mitigation began; null until the IC resolves — drives recovery */
  mitigationStartMin: number | null;
}

/**
 * Overall incident pressure 0..1: ramps with fired injects, then decays once
 * mitigation begins (recovery over ~4 minutes).
 */
export function overallPressure(elapsedMinutes: number, s: SimState): number {
  if (s.firstInjectAtMin == null || elapsedMinutes < s.firstInjectAtMin) return 0;
  let p = Math.min(1, 0.45 + s.firedCount * 0.13);
  if (s.mitigationStartMin != null && elapsedMinutes > s.mitigationStartMin) {
    const decay = Math.max(0, 1 - (elapsedMinutes - s.mitigationStartMin) / 4);
    p *= decay;
  }
  return p;
}

// ─── per-service effect profiles ──────────────────────────────────────────────
interface Effect {
  /** minutes after onset before this service is affected (cascade delay) */
  onset: number;
  /** peak error % at full level */
  error: number;
  /** peak added latency ms at full level */
  latency: number;
  /** requests multiplier at full level (0.05 collapse … 10 spike) */
  reqFactor: number;
  /** peak cpu % at full level */
  cpu: number;
  /** level at which the service reads as "down" (degraded from 0.2) */
  downAt: number;
  /** peak queue depth at full level (mq only) */
  queue?: number;
}

const DEGRADE_AT = 0.2;

type Profile = Partial<Record<string, Effect>>;

const PROFILES: Record<ScenarioType, Profile> = {
  database_failover: {
    "db-primary": { onset: 0, error: 92, latency: 5000, reqFactor: 0.3, cpu: 88, downAt: 0.45 },
    "db-replica": { onset: 1.5, error: 35, latency: 3000, reqFactor: 0.7, cpu: 82, downAt: 0.7 },
    cache: { onset: 1, error: 18, latency: 650, reqFactor: 0.9, cpu: 74, downAt: 0.85 },
    "api-gateway": { onset: 0.5, error: 42, latency: 1600, reqFactor: 0.7, cpu: 62, downAt: 0.8 },
  },
  dns_outage: {
    "cdn-edge": { onset: 0, error: 97, latency: 2200, reqFactor: 0.05, cpu: 20, downAt: 0.4 },
    "api-gateway": { onset: 0.3, error: 95, latency: 2000, reqFactor: 0.05, cpu: 18, downAt: 0.4 },
    "db-primary": { onset: 0.8, error: 90, latency: 1800, reqFactor: 0.05, cpu: 15, downAt: 0.5 },
    "db-replica": { onset: 0.8, error: 90, latency: 1800, reqFactor: 0.05, cpu: 15, downAt: 0.5 },
    cache: { onset: 0.6, error: 85, latency: 1500, reqFactor: 0.05, cpu: 15, downAt: 0.5 },
    "mq-worker": { onset: 0.6, error: 80, latency: 1500, reqFactor: 0.1, cpu: 20, downAt: 0.5 },
  },
  credential_leak: {
    "api-gateway": { onset: 0, error: 6, latency: 320, reqFactor: 1.15, cpu: 48, downAt: 1.1 },
  },
  high_traffic: {
    "cdn-edge": { onset: 0, error: 8, latency: 900, reqFactor: 10, cpu: 70, downAt: 1.1 },
    "api-gateway": { onset: 0.3, error: 30, latency: 3200, reqFactor: 9, cpu: 94, downAt: 0.95 },
    cache: { onset: 0.6, error: 15, latency: 500, reqFactor: 8, cpu: 85, downAt: 1.0 },
    "db-primary": { onset: 1, error: 22, latency: 4800, reqFactor: 4, cpu: 92, downAt: 0.95 },
    "mq-worker": { onset: 0.4, error: 25, latency: 1200, reqFactor: 6, cpu: 88, downAt: 1.0, queue: 48000 },
  },
  deployment_failure: {
    "api-gateway": { onset: 0, error: 100, latency: 1500, reqFactor: 0.9, cpu: 72, downAt: 0.35 },
    cache: { onset: 1, error: 60, latency: 800, reqFactor: 0.9, cpu: 65, downAt: 0.7 },
  },
  generic: {
    "api-gateway": { onset: 0, error: 30, latency: 1800, reqFactor: 0.8, cpu: 68, downAt: 0.7 },
    "db-primary": { onset: 0.8, error: 25, latency: 1200, reqFactor: 0.85, cpu: 70, downAt: 0.8 },
  },
};

/** Deterministic 0..1 pseudo-random from a numeric seed. */
function seeded(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

function serviceLevel(effect: Effect | undefined, elapsedMinutes: number, s: SimState, pressure: number): number {
  if (!effect || s.firstInjectAtMin == null) return 0;
  const sinceOnset = elapsedMinutes - s.firstInjectAtMin - effect.onset;
  if (sinceOnset <= 0) return 0;
  const ramp = Math.min(1, sinceOnset / 1.5);
  return pressure * ramp;
}

/** Ramp 0..1 for a fired inject's targeted effect, decaying once mitigation begins. */
function injectLevel(elapsedMinutes: number, atMin: number, s: SimState): number {
  const since = elapsedMinutes - atMin;
  if (since <= 0) return 0;
  let ramp = Math.min(1, since / 1.5);
  if (s.mitigationStartMin != null && elapsedMinutes > s.mitigationStartMin) {
    ramp *= Math.max(0, 1 - (elapsedMinutes - s.mitigationStartMin) / 4);
  }
  return ramp;
}

/** The service a scenario hits first — the default target for untargeted injects. */
export function primaryService(scenarioType: ScenarioType): string {
  const profile = PROFILES[scenarioType] ?? PROFILES.generic;
  return Object.keys(profile)[0] ?? "api-gateway";
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

interface Contribution {
  level: number;
  error: number;
  latency: number;
  reqFactor: number;
  cpu: number;
  queue: number;
}

/** Full per-service telemetry at a moment in the drill. */
export function generateServiceMetrics(
  scenarioType: ScenarioType,
  elapsedSeconds: number,
  state: SimState,
): ServiceMetric[] {
  const profile = PROFILES[scenarioType] ?? PROFILES.generic;
  const elapsedMin = elapsedSeconds / 60;
  const pressure = overallPressure(elapsedMin, state);
  const primary = primaryService(scenarioType);

  return SERVICES.map((svc, i) => {
    const j = (n: number) => (seeded(elapsedSeconds + i * 7 + n) - 0.5) * 2; // -1..1

    // Gather contributions: the scenario's ambient effect + any fired inject targeting this service.
    const contribs: Contribution[] = [];
    const baseEffect = profile[svc.short];
    if (baseEffect) {
      const lvl = serviceLevel(baseEffect, elapsedMin, state, pressure);
      if (lvl > 0) {
        contribs.push({
          level: lvl,
          error: baseEffect.error,
          latency: baseEffect.latency,
          reqFactor: baseEffect.reqFactor,
          cpu: baseEffect.cpu,
          queue: baseEffect.queue ?? 0,
        });
      }
    }
    for (const fi of state.firedInjects) {
      if (fi.effect.kind === "comms") continue; // social pressure only
      const targets = fi.effect.services.length ? fi.effect.services : [primary];
      if (!targets.includes(svc.short)) continue;
      const lvl = injectLevel(elapsedMin, fi.atMin, state);
      if (lvl > 0) {
        contribs.push({
          level: lvl,
          error: fi.effect.error,
          latency: fi.effect.latency,
          reqFactor: fi.effect.reqFactor,
          cpu: fi.effect.cpu,
          queue: fi.effect.queue,
        });
      }
    }

    // Combine: worst signal wins per metric; requests take the most extreme factor.
    const maxLevel = contribs.reduce((m, c) => Math.max(m, c.level), 0);
    const addError = contribs.reduce((m, c) => Math.max(m, c.error * c.level), 0);
    const addLatency = contribs.reduce((m, c) => Math.max(m, c.latency * c.level), 0);
    const addCpu = contribs.reduce((m, c) => Math.max(m, (c.cpu - 35) * c.level), 0);
    const addQueue = contribs.reduce((m, c) => Math.max(m, c.queue * c.level), 0);
    let reqFactor = 1;
    for (const c of contribs) {
      const f = 1 + (c.reqFactor - 1) * c.level;
      if (Math.abs(1 - f) > Math.abs(1 - reqFactor)) reqFactor = f;
    }

    const rpm = Math.max(0, Math.round(svc.baseRpm * reqFactor * (1 + j(1) * 0.05)));
    const errorRate = clamp(0.3 + Math.abs(j(2)) * 0.4 + addError * (0.85 + Math.abs(j(3)) * 0.15), 0, 100);
    const latencyMs = Math.max(1, Math.round(svc.baseLatency + j(4) * svc.baseLatency * 0.15 + addLatency));
    const cpu = clamp(35 + j(5) * 5 + addCpu, 3, 100);
    const queueBase = svc.short === "mq-worker" ? 180 : 0;
    const queueDepth = Math.max(0, Math.round(queueBase + addQueue + j(6) * 30));

    const downAt = baseEffect?.downAt ?? 0.6;
    const level = maxLevel;
    let status: ServiceHealth = "healthy";
    if (level >= downAt) status = "down";
    else if (level >= DEGRADE_AT) status = "degraded";

    return {
      name: svc.name,
      short: svc.short,
      status,
      rpm,
      errorRate: Math.round(errorRate * 10) / 10,
      latencyMs,
      cpu: Math.round(cpu),
      queueDepth,
      level,
    };
  });
}

/** Aggregate the per-service metrics into the four chart series. */
export function aggregateMetrics(elapsedSeconds: number, services: ServiceMetric[]): MetricSample {
  const totalRequests = services.reduce((a, s) => a + s.rpm, 0);
  // Error rate weighted by each service's baseline traffic (stable even as live rpm collapses).
  const baseByShort = new Map(SERVICES.map((s) => [s.short, s.baseRpm]));
  const totalBase = SERVICES.reduce((a, s) => a + s.baseRpm, 0);
  const weightedError = services.reduce(
    (a, s) => a + s.errorRate * (baseByShort.get(s.short) ?? 0),
    0,
  );
  const latencyP99 = services.reduce((m, s) => Math.max(m, s.latencyMs), 0);
  const cpu = services.reduce((a, s) => a + s.cpu, 0) / (services.length || 1);

  return {
    t: Math.round(elapsedSeconds),
    requests: Math.round(totalRequests),
    errorRate: Math.round((weightedError / totalBase) * 10) / 10,
    latencyP99: Math.round(latencyP99),
    cpu: Math.round(cpu),
  };
}

/** Convenience: aggregate chart sample directly from scenario + state. */
export function generateMetrics(
  scenarioType: ScenarioType,
  elapsedSeconds: number,
  state: SimState,
): MetricSample {
  return aggregateMetrics(elapsedSeconds, generateServiceMetrics(scenarioType, elapsedSeconds, state));
}

const HEALTHY_STATE: SimState = {
  firstInjectAtMin: null,
  firedCount: 0,
  firedInjects: [],
  mitigationStartMin: null,
};

/** Service health grid for the current state. */
export function generateServiceHealth(
  scenarioType: ScenarioType,
  elapsedSeconds: number,
  state: SimState = HEALTHY_STATE,
): ServiceStatus[] {
  return generateServiceMetrics(scenarioType, elapsedSeconds, state).map((s) => ({
    name: s.name,
    status: s.status,
  }));
}

/** A fresh window of baseline chart samples so a chart isn't empty on first paint. */
export function seedMetricWindow(
  scenarioType: ScenarioType,
  count: number,
  stepSeconds: number,
  nowSeconds: number,
): MetricSample[] {
  const out: MetricSample[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const t = Math.max(0, nowSeconds - i * stepSeconds);
    out.push(generateMetrics(scenarioType, t, HEALTHY_STATE));
  }
  return out;
}
