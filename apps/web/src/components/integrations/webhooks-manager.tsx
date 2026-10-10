"use client";

import {
  createWebhook,
  deleteWebhook,
  testWebhook,
  toggleWebhook,
  updateWebhook,
} from "@/app/settings/integrations/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/use-action";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { WEBHOOK_EVENTS, WEBHOOK_EVENT_LABELS, type WebhookEvent } from "@drillforce/shared";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export interface WebhookRow {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string | null;
  active: boolean;
}
export interface DeliveryRow {
  id: string;
  webhookName: string;
  event: string;
  success: boolean;
  statusCode: number | null;
  error: string | null;
  createdAt: Date | string;
}

export function WebhooksManager({
  webhooks,
  deliveries,
}: {
  webhooks: WebhookRow[];
  deliveries: DeliveryRow[];
}) {
  const [editing, setEditing] = useState<WebhookRow | null>(null);
  const [creating, setCreating] = useState(false);
  const router = useRouter();
  const action = useAction();

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1">
            <CardTitle className="text-base">Webhooks</CardTitle>
            <CardDescription>POST drill events to your own endpoints.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" /> Add webhook
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No webhooks configured.</p>
          ) : (
            webhooks.map((w) => (
              <div key={w.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{w.name}</span>
                      <Badge variant={w.active ? "default" : "secondary"}>
                        {w.active ? "Active" : "Paused"}
                      </Badge>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{w.url}</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {w.events.map((e) => (
                        <Badge key={e} variant="outline" className="text-[10px]">
                          {WEBHOOK_EVENT_LABELS[e as WebhookEvent] ?? e}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={action.pending}
                      onClick={() =>
                        action.run(() => testWebhook(w.id), { success: "Test delivery sent" })
                      }
                    >
                      <Send className="h-4 w-4" /> Test
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(w)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        action.run(() => toggleWebhook(w.id, !w.active), {
                          onSuccess: () => router.refresh(),
                        })
                      }
                    >
                      {w.active ? "Pause" : "Enable"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="hover:text-destructive"
                      onClick={() =>
                        action.run(() => deleteWebhook(w.id), { success: "Webhook deleted" })
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Delivery log</CardTitle>
          <CardDescription>Most recent webhook delivery attempts.</CardDescription>
        </CardHeader>
        <CardContent>
          {deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">No deliveries yet.</p>
          ) : (
            <div className="-mx-6 overflow-x-auto px-6">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">When</th>
                    <th className="px-3 py-2 font-medium">Webhook</th>
                    <th className="px-3 py-2 font-medium">Event</th>
                    <th className="px-3 py-2 font-medium">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveries.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 text-muted-foreground">{formatDateTime(d.createdAt)}</td>
                      <td className="px-3 py-2">{d.webhookName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{d.event}</td>
                      <td className="px-3 py-2">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs font-medium",
                            d.success
                              ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                              : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
                          )}
                        >
                          {d.success ? (d.statusCode ?? "OK") : (d.error ?? "Failed")}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {(creating || editing) && (
        <WebhookDialog
          initial={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function WebhookDialog({ initial, onClose }: { initial: WebhookRow | null; onClose: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [secret, setSecret] = useState(initial?.secret ?? "");
  const [events, setEvents] = useState<string[]>(initial?.events ?? []);
  const save = useAction();

  function toggleEvent(e: string) {
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }

  function submit() {
    const input = { name, url, secret, events: events as WebhookEvent[], active: initial?.active ?? true };
    save.run(() => (initial ? updateWebhook(initial.id, input) : createWebhook(input)), {
      success: initial ? "Webhook updated" : "Webhook created",
      onSuccess: onClose,
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit webhook" : "Add webhook"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="wh-name">Name</Label>
            <Input id="wh-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops Slack relay" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-url">Payload URL</Label>
            <Input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/hooks/drillforce" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wh-secret">Signing secret (optional)</Label>
            <Input id="wh-secret" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="Used for the x-drillforce-signature header" />
          </div>
          <div className="space-y-1.5">
            <Label>Events</Label>
            <div className="grid grid-cols-2 gap-2">
              {WEBHOOK_EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={events.includes(e)} onChange={() => toggleEvent(e)} />
                  {WEBHOOK_EVENT_LABELS[e]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.pending}>
            {save.pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {initial ? "Save changes" : "Create webhook"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
