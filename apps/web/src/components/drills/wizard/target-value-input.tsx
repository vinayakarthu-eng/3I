"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CriteriaType } from "@drillforce/shared";
import { Plus, X } from "lucide-react";
import { Field } from "./field";
import { StringListInput } from "./string-list-input";

type Target = Record<string, unknown>;

/** Renders the right target editor for an objective's criteria type. */
export function TargetValueInput({
  id,
  criteria,
  value,
  onChange,
  error,
}: {
  id: string;
  criteria: CriteriaType;
  value: Target;
  onChange: (value: Target) => void;
  error?: string;
}) {
  switch (criteria) {
    case "time_to_action":
      return (
        <Field label="Max minutes" htmlFor={`${id}-minutes`} error={error} required>
          <Input
            id={`${id}-minutes`}
            type="number"
            min={1}
            className="w-32"
            value={(value.max_minutes as number | string | undefined) ?? ""}
            onChange={(e) =>
              onChange({ max_minutes: e.target.value === "" ? "" : Number(e.target.value) })
            }
          />
        </Field>
      );

    case "completeness":
      return (
        <Field label="Checklist" error={error} required hint="Steps responders must complete.">
          <StringListInput
            items={(value.checklist as string[]) ?? []}
            onChange={(checklist) => onChange({ checklist })}
            placeholder="e.g. Promote replica"
            addLabel="Add item"
          />
        </Field>
      );

    case "coordination":
      return (
        <Field label="Stakeholders" error={error} required hint="People or teams who must be contacted.">
          <StringListInput
            items={(value.stakeholders as string[]) ?? []}
            onChange={(stakeholders) => onChange({ stakeholders })}
            placeholder="e.g. VP Engineering"
            addLabel="Add stakeholder"
          />
        </Field>
      );

    case "accuracy":
      return (
        <Field label="Expected outcome" htmlFor={`${id}-outcome`} error={error} required>
          <Textarea
            id={`${id}-outcome`}
            rows={2}
            placeholder="What does a correct response look like?"
            value={(value.expected_outcome as string) ?? ""}
            onChange={(e) => onChange({ expected_outcome: e.target.value })}
          />
        </Field>
      );

    case "quality": {
      const rubric = ((value.rubric as { dimension: string; scale: number }[]) ?? []).length
        ? (value.rubric as { dimension: string; scale: number }[])
        : [{ dimension: "", scale: 5 }];
      const set = (next: typeof rubric) => onChange({ rubric: next });
      return (
        <Field label="Rubric dimensions" error={error} required hint="Evaluators rate each dimension.">
          <div className="space-y-2">
            {rubric.map((dim, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  placeholder="e.g. Clarity"
                  value={dim.dimension}
                  onChange={(e) =>
                    set(rubric.map((d, j) => (j === i ? { ...d, dimension: e.target.value } : d)))
                  }
                />
                <Select
                  value={String(dim.scale)}
                  onValueChange={(v) =>
                    set(rubric.map((d, j) => (j === i ? { ...d, scale: Number(v) } : d)))
                  }
                >
                  <SelectTrigger className="w-28" aria-label="Scale">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[3, 4, 5, 10].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        1–{n}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Remove dimension"
                  disabled={rubric.length === 1}
                  onClick={() => set(rubric.filter((_, j) => j !== i))}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => set([...rubric, { dimension: "", scale: 5 }])}
            >
              <Plus className="h-4 w-4" />
              Add dimension
            </Button>
          </div>
        </Field>
      );
    }
  }
}
