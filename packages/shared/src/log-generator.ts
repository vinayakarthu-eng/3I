/**
 * Synthetic log-line generator for the simulation log stream.
 * Deterministic given (scenarioType, elapsedSeconds, i) so renders are stable.
 * Lines are templated with dynamic request ids, IPs, latencies, status codes,
 * SQL and cache keys, and error lines concentrate on whichever services are hot.
 */
import type { ScenarioType, ServiceMetric } from "./simulation-engine";
import { SCENARIO_TYPES } from "./simulation-engine";

export const LOG_LEVELS = ["INFO", "WARN", "ERROR"] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogLine {
  id: string;
  timestamp: string; // ISO
  level: LogLevel;
  service: string;
  message: string;
}

function seeded(seed: number): number {
  const s = Math.sin(seed * 78.233) * 43758.5453;
  return s - Math.floor(s);
}
const pick = <T>(arr: T[], seed: number): T => arr[Math.floor(seeded(seed) * arr.length) % arr.length];
const int = (seed: number, lo: number, hi: number) => lo + Math.floor(seeded(seed) * (hi - lo + 1));
const hex = (seed: number, len: number) =>
  Array.from({ length: len }, (_, i) => Math.floor(seeded(seed * 97 + i * 13) * 16).toString(16)).join("");
const ip = (seed: number) => `${int(seed, 10, 203)}.${int(seed + 1, 0, 255)}.${int(seed + 2, 0, 255)}.${int(seed + 3, 1, 254)}`;
const reqId = (seed: number) => `req_${hex(seed, 10)}`;

const PATHS = ["/v1/orders", "/v1/checkout", "/v1/customers", "/v1/cart", "/v1/search", "/v1/auth/token", "/static/app.js"];
const SQL = ["SELECT orders", "UPDATE inventory", "INSERT payments", "SELECT sessions", "DELETE carts"];
const KEYS = ["sess:*", "cart:*", "prod:*", "rate:*", "feature:*"];

// ─── normal-state templates (per service) ─────────────────────────────────────
const NORMAL: Record<string, (s: number) => string> = {
  "api-gateway": (s) => `${pick(["GET", "POST"], s)} ${pick(PATHS, s + 1)} ${pick(["200", "201", "204"], s + 2)} in ${int(s + 3, 18, 120)}ms (${reqId(s + 4)})`,
  "db-primary": (s) => pick([
    `connection acquired (pool ${int(s, 8, 32)}/50)`,
    `${pick(SQL, s + 1)} ${int(s + 2, 2, 40)}ms`,
    `autovacuum completed on ${pick(["orders", "sessions", "inventory"], s + 3)}`,
  ], s + 5),
  "db-replica": (s) => `replication lag ${(seeded(s) * 1.8).toFixed(1)}s (threshold 5s)`,
  cache: (s) => pick([
    `${pick(["HIT", "SET"], s)} ${pick(KEYS, s + 1)} ratio ${int(s + 2, 90, 98)}.${int(s + 3, 0, 9)}%`,
    `evicted ${int(s + 4, 10, 120)} keys (lru)`,
  ], s + 6),
  "mq-worker": (s) => pick([
    `processed batch of ${int(s, 80, 220)} messages`,
    `ack offset ${int(s + 1, 10000, 99999)} (lag ${int(s + 2, 0, 400)}ms)`,
  ], s + 3),
  "cdn-edge": (s) => `edge cache HIT ${pick(PATHS, s)} 200 (${int(s + 1, 2, 18)}ms)`,
};

// ─── incident templates (scenario × service) ──────────────────────────────────
type Tmpl = { level: LogLevel; make: (s: number) => string };
const E = (make: (s: number) => string): Tmpl => ({ level: "ERROR", make });
const W = (make: (s: number) => string): Tmpl => ({ level: "WARN", make });

const INCIDENT: Record<ScenarioType, Record<string, Tmpl[]>> = {
  database_failover: {
    "db-primary": [
      E((s) => `FATAL: could not connect to primary — connection refused (${ip(s)})`),
      E((s) => `connection pool exhausted (50/50), ${int(s, 12, 80)} requests queued`),
      E((s) => `${pick(SQL, s)} timed out after 5000ms`),
    ],
    "db-replica": [W((s) => `replication lag ${int(s, 18, 42)}.${int(s + 1, 0, 9)}s and climbing`), W(() => `promoting replica to primary — awaiting quorum`)],
    "api-gateway": [E((s) => `POST ${pick(PATHS, s)} 503 — upstream db error (${reqId(s + 1)})`)],
    cache: [W((s) => `cache stampede on ${pick(KEYS, s)} — ${int(s + 1, 200, 900)} misses/s`)],
  },
  dns_outage: {
    "cdn-edge": [E((s) => `NXDOMAIN resolving api.acme.com from ${pick(["us-east", "eu-west", "ap-south"], s)}`)],
    "api-gateway": [E((s) => `getaddrinfo ENOTFOUND payments.internal (${reqId(s)})`), W(() => `synthetic monitor: 0% successful resolutions`)],
    "db-primary": [E(() => `connection timeout — unable to resolve host`)],
    cache: [E(() => `name resolution failed for cache.internal`)],
    "mq-worker": [E(() => `consumer disconnected: DNS lookup failed`)],
  },
  credential_leak: {
    "api-gateway": [
      W((s) => `unusual access pattern from ${ip(s)} (unknown ASN)`),
      E((s) => `SECURITY: API key kx_live_*** used from unrecognized range ${ip(s)}`),
      E(() => `SECURITY: enumeration of /v1/customers detected`),
      W(() => `revoking compromised credential kx_live_***`),
    ],
  },
  high_traffic: {
    "mq-worker": [W((s) => `queue depth ${int(s, 30000, 52000)} and growing (consumers saturated)`)],
    "api-gateway": [E((s) => `429 Too Many Requests — shedding load (${reqId(s)})`), W(() => `autoscaler adding ${int(1, 2, 8)} instances (target 85% cpu)`)],
    cache: [W((s) => `eviction rate spiking, hit ratio dropped to ${int(s, 55, 68)}%`)],
    "db-primary": [E((s) => `slow query ${(3 + seeded(s) * 2).toFixed(1)}s on orders (lock contention)`)],
  },
  deployment_failure: {
    "api-gateway": [
      E(() => `500 Internal Server Error — unhandled exception in v2.14.0`),
      E((s) => `TypeError: cannot read property 'id' of undefined (${reqId(s)})`),
      W(() => `health check failing on 4/5 pods for release v2.14.0`),
      W(() => `initiating rollback to v2.13.3`),
    ],
    cache: [E(() => `cascading failure: dependent service returning 500s`)],
  },
  generic: {
    "api-gateway": [E((s) => `5xx error rate exceeding SLO (${reqId(s)})`)],
    "db-primary": [E(() => `query timeout on critical path`)],
  },
};

/**
 * Generate `batchSize` log lines for the moment at `elapsedSeconds`. Error/warn
 * lines concentrate on the services with the highest incident level; healthy
 * state stays ~INFO-heavy.
 */
export function generateLogs(
  scenarioType: ScenarioType,
  elapsedSeconds: number,
  services: ServiceMetric[],
  batchSize = 3,
): LogLine[] {
  const type = SCENARIO_TYPES.includes(scenarioType) ? scenarioType : "generic";
  const incident = INCIDENT[type];
  const lines: LogLine[] = [];

  // Weight service selection toward hot services (with a floor for normal traffic).
  const weights = services.map((s) => 0.3 + s.level * 3);
  const totalW = weights.reduce((a, b) => a + b, 0);

  for (let i = 0; i < batchSize; i++) {
    const seed = elapsedSeconds * 10 + i * 3;
    let r = seeded(seed * 1.7) * totalW;
    let idx = 0;
    while (idx < services.length - 1 && r > weights[idx]) {
      r -= weights[idx];
      idx++;
    }
    const svc = services[idx];
    const pool = incident[svc.short];
    const showIncident = svc.level > 0 && pool && seeded(seed * 2.3) < 0.2 + svc.level * 0.7;

    let level: LogLevel;
    let message: string;

    if (showIncident) {
      const t = pick(pool, seed * 3.1);
      level = t.level;
      message = t.make(seed * 5.2);
    } else {
      const normal = NORMAL[svc.short] ?? NORMAL["api-gateway"];
      message = normal(seed * 4.9);
      const roll = seeded(seed * 6.1);
      level = roll > 0.94 ? "WARN" : "INFO";
    }

    lines.push({
      id: `log-${elapsedSeconds}-${i}`,
      timestamp: new Date().toISOString(),
      level,
      service: svc.short,
      message,
    });
  }
  return lines;
}
