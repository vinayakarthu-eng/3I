/**
 * Where injected telemetry goes. With DD_API_KEY set the injection engine ships to Datadog
 * (traces/metrics/logs via the Datadog Agent's OTLP intake, events via the Events API); without it
 * the engine runs a dry run that generates the same telemetry and records counts and samples only.
 * Everything is tagged env:drill + drill_id so it's easy to find — and to exclude from real alerting.
 */
export type TelemetrySink = "datadog" | "dry_run";

export const datadogSite = () => process.env.DD_SITE || "datadoghq.com";
export const telemetrySink = (): TelemetrySink => (process.env.DD_API_KEY ? "datadog" : "dry_run");

export function datadogLinks(drillId: string) {
  const app = `https://app.${datadogSite()}`;
  const q = encodeURIComponent(`env:drill @drill_id:${drillId}`);
  return {
    services: `${app}/apm/services?env=drill`,
    traces: `${app}/apm/traces?query=${q}`,
    logs: `${app}/logs?query=${q}`,
    events: `${app}/event/explorer?query=${encodeURIComponent(`drill_id:${drillId}`)}`,
    databases: `${app}/databases?env=drill`,
  };
}
