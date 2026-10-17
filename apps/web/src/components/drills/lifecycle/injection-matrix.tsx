"use client";

import { saveSignalsAction } from "@/app/drills/[id]/lifecycle-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import {
  SIGNAL_KINDS,
  SIGNAL_KIND_META,
  SIGNAL_PATTERNS,
  SIGNAL_PATTERN_LABELS,
  defaultSignal,
  describeSignal,
  planTotals,
  type SignalParams,
  type SignalPlan,
} from "@drillforce/shared";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

const PARAM_FIELDS: { key: keyof SignalParams; label: string; type: "text" | "number" }[] = [
  { key: "endpoint", label: "Endpoint", type: "text" },
  { key: "statusCode", label: "HTTP status", type: "number" },
  { key: "latencyMs", label: "Latency (ms)", type: "number" },
  { key: "dbName", label: "Database", type: "text" },
  { key: "poolSize", label: "Pool size", type: "number" },
  { key: "lagSeconds", label: "Peak lag (s)", type: "number" },
  { key: "monitorName", label: "Monitor name", type: "text" },
  { key: "priority", label: "Priority", type: "text" },
  { key: "errorMessage", label: "Error message", type: "text" },
];
const n = (v: number) => v.toLocaleString("en-US");

export function InjectionMatrix({ drillId, initial, editable }: { drillId: string; initial: SignalPlan[]; editable: boolean }) {
  const [rows, setRows] = useState<SignalPlan[]>(initial);
  const [dirty, setDirty] = useState(false);
  const save = useAction();
  const totals = useMemo(() => planTotals(rows), [rows]);

  const update = (i: number, patch: Partial<SignalPlan>) => {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
    setDirty(true);
  };
  const setParam = (i: number, key: keyof SignalParams, raw: string, type: "text" | "number") =>
    update(i, { params: { ...rows[i].params, [key]: raw === "" ? undefined : type === "number" ? Number(raw) : raw } });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Injection matrix</CardTitle>
          <CardDescription>
            What the injection engine sends into Datadog when the drill is executed — volume, failures, duration and pattern per stream.
          </CardDescription>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Select
              onValueChange={(kind) => {
                setRows((rs) => [...rs, defaultSignal(kind as SignalPlan["kind"])]);
                setDirty(true);
              }}
            >
              <SelectTrigger className="w-44" aria-label="Add signal">
                <Plus className="mr-1 h-4 w-4" />
                <SelectValue placeholder="Add signal" />
              </SelectTrigger>
              <SelectContent>
                {SIGNAL_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SIGNAL_KIND_META[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!dirty || save.pending}
              onClick={() =>
                save.run(() => saveSignalsAction(drillId, rows), {
                  success: "Injection matrix saved",
                  onSuccess: () => setDirty(false),
                })
              }
            >
              {save.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {!rows.length && <p className="text-sm text-muted-foreground">No signals yet{editable ? " — add one to inject telemetry during the drill." : "."}</p>}
        {rows.map((r, i) => {
          const meta = SIGNAL_KIND_META[r.kind];
          const relevant = PARAM_FIELDS.filter((f) => f.key in meta.defaults.params);
          return (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{meta.label}</Badge>
                  <span className="text-xs text-muted-foreground">{meta.telemetry.join(" · ")}</span>
                </div>
                {editable && (
                  <Button variant="ghost" size="sm" className="hover:text-destructive" onClick={() => (setRows((rs) => rs.filter((_, j) => j !== i)), setDirty(true))}>
                    <Trash2 className="h-4 w-4" /> Remove
                  </Button>
                )}
              </div>
              <p className="text-sm">{describeSignal(r)}</p>
              {editable && (
                <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  <Field label="Service">
                    <Input value={r.service} onChange={(e) => update(i, { service: e.target.value })} />
                  </Field>
                  <Field label={`${meta.unit} / min`}>
                    <Input type="number" min={1} value={r.ratePerMinute} onChange={(e) => update(i, { ratePerMinute: Number(e.target.value) })} />
                  </Field>
                  <Field label="Failing / min">
                    <Input type="number" min={0} value={r.failuresPerMinute} onChange={(e) => update(i, { failuresPerMinute: Number(e.target.value) })} />
                  </Field>
                  <Field label="Duration (min)">
                    <Input type="number" min={1} value={r.durationMinutes} onChange={(e) => update(i, { durationMinutes: Number(e.target.value) })} />
                  </Field>
                  <Field label="Starts at T+ (min)">
                    <Input type="number" min={0} value={r.startOffsetMinutes} onChange={(e) => update(i, { startOffsetMinutes: Number(e.target.value) })} />
                  </Field>
                  <Field label="Pattern">
                    <Select value={r.pattern} onValueChange={(v) => update(i, { pattern: v as SignalPlan["pattern"] })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SIGNAL_PATTERNS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {SIGNAL_PATTERN_LABELS[p]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  {relevant.map((f) => (
                    <Field key={f.key} label={f.label} wide={f.key === "errorMessage" || f.key === "monitorName"}>
                      <Input
                        type={f.type}
                        value={(r.params[f.key] as string | number | undefined) ?? ""}
                        onChange={(e) => setParam(i, f.key, e.target.value, f.type)}
                      />
                    </Field>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {rows.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Expected telemetry: ~{n(totals.spans)} spans · {n(totals.logs)} log lines · {n(totals.metricPoints)} metric points · {totals.events} event
            {totals.events === 1 ? "" : "s"}
            {dirty && editable ? " · unsaved changes" : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "space-y-1 sm:col-span-3 lg:col-span-3" : "space-y-1"}>
      <Label className="text-xs capitalize text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
