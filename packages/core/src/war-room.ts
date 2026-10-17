/**
 * Client for the War Room service (war-room/): when a drill is executed it opens the Slack incident
 * channel, invites on-call, briefs the team and runs the autonomous IC/Deputy/Comms/Liaison/Scribe
 * team; when the drill is concluded it posts the "this was a drill" conclusion and closes out.
 * Configured with WAR_ROOM_URL + WAR_ROOM_TOKEN (shared secret). Optional: without it a drill
 * still executes, just without a Slack channel.
 */
export interface WarRoomIncident {
  channelId: string | null;
  channelName: string;
  teamId: string | null;
  url: string | null;
  mode: "live" | "simulator";
}

export interface OpenIncidentRequest {
  drillId: string;
  title: string;
  summary: string;
  severity: string;
  domain: "db" | "app";
  services: { name: string; status: "healthy" | "degraded" | "down" }[];
  /** Narrative alerts the War Room posts as they "arrive" (mirroring the injected telemetry). */
  injects: { atMin: number; type: string; text: string; severity?: string; affects?: [string, string][] }[];
  briefing: string;
  links: Record<string, string>;
  webUrl: string;
}

const base = () => (process.env.WAR_ROOM_URL ?? "").replace(/\/+$/, "");
export const warRoomConfigured = () => !!(process.env.WAR_ROOM_URL && process.env.WAR_ROOM_TOKEN);

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${base()}${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { "content-type": "application/json", authorization: `Bearer ${process.env.WAR_ROOM_TOKEN}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const json = (await res.json().catch(() => null)) as { error?: string } | null;
  if (!res.ok) throw new Error(json?.error ?? `War Room returned HTTP ${res.status}`);
  return json as T;
}

export const openWarRoomIncident = (req: OpenIncidentRequest) => call<WarRoomIncident>("/api/drillforce/incidents", req);

export const concludeWarRoomIncident = (drillId: string, message: string) =>
  call<{ ok: true }>(`/api/drillforce/incidents/${encodeURIComponent(drillId)}/conclude`, { message });
