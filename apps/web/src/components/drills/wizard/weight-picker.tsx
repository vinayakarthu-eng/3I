"use client";

import { cn } from "@/lib/utils";

export function WeightPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Weight">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          onClick={() => onChange(n)}
          className={cn(
            "h-9 w-9 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            n <= value ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
          )}
        >
          {n}
        </button>
      ))}
    </div>
  );
}
