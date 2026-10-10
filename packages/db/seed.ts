import { config } from "dotenv";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./src/schema";

config({ path: "../../.env" });

const DAY = 24 * 60 * 60 * 1000;
const MIN = 60 * 1000;
const daysFromNow = (n: number) => new Date(Date.now() + n * DAY);

async function main() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://drillforce:drillforce@localhost:5432/drillforce";
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });

  console.log("🧹 Clearing existing data…");
  await db.execute(sql`
    truncate table
      improvement_actions, drill_scores, drill_events, drill_participants,
      drill_objectives, drills, drill_lifecycle_templates, users, organizations
    restart identity cascade
  `);

  console.log("🏢 Creating organization…");
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: "Acme Corp", slug: "acme", sector: "technology" })
    .returning();

  console.log("👥 Creating users…");
  // The first user is treated as the "current user" until auth is added.
  const [admin, manager, participant] = await db
    .insert(schema.users)
    .values([
      { orgId: org.id, email: "alex.admin@acme.test", name: "Alex Rivera", role: "admin" },
      { orgId: org.id, email: "morgan.manager@acme.test", name: "Morgan Lee", role: "drill_manager" },
      { orgId: org.id, email: "sam.participant@acme.test", name: "Sam Patel", role: "participant" },
    ])
    .returning();

  console.log("🧭 Creating lifecycle template…");
  await db.insert(schema.drillLifecycleTemplates).values({
    orgId: org.id,
    name: "Standard Drill Lifecycle",
    isDefault: true,
    stages: [
      { id: "plan", name: "Plan", type: "draft", required: true },
      { id: "schedule", name: "Schedule", type: "scheduled", required: true },
      { id: "brief", name: "Brief", type: "briefing", required: false },
      { id: "execute", name: "Execute", type: "active", required: true },
      { id: "score", name: "Score", type: "scoring", required: true },
      { id: "debrief", name: "Debrief", type: "debriefing", required: true },
      { id: "close", name: "Close", type: "completed", required: true },
    ],
  });

  console.log("🎯 Creating drills…");
  const completedStart = daysFromNow(-14);
  const [draftDrill, scheduledDrill, completedDrill] = await db
    .insert(schema.drills)
    .values([
      {
        orgId: org.id,
        name: "Credential Leak Response",
        type: "tabletop",
        status: "draft",
        description:
          "Walk through our response to an API key accidentally pushed to a public repository.",
        scenario: {
          summary:
            "A production API key for the payments service is found in a public GitHub repo by a security researcher.",
          injects: [
            { at_minute: 0, description: "Security researcher emails security@ with a link to the leaked key." },
            { at_minute: 10, description: "Unusual API traffic detected from an unknown IP range." },
          ],
          expected_actions: ["Revoke key", "Rotate secrets", "Assess blast radius", "Notify stakeholders"],
        },
        createdBy: manager.id,
      },
      {
        orgId: org.id,
        name: "Database Failover",
        type: "functional",
        status: "scheduled",
        description:
          "Simulate primary database failure and validate the failover runbook end-to-end.",
        scenario: {
          summary: "The primary Postgres cluster in us-east-1 becomes unresponsive during peak traffic.",
          injects: [
            { at_minute: 0, description: "PagerDuty alert: primary DB health checks failing." },
            { at_minute: 5, description: "Customer support reports checkout errors spiking." },
            { at_minute: 15, description: "Replica lag on the standby reaches 30 seconds." },
          ],
          expected_actions: [
            "Acknowledge alert",
            "Confirm primary failure",
            "Promote replica",
            "Update status page",
          ],
        },
        scheduledAt: daysFromNow(7),
        createdBy: admin.id,
      },
      {
        orgId: org.id,
        name: "DNS Outage",
        type: "full_scale",
        status: "completed",
        description:
          "Full-scale exercise simulating loss of our primary DNS provider across all public domains.",
        scenario: {
          summary: "Our primary DNS provider suffers a global outage; all public hostnames stop resolving.",
          injects: [
            { at_minute: 0, description: "Synthetic monitors report resolution failures for acme.com." },
            { at_minute: 8, description: "Social media reports that the site is down." },
            { at_minute: 20, description: "Secondary DNS provider propagation is slower than expected." },
          ],
          expected_actions: [
            "Declare incident",
            "Switch to secondary DNS",
            "Post customer communication",
            "Confirm resolution",
          ],
        },
        scheduledAt: completedStart,
        startedAt: completedStart,
        endedAt: new Date(completedStart.getTime() + 75 * MIN),
        createdBy: admin.id,
      },
    ])
    .returning();

  console.log("📋 Creating objectives…");
  const objectives = await db
    .insert(schema.drillObjectives)
    .values([
      // Draft drill
      {
        drillId: draftDrill.id,
        description: "Revoke the leaked credential within 15 minutes of report",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 15 },
        weight: 3,
        sortOrder: 0,
      },
      {
        drillId: draftDrill.id,
        description: "Complete the secret rotation checklist",
        criteriaType: "completeness",
        targetValue: { checklist: ["Revoke key", "Issue new key", "Deploy new key", "Audit access logs"] },
        weight: 2,
        sortOrder: 1,
      },
      // Scheduled drill
      {
        drillId: scheduledDrill.id,
        description: "Detect database failure within 5 minutes",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 5 },
        weight: 3,
        sortOrder: 0,
      },
      {
        drillId: scheduledDrill.id,
        description: "Execute the failover runbook completely",
        criteriaType: "completeness",
        targetValue: {
          checklist: ["Confirm primary down", "Promote replica", "Repoint app config", "Verify writes"],
        },
        weight: 2,
        sortOrder: 1,
      },
      {
        drillId: scheduledDrill.id,
        description: "Communicate status to all stakeholders",
        criteriaType: "coordination",
        targetValue: { stakeholders: ["Engineering Lead", "Support Lead", "VP Engineering"] },
        weight: 1,
        sortOrder: 2,
      },
      // Completed drill
      {
        drillId: completedDrill.id,
        description: "Declare an incident within 5 minutes of first alert",
        criteriaType: "time_to_action",
        targetValue: { max_minutes: 5 },
        weight: 3,
        sortOrder: 0,
      },
      {
        drillId: completedDrill.id,
        description: "Fail over to the secondary DNS provider",
        criteriaType: "completeness",
        targetValue: {
          checklist: ["Lower TTLs", "Update NS records", "Verify propagation", "Monitor error rates"],
        },
        weight: 2,
        sortOrder: 1,
      },
      {
        drillId: completedDrill.id,
        description: "Customer communication is clear and timely",
        criteriaType: "quality",
        targetValue: {
          rubric: [
            { dimension: "Clarity", scale: 5 },
            { dimension: "Timeliness", scale: 5 },
            { dimension: "Accuracy", scale: 5 },
          ],
        },
        weight: 1,
        sortOrder: 2,
      },
    ])
    .returning();

  const completedObjectives = objectives.filter((o) => o.drillId === completedDrill.id);

  console.log("🙋 Adding participants…");
  await db.insert(schema.drillParticipants).values([
    { drillId: scheduledDrill.id, userId: admin.id, role: "incident_commander" },
    { drillId: scheduledDrill.id, userId: participant.id, role: "responder" },
    { drillId: scheduledDrill.id, userId: manager.id, role: "evaluator" },
    { drillId: completedDrill.id, userId: manager.id, role: "incident_commander", joinedAt: completedStart },
    { drillId: completedDrill.id, userId: participant.id, role: "responder", joinedAt: completedStart },
    { drillId: completedDrill.id, userId: admin.id, role: "observer", joinedAt: completedStart },
  ]);

  console.log("📡 Recording events for completed drill…");
  const at = (m: number) => new Date(completedStart.getTime() + m * MIN);
  const channel = "#drill-dns-outage";
  await db.insert(schema.drillEvents).values([
    { drillId: completedDrill.id, eventType: "system", actor: "system", channel, payload: { text: "Drill started" }, occurredAt: at(0) },
    { drillId: completedDrill.id, eventType: "inject", actor: "bot", channel, payload: { text: "Synthetic monitors report resolution failures for acme.com." }, occurredAt: at(0) },
    { drillId: completedDrill.id, eventType: "message", actor: participant.id, channel, payload: { text: "Seeing NXDOMAIN from multiple regions, investigating." }, occurredAt: at(3) },
    { drillId: completedDrill.id, eventType: "action", actor: manager.id, channel, payload: { text: "Incident declared (SEV-1)" }, occurredAt: at(4) },
    { drillId: completedDrill.id, eventType: "inject", actor: "bot", channel, payload: { text: "Social media reports that the site is down." }, occurredAt: at(8) },
    { drillId: completedDrill.id, eventType: "message", actor: participant.id, channel, payload: { text: "Lowering TTLs and updating NS records to secondary provider." }, occurredAt: at(12) },
    { drillId: completedDrill.id, eventType: "message", actor: manager.id, channel, payload: { text: "Status page updated: investigating DNS resolution issues." }, occurredAt: at(18) },
    { drillId: completedDrill.id, eventType: "inject", actor: "bot", channel, payload: { text: "Secondary DNS provider propagation is slower than expected." }, occurredAt: at(20) },
    { drillId: completedDrill.id, eventType: "message", actor: participant.id, channel, payload: { text: "Propagation verified in 4/5 regions, monitoring error rates." }, occurredAt: at(45) },
    { drillId: completedDrill.id, eventType: "system", actor: "system", channel, payload: { text: "Drill ended" }, occurredAt: at(75) },
  ]);

  console.log("📊 Recording scores for completed drill…");
  const [ttaObj, completenessObj, qualityObj] = completedObjectives;
  await db.insert(schema.drillScores).values([
    {
      drillId: completedDrill.id,
      objectiveId: ttaObj.id,
      criteriaType: "time_to_action",
      rawValue: "4",
      normalizedScore: "100",
      evidence: { note: "Incident declared 4 minutes after first inject" },
      scoredBy: "auto",
      scoredAt: at(80),
    },
    {
      drillId: completedDrill.id,
      objectiveId: completenessObj.id,
      criteriaType: "completeness",
      rawValue: "3",
      normalizedScore: "75",
      evidence: { matched: ["Lower TTLs", "Update NS records", "Monitor error rates"], missing: ["Verify propagation (partial)"] },
      scoredBy: "auto",
      scoredAt: at(80),
    },
    {
      drillId: completedDrill.id,
      objectiveId: qualityObj.id,
      criteriaType: "quality",
      rawValue: "3.3",
      normalizedScore: "66",
      evidence: { Clarity: 4, Timeliness: 3, Accuracy: 3, note: "Status page update came 18 minutes in" },
      scoredBy: manager.id,
      scoredAt: at(120),
    },
  ]);

  console.log("🛠  Creating improvement actions…");
  await db.insert(schema.improvementActions).values([
    {
      drillId: completedDrill.id,
      gapDescription: "Customer-facing status update took 18 minutes",
      actionDescription: "Create pre-approved status page templates for DNS and network incidents",
      category: "process",
      severity: "P2",
      ownerId: manager.id,
      dueDate: daysFromNow(14).toISOString().slice(0, 10),
      status: "open",
      verificationMethod: "Next DNS drill posts status update within 10 minutes",
    },
    {
      drillId: completedDrill.id,
      gapDescription: "Secondary DNS propagation verification was manual",
      actionDescription: "Add automated multi-region DNS propagation check to the runbook",
      category: "tooling",
      severity: "P3",
      ownerId: participant.id,
      dueDate: daysFromNow(30).toISOString().slice(0, 10),
      status: "in_progress",
    },
  ]);

  console.log("✅ Seed complete");
  console.log(`   Org: ${org.name} (${org.slug})`);
  console.log(`   Current user: ${admin.name} <${admin.email}>`);
  await client.end();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
