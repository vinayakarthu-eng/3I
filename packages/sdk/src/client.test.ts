import { ENDPOINTS } from "@drillforce/core";
import assert from "node:assert/strict";
import { test } from "node:test";
import { DrillForce, DrillForceError } from "./index";

type Call = { method: string; url: URL; body?: unknown; auth: string | null };

function client(respond: (c: Call) => { status?: number; body: unknown } = () => ({ body: { data: {} } })) {
  const calls: Call[] = [];
  const fake = (async (input: URL | RequestInfo, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      auth: headers.get("authorization"),
    };
    calls.push(call);
    const r = respond(call);
    return new Response(JSON.stringify(r.body), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { df: new DrillForce({ apiKey: "df_live_test", baseUrl: "https://df.test/api/v1/", fetch: fake }), calls };
}

const UUID = "11111111-1111-4111-8111-111111111111";

test("every documented endpoint has an SDK method", async () => {
  const { df, calls } = client();
  const settings = {} as Parameters<typeof df.settings.update>[0];
  const hook = { name: "h", url: "https://x.test", events: ["drill.started" as const] };
  await Promise.all([
    df.drills.list({ limit: 5 }), df.drills.get(UUID), df.drills.create({ name: "d", templateId: "t" }),
    df.drills.changeStatus(UUID, "active"), df.drills.injects(UUID), df.drills.fireInject(UUID, UUID),
    df.drills.submitScores(UUID, []), df.drills.report(UUID), df.drills.generateReport(UUID),
    df.reports.list(), df.reports.get(UUID), df.reports.approve(UUID), df.reports.createAction(UUID, 0),
    df.scenarios.list({ quick: true }), df.competencies.list(), df.readiness.get({ period: "7d" }),
    df.readiness.member(UUID), df.analytics.get(), df.compliance.list(), df.certifications.list(), df.actions.list(),
    df.webhooks.list(), df.webhooks.create(hook), df.webhooks.update(UUID, hook), df.webhooks.setActive(UUID, false),
    df.webhooks.delete(UUID), df.webhooks.test(UUID), df.webhooks.deliveries(), df.settings.get(), df.settings.update(settings),
  ]);
  const hit = new Set(calls.map((c) => `${c.method} ${c.url.pathname.replace("/api/v1", "").replaceAll(UUID, "{id}")}`));
  const missing = ENDPOINTS.filter((e) => e.tag !== "Meta")
    .map((e) => `${e.method} ${e.path.replace(/\{\w+\}/g, "{id}")}`)
    .filter((r) => !hit.has(r));
  assert.deepEqual(missing, []);
});

test("sends the key, JSON body and query, and normalizes the base URL", async () => {
  const { df, calls } = client(() => ({ body: { data: { drills: [] } } }));
  await df.drills.list({ limit: 3 });
  await df.drills.changeStatus(UUID, "briefing");
  assert.equal(calls[0].url.href, "https://df.test/api/v1/drills?limit=3");
  assert.equal(calls[0].auth, "Bearer df_live_test");
  assert.deepEqual(calls[1].body, { status: "briefing" });
});

test("unwraps list envelopes", async () => {
  const { df } = client(() => ({ body: { data: { drills: [{ id: "a" }] } } }));
  assert.deepEqual(await df.drills.list(), [{ id: "a" }]);
});

test("throws DrillForceError with code and field errors", async () => {
  const { df } = client(() => ({
    status: 400,
    body: { error: { code: "bad_request", message: "Name is required", fieldErrors: { name: "Name is required" } } },
  }));
  await assert.rejects(df.webhooks.create({ name: "", url: "x", events: [] }), (err: unknown) => {
    assert.ok(err instanceof DrillForceError);
    assert.equal(err.status, 400);
    assert.equal(err.code, "bad_request");
    assert.deepEqual(err.fieldErrors, { name: "Name is required" });
    return true;
  });
});

test("non-JSON failures still raise DrillForceError", async () => {
  const fake = (async () => new Response("<html>bad gateway</html>", { status: 502 })) as typeof fetch;
  const df = new DrillForce({ apiKey: "k", baseUrl: "https://df.test", fetch: fake });
  await assert.rejects(df.settings.get(), (err: unknown) => err instanceof DrillForceError && err.status === 502);
});

// Compile-time: response types reflect JSON (Dates arrive as ISO strings).
type Assert<T extends true> = T;
export type _DatesAreStrings = Assert<import("./index").DrillSummary["createdAt"] extends string ? true : false>;
export type _NullableDates = Assert<import("./index").Webhook["createdAt"] extends string ? true : false>;
