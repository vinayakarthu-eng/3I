"use client";

import { endDrill, recordObservation } from "@/app/drills/[id]/live-actions";
import { fireInject, postChatMessage, type ChatMessage } from "@/app/drills/[id]/simulate/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SCENARIO_TYPE_LABELS,
  generateLogs,
  generateMetrics,
  generateServiceHealth,
  incidentIntensity,
  seedMetricWindow,
  type LogLine,
  type MetricSample,
  type ScenarioType,
  type ServiceStatus,
} from "@drillforce/shared";
import { AlertTriangle, ClipboardCheck, Send, Siren, StopCircle, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const STEP_SECONDS = 2;
const WINDOW = 30; // samples kept on screen (= 60s of history)

export interface InjectItem {
  id: string;
  description: string;
  triggerAtMinutes: number;
  injectType: string;
  fired: boolean;
}

export interface LiveConfig {
  isIC: boolean;
  role: string;
  objectives: { id: string; description: string }[];
}

interface WarRoomProps {
  drillId: string;
  scenarioType: ScenarioType;
  severity: string;
  scenarioSummary: string;
  injects: InjectItem[];
  initialMessages: ChatMessage[];
  currentUser: { id: string; name: string };
  /** When present, enables real-time execution controls (End Drill, inject panel, observer scoring). */
  live?: LiveConfig;
}

function mmss(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function WarRoom({
  drillId,
  scenarioType,
  severity,
  scenarioSummary,
  injects,
  initialMessages,
  currentUser,
  live,
}: WarRoomProps) {
  const router = useRouter();
  const [elapsed, setElapsed] = useState(0); // seconds of drill time
  const [samples, setSamples] = useState<MetricSample[]>(() =>
    seedMetricWindow(scenarioType, WINDOW, STEP_SECONDS, 0),
  );
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [services, setServices] = useState<ServiceStatus[]>(() =>
    generateServiceHealth(scenarioType, 0),
  );
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [firedIds, setFiredIds] = useState<Set<string>>(
    () => new Set(injects.filter((i) => i.fired).map((i) => i.id)),
  );
  const [latestAlert, setLatestAlert] = useState<string | null>(null);

  const firedIdsRef = useRef(firedIds);
  firedIdsRef.current = firedIds;

  // First-inject time (minutes) across all injects, for intensity ramp.
  const firstInjectAt =
    injects.length > 0 ? Math.min(...injects.map((i) => i.triggerAtMinutes)) : null;

  const tick = useCallback(() => {
    setElapsed((prev) => {
      const next = prev + STEP_SECONDS;
      const minutes = next / 60;

      // Fire any injects whose trigger time has passed.
      const dueNow = injects.filter(
        (i) => i.triggerAtMinutes <= minutes && !firedIdsRef.current.has(i.id),
      );
      if (dueNow.length) {
        setFiredIds((prevSet) => {
          const copy = new Set(prevSet);
          dueNow.forEach((i) => copy.add(i.id));
          return copy;
        });
        for (const inj of dueNow) {
          setLatestAlert(inj.description);
          setMessages((m) => [
            ...m,
            {
              id: `inject-${inj.id}`,
              actor: null,
              actorName: "Scenario Control",
              text: inj.description,
              kind: "inject",
              occurredAt: new Date().toISOString(),
            },
          ]);
          // Persist (fire-and-forget); ignore failures in the live view.
          void fireInject(drillId, inj.id);
        }
      }

      const firedCount = firedIdsRef.current.size + dueNow.length;
      const intensity = incidentIntensity(minutes, firstInjectAt, firedCount);

      setSamples((s) => [...s.slice(-(WINDOW - 1)), generateMetrics(scenarioType, next, intensity)]);
      setLogs((l) => {
        const batch = generateLogs(scenarioType, next, intensity, intensity > 0 ? 4 : 2);
        return [...l, ...batch].slice(-120);
      });
      setServices(generateServiceHealth(scenarioType, intensity));

      return next;
    });
  }, [drillId, injects, firstInjectAt, scenarioType]);

  useEffect(() => {
    const id = setInterval(tick, STEP_SECONDS * 1000);
    return () => clearInterval(id);
  }, [tick]);

  const [ending, setEnding] = useState(false);

  function applyInjectLocally(inj: InjectItem) {
    if (firedIdsRef.current.has(inj.id)) return;
    setFiredIds((p) => new Set(p).add(inj.id));
    setLatestAlert(inj.description);
    setMessages((m) => [
      ...m,
      {
        id: `inject-${inj.id}`,
        actor: null,
        actorName: "Scenario Control",
        text: inj.description,
        kind: "inject",
        occurredAt: new Date().toISOString(),
      },
    ]);
  }

  async function fireManually(inj: InjectItem) {
    applyInjectLocally(inj);
    await fireInject(drillId, inj.id);
  }

  async function handleEnd() {
    if (ending) return;
    setEnding(true);
    const res = await endDrill(drillId);
    if (res.ok) router.push(`/drills/${drillId}/complete`);
    else setEnding(false);
  }

  const current = samples[samples.length - 1];
  const incidentActive = latestAlert !== null;
  const isObserver = live?.role === "observer" || live?.role === "evaluator";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar */}
      <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 text-sm font-semibold tracking-tight">War Room</span>
          <span className="shrink-0 rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
            {SCENARIO_TYPE_LABELS[scenarioType]}
          </span>
          <span className="hidden truncate text-xs text-muted-foreground lg:inline">
            {scenarioSummary}
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-mono text-sm tabular-nums">T+{mmss(elapsed)}</span>
          <span
            className={cn(
              "h-2.5 w-2.5 rounded-full",
              incidentActive ? "animate-pulse bg-red-500" : "bg-emerald-500",
            )}
          />
          {live && isObserver && (
            <ObserverSheet drillId={drillId} objectives={live.objectives} />
          )}
          {live?.isIC && (
            <InjectControlSheet
              injects={injects}
              firedIds={firedIds}
              onFire={fireManually}
            />
          )}
          {live?.isIC && (
            <Button variant="destructive" size="sm" onClick={handleEnd} disabled={ending}>
              <StopCircle className="h-4 w-4" /> End Drill
            </Button>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link href={`/drills/${drillId}`}>
              <X className="h-4 w-4" /> Exit
            </Link>
          </Button>
        </div>
      </div>

      {/* Alert banner */}
      {incidentActive && (
        <div className="flex shrink-0 items-center gap-2 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-600 dark:text-red-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="truncate font-medium">🚨 ALERT: {latestAlert}</span>
          <span className="ml-auto shrink-0 rounded bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
            {severity || "SEV-1"}
          </span>
        </div>
      )}

      {/* Body: 60/40 split */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Monitoring panel (left 60%) */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:w-3/5 lg:flex-[3]">
          <ServiceGrid services={services} />
          <div className="grid gap-4 sm:grid-cols-2">
            <MetricChart
              title="Requests / min"
              data={samples}
              dataKey="requests"
              color="hsl(var(--chart-2))"
              value={current ? current.requests.toLocaleString() : "—"}
            />
            <MetricChart
              title="Error rate"
              data={samples}
              dataKey="errorRate"
              color="hsl(var(--chart-1))"
              unit="%"
              value={current ? `${current.errorRate}%` : "—"}
            />
            <MetricChart
              title="P99 latency"
              data={samples}
              dataKey="latencyP99"
              color="hsl(var(--chart-5))"
              unit="ms"
              value={current ? `${current.latencyP99}ms` : "—"}
            />
            <MetricChart
              title="CPU utilization"
              data={samples}
              dataKey="cpu"
              color="hsl(var(--chart-4))"
              unit="%"
              area
              value={current ? `${current.cpu}%` : "—"}
            />
          </div>
          <LogStream logs={logs} />
        </div>

        {/* Comms panel (right 40%) */}
        <div className="flex min-h-0 flex-1 flex-col border-t lg:w-2/5 lg:flex-[2] lg:border-l lg:border-t-0">
          <CommsPanel
            drillId={drillId}
            messages={messages}
            setMessages={setMessages}
            currentUser={currentUser}
          />
        </div>
      </div>

      {/* Bottom inject ticker (live mode) */}
      {live && (
        <div className="flex shrink-0 items-center gap-2 overflow-hidden border-t bg-muted/50 px-4 py-1.5 text-xs">
          <span className="shrink-0 font-semibold uppercase tracking-wide text-muted-foreground">
            Latest inject
          </span>
          <span className="truncate">
            {latestAlert ?? "Awaiting first inject…"}
          </span>
        </div>
      )}
    </div>
  );
}

function InjectControlSheet({
  injects,
  firedIds,
  onFire,
}: {
  injects: InjectItem[];
  firedIds: Set<string>;
  onFire: (inj: InjectItem) => void;
}) {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Siren className="h-4 w-4" /> Injects
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Inject control</SheetTitle>
          <SheetDescription>
            Injects fire automatically on their scheduled time. Fire one early as the IC.
          </SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {injects.length === 0 && (
            <p className="text-sm text-muted-foreground">No injects configured for this drill.</p>
          )}
          {injects.map((inj) => {
            const fired = firedIds.has(inj.id);
            return (
              <div key={inj.id} className="flex items-start gap-3 rounded-md border p-3">
                <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                  T+{inj.triggerAtMinutes}m
                </span>
                <span className="min-w-0 flex-1 text-sm">{inj.description}</span>
                <Button
                  size="sm"
                  variant={fired ? "ghost" : "outline"}
                  disabled={fired}
                  onClick={() => onFire(inj)}
                >
                  {fired ? "Fired" : "Fire"}
                </Button>
              </div>
            );
          })}
        </div>
      </SheetContent>
    </Sheet>
  );
}

const QUICK_TAGS = ["Good catch", "Missed step", "Late response", "Strong communication"];

function ObserverSheet({
  drillId,
  objectives,
}: {
  drillId: string;
  objectives: { id: string; description: string }[];
}) {
  const [note, setNote] = useState("");
  const [objectiveId, setObjectiveId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  async function submit(text: string, tag?: string) {
    if (!text.trim() || saving) return;
    setSaving(true);
    const res = await recordObservation(drillId, {
      text,
      tag,
      objectiveId: objectiveId || undefined,
    });
    if (res.ok) {
      setLog((l) => [`${tag ? `[${tag}] ` : ""}${text}`, ...l]);
      setNote("");
    }
    setSaving(false);
  }

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <ClipboardCheck className="h-4 w-4" /> Observe
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Observer scoring</SheetTitle>
          <SheetDescription>
            Log timestamped observations. They feed the After-Action Report.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap gap-2">
            {QUICK_TAGS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant="secondary"
                disabled={saving}
                onClick={() => submit(note.trim() || t, t)}
              >
                {t}
              </Button>
            ))}
          </div>

          {objectives.length > 0 && (
            <select
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              value={objectiveId}
              onChange={(e) => setObjectiveId(e.target.value)}
            >
              <option value="">No specific objective</option>
              {objectives.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.description}
                </option>
              ))}
            </select>
          )}

          <Textarea
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you observe? e.g. 'IC delegated comms at T+4m'"
          />
          <Button className="w-full" disabled={saving || !note.trim()} onClick={() => submit(note)}>
            Record observation
          </Button>

          {log.length > 0 && (
            <div className="space-y-1 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground">This session</p>
              {log.map((l, i) => (
                <p key={i} className="text-sm">
                  • {l}
                </p>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ServiceGrid({ services }: { services: ServiceStatus[] }) {
  const color = (s: ServiceStatus["status"]) =>
    s === "healthy"
      ? "bg-emerald-500"
      : s === "degraded"
        ? "bg-amber-500"
        : "bg-red-500 animate-pulse";
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {services.map((svc) => (
        <div
          key={svc.name}
          className="flex items-center gap-2 rounded-md border bg-card px-3 py-2"
        >
          <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", color(svc.status))} />
          <div className="min-w-0">
            <div className="truncate text-xs font-medium">{svc.name}</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {svc.status}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MetricChart({
  title,
  data,
  dataKey,
  color,
  unit,
  value,
  area,
}: {
  title: string;
  data: MetricSample[];
  dataKey: keyof MetricSample;
  color: string;
  unit?: string;
  value: string;
  area?: boolean;
}) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div className="h-24">
        <ResponsiveContainer width="100%" height="100%">
          {area ? (
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <YAxis hide domain={["auto", "auto"]} />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                fill={`url(#g-${dataKey})`}
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="t" hide />
              <YAxis hide domain={["auto", "auto"]} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelFormatter={() => ""}
                formatter={(v: number) => [`${v}${unit ?? ""}`, title]}
              />
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke={color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function LogStream({ logs }: { logs: LogLine[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [logs]);
  const levelColor = (l: LogLine["level"]) =>
    l === "ERROR"
      ? "text-red-400"
      : l === "WARN"
        ? "text-amber-400"
        : "text-emerald-400";
  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-md border bg-zinc-950">
      <div className="border-b border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-400">
        Log Stream
      </div>
      <div
        ref={ref}
        className="min-h-[160px] flex-1 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed"
      >
        {logs.length === 0 && <div className="text-zinc-600">Waiting for log output…</div>}
        {logs.map((log) => (
          <div key={log.id} className="flex gap-2 whitespace-nowrap">
            <span className="text-zinc-600">{log.timestamp.slice(11, 19)}</span>
            <span className={cn("w-12 shrink-0 font-semibold", levelColor(log.level))}>
              {log.level}
            </span>
            <span className="w-24 shrink-0 text-cyan-400">{log.service}</span>
            <span className="text-zinc-300">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CommsPanel({
  drillId,
  messages,
  setMessages,
  currentUser,
}: {
  drillId: string;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  currentUser: { id: string; name: string };
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft("");
    const res = await postChatMessage(drillId, text);
    if (res.ok) {
      setMessages((m) => [...m, res.data]);
    } else {
      setDraft(text);
    }
    setSending(false);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-2 text-sm font-semibold">#war-room</div>
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No messages yet. Coordinate your response here.
          </p>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="flex flex-col gap-0.5 text-sm">
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "font-semibold",
                  msg.kind === "inject" && "text-amber-600 dark:text-amber-400",
                  msg.actor === "bot" && "text-primary",
                )}
              >
                {msg.kind === "inject" ? "⚠️ " : ""}
                {msg.actorName}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {new Date(msg.occurredAt).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
            </div>
            <p
              className={cn(
                "leading-snug",
                msg.kind === "inject" &&
                  "rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1",
              )}
            >
              {msg.text}
            </p>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 border-t p-3">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={`Message as ${currentUser.name}…`}
          disabled={sending}
        />
        <Button size="icon" onClick={() => void send()} disabled={sending || !draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
