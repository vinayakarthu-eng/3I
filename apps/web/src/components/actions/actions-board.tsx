"use client";

import { updateImprovementAction, type ActionUpdate } from "@/app/actions/actions";
import { SeverityBadge } from "@/components/drills/aar/aar-view";
import { Field } from "@/components/drills/wizard/field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { formatDate } from "@/lib/format";
import type { ImprovementActionRow } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  ACTION_CATEGORIES,
  ACTION_CATEGORY_LABELS,
  ACTION_SEVERITIES,
  ACTION_STATUS_LABELS,
  ACTION_STATUSES,
  allowedActionTransitions,
  isActionOverdue,
  type ActionCategory,
  type ActionSeverity,
  type ActionStatus,
} from "@drillforce/shared";
import { AlertTriangle, ExternalLink, ListChecks, Loader2 } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const STATUS_STYLES: Record<ActionStatus, string> = {
  open: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  completed: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  verified: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  deferred: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function ActionStatusBadge({ status }: { status: ActionStatus }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-medium", STATUS_STYLES[status])}>
      {ACTION_STATUS_LABELS[status]}
    </Badge>
  );
}

interface OrgUser {
  id: string;
  name: string;
}

type Filter<T extends string> = T | "all";

export function ActionsBoard({
  rows,
  orgUsers,
  initialActionId,
}: {
  rows: ImprovementActionRow[];
  orgUsers: OrgUser[];
  initialActionId?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [status, setStatus] = useState<Filter<ActionStatus>>("all");
  const [severity, setSeverity] = useState<Filter<ActionSeverity>>("all");
  const [category, setCategory] = useState<Filter<ActionCategory>>("all");
  const [owner, setOwner] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(initialActionId ?? null);

  const filtered = useMemo(
    () =>
      rows.filter(
        ({ action }) =>
          (status === "all" || action.status === status) &&
          (severity === "all" || action.severity === severity) &&
          (category === "all" || action.category === category) &&
          (owner === "all" || (owner === "none" ? !action.ownerId : action.ownerId === owner)),
      ),
    [rows, status, severity, category, owner],
  );
  const overdueCount = rows.filter(({ action }) => isActionOverdue(action)).length;
  const selected = rows.find((r) => r.action.id === selectedId) ?? null;

  function select(id: string | null) {
    setSelectedId(id);
    // Keep the URL shareable (?action=…) without a navigation.
    router.replace(id ? `${pathname}?action=${id}` : pathname, { scroll: false });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <FilterSelect
          label="Status"
          value={status}
          onChange={setStatus}
          options={ACTION_STATUSES.map((s) => [s, ACTION_STATUS_LABELS[s]])}
        />
        <FilterSelect
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={ACTION_SEVERITIES.map((s) => [s, s])}
        />
        <FilterSelect
          label="Category"
          value={category}
          onChange={setCategory}
          options={ACTION_CATEGORIES.map((c) => [c, ACTION_CATEGORY_LABELS[c]])}
        />
        <FilterSelect
          label="Owner"
          value={owner}
          onChange={setOwner}
          options={[...orgUsers.map((u) => [u.id, u.name] as [string, string]), ["none", "Unassigned"]]}
        />
        {overdueCount > 0 && (
          <span className="ml-auto inline-flex items-center gap-1.5 self-center text-sm font-medium text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            {overdueCount} overdue
          </span>
        )}
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[16rem]">Action</TableHead>
              <TableHead className="hidden lg:table-cell">Source Drill</TableHead>
              <TableHead className="hidden md:table-cell">Category</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead className="hidden sm:table-cell">Owner</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  <ListChecks className="mx-auto mb-2 h-6 w-6" />
                  {rows.length ? "No actions match your filters." : "No improvement actions yet. They’re created from After-Action Reports."}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map(({ action, drill, owner: ownerRow }) => {
                const overdue = isActionOverdue(action);
                return (
                  <TableRow
                    key={action.id}
                    className={cn("cursor-pointer", overdue && "bg-red-50 hover:bg-red-100/70 dark:bg-red-950/30 dark:hover:bg-red-950/50")}
                    onClick={() => select(action.id)}
                  >
                    <TableCell>
                      <p className="line-clamp-2 font-medium">{action.actionDescription}</p>
                      <p className="line-clamp-1 text-xs text-muted-foreground">{action.gapDescription}</p>
                    </TableCell>
                    <TableCell className="hidden text-sm lg:table-cell">{drill.name}</TableCell>
                    <TableCell className="hidden text-sm md:table-cell">
                      {action.category ? ACTION_CATEGORY_LABELS[action.category] : "—"}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={action.severity} />
                    </TableCell>
                    <TableCell className="hidden text-sm sm:table-cell">{ownerRow?.name ?? "Unassigned"}</TableCell>
                    <TableCell className={cn("whitespace-nowrap text-sm", overdue && "font-semibold text-red-600 dark:text-red-400")}>
                      {action.dueDate ? formatDate(`${action.dueDate}T00:00:00`) : "—"}
                      {overdue && <span className="block text-xs font-medium">Overdue</span>}
                    </TableCell>
                    <TableCell>
                      <ActionStatusBadge status={action.status} />
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <Sheet open={!!selected} onOpenChange={(open) => !open && select(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {selected && (
            <ActionEditor key={selected.action.id} row={selected} orgUsers={orgUsers} onDone={() => select(null)} />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | "all";
  onChange: (v: T | "all") => void;
  options: [T, string][];
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T | "all")}>
      <SelectTrigger className="h-9 w-auto min-w-[9rem]" aria-label={`Filter by ${label.toLowerCase()}`}>
        <span className="mr-1 text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        {options.map(([v, l]) => (
          <SelectItem key={v} value={v}>
            {l}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ActionEditor({
  row,
  orgUsers,
  onDone,
}: {
  row: ImprovementActionRow;
  orgUsers: OrgUser[];
  onDone: () => void;
}) {
  const { action, drill } = row;
  const save = useAction();
  const [form, setForm] = useState<ActionUpdate>({
    actionDescription: action.actionDescription,
    gapDescription: action.gapDescription,
    category: action.category,
    severity: action.severity,
    ownerId: action.ownerId,
    dueDate: action.dueDate,
    verificationMethod: action.verificationMethod,
    status: action.status,
    deferralJustification: action.deferralJustification,
  });
  const set = (patch: Partial<ActionUpdate>) => setForm((f) => ({ ...f, ...patch }));
  const statusOptions: ActionStatus[] = [action.status, ...allowedActionTransitions(action.status)];
  const overdue = isActionOverdue(action);
  const needsJustification = form.status === "deferred" && action.status !== "deferred";

  return (
    <>
      <SheetHeader className="space-y-2 text-left">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={action.severity} />
          <ActionStatusBadge status={action.status} />
          {overdue && (
            <Badge className="border-transparent bg-red-600 text-white hover:bg-red-600">Overdue</Badge>
          )}
        </div>
        <SheetTitle>Improvement action</SheetTitle>
        <SheetDescription>
          From{" "}
          <Link href={`/drills/${drill.id}/aar`} className="inline-flex items-center gap-1 underline underline-offset-2">
            {drill.name} <ExternalLink className="h-3 w-3" />
          </Link>
          {action.verifiedAt && <> · verified {formatDate(action.verifiedAt)}</>}
        </SheetDescription>
      </SheetHeader>

      <div className="mt-6 space-y-4">
        <Field label="Action" htmlFor="ia-action" required>
          <Textarea
            id="ia-action"
            rows={3}
            value={form.actionDescription}
            onChange={(e) => set({ actionDescription: e.target.value })}
          />
        </Field>
        <Field label="Gap" htmlFor="ia-gap" required>
          <Textarea id="ia-gap" rows={2} value={form.gapDescription} onChange={(e) => set({ gapDescription: e.target.value })} />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set({ status: v as ActionStatus })}>
              <SelectTrigger aria-label="Status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {ACTION_STATUS_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Severity">
            <Select value={form.severity} onValueChange={(v) => set({ severity: v as ActionSeverity })}>
              <SelectTrigger aria-label="Severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACTION_SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Category">
            <Select value={form.category ?? "none"} onValueChange={(v) => set({ category: v === "none" ? null : (v as ActionCategory) })}>
              <SelectTrigger aria-label="Category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {ACTION_CATEGORIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {ACTION_CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Due date" htmlFor="ia-due">
            <Input
              id="ia-due"
              type="date"
              value={form.dueDate ?? ""}
              onChange={(e) => set({ dueDate: e.target.value || null })}
            />
          </Field>
          <Field label="Owner" className="col-span-2">
            <Select value={form.ownerId ?? "none"} onValueChange={(v) => set({ ownerId: v === "none" ? null : v })}>
              <SelectTrigger aria-label="Owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {orgUsers.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Verification method" htmlFor="ia-verify" hint="How you’ll confirm the gap is closed.">
          <Textarea
            id="ia-verify"
            rows={2}
            value={form.verificationMethod ?? ""}
            onChange={(e) => set({ verificationMethod: e.target.value })}
          />
        </Field>

        {(form.status === "deferred" || action.deferralJustification) && (
          <Field
            label="Deferral justification"
            htmlFor="ia-defer"
            required={needsJustification}
            hint="Why this action is being postponed, and until when."
          >
            <Textarea
              id="ia-defer"
              rows={2}
              value={form.deferralJustification ?? ""}
              onChange={(e) => set({ deferralJustification: e.target.value })}
            />
          </Field>
        )}
      </div>

      <SheetFooter className="mt-6 gap-2">
        <Button variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button
          disabled={save.pending}
          onClick={() =>
            save.run(() => updateImprovementAction(action.id, form), { success: "Action updated", onSuccess: onDone })
          }
        >
          {save.pending && <Loader2 className="h-4 w-4 animate-spin" />}
          Save changes
        </Button>
      </SheetFooter>
    </>
  );
}
