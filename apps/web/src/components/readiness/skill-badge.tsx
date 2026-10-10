import { cn } from "@/lib/utils";
import { skillLevel } from "@drillforce/shared";

const BADGE_CLASSES: Record<string, string> = {
  gold: "border-amber-300/60 bg-amber-100 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950 dark:text-amber-300",
  purple: "border-purple-300/60 bg-purple-100 text-purple-800 dark:border-purple-800/60 dark:bg-purple-950 dark:text-purple-300",
  green: "border-green-300/60 bg-green-100 text-green-800 dark:border-green-800/60 dark:bg-green-950 dark:text-green-300",
  blue: "border-blue-300/60 bg-blue-100 text-blue-800 dark:border-blue-800/60 dark:bg-blue-950 dark:text-blue-300",
  gray: "border-zinc-300/60 bg-zinc-100 text-zinc-700 dark:border-zinc-700/60 dark:bg-zinc-800 dark:text-zinc-300",
};

export function SkillBadge({ score, className }: { score: number | null; className?: string }) {
  if (score == null) {
    return <span className={cn("text-xs text-muted-foreground", className)}>Not assessed</span>;
  }
  const level = skillLevel(score);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        BADGE_CLASSES[level.badge],
        className,
      )}
    >
      {level.label}
    </span>
  );
}

/** Shared 6-color palette for competency line charts (5 chart vars + primary). */
export const COMPETENCY_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

/** Heatmap cell background class per score band. */
export const BAND_CLASSES: Record<string, string> = {
  none: "bg-muted text-muted-foreground",
  red: "bg-red-500/15 text-red-700 dark:text-red-300",
  orange: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  yellow: "bg-yellow-500/20 text-yellow-700 dark:text-yellow-300",
  green: "bg-green-500/15 text-green-700 dark:text-green-300",
  emerald: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
};
