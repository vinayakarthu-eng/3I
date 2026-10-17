import type * as core from "@drillforce/core";
import type { DrillStatus, WebhookEvent } from "@drillforce/shared";

/**
 * Typed client for the DrillForce /api/v1 HTTP API.
 *
 * Response types are derived from the core operations behind each route (with Dates as ISO
 * strings, as they arrive over JSON), so they track the server without a codegen step.
 * Only `import type` is used from the monorepo — at runtime this is plain `fetch`.
 */

/** What a value looks like after a JSON round-trip. */
export type Jsonify<T> = T extends Date
  ? string
  : T extends string | number | boolean | null | undefined
    ? T
    : T extends readonly (infer U)[]
      ? Jsonify<U>[]
      : T extends object
        ? { [K in keyof T as T[K] extends (...args: never[]) => unknown ? never : K]: Jsonify<T[K]> }
        : T;

type Data<F extends (...args: never[]) => unknown> = Jsonify<Awaited<ReturnType<F>>>;

export type DrillSummary = Jsonify<core.DrillSummary>;
export type Drill = Data<typeof core.getDrill>;
export type DrillInject = Data<typeof core.listDrillInjects>[number];
export type Scenario = Data<typeof core.listScenarios>[number];
export type Readiness = Data<typeof core.getReadiness>;
export type MemberReadiness = NonNullable<Data<typeof core.getUserReadiness>>;
export type DrillAnalytics = Data<typeof core.getDrillAnalytics>;
export type ImprovedUser = Data<typeof core.getMostImproved>[number];
export type FrameworkCompliance = Data<typeof core.getComplianceOverview>[number];
export type CertificationOverview = Data<typeof core.getCertificationsOverview>;
export type CompetencyArea = Data<typeof core.listCompetencyAreas>[number];
export type ImprovementActionRow = Data<typeof core.listImprovementActions>[number];
export type ImprovementAction = Data<typeof core.createActionFromReport>;
export type ReportSummary = Data<typeof core.listReports>[number];
export type Report = Data<typeof core.getReport>;
export type Webhook = Data<typeof core.redactWebhook>;
export type WebhookDelivery = Jsonify<core.DeliveryRow>;
export type DeliveryResult = Extract<Data<typeof core.sendTestDelivery>, { ok: true }>["result"];
export type OrgSettings = core.OrgSettings;
export type SlackConnection = Data<typeof core.getSlackConnection>;
export type CreateDrillInput = core.CreateDrillInput;
export type ScoreInput = core.ScoreInput;
export type WebhookInput = core.WebhookInput;
export type OrgSettingsInput = core.OrgSettingsInput;
export type UpdateDrillInput = core.UpdateDrillInput;
export type DrillEventInput = core.DrillEventInput;
export type ActionUpdateInput = core.ActionUpdateInput;
export type DrillEvent = Data<typeof core.recordDrillEvent>;
export type DrillSignal = Data<typeof core.listDrillSignals>[number];
export type InjectionPlan = Data<typeof core.getInjectionPlan>;
export type SignalPlanInput = core.SignalPlanInput;
export type { DrillStatus, WebhookEvent };

export interface ApiErrorBody {
  code: "bad_request" | "unauthorized" | "not_found" | "internal" | (string & {});
  message: string;
  fieldErrors?: Record<string, string>;
}

/** A non-2xx response from the API. */
export class DrillForceError extends Error {
  readonly status: number;
  readonly code: ApiErrorBody["code"];
  readonly fieldErrors?: Record<string, string>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "DrillForceError";
    this.status = status;
    this.code = body.code;
    this.fieldErrors = body.fieldErrors;
  }
}

export interface DrillForceOptions {
  apiKey: string;
  /** Where DrillForce runs, e.g. `https://drillforce.example.com` (a trailing `/api/v1` is fine). */
  baseUrl: string;
  /** Override for tests or non-standard runtimes. Defaults to the global `fetch`. */
  fetch?: typeof fetch;
}

type Query = Record<string, string | number | boolean | undefined>;

export class DrillForce {
  private readonly apiKey: string;
  private readonly root: string;
  private readonly doFetch: typeof fetch;

  constructor(opts: DrillForceOptions) {
    if (!opts.apiKey) throw new Error("DrillForce: `apiKey` is required.");
    this.apiKey = opts.apiKey;
    this.root = opts.baseUrl.replace(/\/+$/, "").replace(/\/api\/v1$/, "") + "/api/v1";
    this.doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  }

  private async request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const url = new URL(this.root + path);
    for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v));
    const res = await this.doFetch(url, {
      method,
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const json = (await res.json().catch(() => null)) as { data?: T; error?: ApiErrorBody } | null;
    if (!res.ok || !json || "error" in json) {
      throw new DrillForceError(res.status, json?.error ?? { code: "internal", message: `HTTP ${res.status}` });
    }
    return json.data as T;
  }

  private id(value: string) {
    return encodeURIComponent(value);
  }

  readonly drills = {
    list: async (opts: { limit?: number } = {}) =>
      (await this.request<{ drills: DrillSummary[] }>("GET", "/drills", undefined, opts)).drills,
    get: (id: string) => this.request<Drill>("GET", `/drills/${this.id(id)}`),
    create: (input: CreateDrillInput) => this.request<{ id: string }>("POST", "/drills", input),
    update: (id: string, input: UpdateDrillInput) => this.request<Drill>("PUT", `/drills/${this.id(id)}`, input),
    delete: (id: string) => this.request<{ id: string; deleted: true }>("DELETE", `/drills/${this.id(id)}`),
    /** Record a message/action/signal/observation; `actor` may be "bot", "agent:<name>" or "slack:<id>". */
    recordEvent: (id: string, event: DrillEventInput) =>
      this.request<DrillEvent>("POST", `/drills/${this.id(id)}/events`, event),
    signals: async (id: string) =>
      (await this.request<{ signals: DrillSignal[] }>("GET", `/drills/${this.id(id)}/signals`)).signals,
    setSignals: async (id: string, signals: SignalPlanInput[]) =>
      (await this.request<{ signals: DrillSignal[] }>("PUT", `/drills/${this.id(id)}/signals`, { signals })).signals,
    injectionPlan: (id: string) => this.request<InjectionPlan>("GET", `/drills/${this.id(id)}/injection-plan`),
    rescore: (id: string) =>
      this.request<{ scored: number; finalized: boolean }>("POST", `/drills/${this.id(id)}/rescore`),
    changeStatus: (id: string, status: DrillStatus) =>
      this.request<{ id: string; status: DrillStatus }>("POST", `/drills/${this.id(id)}/status`, { status }),
    injects: async (id: string) =>
      (await this.request<{ injects: DrillInject[] }>("GET", `/drills/${this.id(id)}/injects`)).injects,
    fireInject: (id: string, injectId: string) =>
      this.request<{ id: string; fired: boolean }>("POST", `/drills/${this.id(id)}/injects/${this.id(injectId)}/fire`),
    submitScores: (id: string, scores: ScoreInput) =>
      this.request<{ finalized: boolean; composite: number | null }>("POST", `/drills/${this.id(id)}/scores`, scores),
    /** The drill's latest AAR, or null. */
    report: async (id: string) =>
      (await this.request<{ report: Report | null }>("GET", `/drills/${this.id(id)}/report`)).report,
    generateReport: (id: string) => this.request<Report>("POST", `/drills/${this.id(id)}/report`),
  };

  readonly reports = {
    list: async () => (await this.request<{ reports: ReportSummary[] }>("GET", "/reports")).reports,
    get: (reportId: string) => this.request<Report>("GET", `/reports/${this.id(reportId)}`),
    approve: (reportId: string) => this.request<Report>("POST", `/reports/${this.id(reportId)}/approve`),
    createAction: (reportId: string, index: number) =>
      this.request<ImprovementAction>("POST", `/reports/${this.id(reportId)}/actions`, { index }),
  };

  readonly scenarios = {
    list: async (opts: { quick?: boolean } = {}) =>
      (await this.request<{ scenarios: Scenario[] }>("GET", "/scenarios", undefined, opts)).scenarios,
  };

  readonly competencies = {
    list: async () => (await this.request<{ competencies: CompetencyArea[] }>("GET", "/competencies")).competencies,
  };

  readonly readiness = {
    get: (opts: { period?: "7d" | "30d" | "90d" | "all" } = {}) =>
      this.request<Readiness>("GET", "/readiness", undefined, opts),
    member: (userId: string) => this.request<MemberReadiness>("GET", `/readiness/${this.id(userId)}`),
  };

  readonly analytics = {
    get: () => this.request<{ drills: DrillAnalytics; mostImproved: ImprovedUser[] }>("GET", "/analytics"),
  };

  readonly compliance = {
    list: async () => (await this.request<{ frameworks: FrameworkCompliance[] }>("GET", "/compliance")).frameworks,
  };

  readonly certifications = {
    list: async () =>
      (await this.request<{ certifications: CertificationOverview }>("GET", "/certifications")).certifications,
  };

  readonly actions = {
    list: async () => (await this.request<{ actions: ImprovementActionRow[] }>("GET", "/actions")).actions,
    update: (actionId: string, input: ActionUpdateInput) =>
      this.request<ImprovementAction>("PUT", `/actions/${this.id(actionId)}`, input),
  };

  readonly webhooks = {
    list: async () => (await this.request<{ webhooks: Webhook[] }>("GET", "/webhooks")).webhooks,
    create: (input: WebhookInput) => this.request<Webhook>("POST", "/webhooks", input),
    update: (webhookId: string, input: WebhookInput) =>
      this.request<Webhook>("PATCH", `/webhooks/${this.id(webhookId)}`, input),
    setActive: (webhookId: string, active: boolean) =>
      this.request<Webhook>("PATCH", `/webhooks/${this.id(webhookId)}`, { active }),
    delete: (webhookId: string) =>
      this.request<{ id: string; deleted: true }>("DELETE", `/webhooks/${this.id(webhookId)}`),
    test: (webhookId: string) => this.request<DeliveryResult>("POST", `/webhooks/${this.id(webhookId)}/test`),
    deliveries: async (opts: { limit?: number } = {}) =>
      (await this.request<{ deliveries: WebhookDelivery[] }>("GET", "/webhooks/deliveries", undefined, opts)).deliveries,
  };

  readonly integrations = {
    slack: {
      /** Connect from the web app (Settings → Integrations → Add to Slack); OAuth needs a browser. */
      get: () => this.request<SlackConnection>("GET", "/integrations/slack"),
      disconnect: () =>
        this.request<{ disconnected: boolean; teamName?: string }>("DELETE", "/integrations/slack"),
    },
  };

  readonly settings = {
    get: () => this.request<OrgSettings>("GET", "/settings"),
    update: (input: OrgSettingsInput) => this.request<OrgSettings>("PUT", "/settings", input),
  };
}
