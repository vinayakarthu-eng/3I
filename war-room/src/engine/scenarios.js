// Three expert-shaped scenarios. Each inject fires at `atMin` (scaled by drill speed),
// may degrade services, and carries a domain hint the SME reasons about.

export const SCENARIOS = [
  {
    slug: "database_failover",
    title: "Database Primary Failover",
    severity: "SEV1",
    domain: "db",
    paymentsAffected: true,
    summary: "The primary Postgres cluster in us-east-1 is unresponsive during peak traffic.",
    services: [
      { name: "API Gateway", status: "degraded" },
      { name: "Database Primary", status: "down" },
      { name: "Database Replica", status: "degraded" },
      { name: "Cache Layer", status: "healthy" },
      { name: "Payments", status: "degraded" },
    ],
    injects: [
      { atMin: 0, type: "alert", severity: "SEV1", text: "PagerDuty: primary DB health checks failing in us-east-1.", affects: [["Database Primary", "down"]] },
      { atMin: 1, type: "metric", text: "Connection pool exhausted (200/200) — new connections timing out.", affects: [["API Gateway", "degraded"]] },
      { atMin: 2, type: "metric", text: "Application error rate climbing past 40%; checkout failing.", affects: [["Payments", "down"]] },
      { atMin: 3, type: "comms", text: "Support: 180+ tickets about failed payments in the last 5 minutes." },
      { atMin: 5, type: "metric", text: "Replica lag holding at 24s — promotion will lose recent writes.", affects: [["Database Replica", "degraded"]] },
      { atMin: 7, type: "comms", text: "CEO in #exec: board call in 30 minutes, needs a status line." },
    ],
  },
  {
    slug: "credential_stuffing",
    title: "Credential-Stuffing Attack",
    severity: "SEV2",
    domain: "security",
    paymentsAffected: false,
    summary: "A botnet is running a credential-stuffing attack against the login endpoint.",
    services: [
      { name: "Auth Service", status: "degraded" },
      { name: "API Gateway", status: "degraded" },
      { name: "WAF", status: "healthy" },
      { name: "Login", status: "degraded" },
      { name: "Account DB", status: "healthy" },
    ],
    injects: [
      { atMin: 0, type: "alert", severity: "SEV2", text: "Failed-login rate spiked 50x from a wide IP range (ASN 203.0.113.0/24).", affects: [["Auth Service", "degraded"]] },
      { atMin: 1, type: "security", text: "3,400 accounts hit lockout thresholds in 2 minutes.", affects: [["Login", "degraded"]] },
      { atMin: 3, type: "security", text: "A 2M-credential combo list referencing our domain found on a paste site." },
      { atMin: 4, type: "metric", text: "Auth latency p99 at 4.1s — legitimate users timing out.", affects: [["API Gateway", "degraded"]] },
      { atMin: 6, type: "comms", text: "Support: customers reporting they're locked out of their accounts." },
      { atMin: 8, type: "security", text: "Small cluster of successful logins from the attack range — possible account takeover." },
    ],
  },
  {
    slug: "canary_leak",
    title: "Canary Memory Leak",
    severity: "SEV2",
    domain: "k8s",
    paymentsAffected: false,
    summary: "A new canary release is leaking memory and starting to cascade to stable pods.",
    services: [
      { name: "Canary Deploy", status: "down" },
      { name: "API Gateway", status: "degraded" },
      { name: "Ingress", status: "healthy" },
      { name: "Stable Pods", status: "healthy" },
      { name: "Metrics", status: "healthy" },
    ],
    injects: [
      { atMin: 0, type: "alert", severity: "SEV2", text: "Canary v2.14.0 pods OOMKilled 6 times in 4 minutes.", affects: [["Canary Deploy", "down"]] },
      { atMin: 1, type: "metric", text: "Canary error rate at 100%; 12% of traffic routed to canary.", affects: [["API Gateway", "degraded"]] },
      { atMin: 3, type: "metric", text: "Memory pressure now affecting two stable pods on the same node.", affects: [["Stable Pods", "degraded"]] },
      { atMin: 4, type: "comms", text: "Support: intermittent 500s reported by three enterprise customers." },
      { atMin: 6, type: "metric", text: "HPA scaling up but new pods inherit the leak — scaling makes it worse." },
      { atMin: 8, type: "comms", text: "Release manager asks whether to roll back v2.14.0 fleet-wide." },
    ],
  },
];

export function findScenario(slug) {
  return SCENARIOS.find((s) => s.slug === slug);
}
