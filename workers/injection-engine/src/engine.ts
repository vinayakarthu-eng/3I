import type { DrillSignal, SignalStats } from "@drillforce/core";
import { patternFactor, type SignalPlan } from "@drillforce/shared";
import { gauges, generateSecond, sendDatadogEvent, type StreamRef } from "./generators";
import type { Telemetry } from "./telemetry";

export interface RunningRow {
  signal: DrillSignal;
  drill: { id: string; name: string; orgId: string; status: string };
}

export interface EngineDeps {
  listRunning(): Promise<RunningRow[]>;
  persist(signalId: string, stats: SignalStats, opts: { status?: "completed" | "failed"; lastError?: string | null }): Promise<void>;
  sendEvent?(plan: SignalPlan, ref: StreamRef & { drillName: string }): Promise<string | null>;
}

interface Stream {
  row: RunningRow;
  plan: SignalPlan;
  stats: SignalStats;
  base: SignalStats;
  accUnits: number;
  accFailures: number;
  lastTickAt: number;
  lastPersistAt: number;
  eventError: string | null;
}

const zero = (): SignalStats => ({ volume: 0, failures: 0, spans: 0, logs: 0, metricPoints: 0, events: 0, samples: [] });
const PERSIST_EVERY_MS = 2000;

/**
 * Drives every running signal stream: each tick emits the telemetry that stream owes for the
 * elapsed time (rate × pattern factor, with fractional carry), finishes streams whose duration is
 * over, and persists counters for the UI. Streams that disappear (drill concluded) are dropped.
 */
export class InjectionEngine {
  private streams = new Map<string, Stream>();

  constructor(private tel: Telemetry, private deps: EngineDeps) {}

  get active() {
    return this.streams.size;
  }

  async tick(now = Date.now()) {
    const rows = await this.deps.listRunning();
    const live = new Set(rows.map((r) => r.signal.id));
    for (const id of [...this.streams.keys()]) {
      if (!live.has(id)) {
        this.streams.delete(id); // stopped (drill concluded) or finished elsewhere
        gauges.delete(id);
      }
    }
    for (const row of rows) await this.step(row, now);
  }

  private async step(row: RunningRow, now: number) {
    const s = row.signal;
    let st = this.streams.get(s.id);
    if (!st) {
      const base = { ...zero(), ...(s.stats ?? {}) };
      st = {
        row,
        plan: { kind: s.kind, service: s.service, ratePerMinute: s.ratePerMinute, failuresPerMinute: s.failuresPerMinute, durationMinutes: s.durationMinutes, startOffsetMinutes: s.startOffsetMinutes, pattern: s.pattern, params: s.params },
        stats: { ...base, samples: [...(base.samples ?? [])] },
        base,
        accUnits: 0,
        accFailures: 0,
        lastTickAt: now,
        lastPersistAt: 0,
        eventError: null,
      };
      this.streams.set(s.id, st);
    }
    const startedAt = (s.startedAt ? new Date(s.startedAt).getTime() : now) + st.plan.startOffsetMinutes * 60_000;
    const elapsedMin = (now - startedAt) / 60_000;
    const dt = Math.min(5, Math.max(0, (now - st.lastTickAt) / 1000));
    st.lastTickAt = now;
    if (elapsedMin < 0) return; // not started yet (start offset)

    const ref = { signalId: s.id, drillId: row.drill.id };

    if (st.plan.kind === "alert_event") {
      if (st.stats.events === 0) {
        st.eventError = this.tel.mode === "datadog" && this.deps.sendEvent ? await this.deps.sendEvent(st.plan, { ...ref, drillName: row.drill.name }) : null;
        st.stats.events = 1;
        st.stats.volume = 1;
        st.stats.samples = [`${st.plan.params.monitorName ?? "Monitor alert"} (${st.plan.params.priority ?? "P2"})`];
      }
      await this.finish(st, st.eventError ? "failed" : "completed");
      return;
    }

    if (elapsedMin >= st.plan.durationMinutes) {
      await this.finish(st, "completed");
      return;
    }

    const factor = patternFactor(st.plan.pattern, elapsedMin, st.plan.durationMinutes);
    st.accUnits += (st.plan.ratePerMinute * factor * dt) / 60;
    st.accFailures += (Math.min(st.plan.failuresPerMinute, st.plan.ratePerMinute) * factor * dt) / 60;
    const units = Math.floor(st.accUnits);
    st.accUnits -= units;
    const failures = Math.min(units, Math.floor(st.accFailures));
    st.accFailures -= failures;

    const emitted = generateSecond(this.tel, st.plan, ref, units, failures, factor);
    st.stats.volume += units;
    st.stats.failures += failures;
    st.stats.spans += emitted.spans;
    st.stats.logs += emitted.logs;
    st.stats.events += emitted.events;
    for (const sample of emitted.samples) {
      if ((st.stats.samples ??= []).length < 3 && !st.stats.samples.includes(sample)) st.stats.samples.push(sample);
    }
    if (now - st.lastPersistAt >= PERSIST_EVERY_MS) await this.persist(st, now);
  }

  private snapshot(st: Stream): SignalStats {
    return { ...st.stats, metricPoints: st.base.metricPoints + (this.tel.metricPoints.get(st.row.signal.id) ?? 0) };
  }

  private async persist(st: Stream, now: number) {
    st.lastPersistAt = now;
    await this.deps.persist(st.row.signal.id, this.snapshot(st), { lastError: this.tel.mode === "datadog" ? this.tel.lastError : null });
  }

  private async finish(st: Stream, status: "completed" | "failed") {
    await this.tel.flush(); // ship (and count) everything before marking the stream done
    await this.deps.persist(st.row.signal.id, this.snapshot(st), { status, lastError: st.eventError ?? (this.tel.mode === "datadog" ? this.tel.lastError : null) });
    this.streams.delete(st.row.signal.id);
    gauges.delete(st.row.signal.id);
  }
}
