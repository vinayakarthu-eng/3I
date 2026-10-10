"use client";

import { updateOrgSettings } from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { SECTORS, SECTOR_LABELS, type Sector } from "@drillforce/shared";
import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

const NOTIFICATION_FIELDS: { key: keyof Notifications; label: string }[] = [
  { key: "drillScheduled", label: "Drill scheduled" },
  { key: "drillCompleted", label: "Drill completed" },
  { key: "actionAssigned", label: "Action assigned to me" },
  { key: "actionOverdue", label: "Action overdue" },
  { key: "certificationEarned", label: "Certification earned" },
];

interface Notifications {
  drillScheduled: boolean;
  drillCompleted: boolean;
  actionAssigned: boolean;
  actionOverdue: boolean;
  certificationEarned: boolean;
}

export interface SettingsValues {
  name: string;
  sector: Sector;
  passThreshold: number;
  defaultDurationMinutes: number;
  notifications: Notifications;
  competencyWeights: Record<string, number>;
}

export function SettingsForm({
  initial,
  competencies,
}: {
  initial: SettingsValues;
  competencies: string[];
}) {
  const [values, setValues] = useState<SettingsValues>(initial);
  const save = useAction();
  const set = (patch: Partial<SettingsValues>) => setValues((v) => ({ ...v, ...patch }));

  function submit() {
    save.run(() => updateOrgSettings(values), { success: "Settings saved" });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Organization</CardTitle>
          <CardDescription>Name, sector, and branding.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="org-name">Organization name</Label>
            <Input id="org-name" value={values.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Sector</Label>
            <Select value={values.sector} onValueChange={(v) => set({ sector: v as Sector })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SECTORS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SECTOR_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-md border bg-muted text-sm font-semibold">
                {values.name.slice(0, 2).toUpperCase()}
              </span>
              <Button type="button" variant="outline" size="sm" disabled>
                Upload logo
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scoring</CardTitle>
          <CardDescription>Default pass threshold and per-competency weights.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="threshold">Pass / fail threshold</Label>
              <span className="font-mono text-sm tabular-nums">{values.passThreshold}</span>
            </div>
            <input
              id="threshold"
              type="range"
              min={0}
              max={100}
              value={values.passThreshold}
              onChange={(e) => set({ passThreshold: Number(e.target.value) })}
              className="w-full accent-primary"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {competencies.map((c) => (
              <div key={c} className="space-y-1.5">
                <Label className="text-xs">{c}</Label>
                <Input
                  type="number"
                  min={1}
                  max={5}
                  value={values.competencyWeights[c] ?? 1}
                  onChange={(e) =>
                    set({
                      competencyWeights: {
                        ...values.competencyWeights,
                        [c]: Number(e.target.value),
                      },
                    })
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notifications</CardTitle>
          <CardDescription>Email notifications (preferences stored for when email is wired up).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {NOTIFICATION_FIELDS.map((f) => (
            <label key={f.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={values.notifications[f.key]}
                onChange={(e) =>
                  set({ notifications: { ...values.notifications, [f.key]: e.target.checked } })
                }
              />
              {f.label}
            </label>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Drill defaults</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="duration">Default duration (minutes)</Label>
            <Input
              id="duration"
              type="number"
              min={5}
              max={480}
              value={values.defaultDurationMinutes}
              onChange={(e) => set({ defaultDurationMinutes: Number(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Integrations</CardTitle>
          <CardDescription>Slack, webhooks, and incident-tool connections.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/settings/integrations">Manage integrations</Link>
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={submit} disabled={save.pending}>
          {save.pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save settings
        </Button>
      </div>
    </div>
  );
}
