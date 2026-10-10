"use client";

import { deleteObjective, reorderObjectives, saveObjective } from "@/app/drills/[id]/actions";
import { CriteriaBadge } from "@/components/drills/drill-badges";
import { ObjectiveTargetView } from "@/components/drills/objective-target";
import { Field } from "@/components/drills/wizard/field";
import { TargetValueInput } from "@/components/drills/wizard/target-value-input";
import { WeightPicker } from "@/components/drills/wizard/weight-picker";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { defaultTargetFor, objectiveSchema, issuesToErrors } from "@/lib/drill-form";
import { scoreColor } from "@/lib/format";
import type { DrillDetail } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CRITERIA_TYPE_LABELS, CRITERIA_TYPES, type CriteriaType } from "@drillforce/shared";
import { GripVertical, Loader2, Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

type Objective = DrillDetail["objectives"][number];

interface EditorState {
  id?: string;
  description: string;
  criteriaType: CriteriaType;
  targetValue: Record<string, unknown>;
  weight: number;
}

export function ObjectivesTab({ drill }: { drill: DrillDetail }) {
  const [items, setItems] = useState(drill.objectives);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [toDelete, setToDelete] = useState<Objective | null>(null);
  const reorder = useAction();
  const remove = useAction();

  // Keep local order in sync when server data changes.
  useEffect(() => setItems(drill.objectives), [drill.objectives]);

  // Latest score per objective.
  const scoreByObjective = new Map<string, number>();
  for (const s of drill.scores) {
    if (s.objectiveId && !scoreByObjective.has(s.objectiveId) && s.normalizedScore != null) {
      scoreByObjective.set(s.objectiveId, Number(s.normalizedScore));
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((o) => o.id === active.id);
    const to = items.findIndex((o) => o.id === over.id);
    const next = arrayMove(items, from, to);
    setItems(next);
    reorder.run(() => reorderObjectives(drill.id, next.map((o) => o.id)), {
      onError: () => setItems(drill.objectives),
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {items.length} objective{items.length === 1 ? "" : "s"} · drag to reorder
          {reorder.pending && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
        </p>
        <Button
          size="sm"
          onClick={() =>
            setEditor({
              description: "",
              criteriaType: "time_to_action",
              targetValue: defaultTargetFor("time_to_action"),
              weight: 1,
            })
          }
        >
          <Plus className="h-4 w-4" />
          Add Objective
        </Button>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-12 text-center">
          <Target className="mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No objectives yet. Objectives define how this drill is scored.</p>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-3">
              {items.map((o, i) => (
                <SortableObjective
                  key={o.id}
                  objective={o}
                  index={i}
                  score={scoreByObjective.get(o.id)}
                  onEdit={() =>
                    setEditor({
                      id: o.id,
                      description: o.description,
                      criteriaType: o.criteriaType,
                      targetValue: (o.targetValue as Record<string, unknown>) ?? defaultTargetFor(o.criteriaType),
                      weight: o.weight,
                    })
                  }
                  onDelete={() => setToDelete(o)}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editor && <ObjectiveDialog drillId={drill.id} initial={editor} onClose={() => setEditor(null)} />}

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this objective?</AlertDialogTitle>
            <AlertDialogDescription>
              “{toDelete?.description}” and any scores recorded against it will be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                toDelete &&
                remove.run(() => deleteObjective(drill.id, toDelete.id), { success: "Objective deleted" })
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function SortableObjective({
  objective,
  index,
  score,
  onEdit,
  onDelete,
}: {
  objective: Objective;
  index: number;
  score?: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: objective.id });

  return (
    <Card
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", isDragging && "z-10 shadow-lg ring-2 ring-primary/30")}
    >
      <CardContent className="flex gap-3 p-4 sm:p-5">
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          className="-ml-1 mt-0.5 flex h-7 w-6 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-accent active:cursor-grabbing"
          aria-label={`Reorder objective ${index + 1}`}
        >
          <GripVertical className="h-4 w-4" />
        </button>

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">#{index + 1}</span>
            <CriteriaBadge criteria={objective.criteriaType} />
            <WeightDots weight={objective.weight} />
          </div>
          <p className="font-medium">{objective.description}</p>
          <div className="text-muted-foreground">
            <ObjectiveTargetView target={objective.targetValue} />
          </div>
          {score != null && (
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    "h-full rounded-full",
                    score > 80 ? "bg-green-500" : score > 60 ? "bg-yellow-500" : "bg-red-500",
                  )}
                  style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
                />
              </div>
              <span className={cn("w-10 text-right text-sm font-semibold tabular-nums", scoreColor(score))}>
                {Math.round(score)}
              </span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" size="icon" onClick={onEdit} aria-label="Edit objective">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label="Delete objective"
            className="hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function WeightDots({ weight }: { weight: number }) {
  return (
    <span className="flex items-center gap-1" title={`Weight ${weight} of 5`} aria-label={`Weight ${weight} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn("h-1.5 w-1.5 rounded-full", n <= weight ? "bg-foreground" : "bg-muted-foreground/25")}
        />
      ))}
    </span>
  );
}

function ObjectiveDialog({
  drillId,
  initial,
  onClose,
}: {
  drillId: string;
  initial: EditorState;
  onClose: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useAction();

  function submit() {
    const parsed = objectiveSchema.safeParse(value);
    if (!parsed.success) {
      setErrors(issuesToErrors(parsed.error));
      return;
    }
    save.run(() => saveObjective(drillId, value), {
      success: value.id ? "Objective updated" : "Objective added",
      onSuccess: onClose,
    });
  }

  const targetError = Object.entries(errors).find(([k]) => k.startsWith("targetValue"))?.[1];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{value.id ? "Edit objective" : "Add objective"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="Description" htmlFor="objective-description" error={errors.description} required>
            <Input
              id="objective-description"
              value={value.description}
              placeholder="e.g. Detect database failure within 5 minutes"
              onChange={(e) => setValue({ ...value, description: e.target.value })}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
            <Field label="Criteria type">
              <Select
                value={value.criteriaType}
                onValueChange={(v) =>
                  setValue({
                    ...value,
                    criteriaType: v as CriteriaType,
                    targetValue: defaultTargetFor(v as CriteriaType),
                  })
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
            <Field label="Weight">
              <WeightPicker value={value.weight} onChange={(weight) => setValue({ ...value, weight })} />
            </Field>
          </div>
          <TargetValueInput
            id="objective-dialog"
            criteria={value.criteriaType}
            value={value.targetValue}
            onChange={(targetValue) => setValue({ ...value, targetValue })}
            error={targetError}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={save.pending}>
            {save.pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {value.id ? "Save changes" : "Add objective"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
