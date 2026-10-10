/**
 * Synthetic log-line generator for the simulation log stream.
 * Deterministic given (scenarioType, elapsedSeconds) so renders are stable.
 */
import { SCENARIO_TYPES, type ScenarioType } from "./simulation-engine";

export const LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogLine {
  id: string;
  timestamp: string; // ISO
  level: LogLevel;
  service: string;
  message: string;
}

const SERVICES = [
  "api-gateway",
  "db-primary",
  "db-replica",
  "cache",
  "mq-worker",
  "cdn-edge",
  "auth-svc",
  "payments-svc",
];

const NORMAL_MESSAGES: { level: LogLevel; service: string; message: string }[] = [
  { level: "INFO", service: "api-gateway", message: "GET /v1/orders 200 in 42ms" },
  { level: "INFO", service: "api-gateway", message: "POST /v1/checkout 201 in 88ms" },
  { level: "INFO", service: "db-primary", message: "connection acquired (pool 18/50)" },
  { level: "INFO", service: "cache", message: "cache hit ratio 94.2% over last 1m" },
  { level: "INFO", service: "mq-worker", message: "processed batch of 120 messages" },
  { level: "INFO", service: "cdn-edge", message: "edge cache HIT for /static/app.js" },
  { level: "INFO", service: "auth-svc", message: "issued JWT for user session (ttl 3600s)" },
  { level: "INFO", service: "payments-svc", message: "charge authorized txn_8f3a succeeded" },
  { level: "WARN", service: "db-replica", message: "replication lag 1.2s (threshold 5s)" },
  { level: "WARN", service: "mq-worker", message: "consumer rebalance took 820ms" },
  { level: "INFO", service: "db-primary", message: "autovacuum completed on orders table" },
];

const INCIDENT_MESSAGES: Record<ScenarioType, { level: LogLevel; service: string; message: string }[]> = {
  database_failover: [
    { level: "ERROR", service: "db-primary", message: "FATAL: could not connect to primary — connection refused" },
    { level: "ERROR", service: "db-primary", message: "connection pool exhausted (50/50), new connections timing out" },
    { level: "ERROR", service: "api-gateway", message: "POST /v1/checkout 503 — upstream db error" },
    { level: "WARN", service: "db-replica", message: "replication lag 28.4s and climbing" },
    { level: "ERROR", service: "payments-svc", message: "charge failed: database write timeout after 5000ms" },
    { level: "WARN", service: "db-replica", message: "promoting replica to primary — awaiting quorum" },
  ],
  dns_outage: [
    { level: "ERROR", service: "cdn-edge", message: "NXDOMAIN resolving api.acme.com — all regions" },
    { level: "ERROR", service: "api-gateway", message: "getaddrinfo ENOTFOUND payments.internal" },
    { level: "ERROR", service: "auth-svc", message: "upstream connect error: name resolution failed" },
    { level: "WARN", service: "cdn-edge", message: "falling back to secondary DNS resolver" },
    { level: "ERROR", service: "payments-svc", message: "connection timeout — unable to resolve host" },
    { level: "WARN", service: "api-gateway", message: "synthetic monitor: 0% successful resolutions" },
  ],
  credential_leak: [
    { level: "WARN", service: "auth-svc", message: "unusual access pattern from 203.0.113.7 (unknown ASN)" },
    { level: "ERROR", service: "auth-svc", message: "SECURITY: API key kx_live_*** used from unrecognized IP range" },
    { level: "WARN", service: "api-gateway", message: "rate-limit breach for key kx_live_*** (4200 req/min)" },
    { level: "ERROR", service: "payments-svc", message: "SECURITY: enumeration of /v1/customers detected" },
    { level: "WARN", service: "auth-svc", message: "revoking compromised credential kx_live_***" },
    { level: "INFO", service: "auth-svc", message: "audit: rotating secrets for payments scope" },
  ],
  high_traffic: [
    { level: "WARN", service: "mq-worker", message: "queue depth 48210 and growing (consumers saturated)" },
    { level: "ERROR", service: "api-gateway", message: "429 Too Many Requests — shedding load" },
    { level: "WARN", service: "cache", message: "eviction rate spiking, hit ratio dropped to 61%" },
    { level: "ERROR", service: "db-primary", message: "slow query 4.8s on orders (lock contention)" },
    { level: "WARN", service: "api-gateway", message: "autoscaler adding 6 instances (target 85% cpu)" },
    { level: "ERROR", service: "payments-svc", message: "timeout waiting for db connection (pool saturated)" },
  ],
  deployment_failure: [
    { level: "ERROR", service: "api-gateway", message: "500 Internal Server Error — unhandled exception in v2.14.0" },
    { level: "ERROR", service: "api-gateway", message: "TypeError: cannot read property 'id' of undefined" },
    { level: "ERROR", service: "cache", message: "cascading failure: dependent service returning 500s" },
    { level: "WARN", service: "api-gateway", message: "health check failing on 4/5 pods for release v2.14.0" },
    { level: "WARN", service: "api-gateway", message: "initiating rollback to v2.13.3" },
    { level: "ERROR", service: "payments-svc", message: "dependency api-gateway unhealthy — circuit open" },
  ],
  generic: [
    { level: "ERROR", service: "api-gateway", message: "5xx error rate exceeding SLO" },
    { level: "ERROR", service: "db-primary", message: "query timeout on critical path" },
    { level: "WARN", service: "mq-worker", message: "processing backlog detected" },
    { level: "ERROR", service: "payments-svc", message: "downstream dependency failing" },
  ],
};

function seeded(seed: number): number {
  const s = Math.sin(seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

function pick<T>(arr: T[], seed: number): T {
  return arr[Math.floor(seeded(seed) * arr.length) % arr.length];
}

/**
 * Generate `batchSize` log lines for the moment at `elapsedSeconds`.
 * Normal state: ~80% INFO / 15% WARN / 5% ERROR.
 * Incident (intensity > 0): flips toward ~20% INFO / 30% WARN / 50% ERROR with
 * scenario-specific messages mixed in.
 */
export function generateLogs(
  scenarioType: ScenarioType,
  elapsedSeconds: number,
  intensity: number,
  batchSize = 3,
): LogLine[] {
  const type = SCENARIO_TYPES.includes(scenarioType) ? scenarioType : "generic";
  const incidentMsgs = INCIDENT_MESSAGES[type];
  const lines: LogLine[] = [];

  for (let i = 0; i < batchSize; i++) {
    const seed = elapsedSeconds * 10 + i;
    const roll = seeded(seed * 1.7);
    const incident = intensity > 0 && seeded(seed * 2.3) < 0.2 + intensity * 0.65;

    let entry: { level: LogLevel; service: string; message: string };
    if (incident) {
      entry = pick(incidentMsgs, seed * 3.1);
    } else {
      // Occasionally still throw a normal WARN/ERROR to keep it realistic.
      const base = pick(NORMAL_MESSAGES, seed * 4.9);
      if (roll > 0.95) entry = { level: "ERROR", service: pick(SERVICES, seed), message: base.message };
      else if (roll > 0.8) entry = { level: "WARN", service: base.service, message: base.message };
      else entry = base;
    }

    lines.push({
      id: `log-${elapsedSeconds}-${i}`,
      timestamp: new Date(Date.now()).toISOString(),
      level: entry.level,
      service: entry.service,
      message: entry.message,
    });
  }
  return lines;
}
