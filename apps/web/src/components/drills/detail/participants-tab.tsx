"use client";

import { addParticipant, changeParticipantRole, removeParticipant } from "@/app/drills/[id]/actions";
import { ParticipantRoleBadge } from "@/components/drills/drill-badges";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/hooks/use-action";
import { formatDateTime, initials } from "@/lib/format";
import type { DrillDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { PARTICIPANT_ROLE_LABELS, PARTICIPANT_ROLES, type ParticipantRole } from "@drillforce/shared";
import { Check, Loader2, Search, UserMinus, UserPlus, Users } from "lucide-react";
import { useMemo, useState } from "react";

type Participant = DrillDetail["participants"][number];
export interface OrgUser {
  id: string;
  name: string;
  email: string;
}

const ROLE_ORDER: ParticipantRole[] = ["incident_commander", "responder", "evaluator", "observer"];

export function ParticipantsTab({ drill, orgUsers }: { drill: DrillDetail; orgUsers: OrgUser[] }) {
  const [adding, setAdding] = useState(false);
  const [toRemove, setToRemove] = useState<Participant | null>(null);
  const roleChange = useAction();
  const remove = useAction();

  const participants = [...drill.participants].sort(
    (a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.user.name.localeCompare(b.user.name),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {participants.length} participant{participants.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" onClick={() => setAdding(true)}>
          <UserPlus className="h-4 w-4" />
          Add Participant
        </Button>
      </div>

      {participants.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
          <Users className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No participants yet.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {participants.map((p) => (
            <Card key={p.id}>
              <CardContent className="flex items-start gap-3 p-4">
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials(p.user.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1 space-y-2">
                  <div>
                    <div className="truncate font-medium">{p.user.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{p.user.email}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      value={p.role}
                      onValueChange={(role) =>
                        roleChange.run(() => changeParticipantRole(drill.id, p.id, role as ParticipantRole), {
                          success: `${p.user.name} is now ${PARTICIPANT_ROLE_LABELS[role as ParticipantRole]}`,
                        })
                      }
                    >
                      <SelectTrigger className="h-8 w-auto gap-2 border-none p-0 shadow-none focus:ring-0" aria-label={`Role for ${p.user.name}`}>
                        <ParticipantRoleBadge role={p.role} />
                      </SelectTrigger>
                      <SelectContent>
                        {PARTICIPANT_ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {PARTICIPANT_ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">
                      {p.joinedAt ? `Joined ${formatDateTime(p.joinedAt)}` : "Not joined yet"}
                    </span>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 hover:text-destructive"
                  aria-label={`Remove ${p.user.name}`}
                  onClick={() => setToRemove(p)}
                >
                  <UserMinus className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {adding && (
        <AddParticipantDialog
          drillId={drill.id}
          orgUsers={orgUsers}
          existing={new Set(drill.participants.map((p) => p.user.email))}
          onClose={() => setAdding(false)}
        />
      )}

      <AlertDialog open={!!toRemove} onOpenChange={(open) => !open && setToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {toRemove?.user.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They’ll no longer be part of this drill. You can add them back at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                toRemove &&
                remove.run(() => removeParticipant(drill.id, toRemove.id), {
                  success: `${toRemove.user.name} removed`,
                })
              }
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function AddParticipantDialog({
  drillId,
  orgUsers,
  existing,
  onClose,
}: {
  drillId: string;
  orgUsers: OrgUser[];
  existing: Set<string>;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<OrgUser | null>(null);
  const [role, setRole] = useState<ParticipantRole>("responder");
  const add = useAction();

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgUsers
      .filter((u) => !existing.has(u.email))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [query, orgUsers, existing]);

  const inviteEmail = !selected && EMAIL_RE.test(query.trim()) && !orgUsers.some((u) => u.email === query.trim().toLowerCase())
    ? query.trim().toLowerCase()
    : null;
  const email = selected?.email ?? inviteEmail;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add participant</DialogTitle>
          <DialogDescription>Search your organization or invite someone by email.</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              className="pl-9"
              placeholder="Name or email"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              aria-label="Search people"
            />
          </div>

          <ul className="max-h-56 space-y-1 overflow-y-auto">
            {matches.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelected(u)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-accent",
                    selected?.id === u.id && "bg-accent",
                  )}
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="text-xs">{initials(u.name)}</AvatarFallback>
                  </Avatar>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{u.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
                  </span>
                  {selected?.id === u.id && <Check className="h-4 w-4" />}
                </button>
              </li>
            ))}
            {matches.length === 0 && !inviteEmail && (
              <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                No matches. Type a full email address to invite someone new.
              </li>
            )}
            {inviteEmail && (
              <li className="rounded-md border border-dashed px-3 py-2 text-sm">
                Invite <span className="font-medium">{inviteEmail}</span> as a new participant
              </li>
            )}
          </ul>

          <Select value={role} onValueChange={(v) => setRole(v as ParticipantRole)}>
            <SelectTrigger aria-label="Role">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARTICIPANT_ROLES.map((r) => (
                <SelectItem key={r} value={r}>
                  {PARTICIPANT_ROLE_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!email || add.pending}
            onClick={() =>
              email &&
              add.run(() => addParticipant(drillId, { email, name: selected?.name, role }), {
                success: `${selected?.name ?? email} added`,
                onSuccess: onClose,
              })
            }
          >
            {add.pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {inviteEmail ? "Invite & add" : "Add participant"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
