import type { ObjectiveTarget } from "@drillforce/shared";

/** Renders an objective's target_value according to its shape. */
export function ObjectiveTargetView({ target }: { target: ObjectiveTarget | null }) {
  if (!target || Object.keys(target).length === 0) {
    return <span className="text-sm text-muted-foreground">No target set</span>;
  }

  if ("max_minutes" in target && typeof target.max_minutes === "number") {
    return (
      <span className="text-sm">
        Within <span className="font-medium">{target.max_minutes} minutes</span>
      </span>
    );
  }

  const list =
    ("checklist" in target && Array.isArray(target.checklist) && target.checklist) ||
    ("stakeholders" in target && Array.isArray(target.stakeholders) && target.stakeholders) ||
    null;
  if (list) {
    return (
      <ul className="list-inside list-disc space-y-0.5 text-sm">
        {(list as string[]).map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    );
  }

  if ("rubric" in target && Array.isArray(target.rubric)) {
    return (
      <ul className="space-y-0.5 text-sm">
        {(target.rubric as { dimension: string; scale: number }[]).map((r) => (
          <li key={r.dimension}>
            {r.dimension} <span className="text-muted-foreground">(1–{r.scale})</span>
          </li>
        ))}
      </ul>
    );
  }

  if ("expected_outcome" in target && typeof target.expected_outcome === "string") {
    return <span className="text-sm">{target.expected_outcome}</span>;
  }

  return (
    <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
      {JSON.stringify(target, null, 2)}
    </pre>
  );
}
