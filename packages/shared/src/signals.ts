/**
 * Signal injection plans — the "injection matrix" a drill planner defines, and that the injection
 * engine turns into real telemetry (traces, metrics, logs, events) in Datadog.
 *
 * One SignalPlan = one stream: e.g. "5,000 requests/min into checkout-api for 10 minutes, 300/min
 * failing with HTTP 500, ramping up". Shared by the planner UI, core validation and the engine.
 */

export const MONITORING_DOMAINS = ["application", "database"] as const;
export type MonitoringDomain = (typeof MONITORING_DOMAINS)[number];

export const MONITORING_DOMAIN_LABELS: Record<MonitoringDomain, string> = {
  application: "Application monitoring",
  database: "Database monitoring",
};

export const SIGNAL_KINDS = [
  "http_errors",
  "latency_spike",
  "error_logs",
  "db_query_failures",
  "db_connection_exhaustion",
  "db_slow_queries",
  "replica_lag",
  "alert_event",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const SIGNAL_PATTERNS = ["steady", "ramp", "spike", "sawtooth"] as const;
export type SignalPattern = (typeof SIGNAL_PATTERNS)[number];

export const SIGNAL_PATTERN_LABELS: Record<SignalPattern, string> = {
  steady: "Steady",
  ramp: "Ramp up",
  spike: "Spike (middle third)",
  sawtooth: "Sawtooth (3-min waves)",
};

export const TELEMETRY_TYPES = ["traces", "metrics", "logs", "events"] as const;
export type TelemetryType = (typeof TELEMETRY_TYPES)[number];

export interface SignalParams {
  /** HTTP status for failing requests (http_errors). */
  statusCode?: number;
  /** Route that fails, e.g. "POST /api/checkout". */
  endpoint?: string;
  /** Latency of affected requests/queries in ms (latency_spike, db_slow_queries). */
  latencyMs?: number;
  /** Database name (db_* kinds). */
  dbName?: string;
  /** Error message carried by failing spans and log lines. */
  errorMessage?: string;
  /** Connection pool size (db_connection_exhaustion). */
  poolSize?: number;
  /** Peak replica lag in seconds (replica_lag). */
  lagSeconds?: number;
  /** Monitor/alert title (alert_event). */
  monitorName?: string;
  /** Alert priority, e.g. "P1" (alert_event). */
  priority?: string;
}

export interface SignalPlan {
  kind: SignalKind;
  /** Target service, e.g. "checkout-api" or "postgres-primary". */
  service: string;
  /** Volume per minute: requests, queries, log lines or events. */
  ratePerMinute: number;
  /** How many of those fail per minute (0 for pure latency/lag signals). */
  failuresPerMinute: number;
  durationMinutes: number;
  /** Minutes after Execute that this stream starts. */
  startOffsetMinutes: number;
  pattern: SignalPattern;
  params: SignalParams;
}

interface SignalKindMeta {
  label: string;
  domain: MonitoringDomain;
  /** What `ratePerMinute` counts. */
  unit: "requests" | "queries" | "log lines" | "events" | "samples";
  /** Which telemetry the engine emits for this kind. */
  telemetry: TelemetryType[];
  description: string;
  defaults: Omit<SignalPlan, "kind">;
}

export const SIGNAL_KIND_META: Record<SignalKind, SignalKindMeta> = {
  http_errors: {
    label: "HTTP errors",
    domain: "application",
    unit: "requests",
    telemetry: ["traces", "metrics", "logs"],
    description: "Request traffic where a share of requests fail with a 5xx — drives the APM error rate.",
    defaults: {
      service: "checkout-api",
      ratePerMinute: 5000,
      failuresPerMinute: 300,
      durationMinutes: 10,
      startOffsetMinutes: 0,
      pattern: "ramp",
      params: { statusCode: 500, endpoint: "POST /api/checkout", errorMessage: "upstream payments-service returned 503" },
    },
  },
  latency_spike: {
    label: "Latency spike",
    domain: "application",
    unit: "requests",
    telemetry: ["traces", "metrics"],
    description: "Requests slow down to the given latency — drives p95/p99 latency monitors.",
    defaults: {
      service: "checkout-api",
      ratePerMinute: 3000,
      failuresPerMinute: 0,
      durationMinutes: 8,
      startOffsetMinutes: 1,
      pattern: "spike",
      params: { latencyMs: 2400, endpoint: "GET /api/cart" },
    },
  },
  error_logs: {
    label: "Error log flood",
    domain: "application",
    unit: "log lines",
    telemetry: ["logs", "metrics"],
    description: "Structured ERROR log lines with stack traces, correlated to traces.",
    defaults: {
      service: "payments-service",
      ratePerMinute: 600,
      failuresPerMinute: 600,
      durationMinutes: 10,
      startOffsetMinutes: 0,
      pattern: "steady",
      params: { errorMessage: "PaymentGatewayTimeout: no response from gateway after 30000ms" },
    },
  },
  db_query_failures: {
    label: "Database query failures",
    domain: "database",
    unit: "queries",
    telemetry: ["traces", "metrics", "logs"],
    description: "Database client spans that fail — e.g. 100% of queries to the primary erroring.",
    defaults: {
      service: "postgres-primary",
      ratePerMinute: 4000,
      failuresPerMinute: 4000,
      durationMinutes: 10,
      startOffsetMinutes: 0,
      pattern: "steady",
      params: {
        dbName: "orders",
        errorMessage: "FATAL: terminating connection due to administrator command (primary unavailable)",
      },
    },
  },
  db_connection_exhaustion: {
    label: "Connection pool exhaustion",
    domain: "database",
    unit: "requests",
    telemetry: ["traces", "metrics", "logs"],
    description: "The pool fills to its limit and new connections time out.",
    defaults: {
      service: "checkout-api",
      ratePerMinute: 2000,
      failuresPerMinute: 800,
      durationMinutes: 8,
      startOffsetMinutes: 1,
      pattern: "ramp",
      params: { dbName: "orders", poolSize: 200, errorMessage: "timeout acquiring connection from pool (200/200 in use)" },
    },
  },
  db_slow_queries: {
    label: "Slow queries",
    domain: "database",
    unit: "queries",
    telemetry: ["traces", "metrics"],
    description: "Queries take far longer than normal — drives database latency monitors.",
    defaults: {
      service: "postgres-replica",
      ratePerMinute: 1500,
      failuresPerMinute: 0,
      durationMinutes: 10,
      startOffsetMinutes: 2,
      pattern: "sawtooth",
      params: { dbName: "orders", latencyMs: 1800 },
    },
  },
  replica_lag: {
    label: "Replica lag",
    domain: "database",
    unit: "samples",
    telemetry: ["metrics", "logs"],
    description: "Replication lag climbs to the given peak — a gauge sampled every second.",
    defaults: {
      service: "postgres-replica",
      ratePerMinute: 60,
      failuresPerMinute: 0,
      durationMinutes: 10,
      startOffsetMinutes: 0,
      pattern: "ramp",
      params: { dbName: "orders", lagSeconds: 24 },
    },
  },
  alert_event: {
    label: "Monitor alert event",
    domain: "application",
    unit: "events",
    telemetry: ["events"],
    description: "A monitor-style alert event (as a Datadog monitor would raise) at the start of the stream.",
    defaults: {
      service: "checkout-api",
      ratePerMinute: 1,
      failuresPerMinute: 0,
      durationMinutes: 1,
      startOffsetMinutes: 0,
      pattern: "steady",
      params: { monitorName: "[P1] checkout-api error rate above 5%", priority: "P1" },
    },
  },
};

export function defaultSignal(kind: SignalKind): SignalPlan {
  const { defaults } = SIGNAL_KIND_META[kind];
  return { kind, ...defaults, params: { ...defaults.params } };
}

/** Pattern multiplier (0–1] for a stream `elapsedMinutes` into its `durationMinutes`. */
export function patternFactor(pattern: SignalPattern, elapsedMinutes: number, durationMinutes: number): number {
  const t = durationMinutes > 0 ? Math.min(1, Math.max(0, elapsedMinutes / durationMinutes)) : 1;
  switch (pattern) {
    case "steady":
      return 1;
    case "ramp":
      return 0.1 + 0.9 * t;
    case "spike":
      return t >= 1 / 3 && t < 2 / 3 ? 1 : 0.2;
    case "sawtooth":
      return 0.25 + 0.75 * ((elapsedMinutes % 3) / 3);
  }
}

/** Average of patternFactor over the stream (for totals). */
export function averagePatternFactor(pattern: SignalPattern, durationMinutes: number) {
  const steps = 120;
  let sum = 0;
  for (let i = 0; i < steps; i++) sum += patternFactor(pattern, ((i + 0.5) / steps) * durationMinutes, durationMinutes);
  return sum / steps;
}

export interface SignalTotals {
  volume: number;
  failures: number;
  /** Estimated telemetry the engine will emit. */
  spans: number;
  logs: number;
  metricPoints: number;
  events: number;
}

/** Spans per request/query the engine generates (server → downstream → db). */
const SPANS_PER_UNIT: Partial<Record<SignalKind, number>> = {
  http_errors: 3,
  latency_spike: 3,
  db_query_failures: 2,
  db_connection_exhaustion: 2,
  db_slow_queries: 2,
};

export function signalTotals(plan: SignalPlan): SignalTotals {
  const meta = SIGNAL_KIND_META[plan.kind];
  const factor = plan.kind === "alert_event" ? 1 : averagePatternFactor(plan.pattern, plan.durationMinutes);
  const volume = plan.kind === "alert_event" ? 1 : Math.round(plan.ratePerMinute * plan.durationMinutes * factor);
  const failures = plan.kind === "alert_event" ? 0 : Math.round(Math.min(plan.failuresPerMinute, plan.ratePerMinute) * plan.durationMinutes * factor);
  const has = (t: TelemetryType) => meta.telemetry.includes(t);
  return {
    volume,
    failures,
    spans: has("traces") ? volume * (SPANS_PER_UNIT[plan.kind] ?? 1) : 0,
    logs: has("logs") ? (plan.kind === "replica_lag" ? Math.ceil(plan.durationMinutes) : plan.kind === "error_logs" ? volume : failures) : 0,
    // One aggregated point per metric per 10s flush.
    metricPoints: has("metrics") ? Math.ceil(plan.durationMinutes * 6) * 4 : 0,
    events: has("events") ? 1 : 0,
  };
}

export function planTotals(plans: SignalPlan[]): SignalTotals {
  return plans.map(signalTotals).reduce(
    (a, t) => ({
      volume: a.volume + t.volume,
      failures: a.failures + t.failures,
      spans: a.spans + t.spans,
      logs: a.logs + t.logs,
      metricPoints: a.metricPoints + t.metricPoints,
      events: a.events + t.events,
    }),
    { volume: 0, failures: 0, spans: 0, logs: 0, metricPoints: 0, events: 0 },
  );
}

const n = (value: number) => value.toLocaleString("en-US");

/** One plain-English sentence: what this stream will inject. */
export function describeSignal(plan: SignalPlan): string {
  const p = plan.params;
  const when = plan.startOffsetMinutes ? `starting at T+${plan.startOffsetMinutes}m` : "starting immediately";
  const span = `for ${plan.durationMinutes} min, ${when}, ${SIGNAL_PATTERN_LABELS[plan.pattern].toLowerCase()}`;
  const pct = plan.ratePerMinute ? Math.round((plan.failuresPerMinute / plan.ratePerMinute) * 1000) / 10 : 0;
  switch (plan.kind) {
    case "http_errors":
      return `${n(plan.ratePerMinute)} requests/min to ${p.endpoint ?? plan.service} on ${plan.service}, ${n(plan.failuresPerMinute)}/min (${pct}%) failing with HTTP ${p.statusCode ?? 500} — ${span}.`;
    case "latency_spike":
      return `${n(plan.ratePerMinute)} requests/min to ${p.endpoint ?? plan.service} on ${plan.service} slowed to ~${n(p.latencyMs ?? 2000)} ms — ${span}.`;
    case "error_logs":
      return `${n(plan.ratePerMinute)} ERROR log lines/min from ${plan.service} (“${p.errorMessage ?? "error"}”) — ${span}.`;
    case "db_query_failures":
      return `${n(plan.ratePerMinute)} queries/min to ${p.dbName ?? "the database"} on ${plan.service}, ${n(plan.failuresPerMinute)}/min (${pct}%) failing — ${span}.`;
    case "db_connection_exhaustion":
      return `Connection pool on ${plan.service} (${p.poolSize ?? 100} max) saturates; ${n(plan.failuresPerMinute)} of ${n(plan.ratePerMinute)} requests/min time out acquiring a connection — ${span}.`;
    case "db_slow_queries":
      return `${n(plan.ratePerMinute)} queries/min to ${p.dbName ?? "the database"} on ${plan.service} taking ~${n(p.latencyMs ?? 1000)} ms — ${span}.`;
    case "replica_lag":
      return `Replication lag on ${plan.service} climbing to ${p.lagSeconds ?? 10}s — ${span}.`;
    case "alert_event":
      return `Monitor alert “${p.monitorName ?? "Monitor triggered"}” (${p.priority ?? "P2"}) on ${plan.service}${plan.startOffsetMinutes ? ` at T+${plan.startOffsetMinutes}m` : " at T+0"}.`;
  }
}
