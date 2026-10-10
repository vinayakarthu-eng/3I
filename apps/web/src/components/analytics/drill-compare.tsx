"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { scoreColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useState } from "react";

export interface CompareDrill {
  id: string;
  name: string;
  composite: number;
  ttrMins: number | null;
  events: number;
  byCompetency: Record<string, number>;
}

export function DrillCompare({
  drills,
  competencies,
}: {
  drills: CompareDrill[];
  competencies: string[];
}) {
  const [selected, setSelected] = useState<string[]>(drills.slice(0, 2).map((d) => d.id));

  function toggle(id: string) {
    setSelected((cur) => {
      if (cur.includes(id)) return cur.filter((x) => x !== id);
      if (cur.length >= 3) return [...cur.slice(1), id];
      return [...cur, id];
    });
  }

  const chosen = selected
    .map((id) => drills.find((d) => d.id === id))
    .filter((d): d is CompareDrill => Boolean(d));

  const cell = (v: number | null | undefined) =>
    v == null ? <span className="text-muted-foreground">—</span> : (
      <span className={cn("font-semibold tabular-nums", scoreColor(typeof v === "number" ? v : null))}>
        {Math.round(v)}
      </span>
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Drill comparison</CardTitle>
        <CardDescription>Pick 2–3 drills to compare side by side.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {drills.map((d) => (
            <button
              key={d.id}
              onClick={() => toggle(d.id)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                selected.includes(d.id)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent",
              )}
            >
              {d.name}
            </button>
          ))}
        </div>

        {chosen.length < 2 ? (
          <p className="text-sm text-muted-foreground">Select at least two drills.</p>
        ) : (
          <div className="-mx-6 overflow-x-auto px-6">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">Metric</th>
                  {chosen.map((d) => (
                    <th key={d.id} className="px-3 py-2 font-medium">
                      {d.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-2 pr-3 text-muted-foreground">Composite</td>
                  {chosen.map((d) => (
                    <td key={d.id} className="px-3 py-2">
                      {cell(d.composite)}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-3 text-muted-foreground">Time to resolution</td>
                  {chosen.map((d) => (
                    <td key={d.id} className="px-3 py-2 tabular-nums">
                      {d.ttrMins == null ? "—" : `${d.ttrMins}m`}
                    </td>
                  ))}
                </tr>
                <tr className="border-b">
                  <td className="py-2 pr-3 text-muted-foreground">Events</td>
                  {chosen.map((d) => (
                    <td key={d.id} className="px-3 py-2 tabular-nums">
                      {d.events}
                    </td>
                  ))}
                </tr>
                {competencies.map((c) => (
                  <tr key={c} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-muted-foreground">{c}</td>
                    {chosen.map((d) => (
                      <td key={d.id} className="px-3 py-2">
                        {cell(d.byCompetency[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
