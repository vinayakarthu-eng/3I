"use client";

import { createApiKeyAction, revokeApiKeyAction } from "@/app/settings/api-keys-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/hooks/use-action";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/format";
import { Check, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  lastUsedAt: Date | string | null;
  createdAt: Date | string;
}

export function ApiKeysManager({ keys }: { keys: ApiKeyRow[] }) {
  const [creating, setCreating] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);
  const revoke = useAction();
  const router = useRouter();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> API keys
          </CardTitle>
          <CardDescription>
            Authenticate the DrillForce API with <code className="font-mono text-xs">Authorization: Bearer &lt;key&gt;</code>.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Create key
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {keys.length === 0 ? (
          <p className="text-sm text-muted-foreground">No API keys yet.</p>
        ) : (
          keys.map((k) => (
            <div key={k.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <p className="font-medium">{k.name}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {k.prefix}… · created {formatDate(k.createdAt)}
                  {k.lastUsedAt ? ` · last used ${formatDate(k.lastUsedAt)}` : " · never used"}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="hover:text-destructive"
                disabled={revoke.pending}
                onClick={() =>
                  revoke.run(() => revokeApiKeyAction(k.id), {
                    success: "Key revoked",
                    onSuccess: () => router.refresh(),
                  })
                }
              >
                <Trash2 className="h-4 w-4" /> Revoke
              </Button>
            </div>
          ))
        )}
      </CardContent>

      {creating && (
        <CreateDialog
          onClose={() => setCreating(false)}
          onCreated={(raw) => {
            setCreating(false);
            setRevealed(raw);
            router.refresh();
          }}
        />
      )}
      {revealed && <RevealDialog rawKey={revealed} onClose={() => setRevealed(null)} />}
    </Card>
  );
}

function CreateDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (raw: string) => void }) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();

  function submit() {
    startTransition(async () => {
      const res = await createApiKeyAction(name.trim() || "Untitled key");
      if (res.ok) onCreated(res.data.raw);
      else toast({ variant: "destructive", title: "Couldn't create key", description: res.error });
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>Give it a name so you can recognize it later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="key-name">Key name</Label>
          <Input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. CI pipeline, Zapier, Partner X"
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Create key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RevealDialog({ rawKey, onClose }: { rawKey: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard?.writeText(rawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy your API key now</DialogTitle>
          <DialogDescription>
            This is the only time the full key is shown. Store it somewhere safe — if you lose it,
            revoke it and create a new one.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-3">
          <code className="min-w-0 flex-1 break-all font-mono text-xs">{rawKey}</code>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
