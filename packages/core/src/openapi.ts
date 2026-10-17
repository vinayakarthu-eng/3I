import { DRILL_STATUSES, WEBHOOK_EVENTS } from "@drillforce/shared";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { updateDrillInput } from "./drill-edits";
import { drillEventInput } from "./drill-live";
import { createDrillInput, scoreInput } from "./drill-writes";
import { actionUpdateInput } from "./improvement-actions";
import { orgSettingsInput } from "./settings";
import { webhookInput } from "./webhooks";

/**
 * The /api/v1 contract. Route handlers, the discovery endpoint and the OpenAPI document are all
 * described from this one table, and request bodies come from the same zod schemas core validates
 * with — so the published spec can't drift from what the API accepts.
 */

type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
interface QueryParam {
  name: string;
  description: string;
  schema: Record<string, unknown>;
}
export interface Endpoint {
  method: Method;
  /** OpenAPI-style path relative to /api/v1, e.g. `/drills/{id}`. */
  path: string;
  tag: string;
  summary: string;
  operationId: string;
  query?: QueryParam[];
  body?: z.ZodTypeAny;
  /** Top-level keys of `data` in the success response, for list-style endpoints. */
  returns?: string;
  public?: boolean;
}

const statusInput = z.object({ status: z.enum(DRILL_STATUSES) });
const scoresBody = z.union([scoreInput, z.object({ scores: scoreInput })]);
const reportActionInput = z.object({ index: z.number().int().min(0) });
const webhookPatchInput = z.union([z.object({ active: z.boolean() }).strict(), webhookInput]);

const limit: QueryParam = {
  name: "limit",
  description: "Max rows (1–100).",
  schema: { type: "integer", minimum: 1, maximum: 100 },
};

export const ENDPOINTS: Endpoint[] = [
  { method: "GET", path: "/", tag: "Meta", summary: "API discovery", operationId: "discover", public: true },
  { method: "GET", path: "/openapi.json", tag: "Meta", summary: "This OpenAPI document", operationId: "openapi", public: true },

  { method: "GET", path: "/drills", tag: "Drills", summary: "List drills", operationId: "listDrills", query: [limit], returns: "drills" },
  { method: "POST", path: "/drills", tag: "Drills", summary: "Create a drill (templateId, or name+type+objectives)", operationId: "createDrill", body: createDrillInput },
  { method: "GET", path: "/drills/{id}", tag: "Drills", summary: "Get a drill with objectives and participants", operationId: "getDrill" },
  { method: "PUT", path: "/drills/{id}", tag: "Drills", summary: "Replace a drill's details, objectives and participants", operationId: "updateDrill", body: updateDrillInput },
  { method: "DELETE", path: "/drills/{id}", tag: "Drills", summary: "Delete a drill and everything recorded for it", operationId: "deleteDrill" },
  { method: "POST", path: "/drills/{id}/events", tag: "Drills", summary: "Record a message, action, signal or observation", operationId: "recordDrillEvent", body: drillEventInput },
  { method: "POST", path: "/drills/{id}/rescore", tag: "Drills", summary: "Re-run auto-scoring for an ended drill", operationId: "rescoreDrill" },
  { method: "POST", path: "/drills/{id}/status", tag: "Drills", summary: "Change status (validated transition; scoring auto-scores)", operationId: "changeDrillStatus", body: statusInput },
  { method: "GET", path: "/drills/{id}/injects", tag: "Drills", summary: "List a drill's timed injects", operationId: "listDrillInjects", returns: "injects" },
  { method: "POST", path: "/drills/{id}/injects/{injectId}/fire", tag: "Drills", summary: "Fire an inject (idempotent)", operationId: "fireInject" },
  { method: "POST", path: "/drills/{id}/scores", tag: "Drills", summary: "Submit evaluator scores for quality/accuracy objectives", operationId: "submitScores", body: scoresBody },
  { method: "GET", path: "/drills/{id}/report", tag: "Reports", summary: "The drill's latest AAR (or null)", operationId: "getDrillReport", returns: "report" },
  { method: "POST", path: "/drills/{id}/report", tag: "Reports", summary: "Generate a new AAR", operationId: "generateReport" },

  { method: "GET", path: "/reports", tag: "Reports", summary: "Latest AAR per drill", operationId: "listReports", returns: "reports" },
  { method: "GET", path: "/reports/{reportId}", tag: "Reports", summary: "Get an AAR", operationId: "getReport" },
  { method: "POST", path: "/reports/{reportId}/approve", tag: "Reports", summary: "Approve an AAR", operationId: "approveReport" },
  { method: "POST", path: "/reports/{reportId}/actions", tag: "Reports", summary: "Create the improvement action for corrective action #index (once)", operationId: "createActionFromReport", body: reportActionInput },

  { method: "GET", path: "/scenarios", tag: "Library", summary: "Scenario templates", operationId: "listScenarios", returns: "scenarios",
    query: [{ name: "quick", description: "Only quick drills.", schema: { type: "boolean" } }] },
  { method: "GET", path: "/competencies", tag: "Library", summary: "The competency catalog", operationId: "listCompetencies", returns: "competencies" },

  { method: "GET", path: "/readiness", tag: "Readiness", summary: "Team readiness", operationId: "getReadiness",
    query: [{ name: "period", description: "Lookback window.", schema: { type: "string", enum: ["7d", "30d", "90d", "all"] } }] },
  { method: "GET", path: "/readiness/{userId}", tag: "Readiness", summary: "A member's readiness profile", operationId: "getMemberReadiness" },
  { method: "GET", path: "/analytics", tag: "Readiness", summary: "Drill analytics + most improved", operationId: "getAnalytics" },
  { method: "GET", path: "/compliance", tag: "Readiness", summary: "Compliance status per framework", operationId: "getCompliance", returns: "frameworks" },
  { method: "GET", path: "/certifications", tag: "Readiness", summary: "Certifications, holders and your progress", operationId: "listCertifications", returns: "certifications" },
  { method: "GET", path: "/actions", tag: "Readiness", summary: "Improvement actions", operationId: "listActions", returns: "actions" },
  { method: "PUT", path: "/actions/{actionId}", tag: "Readiness", summary: "Update an improvement action (status workflow enforced)", operationId: "updateAction", body: actionUpdateInput },

  { method: "GET", path: "/webhooks", tag: "Webhooks", summary: "List webhooks (secrets redacted)", operationId: "listWebhooks", returns: "webhooks" },
  { method: "POST", path: "/webhooks", tag: "Webhooks", summary: "Create a webhook", operationId: "createWebhook", body: webhookInput },
  { method: "PATCH", path: "/webhooks/{webhookId}", tag: "Webhooks", summary: "Replace a webhook, or send { active } alone to pause/resume", operationId: "updateWebhook", body: webhookPatchInput },
  { method: "DELETE", path: "/webhooks/{webhookId}", tag: "Webhooks", summary: "Delete a webhook", operationId: "deleteWebhook" },
  { method: "POST", path: "/webhooks/{webhookId}/test", tag: "Webhooks", summary: "Send a test.ping delivery", operationId: "testWebhook" },
  { method: "GET", path: "/webhooks/deliveries", tag: "Webhooks", summary: "Recent deliveries", operationId: "listWebhookDeliveries", query: [limit], returns: "deliveries" },

  { method: "GET", path: "/integrations/slack", tag: "Settings", summary: "This org's Slack workspace connection (install via the web app)", operationId: "getSlackConnection" },
  { method: "DELETE", path: "/integrations/slack", tag: "Settings", summary: "Disconnect Slack (revokes the bot token)", operationId: "disconnectSlack" },
  { method: "GET", path: "/settings", tag: "Settings", summary: "Org settings (defaults filled in)", operationId: "getSettings" },
  { method: "PUT", path: "/settings", tag: "Settings", summary: "Replace org settings", operationId: "updateSettings", body: orgSettingsInput },
];

function jsonSchema(schema: z.ZodTypeAny) {
  const { $schema: _ignored, ...rest } = zodToJsonSchema(schema, { target: "openApi3", $refStrategy: "none" }) as Record<string, unknown>;
  return rest;
}

const errorEnvelope = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: {
        code: { type: "string", enum: ["bad_request", "unauthorized", "not_found", "not_configured", "internal"] },
        message: { type: "string" },
        fieldErrors: { type: "object", additionalProperties: { type: "string" } },
      },
    },
  },
};

function successEnvelope(returns?: string) {
  const data = returns
    ? { type: "object", required: [returns], properties: { [returns]: {} } }
    : { type: "object", additionalProperties: true };
  return { type: "object", required: ["data"], properties: { data } };
}

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});

/** The OpenAPI 3.0 document for /api/v1. */
export function openApiDocument(serverUrl = "/api/v1") {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const e of ENDPOINTS) {
    const pathParams = [...e.path.matchAll(/\{(\w+)\}/g)].map((m) => ({
      name: m[1],
      in: "path",
      required: true,
      schema: { type: "string", format: "uuid" },
    }));
    const op: Record<string, unknown> = {
      operationId: e.operationId,
      summary: e.summary,
      tags: [e.tag],
      parameters: [...pathParams, ...(e.query ?? []).map((p) => ({ ...p, in: "query", required: false }))],
      responses: {
        "200": { description: "OK", content: { "application/json": { schema: successEnvelope(e.returns) } } },
        ...(e.body ? { "400": errorResponse("Invalid request") } : {}),
        ...(e.public ? {} : { "401": errorResponse("Missing or invalid API key") }),
        ...(pathParams.length ? { "404": errorResponse("Not found in your organization") } : {}),
      },
      ...(e.public ? { security: [] } : {}),
    };
    if (e.body) {
      op.requestBody = { required: true, content: { "application/json": { schema: jsonSchema(e.body) } } };
    }
    (paths[e.path] ??= {})[e.method.toLowerCase()] = op;
  }

  return {
    openapi: "3.0.3",
    info: {
      title: "DrillForce API",
      version: "v1",
      description:
        "Org-scoped API for planning, running and scoring incident drills. Every response is " +
        "`{ data }` on success or `{ error: { code, message, fieldErrors? } }` on failure. " +
        `Webhook events: ${WEBHOOK_EVENTS.join(", ")}.`,
    },
    servers: [{ url: serverUrl }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer", description: "`df_live_…` key from Settings → API keys" } },
      schemas: { Error: errorEnvelope },
    },
    paths,
  };
}
