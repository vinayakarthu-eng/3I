import type { CriteriaType, DrillScenario, DrillType, Sector } from "./index";

export interface ObjectiveDraft {
  description: string;
  criteriaType: CriteriaType;
  targetValue: Record<string, unknown>;
  weight: number;
}

export interface DrillTemplate {
  id: string;
  name: string;
  /** "general" templates apply to any sector. */
  sector: Sector | "general";
  type: DrillType;
  description: string;
  scenario: DrillScenario;
  objectives: ObjectiveDraft[];
}

export const DRILL_TEMPLATES: DrillTemplate[] = [
  {
    id: "database-failover",
    name: "Database Failover",
    sector: "technology",
    type: "functional",
    description:
      "Simulate loss of the primary database and validate detection, failover execution, and stakeholder communication.",
    scenario: {
      summary: "The primary database cluster becomes unresponsive during peak traffic.",
      injects: [
        { at_minute: 0, description: "Monitoring alert: primary DB health checks failing." },
        { at_minute: 5, description: "Customer support reports checkout errors spiking." },
        { at_minute: 15, description: "Replica lag on the standby reaches 30 seconds." },
      ],
      expected_actions: ["Acknowledge alert", "Confirm primary failure", "Promote replica", "Update status page"],
    },
    objectives: [
      {
        description: "Detect the database failure within 5 minutes",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 5 },
        weight: 3,
      },
      {
        description: "Execute the failover runbook completely",
        criteriaType: "completeness",
        targetValue: {
          checklist: ["Confirm primary down", "Promote replica", "Repoint application config", "Verify writes"],
        },
        weight: 2,
      },
      {
        description: "Communicate status to all stakeholders",
        criteriaType: "coordination",
        targetValue: { stakeholders: ["Engineering Lead", "Support Lead", "VP Engineering"] },
        weight: 1,
      },
    ],
  },
  {
    id: "dns-outage",
    name: "DNS Outage",
    sector: "technology",
    type: "tabletop",
    description:
      "Walk through loss of the primary DNS provider: detection, mitigation via secondary DNS, and customer communication.",
    scenario: {
      summary: "The primary DNS provider suffers a global outage; public hostnames stop resolving.",
      injects: [
        { at_minute: 0, description: "Synthetic monitors report resolution failures." },
        { at_minute: 8, description: "Social media reports that the site is down." },
        { at_minute: 20, description: "Secondary DNS propagation is slower than expected." },
      ],
      expected_actions: ["Declare incident", "Switch to secondary DNS", "Post customer communication"],
    },
    objectives: [
      {
        description: "Detect and declare the incident within 5 minutes",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 5 },
        weight: 3,
      },
      {
        description: "Mitigate by failing over to the secondary DNS provider",
        criteriaType: "completeness",
        targetValue: { checklist: ["Lower TTLs", "Update NS records", "Verify propagation", "Monitor error rates"] },
        weight: 2,
      },
      {
        description: "Customer communication is clear, accurate, and timely",
        criteriaType: "quality",
        targetValue: {
          rubric: [
            { dimension: "Clarity", scale: 5 },
            { dimension: "Timeliness", scale: 5 },
            { dimension: "Accuracy", scale: 5 },
          ],
        },
        weight: 1,
      },
    ],
  },
  {
    id: "credential-leak",
    name: "Credential Leak Response",
    sector: "technology",
    type: "tabletop",
    description:
      "Respond to a production credential leaked publicly: detect, revoke, and assess impact.",
    scenario: {
      summary: "A production API key is discovered in a public code repository.",
      injects: [
        { at_minute: 0, description: "A security researcher reports the leaked key to security@." },
        { at_minute: 10, description: "Unusual API traffic detected from an unknown IP range." },
      ],
      expected_actions: ["Revoke key", "Rotate secrets", "Assess blast radius", "Notify stakeholders"],
    },
    objectives: [
      {
        description: "Confirm the leak and identify the credential within 10 minutes",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 10 },
        weight: 2,
      },
      {
        description: "Revoke and rotate all affected credentials",
        criteriaType: "completeness",
        targetValue: { checklist: ["Revoke key", "Issue new key", "Deploy new key", "Audit access logs"] },
        weight: 3,
      },
      {
        description: "Accurately assess the impact of the leak",
        criteriaType: "accuracy",
        targetValue: {
          expected_outcome:
            "Team identifies which systems the key could access, whether it was used maliciously, and what data was exposed.",
        },
        weight: 2,
      },
    ],
  },
  {
    id: "code-blue",
    name: "Code Blue Response",
    sector: "healthcare",
    type: "full_scale",
    description:
      "Simulated cardiac arrest on an inpatient ward to evaluate response time, team assembly, and protocol adherence.",
    scenario: {
      summary: "A patient on a medical ward becomes unresponsive with no pulse.",
      injects: [
        { at_minute: 0, description: "Nurse finds patient unresponsive and calls Code Blue." },
        { at_minute: 3, description: "Defibrillator on the crash cart reports a low battery." },
        { at_minute: 8, description: "Family member arrives and asks what is happening." },
      ],
      expected_actions: ["Start CPR", "Attach defibrillator", "Administer epinephrine", "Document timeline"],
    },
    objectives: [
      {
        description: "Code team arrives at bedside within 3 minutes",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 3 },
        weight: 3,
      },
      {
        description: "Full code team assembled with all roles filled",
        criteriaType: "coordination",
        targetValue: {
          stakeholders: ["Team Leader", "Airway", "Compressions", "Medications", "Recorder"],
        },
        weight: 2,
      },
      {
        description: "ACLS protocol followed correctly",
        criteriaType: "completeness",
        targetValue: {
          checklist: ["CPR started immediately", "Rhythm check every 2 minutes", "Epinephrine every 3-5 minutes", "Timeline documented"],
        },
        weight: 3,
      },
    ],
  },
  {
    id: "communication-cascade",
    name: "Communication Cascade",
    sector: "general",
    type: "functional",
    description:
      "Test how quickly and completely critical information propagates through the notification tree, and whether escalations are correct.",
    scenario: {
      summary: "A critical incident requires notifying leadership and all on-call responders.",
      injects: [
        { at_minute: 0, description: "Initial notification sent to the first tier of the call tree." },
        { at_minute: 10, description: "A key contact is unreachable; backup must be engaged." },
      ],
      expected_actions: ["Initiate call tree", "Confirm receipt", "Escalate unreachable contacts"],
    },
    objectives: [
      {
        description: "All first-tier contacts notified within 15 minutes",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 15 },
        weight: 3,
      },
      {
        description: "Every contact in the call tree confirms receipt",
        criteriaType: "completeness",
        targetValue: { checklist: ["Tier 1 confirmed", "Tier 2 confirmed", "Leadership confirmed", "Backups engaged"] },
        weight: 2,
      },
      {
        description: "Escalations go to the correct backup contacts",
        criteriaType: "accuracy",
        targetValue: { expected_outcome: "Unreachable contacts are escalated to their designated backup within 5 minutes." },
        weight: 2,
      },
    ],
  },
];
