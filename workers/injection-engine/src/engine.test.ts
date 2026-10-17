import assert from "node:assert/strict";
import { test } from "node:test";
import type { SignalStats } from "@drillforce/core";
import { defaultSignal, signalTotals, type SignalPlan } from "@drillforce/shared";
import { InjectionEngine, type RunningRow } from "./engine";
import { Telemetry } from "./telemetry";

function row(plan: SignalPlan, id: string, startedAt: Date): RunningRow {
  return {
    signal: { id, drillId: "d1", sortOrder: 0, status: "running", startedAt, completedAt: null, stats: null, lastError: null, ...plan } as RunningRow["signal"],
    drill: { id: "d1", name: "Test drill", orgId: "o1", status: "active" },
  };
}

/** Run the engine over simulated time (1s ticks) and return what it persisted. */
async function simulate(plans: SignalPlan[], seconds: number) {
  const tel = new Telemetry("dry_run", undefined, 60_000);
  const start = Date.now() - 1000;
  let rows = plans.map((p, i) => row(p, `s${i}`, new Date(start)));
  const persisted = new Map<string, { stats: SignalStats; status?: string }>();
  const engine = new InjectionEngine(tel, {
    listRunning: async () => rows,
    persist: async (id, stats, opts) => {
      persisted.set(id, { stats, status: opts.status });
      if (opts.status) rows = rows.filter((r) => r.signal.id !== id);
    },
  });
  for (let s = 0; s <= seconds; s++) await engine.tick(start + s * 1000);
  await tel.flush();
  return { persisted, tel };
}

test("a full stream emits its planned volume and failures, then completes", async () => {
  const plan = { ...defaultSignal("http_errors"), ratePerMinute: 600, failuresPerMinute: 60, durationMinutes: 1, pattern: "steady" as const };
  const { persisted, tel } = await simulate([plan], 62);
  const p = persisted.get("s0")!;
  assert.equal(p.status, "completed");
  assert.ok(Math.abs(p.stats.volume - 600) <= 10, `volume ${p.stats.volume}`);
  assert.ok(Math.abs(p.stats.failures - 60) <= 2, `failures ${p.stats.failures}`);
  assert.equal(p.stats.spans, p.stats.volume * 3, "3 spans per request");
  assert.equal(p.stats.logs, p.stats.failures, "one ERROR log per failure");
  assert.equal(tel.exported.spans, p.stats.spans, "every span went through the exporter");
  assert.ok(p.stats.samples?.[0]?.includes("500"), `sample ${p.stats.samples?.[0]}`);
});

test("expected totals match what the engine generates (ramp pattern)", async () => {
  const plan = { ...defaultSignal("db_query_failures"), ratePerMinute: 1200, failuresPerMinute: 1200, durationMinutes: 2, pattern: "ramp" as const };
  const { persisted } = await simulate([plan], 122);
  const p = persisted.get("s0")!;
  const expected = signalTotals(plan);
  assert.ok(Math.abs(p.stats.volume - expected.volume) / expected.volume < 0.03, `volume ${p.stats.volume} vs ${expected.volume}`);
  assert.equal(p.stats.failures, p.stats.volume, "100% of queries fail");
});

test("start offsets are honoured", async () => {
  const plan = { ...defaultSignal("latency_spike"), ratePerMinute: 600, durationMinutes: 1, startOffsetMinutes: 1, pattern: "steady" as const };
  const { persisted } = await simulate([plan], 30);
  assert.equal(persisted.get("s0")?.stats.volume ?? 0, 0, "nothing before T+1m");
});

test("alert events fire once and complete", async () => {
  const { persisted } = await simulate([defaultSignal("alert_event")], 3);
  const p = persisted.get("s0")!;
  assert.equal(p.status, "completed");
  assert.equal(p.stats.events, 1);
});

test("a stopped stream (drill concluded) stops generating", async () => {
  const tel = new Telemetry("dry_run", undefined, 60_000);
  const start = Date.now();
  let rows = [row({ ...defaultSignal("error_logs"), ratePerMinute: 600 }, "s0", new Date(start))];
  const persisted: SignalStats[] = [];
  const engine = new InjectionEngine(tel, { listRunning: async () => rows, persist: async (_id, stats) => void persisted.push(stats) });
  for (let s = 1; s <= 5; s++) await engine.tick(start + s * 1000);
  rows = []; // concluded
  const before = tel.exported.logs;
  for (let s = 6; s <= 10; s++) await engine.tick(start + s * 1000);
  await tel.flush();
  assert.equal(engine.active, 0);
  assert.ok(tel.exported.logs - before <= 60, "no new generation after stop (only buffered flush)");
});
