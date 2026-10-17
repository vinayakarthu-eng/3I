import { defaultSignal, type SignalPlan } from "./signals";
import type {
  CriteriaType,
  Difficulty,
  DrillScenario,
  DrillType,
  Sector,
} from "./index";

export interface ObjectiveDraft {
  description: string;
  criteriaType: CriteriaType;
  targetValue: Record<string, unknown>;
  weight: number;
  /** Competency area name (must match COMPETENCY_AREAS); mapped on drill creation. */
  competency?: string;
}

export interface DrillTemplate {
  id: string;
  name: string;
  /** "general" templates apply to any sector. */
  sector: Sector | "general";
  type: DrillType;
  description: string;
  estimatedDurationMinutes: number;
  difficulty: Difficulty;
  /** "Inspired by [real incident reference]". */
  basedOn: string;
  /** Single-competency quick drills (10–15 min). */
  isQuickDrill: boolean;
  /** Competency area names this scenario exercises. */
  competencyAreasTested: string[];
  scenario: DrillScenario;
  objectives: ObjectiveDraft[];
}

// Short constructors to keep the library readable.
const tta = (description: string, max_minutes: number, weight = 3, competency?: string): ObjectiveDraft => ({
  description,
  criteriaType: "time_to_action",
  targetValue: { max_minutes },
  weight,
  competency,
});
const checklist = (description: string, items: string[], weight = 2, competency?: string): ObjectiveDraft => ({
  description,
  criteriaType: "completeness",
  targetValue: { checklist: items },
  weight,
  competency,
});
const coord = (description: string, stakeholders: string[], weight = 2, competency?: string): ObjectiveDraft => ({
  description,
  criteriaType: "coordination",
  targetValue: { stakeholders },
  weight,
  competency,
});
const quality = (description: string, dims: string[], weight = 1, competency?: string): ObjectiveDraft => ({
  description,
  criteriaType: "quality",
  targetValue: { rubric: dims.map((dimension) => ({ dimension, scale: 5 })) },
  weight,
  competency,
});
const accuracy = (description: string, expected_outcome: string, weight = 2, competency?: string): ObjectiveDraft => ({
  description,
  criteriaType: "accuracy",
  targetValue: { expected_outcome },
  weight,
  competency,
});

const signal = (kind: SignalPlan["kind"], overrides: Partial<SignalPlan> = {}): SignalPlan => {
  const base = defaultSignal(kind);
  return { ...base, ...overrides, params: { ...base.params, ...overrides.params } };
};

export const DRILL_TEMPLATES: DrillTemplate[] = [
  // ─── Monitoring drills: real telemetry injected into Datadog ───────────────
  {
    id: "app-monitoring-checkout-errors",
    name: "Application Monitoring: Checkout Error Surge",
    sector: "technology",
    type: "functional",
    description:
      "Inject a realistic error surge into checkout-api — failing requests, slow responses, error logs and a P1 monitor — and validate that responders detect it in Datadog APM, find the failing dependency, and mitigate.",
    estimatedDurationMinutes: 30,
    difficulty: "intermediate",
    basedOn: "Modelled on payment-dependency outages behind 5xx surges in e-commerce checkouts",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "Internal Communication"],
    scenario: {
      summary: "checkout-api starts failing as its payments-service dependency times out during peak traffic.",
      scenarioType: "high_traffic",
      severity: "SEV-2",
      monitoringDomain: "application",
      injects: [
        { at_minute: 0, description: "Datadog monitor: checkout-api error rate above 5%." },
        { at_minute: 2, description: "p95 latency on GET /api/cart crosses 2s." },
        { at_minute: 4, description: "payments-service logging gateway timeouts." },
      ],
      expected_actions: ["Acknowledge the monitor", "Open the checkout-api APM service page", "Trace failures to payments-service", "Mitigate (fail open / disable feature)", "Post an internal update"],
      signals: [
        signal("alert_event"),
        signal("http_errors"),
        signal("latency_spike"),
        signal("error_logs"),
      ],
    },
    objectives: [
      tta("Acknowledge the error-rate monitor within 3 minutes", 3, 3, "Incident Scoping"),
      accuracy("Identify the failing dependency from traces", "payments-service gateway timeouts are causing checkout-api 5xx responses", 3, "Incident Scoping"),
      checklist("Work the investigation in APM", ["Open checkout-api service page", "Filter error traces", "Inspect a failing trace", "Correlate with payments-service logs"], 2, "Incident Mechanics"),
      quality("Internal status update is clear and accurate", ["Clarity", "Accuracy", "Timeliness"], 1, "Internal Communication"),
    ],
  },
  {
    id: "db-monitoring-primary-failover",
    name: "Database Monitoring: Primary Database Failure",
    sector: "technology",
    type: "functional",
    description:
      "Inject a primary Postgres failure — 100% of queries to the primary failing, the connection pool exhausting, replica lag climbing — and validate detection in Datadog Database Monitoring and a safe failover.",
    estimatedDurationMinutes: 30,
    difficulty: "advanced",
    basedOn: "Modelled on primary-loss incidents such as the 2017 GitLab database outage",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "Incident Command"],
    scenario: {
      summary: "The primary Postgres instance for the orders database stops accepting queries during peak traffic.",
      scenarioType: "database_failover",
      severity: "SEV-1",
      monitoringDomain: "database",
      injects: [
        { at_minute: 0, description: "Datadog monitor: postgres-primary query error rate at 100%." },
        { at_minute: 1, description: "checkout-api connection pool exhausted (200/200)." },
        { at_minute: 3, description: "Replica lag climbing past 20s — promotion will lose writes." },
      ],
      expected_actions: ["Acknowledge the monitor", "Confirm the primary is down", "Assess replica lag", "Decide and execute failover", "Verify writes recover"],
      signals: [
        signal("alert_event", { service: "postgres-primary", params: { monitorName: "[P1] postgres-primary query error rate at 100%", priority: "P1" } }),
        signal("db_query_failures"),
        signal("db_connection_exhaustion"),
        signal("replica_lag"),
      ],
    },
    objectives: [
      tta("Acknowledge the database monitor within 3 minutes", 3, 3, "Incident Scoping"),
      accuracy("Pinpoint the failing database from APM/DBM", "postgres-primary (orders) is failing 100% of queries; the replica is healthy but lagging", 3, "Incident Scoping"),
      checklist("Execute the failover safely", ["Confirm primary down", "Check replica lag", "Promote replica", "Repoint application", "Verify writes"], 3, "Incident Mechanics"),
      quality("Go/no-go decision is explicit and owned", ["Clarity", "Risk awareness", "Ownership"], 1, "Incident Command"),
    ],
  },

  // ─── Technology (8) ──────────────────────────────────────────────────────
  {
    id: "database-failover",
    name: "Database Failover",
    sector: "technology",
    type: "full_scale",
    description:
      "Simulate loss of the primary database and validate detection, failover execution, and stakeholder communication.",
    estimatedDurationMinutes: 45,
    difficulty: "advanced",
    basedOn: "Inspired by the 2017 GitLab database incident",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "Internal Communication"],
    scenario: {
      summary: "The primary database cluster becomes unresponsive during peak traffic.",
      scenarioType: "database_failover",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Monitoring alert: primary DB health checks failing." },
        { at_minute: 3, description: "Connection pool exhaustion — new connections timing out." },
        { at_minute: 5, description: "Application error rate exceeds 40%." },
        { at_minute: 8, description: "Customer support: 200+ tickets in the last 5 minutes." },
        { at_minute: 12, description: "CEO asks for a status update before a board call." },
        { at_minute: 18, description: "Replica promotion stalls awaiting quorum." },
      ],
      expected_actions: ["Acknowledge alert", "Confirm primary failure", "Promote replica", "Update status page"],
    },
    objectives: [
      tta("Detect the database failure within 5 minutes", 5, 3, "Incident Scoping"),
      checklist("Execute the failover runbook completely", ["Confirm primary down", "Promote replica", "Repoint application config", "Verify writes"], 2, "Incident Mechanics"),
      coord("Communicate status to all stakeholders", ["Engineering Lead", "Support Lead", "VP Engineering"], 1, "Internal Communication"),
    ],
  },
  {
    id: "dns-outage",
    name: "DNS Outage",
    sector: "technology",
    type: "full_scale",
    description:
      "Respond to loss of the primary DNS provider: detection, mitigation via secondary DNS, and customer communication.",
    estimatedDurationMinutes: 30,
    difficulty: "advanced",
    basedOn: "Inspired by the 2016 Dyn DNS DDoS outage",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "External Communication"],
    scenario: {
      summary: "The primary DNS provider suffers a global outage; public hostnames stop resolving.",
      scenarioType: "dns_outage",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Synthetic monitors report resolution failures." },
        { at_minute: 4, description: "Request volume collapses to near zero across regions." },
        { at_minute: 8, description: "Social media reports that the site is down." },
        { at_minute: 12, description: "All services logging name-resolution failures." },
        { at_minute: 20, description: "Secondary DNS propagation is slower than expected." },
      ],
      expected_actions: ["Declare incident", "Switch to secondary DNS", "Post customer communication", "Confirm resolution"],
    },
    objectives: [
      tta("Detect and declare the incident within 5 minutes", 5, 3, "Incident Scoping"),
      checklist("Fail over to the secondary DNS provider", ["Lower TTLs", "Update NS records", "Verify propagation", "Monitor error rates"], 2, "Incident Mechanics"),
      quality("Customer communication is clear, accurate, and timely", ["Clarity", "Timeliness", "Accuracy"], 1, "External Communication"),
    ],
  },
  {
    id: "credential-leak",
    name: "Credential Leak Response",
    sector: "technology",
    type: "functional",
    description: "Respond to a production credential leaked publicly: detect, revoke, and assess impact.",
    estimatedDurationMinutes: 30,
    difficulty: "intermediate",
    basedOn: "Inspired by numerous public GitHub secret-leak incidents",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Mechanics", "Process Adherence", "External Communication"],
    scenario: {
      summary: "A production API key is discovered in a public code repository.",
      scenarioType: "credential_leak",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "A security researcher reports the leaked key to security@." },
        { at_minute: 4, description: "Unusual API traffic from an unknown IP range (203.0.113.0/24)." },
        { at_minute: 8, description: "Legal asks whether customer data was accessed." },
        { at_minute: 12, description: "A second key from the same repo is confirmed active." },
        { at_minute: 18, description: "PR drafts a holding statement and needs a go/no-go." },
      ],
      expected_actions: ["Revoke key", "Rotate secrets", "Assess blast radius", "Notify stakeholders"],
    },
    objectives: [
      checklist("Revoke and rotate all affected credentials", ["Revoke key", "Issue new key", "Deploy new key", "Audit access logs"], 3, "Incident Mechanics"),
      accuracy("Accurately assess the impact of the leak", "Team identifies which systems the key could access, whether it was used maliciously, and what data was exposed.", 2, "Process Adherence"),
      quality("Stakeholder and legal communication is accurate", ["Clarity", "Accuracy", "Timeliness"], 1, "External Communication"),
    ],
  },
  {
    id: "ddos-attack",
    name: "DDoS Attack Mitigation",
    sector: "technology",
    type: "full_scale",
    description: "Mitigate a volumetric DDoS attack while keeping critical services available.",
    estimatedDurationMinutes: 45,
    difficulty: "advanced",
    basedOn: "Inspired by the 2018 GitHub 1.35 Tbps memcached DDoS",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "Incident Command"],
    scenario: {
      summary: "A large volumetric attack saturates the edge and degrades availability.",
      scenarioType: "high_traffic",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Edge bandwidth saturates; latency spikes 10x." },
        { at_minute: 5, description: "Autoscaler maxes out; queue depth climbing." },
        { at_minute: 10, description: "Legitimate customers report timeouts." },
        { at_minute: 15, description: "Attack shifts to a new attack vector." },
        { at_minute: 25, description: "Finance asks about the scrubbing-service cost." },
      ],
      expected_actions: ["Enable scrubbing", "Rate-limit abusive sources", "Shed non-critical load", "Brief leadership"],
    },
    objectives: [
      tta("Identify the attack and engage mitigation within 10 minutes", 10, 3, "Incident Scoping"),
      checklist("Apply layered mitigations", ["Enable upstream scrubbing", "Rate-limit by signature", "Shed non-critical traffic", "Confirm recovery"], 2, "Incident Mechanics"),
      coord("Coordinate roles and decisions as IC", ["Network Lead", "Security Lead", "Leadership"], 2, "Incident Command"),
    ],
  },
  {
    id: "deployment-rollback",
    name: "Deployment Rollback",
    sector: "technology",
    type: "tabletop",
    description: "A bad release causes errors; practice the decision to roll back and the rollback itself.",
    estimatedDurationMinutes: 20,
    difficulty: "beginner",
    basedOn: "Inspired by the 2012 Knight Capital deployment incident",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Process Adherence"],
    scenario: {
      summary: "Release v2.14.0 causes a spike in 500s for one service, cascading to dependents.",
      scenarioType: "deployment_failure",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Error rate for the API hits 100% on new pods." },
        { at_minute: 4, description: "Dependent services start returning 500s." },
        { at_minute: 8, description: "On-call debates a forward-fix vs. rollback." },
      ],
      expected_actions: ["Diagnose the regression", "Decide rollback", "Execute rollback", "Verify recovery"],
    },
    objectives: [
      tta("Make the rollback decision within 8 minutes", 8, 2, "Incident Scoping"),
      checklist("Execute the rollback runbook", ["Pause the rollout", "Roll back to last good version", "Verify health checks", "Post-incident note"], 3, "Process Adherence"),
    ],
  },
  {
    id: "third-party-api-outage",
    name: "Third-Party API Outage",
    sector: "technology",
    type: "functional",
    description: "A critical payment provider API goes down; practice graceful degradation and comms.",
    estimatedDurationMinutes: 25,
    difficulty: "intermediate",
    basedOn: "Inspired by the 2021 Stripe partial outage",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "External Communication"],
    scenario: {
      summary: "The payment provider returns elevated errors and timeouts.",
      scenarioType: "generic",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Payment success rate drops from 99% to 60%." },
        { at_minute: 6, description: "Provider status page confirms a partial outage." },
        { at_minute: 14, description: "Customers tweet about failed checkouts." },
      ],
      expected_actions: ["Confirm third-party fault", "Enable ret/queue fallback", "Communicate to customers"],
    },
    objectives: [
      accuracy("Correctly attribute the failure to the third party", "Team rules out internal causes and confirms the provider as the root cause from status and telemetry.", 2, "Incident Scoping"),
      checklist("Degrade gracefully", ["Enable retry/queue", "Disable non-critical calls", "Monitor recovery", "Reconcile failed transactions"], 2, "Incident Mechanics"),
      quality("Customer messaging sets expectations", ["Clarity", "Timeliness"], 1, "External Communication"),
    ],
  },
  {
    id: "datacenter-failover",
    name: "Data Center Failover",
    sector: "technology",
    type: "full_scale",
    description: "Full regional failover exercise: evacuate a failed region and validate the DR plan.",
    estimatedDurationMinutes: 60,
    difficulty: "advanced",
    basedOn: "Inspired by the 2021 US-East-1 regional disruptions",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Mechanics", "Incident Command", "Internal Communication"],
    scenario: {
      summary: "A primary region becomes unavailable; traffic must move to the secondary region.",
      scenarioType: "database_failover",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Region-wide networking failure declared by the provider." },
        { at_minute: 10, description: "Cross-region replication lag spikes." },
        { at_minute: 25, description: "Failover reveals a stale DNS record." },
        { at_minute: 40, description: "Leadership requests an ETA for full recovery." },
      ],
      expected_actions: ["Declare DR event", "Fail over to secondary region", "Validate data integrity", "Communicate recovery"],
    },
    objectives: [
      checklist("Execute the regional DR runbook", ["Declare DR", "Promote secondary region", "Repoint global traffic", "Validate data integrity"], 3, "Incident Mechanics"),
      coord("Run the incident as IC with clear roles", ["Infra Lead", "Data Lead", "Comms Lead", "Leadership"], 2, "Incident Command"),
      quality("Internal updates are regular and accurate", ["Cadence", "Accuracy"], 1, "Internal Communication"),
    ],
  },
  {
    id: "ssl-cert-expiry",
    name: "SSL Certificate Expiry",
    sector: "technology",
    type: "tabletop",
    description: "A TLS certificate expires in production; practice rapid detection and replacement.",
    estimatedDurationMinutes: 15,
    difficulty: "beginner",
    basedOn: "Inspired by repeated real-world cert-expiry outages",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Process Adherence"],
    scenario: {
      summary: "The certificate on the primary domain has expired; browsers show warnings.",
      scenarioType: "generic",
      severity: "SEV-3",
      injects: [
        { at_minute: 0, description: "Users report TLS warnings on the main site." },
        { at_minute: 5, description: "Automated renewal is found to have silently failed." },
      ],
      expected_actions: ["Identify the expired cert", "Reissue and deploy", "Verify chain", "Fix renewal automation"],
    },
    objectives: [
      tta("Identify the expired certificate within 5 minutes", 5, 2, "Incident Scoping"),
      checklist("Replace the certificate and fix automation", ["Reissue cert", "Deploy to edge", "Verify chain and OCSP", "Repair auto-renewal"], 3, "Process Adherence"),
    ],
  },

  // ─── Healthcare (4) ──────────────────────────────────────────────────────
  {
    id: "code-blue",
    name: "Code Blue Response",
    sector: "healthcare",
    type: "full_scale",
    description: "Simulated cardiac arrest on an inpatient ward to evaluate response time and protocol adherence.",
    estimatedDurationMinutes: 30,
    difficulty: "advanced",
    basedOn: "Inspired by AHA ACLS resuscitation guidelines",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Command", "Process Adherence"],
    scenario: {
      summary: "A patient on a medical ward becomes unresponsive with no pulse.",
      scenarioType: "generic",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Nurse finds patient unresponsive and calls Code Blue." },
        { at_minute: 3, description: "Defibrillator on the crash cart reports a low battery." },
        { at_minute: 8, description: "Family member arrives and asks what is happening." },
      ],
      expected_actions: ["Start CPR", "Attach defibrillator", "Administer epinephrine", "Document timeline"],
    },
    objectives: [
      tta("Code team arrives at bedside within 3 minutes", 3, 3, "Incident Scoping"),
      coord("Full code team assembled with all roles filled", ["Team Leader", "Airway", "Compressions", "Medications", "Recorder"], 2, "Incident Command"),
      checklist("ACLS protocol followed correctly", ["CPR started immediately", "Rhythm check every 2 minutes", "Epinephrine every 3-5 minutes", "Timeline documented"], 3, "Process Adherence"),
    ],
  },
  {
    id: "mass-casualty-triage",
    name: "Mass Casualty Incident Triage",
    sector: "healthcare",
    type: "functional",
    description: "A surge of casualties arrives at once; practice START triage, resource allocation, and command.",
    estimatedDurationMinutes: 45,
    difficulty: "advanced",
    basedOn: "Inspired by START/SALT mass-casualty triage protocols",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Command", "Internal Communication"],
    scenario: {
      summary: "A bus collision sends 30+ patients to the ED within 20 minutes.",
      scenarioType: "generic",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "First ambulances arrive; 8 patients, mixed severity." },
        { at_minute: 10, description: "Two critical patients need immediate surgery." },
        { at_minute: 25, description: "Blood bank reports limited O-negative supply." },
      ],
      expected_actions: ["Activate MCI plan", "Triage with START", "Allocate OR and ICU", "Brief incoming staff"],
    },
    objectives: [
      checklist("Activate and run the MCI plan", ["Declare MCI", "Set triage area", "Assign triage officer", "Open additional capacity"], 3, "Incident Scoping"),
      coord("Command and allocate scarce resources", ["ED Charge", "Surgery", "ICU", "Blood Bank"], 2, "Incident Command"),
      quality("Staff briefings are clear under pressure", ["Clarity", "Prioritization"], 1, "Internal Communication"),
    ],
  },
  {
    id: "ehr-outage",
    name: "EHR System Outage",
    sector: "healthcare",
    type: "functional",
    description: "The electronic health record system goes down; practice downtime procedures and safety.",
    estimatedDurationMinutes: 30,
    difficulty: "intermediate",
    basedOn: "Inspired by health-system EHR downtime events",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Mechanics", "Process Adherence", "Internal Communication"],
    scenario: {
      summary: "The EHR becomes unavailable hospital-wide during day shift.",
      scenarioType: "generic",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Clinicians cannot access charts or orders." },
        { at_minute: 8, description: "Pharmacy cannot verify active medication orders." },
        { at_minute: 20, description: "Vendor estimates a 2-hour restoration window." },
      ],
      expected_actions: ["Activate downtime procedures", "Switch to paper charting", "Safeguard medication orders", "Communicate to units"],
    },
    objectives: [
      checklist("Activate EHR downtime procedures", ["Declare downtime", "Distribute paper forms", "Assign runners", "Log manual orders"], 3, "Process Adherence"),
      accuracy("Preserve medication-order safety", "No medication administered without verification against the last known order set.", 2, "Incident Mechanics"),
      quality("Unit communications are complete", ["Coverage", "Clarity"], 1, "Internal Communication"),
    ],
  },
  {
    id: "medication-error",
    name: "Medication Error Response",
    sector: "healthcare",
    type: "tabletop",
    description: "A medication error is discovered; practice disclosure, patient safety, and reporting.",
    estimatedDurationMinutes: 20,
    difficulty: "intermediate",
    basedOn: "Inspired by Just Culture incident-reporting frameworks",
    isQuickDrill: false,
    competencyAreasTested: ["Process Adherence", "External Communication"],
    scenario: {
      summary: "A patient received a 10x dose due to a pump programming error.",
      scenarioType: "generic",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Nurse recognizes the dosing error." },
        { at_minute: 6, description: "Patient shows early adverse symptoms." },
        { at_minute: 12, description: "Family asks what happened." },
      ],
      expected_actions: ["Stabilize patient", "Notify physician", "Disclose to family", "File incident report"],
    },
    objectives: [
      checklist("Follow the error-response protocol", ["Stop the medication", "Assess and stabilize", "Notify physician", "File safety report"], 3, "Process Adherence"),
      quality("Disclosure to the family is honest and compassionate", ["Honesty", "Empathy", "Clarity"], 2, "External Communication"),
    ],
  },

  // ─── Public Sector (3) ─────────────────────────────────────────────────────
  {
    id: "natural-disaster-eoc",
    name: "Natural Disaster EOC Activation",
    sector: "public_sector",
    type: "full_scale",
    description: "Activate the Emergency Operations Center for a major flood and coordinate multi-agency response.",
    estimatedDurationMinutes: 60,
    difficulty: "advanced",
    basedOn: "Inspired by FEMA ICS/EOC activation procedures",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Command", "Internal Communication"],
    scenario: {
      summary: "A river flood threatens a metro area; the EOC must coordinate evacuation and shelter.",
      scenarioType: "generic",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Weather service issues a flash-flood emergency." },
        { at_minute: 15, description: "A levee is reported overtopping in one district." },
        { at_minute: 35, description: "A shelter reaches capacity and needs overflow." },
        { at_minute: 50, description: "Media requests an official briefing." },
      ],
      expected_actions: ["Activate EOC", "Order evacuations", "Open shelters", "Coordinate agencies", "Brief public"],
    },
    objectives: [
      checklist("Activate the EOC under ICS", ["Stand up EOC", "Assign section chiefs", "Establish comms plan", "Set operational period"], 3, "Incident Scoping"),
      coord("Coordinate across agencies", ["Fire", "Police", "Public Works", "Red Cross", "County"], 2, "Incident Command"),
      quality("Public briefings are timely and accurate", ["Accuracy", "Timeliness", "Clarity"], 2, "Internal Communication"),
    ],
  },
  {
    id: "critical-infra-cyberattack",
    name: "Cyber Attack on Critical Infrastructure",
    sector: "public_sector",
    type: "functional",
    description: "Respond to a cyber intrusion targeting a water-treatment control system.",
    estimatedDurationMinutes: 45,
    difficulty: "advanced",
    basedOn: "Inspired by the 2021 Oldsmar water-treatment intrusion",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Mechanics", "External Communication"],
    scenario: {
      summary: "An operator notices unauthorized changes to chemical dosing setpoints.",
      scenarioType: "credential_leak",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "SCADA shows an unexplained setpoint change." },
        { at_minute: 8, description: "Remote access logs show an unknown session." },
        { at_minute: 20, description: "State regulators request notification." },
      ],
      expected_actions: ["Isolate control system", "Revert setpoints", "Preserve forensics", "Notify authorities"],
    },
    objectives: [
      tta("Detect and isolate the compromised system within 10 minutes", 10, 3, "Incident Scoping"),
      checklist("Contain and recover safely", ["Isolate OT network", "Revert to safe setpoints", "Preserve logs", "Reset credentials"], 2, "Incident Mechanics"),
      accuracy("Notify authorities correctly", "Required regulators and law enforcement are notified within mandated timeframes with accurate detail.", 2, "External Communication"),
    ],
  },
  {
    id: "pandemic-surge",
    name: "Pandemic Surge Response",
    sector: "public_sector",
    type: "tabletop",
    description: "Plan the public-health response to a sudden surge in cases across the jurisdiction.",
    estimatedDurationMinutes: 30,
    difficulty: "intermediate",
    basedOn: "Inspired by COVID-19 surge-planning after-action reports",
    isQuickDrill: false,
    competencyAreasTested: ["Incident Scoping", "Incident Command", "External Communication"],
    scenario: {
      summary: "Cases double week-over-week, straining hospital capacity and testing supply.",
      scenarioType: "generic",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Hospitals report ICU occupancy over 90%." },
        { at_minute: 10, description: "Testing supplies will run out in 48 hours." },
        { at_minute: 20, description: "The public demands clear guidance." },
      ],
      expected_actions: ["Convene response", "Allocate resources", "Issue public guidance", "Coordinate hospitals"],
    },
    objectives: [
      accuracy("Correctly assess capacity and risk", "The team produces an accurate capacity and resource forecast to drive decisions.", 2, "Incident Scoping"),
      coord("Coordinate the jurisdiction-wide response", ["Hospitals", "Public Health", "Supply", "Leadership"], 2, "Incident Command"),
      quality("Public guidance is clear and actionable", ["Clarity", "Actionability", "Timeliness"], 2, "External Communication"),
    ],
  },

  // ─── Quick Drills (6, single-competency) ───────────────────────────────────
  {
    id: "severity-assessment-speedrun",
    name: "Severity Assessment Speed Run",
    sector: "general",
    type: "tabletop",
    description: "A rapid-fire drill: classify incident severity and blast radius under time pressure.",
    estimatedDurationMinutes: 10,
    difficulty: "beginner",
    basedOn: "Inspired by SEV-level classification playbooks",
    isQuickDrill: true,
    competencyAreasTested: ["Incident Scoping"],
    scenario: {
      summary: "Three alerts arrive in quick succession; assign the correct severity to each.",
      scenarioType: "generic",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Alert: elevated 5xx on a non-critical endpoint." },
        { at_minute: 3, description: "Alert: checkout fully down in one region." },
        { at_minute: 6, description: "Alert: suspected data exposure." },
      ],
      expected_actions: ["Classify each alert", "Justify severity", "Identify blast radius"],
    },
    objectives: [
      tta("Assign a severity to each alert within 2 minutes", 2, 2, "Incident Scoping"),
      accuracy("Severity and blast-radius calls are correct", "Each alert is given the correct SEV level with a defensible blast-radius assessment.", 3, "Incident Scoping"),
    ],
  },
  {
    id: "root-cause-race",
    name: "Root Cause Race",
    sector: "general",
    type: "functional",
    description: "Given symptoms and telemetry, isolate the root cause as fast as possible.",
    estimatedDurationMinutes: 15,
    difficulty: "intermediate",
    basedOn: "Inspired by blameless-postmortem RCA practice",
    isQuickDrill: true,
    competencyAreasTested: ["Incident Mechanics"],
    scenario: {
      summary: "Latency is up 5x with intermittent errors; find the cause from the evidence provided.",
      scenarioType: "deployment_failure",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Dashboards show latency spike with no deploy marker." },
        { at_minute: 5, description: "A config change 20 minutes ago is surfaced in the audit log." },
      ],
      expected_actions: ["Form hypotheses", "Test with telemetry", "Identify root cause"],
    },
    objectives: [
      tta("Identify the root cause within 10 minutes", 10, 2, "Incident Mechanics"),
      accuracy("Root-cause conclusion is correct and evidence-backed", "The identified root cause is correct and supported by specific telemetry or logs.", 3, "Incident Mechanics"),
    ],
  },
  {
    id: "status-update-blitz",
    name: "Status Update Blitz",
    sector: "general",
    type: "tabletop",
    description: "Practice crisp internal status updates on a fixed cadence during an ongoing incident.",
    estimatedDurationMinutes: 10,
    difficulty: "beginner",
    basedOn: "Inspired by incident-command status-cadence norms",
    isQuickDrill: true,
    competencyAreasTested: ["Internal Communication"],
    scenario: {
      summary: "An incident is in progress; deliver three internal updates at a set cadence.",
      scenarioType: "generic",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Incident declared; first update due now." },
        { at_minute: 5, description: "Mitigation underway; second update due." },
      ],
      expected_actions: ["Post update 1", "Post update 2", "Post resolution update"],
    },
    objectives: [
      checklist("Deliver updates on cadence", ["Initial update", "Mitigation update", "Resolution update"], 2, "Internal Communication"),
      quality("Updates are clear, scannable, and accurate", ["Clarity", "Completeness", "Accuracy"], 3, "Internal Communication"),
    ],
  },
  {
    id: "customer-comms-challenge",
    name: "Customer Communication Challenge",
    sector: "general",
    type: "tabletop",
    description: "Draft an external status-page post and customer message under scrutiny.",
    estimatedDurationMinutes: 12,
    difficulty: "intermediate",
    basedOn: "Inspired by public status-page communication best practices",
    isQuickDrill: true,
    competencyAreasTested: ["External Communication"],
    scenario: {
      summary: "Customers are affected; craft the public communication.",
      scenarioType: "generic",
      severity: "SEV-2",
      injects: [
        { at_minute: 0, description: "Support queue filling with 'is it down?' tickets." },
        { at_minute: 6, description: "A journalist asks for comment." },
      ],
      expected_actions: ["Post status update", "Send customer message", "Prepare press holding line"],
    },
    objectives: [
      quality("External messaging is clear, honest, and on-brand", ["Clarity", "Honesty", "Tone", "Timeliness"], 3, "External Communication"),
      accuracy("Messaging avoids over/under-promising", "The message states impact and next update time accurately without speculation or false assurances.", 2, "External Communication"),
    ],
  },
  {
    id: "ic-decision-gauntlet",
    name: "IC Decision Gauntlet",
    sector: "general",
    type: "tabletop",
    description: "A rapid series of forced decisions to test incident-command judgment and delegation.",
    estimatedDurationMinutes: 15,
    difficulty: "advanced",
    basedOn: "Inspired by ICS incident-commander decision drills",
    isQuickDrill: true,
    competencyAreasTested: ["Incident Command"],
    scenario: {
      summary: "As IC, make a sequence of trade-off decisions with incomplete information.",
      scenarioType: "generic",
      severity: "SEV-1",
      injects: [
        { at_minute: 0, description: "Choose: mitigate now (risky) or gather more data (slow)." },
        { at_minute: 5, description: "A second incident competes for the same responders." },
        { at_minute: 10, description: "Leadership wants you on a call during mitigation." },
      ],
      expected_actions: ["Decide and delegate", "Prioritize incidents", "Protect focus"],
    },
    objectives: [
      accuracy("Decisions are sound and well-reasoned", "Each decision is defensible given the information available and correctly prioritizes safety and impact.", 3, "Incident Command"),
      coord("Delegation keeps the response moving", ["Ops Lead", "Comms Lead", "Scribe"], 2, "Incident Command"),
    ],
  },
  {
    id: "runbook-relay",
    name: "Runbook Relay",
    sector: "general",
    type: "functional",
    description: "Execute an unfamiliar runbook precisely, with clean handoffs and documentation.",
    estimatedDurationMinutes: 15,
    difficulty: "beginner",
    basedOn: "Inspired by runbook-adherence and handoff practice",
    isQuickDrill: true,
    competencyAreasTested: ["Process Adherence"],
    scenario: {
      summary: "Follow a provided runbook step-by-step, documenting as you go and handing off cleanly.",
      scenarioType: "generic",
      severity: "SEV-3",
      injects: [
        { at_minute: 0, description: "Runbook started; begin executing steps in order." },
        { at_minute: 8, description: "Shift change — hand off mid-procedure." },
      ],
      expected_actions: ["Execute steps in order", "Document each step", "Hand off cleanly"],
    },
    objectives: [
      checklist("Execute and document every runbook step", ["Pre-checks complete", "Steps executed in order", "Each step documented", "Clean handoff recorded"], 3, "Process Adherence"),
      accuracy("No steps skipped or performed out of order", "Every runbook step is completed in the correct order with evidence captured.", 2, "Process Adherence"),
    ],
  },
];
