/**
 * Client-side simulation engine for the drill "war room" (/drills/[id]/simulate).
 * Produces realistic, scenario-specific monitoring metrics with no real infra.
 *
 * All functions are pure and deterministic given their inputs (a small seeded PRNG
 * drives jitter) so server and client renders agree and charts are reproducible.
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

export const SERVICE_NAMES = [
  "API Gateway",
  "Database Primary",
  "Database Replica",
  "Cache Layer",
  "Message Queue",
  "CDN",
] as const;
export type ServiceName = (typeof SERVICE_NAMES)[number];

export type ServiceHealth = "healthy" | "degraded" | "down";

export interface ServiceStatus {
  name: ServiceName;
  status: ServiceHealth;
}

export interface MetricSample {
  /** seconds since drill start */
  t: number;
  /** requests per minute */
  requests: number;
  /** error rate as a percentage 0-100 */
  errorRate: number;
  /** p99 latency in ms */
  latencyP99: number;
  /** CPU utilization percentage 0-100 */
  cpu: number;
}

interface Profile {
  /** baseline requests/min when healthy */
  baseRequests: number;
  /** peak error-rate % at full incident intensity */
  peakErrorRate: number;
  /** peak p99 latency ms at full intensity */
  peakLatency: number;
  /** requests multiplier at full intensity (e.g. 0.05 = near-zero, 10 = 10x spike) */
  requestsFactor: number;
  /** services that degrade / fail during the incident, worst first */
  affected: ServiceName[];
}

const BASE_LATENCY = 180;
const BASE_CPU = 35;

const PROFILES: Record<ScenarioType, Profile> = {
  database_failover: {
    baseRequests: 4200,
    peakErrorRate: 40,
    peakLatency: 5000,
    requestsFactor: 0.7,
    affected: ["Database Primary", "Database Replica", "Cache Layer"],
  },
  dns_outage: {
    baseRequests: 3800,
    peakErrorRate: 95,
    peakLatency: 2200,
    requestsFactor: 0.05,
    affected: ["CDN", "API Gateway", "Database Primary", "Database Replica", "Cache Layer", "Message Queue"],
  },
  credential_leak: {
    baseRequests: 4000,
    peakErrorRate: 6,
    peakLatency: 320,
    requestsFactor: 1.1,
    affected: ["API Gateway"],
  },
  high_traffic: {
    baseRequests: 5000,
    peakErrorRate: 18,
    peakLatency: 3200,
    requestsFactor: 10,
    affected: ["Message Queue", "Cache Layer", "Database Primary"],
  },
  deployment_failure: {
    baseRequests: 4400,
    peakErrorRate: 100,
    peakLatency: 1500,
    requestsFactor: 0.6,
    affected: ["API Gateway", "Cache Layer"],
  },
  generic: {
    baseRequests: 4000,
    peakErrorRate: 30,
    peakLatency: 1800,
    requestsFactor: 0.8,
    affected: ["API Gateway", "Database Primary"],
  },
};

/** Deterministic 0..1 pseudo-random from a numeric seed. */
function seeded(seed: number): number {
  const s = Math.sin(seed * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Incident intensity 0..1 at a given moment. Ramps up over ~3 minutes after the
 * first inject fires, scaling further with how many injects have fired.
 */
export function incidentIntensity(elapsedMinutes: number, firstInjectAt: number | null, firedCount: number): number {
  if (firstInjectAt == null || elapsedMinutes < firstInjectAt) return 0;
  const sinceStart = elapsedMinutes - firstInjectAt;
  const ramp = Math.min(1, sinceStart / 3);
  const pressure = Math.min(1, 0.4 + firedCount * 0.15);
  return Math.min(1, ramp * pressure);
}

/**
 * Current instantaneous metric sample. `t` is seconds since start and seeds the jitter.
 */
export function generateMetrics(
  scenarioType: ScenarioType,
  elapsedSeconds: number,
  intensity: number,
): MetricSample {
  const p = PROFILES[scenarioType] ?? PROFILES.generic;
  const j = (n: number) => (seeded(elapsedSeconds + n) - 0.5) * 2; // -1..1

  const requestsMultiplier = 1 + (p.requestsFactor - 1) * intensity;
  const requests = Math.max(0, Math.round(p.baseRequests * requestsMultiplier * (1 + j(1) * 0.06)));

  const errorRate = Math.max(
    0,
    Math.min(100, (0.4 + j(2) * 0.3) + p.peakErrorRate * intensity * (0.85 + Math.abs(j(3)) * 0.15)),
  );

  const latencyP99 = Math.max(
    40,
    Math.round(BASE_LATENCY + j(4) * 25 + (p.peakLatency - BASE_LATENCY) * intensity * (0.8 + Math.abs(j(5)) * 0.2)),
  );

  const cpu = Math.max(
    5,
    Math.min(100, BASE_CPU + j(6) * 6 + (92 - BASE_CPU) * intensity * (0.7 + Math.abs(j(7)) * 0.3)),
  );

  return {
    t: Math.round(elapsedSeconds),
    requests,
    errorRate: Math.round(errorRate * 10) / 10,
    latencyP99,
    cpu: Math.round(cpu),
  };
}

/** Service health grid for the current intensity. */
export function generateServiceHealth(scenarioType: ScenarioType, intensity: number): ServiceStatus[] {
  const p = PROFILES[scenarioType] ?? PROFILES.generic;
  return SERVICE_NAMES.map((name) => {
    const rank = p.affected.indexOf(name);
    if (rank === -1 || intensity < 0.1) return { name, status: "healthy" as ServiceHealth };
    // Earlier-listed services fail sooner / harder.
    const threshold = 0.25 + rank * 0.18;
    let status: ServiceHealth = "healthy";
    if (intensity >= threshold + 0.25) status = "down";
    else if (intensity >= threshold) status = "degraded";
    return { name, status };
  });
}

/** A fresh window of baseline metrics so a chart isn't empty on first paint. */
export function seedMetricWindow(
  scenarioType: ScenarioType,
  count: number,
  stepSeconds: number,
  nowSeconds: number,
): MetricSample[] {
  const out: MetricSample[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(generateMetrics(scenarioType, Math.max(0, nowSeconds - i * stepSeconds), 0));
  }
  return out;
}
