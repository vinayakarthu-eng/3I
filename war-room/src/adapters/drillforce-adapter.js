import { BaseAdapter } from "./base-adapter.js";

// War Room scenario → closest DrillForce scenario template (objectives + scoring come from it).
const TEMPLATE_FOR = {
  database_failover: "database-failover",
  credential_stuffing: "credential-leak",
  canary_leak: "deployment-rollback",
};

/**
 * Records each War Room incident as a DrillForce drill over the public /api/v1 API:
 * the incident becomes an active drill, every message lands on its timeline, and closing the
 * incident hands it to scoring (auto-score, AAR, webhooks). Output-only — it never delivers
 * user messages — and fail-soft: if DrillForce is unreachable the drill carries on.
 *
 * Enabled with DRILLFORCE_API_URL (e.g. http://localhost:3001) + DRILLFORCE_API_KEY (df_live_…).
 */
export class DrillForceAdapter extends BaseAdapter {
  constructor({ baseUrl, apiKey, webUrl = baseUrl }) {
    super("drillforce");
    this.root = baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
    this.webUrl = webUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.drillId = null;
    this.queue = Promise.resolve(); // keeps timeline order; one request at a time
  }

  static fromEnv(env = process.env) {
    if (!env.DRILLFORCE_API_URL || !env.DRILLFORCE_API_KEY) return null;
    return new DrillForceAdapter({
      baseUrl: env.DRILLFORCE_API_URL,
      apiKey: env.DRILLFORCE_API_KEY,
      webUrl: env.DRILLFORCE_WEB_URL || env.DRILLFORCE_API_URL,
    });
  }

  async request(method, path, body) {
    const res = await fetch(this.root + path, {
      method,
      headers: { authorization: `Bearer ${this.apiKey}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.error) {
      throw new Error(`${method} ${path} → ${res.status} ${json?.error?.message ?? ""}`.trim());
    }
    return json.data;
  }

  /** Run `fn` after everything queued so far; log (don't throw) failures. */
  enqueue(label, fn) {
    this.queue = this.queue.then(fn).catch((err) => console.warn(`[drillforce] ${label} failed: ${err.message}`));
    return this.queue;
  }

  async createChannel(name, topic, opts = {}) {
    const scenario = opts.scenario;
    this.drillId = null;
    this.channel = { id: name, name };
    await this.enqueue("create drill", async () => {
      const templateId = TEMPLATE_FOR[scenario?.slug];
      const { id } = await this.request("POST", "/drills", {
        name: `War Room · ${topic}`.slice(0, 200),
        description: scenario?.summary,
        ...(templateId ? { templateId } : { type: "functional" }),
        status: "scheduled",
        scheduledAt: new Date().toISOString(),
      });
      await this.request("POST", `/drills/${id}/status`, { status: "briefing" });
      await this.request("POST", `/drills/${id}/status`, { status: "active" });
      this.drillId = id;
      console.log(`[drillforce] recording as drill ${id} → ${this.webUrl}/drills/${id}`);
    });
    return this.channel;
  }

  /** War Room message → DrillForce timeline event. */
  toEvent(message) {
    const base = { text: String(message.text ?? "").slice(0, 2000), channel: `war-room:${this.channel?.name ?? ""}` };
    if (message.kind === "agent") {
      return { ...base, type: "message", actor: `agent:${message.role}`, actorName: message.name };
    }
    if (message.kind === "user") {
      const slackId = message.meta?.userId;
      return {
        ...base,
        type: "message",
        ...(slackId && /^[UW][A-Z0-9]+$/.test(slackId) ? { actor: `slack:${slackId}` } : {}),
        actorName: message.name,
      };
    }
    if (message.kind === "inject") {
      return { ...base, type: "signal", actor: "agent:scenario-control", actorName: message.name };
    }
    return { ...base, type: "message", actor: "bot", actorName: message.name };
  }

  async send(message) {
    if (!message?.text) return;
    this.enqueue("record event", async () => {
      if (!this.drillId) return;
      await this.request("POST", `/drills/${this.drillId}/events`, this.toEvent(message));
    });
  }

  /** Incident closed → end the drill (DrillForce auto-scores it and fires drill.ended/scored). */
  async closeChannel() {
    await this.enqueue("end drill", async () => {
      if (!this.drillId) return;
      const id = this.drillId;
      this.drillId = null;
      await this.request("POST", `/drills/${id}/status`, { status: "scoring" });
      console.log(`[drillforce] drill ${id} ended → ${this.webUrl}/drills/${id}?tab=scores`);
    });
  }
}
