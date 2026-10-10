"use client";

import { createDrill, updateDrill } from "@/app/drills/actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  defaultTargetFor,
  emptyObjective,
  newKey,
  validateStep,
  type DrillFormValues,
  type ObjectiveFormValue,
  type ParticipantFormValue,
} from "@/lib/drill-form";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CRITERIA_TYPE_LABELS,
  CRITERIA_TYPES,
  PARTICIPANT_ROLE_LABELS,
  PARTICIPANT_ROLES,
  SECTOR_LABELS,
  SECTORS,
  type CriteriaType,
  type DrillTemplate,
  type DrillType,
  type ParticipantRole,
  type Sector,
} from "@drillforce/shared";
import { ArrowLeft, ArrowRight, Check, Loader2, Plus, Trash2, UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Field } from "./field";
import { TargetValueInput } from "./target-value-input";
import { TemplateDialog } from "./template-dialog";
import { WeightPicker } from "./weight-picker";

const STEPS = [
  { title: "Basic information", description: "Name, type, and schedule" },
  { title: "Objectives", description: "What success looks like" },
  { title: "Participants", description: "Who takes part, and in which role" },
] as const;

const TYPE_OPTIONS: { value: DrillType; label: string }[] = [
  { value: "tabletop", label: "Tabletop Exercise" },
  { value: "functional", label: "Functional Exercise" },
  { value: "full_scale", label: "Full-Scale Exercise" },
];

export interface OrgUserOption {
  id: string;
  name: string;
  email: string;
}

type Errors = Record<string, string>;

export function DrillWizard({
  mode,
  drillId,
  initialValues,
  orgUsers,
  templates,
}: {
  mode: "create" | "edit";
  drillId?: string;
  initialValues: DrillFormValues;
  orgUsers: OrgUserOption[];
  templates?: DrillTemplate[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<DrillFormValues>(initialValues);
  const [errors, setErrors] = useState<Errors>({});
  const [pending, startTransition] = useTransition();
  const [pendingIntent, setPendingIntent] = useState<string | null>(null);

  const update = (patch: Partial<DrillFormValues>) => setValues((v) => ({ ...v, ...patch }));

  // Once a step has shown errors, re-validate as the user edits so fixed fields clear.
  const hasErrors = Object.keys(errors).length > 0;
  useEffect(() => {
    if (hasErrors) setErrors(validateStep(step, values));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  function goNext() {
    const stepErrors = validateStep(step, values);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length === 0) setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function goTo(target: number) {
    if (target <= step) {
      setErrors({});
      setStep(target);
      return;
    }
    // Only allow jumping forward when every step in between is valid.
    for (let s = step; s < target; s++) {
      const stepErrors = validateStep(s, values);
      if (Object.keys(stepErrors).length) {
        setStep(s);
        setErrors(stepErrors);
        return;
      }
    }
    setErrors({});
    setStep(target);
  }

  function applyTemplate(t: DrillTemplate) {
    setValues((v) => ({
      ...v,
      name: v.name || t.name,
      type: t.type,
      sector: t.sector === "general" ? v.sector : t.sector,
      description: t.description,
      scenario: t.scenario,
      templateId: t.id,
      objectives: t.objectives.map((o) => ({
        key: newKey(),
        description: o.description,
        criteriaType: o.criteriaType,
        targetValue: structuredClone(o.targetValue),
        weight: o.weight,
      })),
    }));
    setErrors({});
    toast({ title: `Template applied: ${t.name}`, description: "Details and objectives were pre-filled." });
  }

  function submit(intent: "draft" | "schedule" | "save") {
    const allErrors = { ...validateStep(0, values), ...validateStep(1, values), ...validateStep(2, values) };
    if (intent === "schedule" && !values.scheduledAt) {
      allErrors.scheduledAt = "Pick a date and time to schedule this drill";
    }
    if (Object.keys(allErrors).length) {
      setErrors(allErrors);
      const firstBad = Object.keys(allErrors).some((k) => !k.startsWith("objectives") && !k.startsWith("participants"))
        ? 0
        : Object.keys(allErrors).some((k) => k.startsWith("objectives"))
          ? 1
          : 2;
      setStep(firstBad);
      return;
    }

    const payload = {
      ...values,
      type: values.type as DrillType,
      scheduledAt: values.scheduledAt ? new Date(values.scheduledAt).toISOString() : "",
      objectives: values.objectives.map(({ key: _key, ...o }) => o),
      participants: values.participants.map(({ key: _key, ...p }) => p),
      intent,
    };

    setPendingIntent(intent);
    startTransition(async () => {
      const result =
        mode === "edit" && drillId ? await updateDrill(drillId, payload) : await createDrill(payload);
      setPendingIntent(null);
      if (!result.ok) {
        if (result.fieldErrors) setErrors(result.fieldErrors);
        toast({ variant: "destructive", title: "Couldn’t save drill", description: result.error });
        return;
      }
      toast({
        title:
          mode === "edit"
            ? "Drill updated"
            : intent === "schedule"
              ? "Drill scheduled"
              : "Draft saved",
        description: values.name,
      });
      router.push(`/drills/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <Stepper step={step} onSelect={goTo} />

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1.5">
            <CardTitle>{STEPS[step].title}</CardTitle>
            <CardDescription>{STEPS[step].description}</CardDescription>
          </div>
          {step === 0 && mode === "create" && (
            <TemplateDialog onSelect={applyTemplate} templates={templates} />
          )}
        </CardHeader>
        <CardContent>
          {step === 0 && <BasicInfoStep values={values} errors={errors} update={update} />}
          {step === 1 && (
            <ObjectivesStep
              objectives={values.objectives}
              errors={errors}
              onChange={(objectives) => update({ objectives })}
            />
          )}
          {step === 2 && (
            <ParticipantsStep
              participants={values.participants}
              orgUsers={orgUsers}
              errors={errors}
              onChange={(participants) => update({ participants })}
            />
          )}
        </CardContent>
      </Card>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="outline"
          onClick={() => (step === 0 ? router.back() : goTo(step - 1))}
          disabled={pending}
        >
          <ArrowLeft className="h-4 w-4" />
          {step === 0 ? "Cancel" : "Back"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button type="button" onClick={goNext}>
            Next
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : mode === "edit" ? (
          <Button type="button" onClick={() => submit("save")} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="button" variant="outline" onClick={() => submit("draft")} disabled={pending}>
              {pendingIntent === "draft" && <Loader2 className="h-4 w-4 animate-spin" />}
              Save as Draft
            </Button>
            <Button type="button" onClick={() => submit("schedule")} disabled={pending}>
              {pendingIntent === "schedule" && <Loader2 className="h-4 w-4 animate-spin" />}
              Schedule Drill
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Stepper ────────────────────────────────────────────────────────────────

function Stepper({ step, onSelect }: { step: number; onSelect: (i: number) => void }) {
  return (
    <ol className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={s.title} className="flex flex-1 items-center gap-2">
            <button
              type="button"
              onClick={() => onSelect(i)}
              className="flex items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-current={current ? "step" : undefined}
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-medium transition-colors",
                  done && "border-primary bg-primary text-primary-foreground",
                  current && "border-primary text-foreground ring-2 ring-primary/20",
                  !done && !current && "text-muted-foreground",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="hidden sm:block">
                <span className={cn("block text-sm font-medium", !current && !done && "text-muted-foreground")}>
                  {s.title}
                </span>
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span className={cn("h-px flex-1 bg-border", done && "bg-primary")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

// ─── Step 1 ─────────────────────────────────────────────────────────────────

function BasicInfoStep({
  values,
  errors,
  update,
}: {
  values: DrillFormValues;
  errors: Errors;
  update: (patch: Partial<DrillFormValues>) => void;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Field label="Drill name" htmlFor="name" error={errors.name} required className="md:col-span-2">
        <Input
          id="name"
          autoFocus
          placeholder="e.g. Q4 Database Failover"
          value={values.name}
          onChange={(e) => update({ name: e.target.value })}
        />
      </Field>

      <Field label="Drill type" error={errors.type} required>
        <Select value={values.type} onValueChange={(v) => update({ type: v as DrillType })}>
          <SelectTrigger aria-label="Drill type">
            <SelectValue placeholder="Select a type" />
          </SelectTrigger>
          <SelectContent>
            {TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Sector" error={errors.sector}>
        <Select value={values.sector} onValueChange={(v) => update({ sector: v as Sector })}>
          <SelectTrigger aria-label="Sector">
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
      </Field>

      <Field
        label="Scheduled date & time"
        htmlFor="scheduledAt"
        error={errors.scheduledAt}
        hint="Required to schedule; optional for drafts."
      >
        <Input
          id="scheduledAt"
          type="datetime-local"
          value={values.scheduledAt}
          onChange={(e) => update({ scheduledAt: e.target.value })}
        />
      </Field>

      <Field label="Description" htmlFor="description" error={errors.description} className="md:col-span-2">
        <Textarea
          id="description"
          rows={4}
          placeholder="What is this drill testing, and why?"
          value={values.description}
          onChange={(e) => update({ description: e.target.value })}
        />
      </Field>

      {values.scenario?.summary && (
        <div className="rounded-md border bg-muted/40 p-3 text-sm md:col-span-2">
          <span className="font-medium">Scenario: </span>
          <span className="text-muted-foreground">{values.scenario.summary}</span>
          {values.scenario.injects?.length ? (
            <span className="text-muted-foreground"> · {values.scenario.injects.length} injects</span>
          ) : null}
        </div>
      )}
    </div>
  );
}

// ─── Step 2 ─────────────────────────────────────────────────────────────────

function ObjectivesStep({
  objectives,
  errors,
  onChange,
}: {
  objectives: ObjectiveFormValue[];
  errors: Errors;
  onChange: (objectives: ObjectiveFormValue[]) => void;
}) {
  const set = (i: number, patch: Partial<ObjectiveFormValue>) =>
    onChange(objectives.map((o, j) => (j === i ? { ...o, ...patch } : o)));

  const targetError = (i: number) =>
    Object.entries(errors).find(([k]) => k.startsWith(`objectives.${i}.targetValue`))?.[1];

  return (
    <div className="space-y-4">
      {errors.objectives && (
        <p className="text-sm font-medium text-destructive">{errors.objectives}</p>
      )}

      {objectives.map((o, i) => (
        <div key={o.key} className="space-y-4 rounded-lg border p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Objective {i + 1}</span>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-destructive"
              disabled={objectives.length === 1}
              onClick={() => onChange(objectives.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
              Remove
            </Button>
          </div>

          <Field
            label="Description"
            htmlFor={`obj-${o.key}-desc`}
            error={errors[`objectives.${i}.description`]}
            required
          >
            <Input
              id={`obj-${o.key}-desc`}
              placeholder="e.g. Detect database failure within 5 minutes"
              value={o.description}
              onChange={(e) => set(i, { description: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Criteria type">
              <Select
                value={o.criteriaType}
                onValueChange={(v) =>
                  set(i, { criteriaType: v as CriteriaType, targetValue: defaultTargetFor(v as CriteriaType) })
                }
              >
                <SelectTrigger aria-label="Criteria type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CRITERIA_TYPES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {CRITERIA_TYPE_LABELS[c]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Weight" hint="1 (low) – 5 (high)" error={errors[`objectives.${i}.weight`]}>
              <WeightPicker value={o.weight} onChange={(weight) => set(i, { weight })} />
            </Field>
          </div>

          <TargetValueInput
            id={`obj-${o.key}`}
            criteria={o.criteriaType}
            value={o.targetValue}
            onChange={(targetValue) => set(i, { targetValue })}
            error={targetError(i)}
          />
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        className="w-full border-dashed"
        onClick={() => onChange([...objectives, emptyObjective()])}
      >
        <Plus className="h-4 w-4" />
        Add Objective
      </Button>
    </div>
  );
}

// ─── Step 3 ─────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ParticipantsStep({
  participants,
  orgUsers,
  errors,
  onChange,
}: {
  participants: ParticipantFormValue[];
  orgUsers: OrgUserOption[];
  errors: Errors;
  onChange: (participants: ParticipantFormValue[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<ParticipantRole>("responder");
  const [focused, setFocused] = useState(false);
  const [inputError, setInputError] = useState<string | null>(null);

  const added = new Set(participants.map((p) => p.email.toLowerCase()));
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgUsers
      .filter((u) => !added.has(u.email.toLowerCase()))
      .filter((u) => !q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
      .slice(0, 6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, orgUsers, participants]);

  function add(user?: OrgUserOption) {
    const email = (user?.email ?? query).trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      setInputError("Enter a valid email or pick someone from the list");
      return;
    }
    if (added.has(email)) {
      setInputError("Already added");
      return;
    }
    const match = user ?? orgUsers.find((u) => u.email.toLowerCase() === email);
    onChange([
      ...participants,
      { key: newKey(), userId: match?.id, email, name: match?.name ?? "", role },
    ]);
    setQuery("");
    setInputError(null);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="relative flex-1">
          <Input
            placeholder="Search people or enter an email to invite"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setInputError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(suggestions.length === 1 && query ? suggestions[0] : undefined);
              }
            }}
            aria-label="Search participants"
          />
          {focused && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
              {suggestions.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-accent"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => add(u)}
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">{initials(u.name)}</AvatarFallback>
                    </Avatar>
                    <span>
                      <span className="block font-medium">{u.name}</span>
                      <span className="block text-xs text-muted-foreground">{u.email}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {inputError && <p className="mt-1.5 text-xs font-medium text-destructive">{inputError}</p>}
        </div>
        <Select value={role} onValueChange={(v) => setRole(v as ParticipantRole)}>
          <SelectTrigger className="sm:w-48" aria-label="Role for new participant">
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
        <Button type="button" onClick={() => add()}>
          <UserPlus className="h-4 w-4" />
          Add
        </Button>
      </div>

      {errors.participants && (
        <p className="text-sm font-medium text-destructive">{errors.participants}</p>
      )}

      {participants.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-10 text-center text-sm text-muted-foreground">
          No participants yet. Add at least one person to run this drill.
        </div>
      ) : (
        <ul className="divide-y rounded-lg border">
          {participants.map((p, i) => (
            <li key={p.key} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="text-xs">{initials(p.name || p.email)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {p.name || <span className="text-muted-foreground">Invite pending</span>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{p.email}</div>
                  {errors[`participants.${i}.email`] && (
                    <div className="text-xs text-destructive">{errors[`participants.${i}.email`]}</div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={p.role}
                  onValueChange={(v) =>
                    onChange(participants.map((x, j) => (j === i ? { ...x, role: v as ParticipantRole } : x)))
                  }
                >
                  <SelectTrigger className="w-48" aria-label={`Role for ${p.email}`}>
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
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${p.email}`}
                  onClick={() => onChange(participants.filter((_, j) => j !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
