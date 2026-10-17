import type { Logger } from "@opentelemetry/api-logs";
import type { Meter, Tracer } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { AggregationTemporalityPreference, OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor, LoggerProvider, type LogRecordExporter, type ReadableLogRecord } from "@opentelemetry/sdk-logs";
import {
  AggregationTemporality,
  MeterProvider,
  PeriodicExportingMetricReader,
  type PushMetricExporter,
  type ResourceMetrics,
} from "@opentelemetry/sdk-metrics";
import { BatchSpanProcessor, TracerProvider, type ReadableSpan, type SpanExporter } from "@opentelemetry/sdk-trace";

/**
 * OpenTelemetry pipelines, one per synthetic service (service.name is a resource attribute).
 *
 * - "datadog": OTLP/HTTP to the Datadog Agent (DD_OTLP_ENDPOINT, default http://localhost:4318),
 *   which forwards traces to APM, metrics, and logs to Datadog.
 * - "dry_run": the exact same SDK pipeline, but exporters only count what they would have sent.
 *
 * Every exporter is wrapped to count exported items and capture export failures.
 */
export type Mode = "datadog" | "dry_run";

export interface ServicePipeline {
  tracer: Tracer;
  meter: Meter;
  logger: Logger;
}

type Done = (r: ExportResult) => void;
const ok: ExportResult = { code: ExportResultCode.SUCCESS };

class CountingSpanExporter implements SpanExporter {
  constructor(private inner: SpanExporter | null, private tel: Telemetry) {}
  export(spans: ReadableSpan[], done: Done) {
    this.tel.exported.spans += spans.length;
    if (!this.inner) return done(ok);
    this.inner.export(spans, (r) => (this.tel.recordResult("traces", r), done(r)));
  }
  shutdown() {
    return this.inner?.shutdown() ?? Promise.resolve();
  }
  forceFlush() {
    return this.inner?.forceFlush?.() ?? Promise.resolve();
  }
}

class CountingLogExporter implements LogRecordExporter {
  constructor(private inner: LogRecordExporter | null, private tel: Telemetry) {}
  export(logs: ReadableLogRecord[], done: Done) {
    this.tel.exported.logs += logs.length;
    if (!this.inner) return done(ok);
    this.inner.export(logs, (r) => (this.tel.recordResult("logs", r), done(r)));
  }
  shutdown() {
    return this.inner?.shutdown() ?? Promise.resolve();
  }
  forceFlush() {
    return this.inner?.forceFlush?.() ?? Promise.resolve();
  }
}

class CountingMetricExporter implements PushMetricExporter {
  constructor(private inner: PushMetricExporter | null, private tel: Telemetry) {}
  export(metrics: ResourceMetrics, done: Done) {
    for (const scope of metrics.scopeMetrics) {
      for (const metric of scope.metrics) {
        for (const point of metric.dataPoints as { attributes: Record<string, unknown> }[]) {
          const id = String(point.attributes.signal_id ?? "");
          if (id) this.tel.metricPoints.set(id, (this.tel.metricPoints.get(id) ?? 0) + 1);
        }
      }
    }
    if (!this.inner) return done(ok);
    this.inner.export(metrics, (r) => (this.tel.recordResult("metrics", r), done(r)));
  }
  selectAggregationTemporality() {
    // Datadog prefers delta temporality for counters and histograms.
    return AggregationTemporality.DELTA;
  }
  shutdown() {
    return this.inner?.shutdown() ?? Promise.resolve();
  }
  forceFlush() {
    return this.inner?.forceFlush() ?? Promise.resolve();
  }
}

export class Telemetry {
  readonly exported = { spans: 0, logs: 0 };
  /** Metric data points exported, by signal id. */
  readonly metricPoints = new Map<string, number>();
  /** Most recent export failure (cleared on the next success), e.g. Agent unreachable. */
  lastError: string | null = null;
  private pipelines = new Map<string, { tp: TracerProvider; mp: MeterProvider; lp: LoggerProvider; p: ServicePipeline }>();

  constructor(
    readonly mode: Mode,
    private endpoint = (process.env.DD_OTLP_ENDPOINT || "http://localhost:4318").replace(/\/+$/, ""),
    private metricIntervalMs = 10_000,
  ) {}

  recordResult(kind: string, r: ExportResult) {
    if (r.code === ExportResultCode.SUCCESS) {
      this.lastError = null;
    } else {
      this.lastError = `Couldn't export ${kind} to the Datadog Agent at ${this.endpoint}: ${r.error?.message ?? "export failed"}`;
    }
  }

  service(name: string): ServicePipeline {
    const hit = this.pipelines.get(name);
    if (hit) return hit.p;
    const resource = resourceFromAttributes({
      "service.name": name,
      "service.version": "drill",
      "deployment.environment.name": "drill",
      "deployment.environment": "drill", // older Datadog mappings read this key
      "drillforce.synthetic": true,
    });
    const real = this.mode === "datadog";
    const tp = new TracerProvider({
      resource,
      spanProcessors: [
        new BatchSpanProcessor({
          exporter: new CountingSpanExporter(real ? new OTLPTraceExporter({ url: `${this.endpoint}/v1/traces` }) : null, this),
          maxQueueSize: 20_000,
          maxExportBatchSize: 1_000,
          scheduledDelayMillis: 2_000,
        }),
      ],
    });
    const mp = new MeterProvider({
      resource,
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new CountingMetricExporter(
            real
              ? new OTLPMetricExporter({ url: `${this.endpoint}/v1/metrics`, temporalityPreference: AggregationTemporalityPreference.DELTA })
              : null,
            this,
          ),
          exportIntervalMillis: this.metricIntervalMs,
        }),
      ],
    });
    const lp = new LoggerProvider({
      resource,
      processors: [
        new BatchLogRecordProcessor({
          exporter: new CountingLogExporter(real ? new OTLPLogExporter({ url: `${this.endpoint}/v1/logs` }) : null, this),
          maxQueueSize: 20_000,
          maxExportBatchSize: 1_000,
          scheduledDelayMillis: 2_000,
        }),
      ],
    });
    const p = { tracer: tp.getTracer("drillforce-injection-engine"), meter: mp.getMeter("drillforce-injection-engine"), logger: lp.getLogger("drillforce-injection-engine") };
    this.pipelines.set(name, { tp, mp, lp, p });
    return p;
  }

  async flush() {
    await Promise.all([...this.pipelines.values()].flatMap(({ tp, mp, lp }) => [tp.forceFlush(), mp.forceFlush(), lp.forceFlush()]));
  }

  async shutdown() {
    await Promise.all([...this.pipelines.values()].flatMap(({ tp, mp, lp }) => [tp.shutdown(), mp.shutdown(), lp.shutdown()]));
  }
}
