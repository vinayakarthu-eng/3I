import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatScore, scoreColor } from "@/lib/format";
import { getDrill } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { CheckCircle2, FileText, Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill ? `Complete · ${drill.name}` : "Drill not found" };
}

function elapsed(start: Date | null, end: Date | null) {
  if (!start || !end) return "—";
  const secs = Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export default async function CompletePage({ params }: Props) {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  if (!drill) notFound();

  // Latest score per objective.
  const latest = new Map<string, number>();
  for (const s of drill.scores) {
    if (s.objectiveId && !latest.has(s.objectiveId) && s.normalizedScore != null) {
      latest.set(s.objectiveId, Number(s.normalizedScore));
    }
  }
  const composite = drill.composite ? Number(drill.composite.compositeScore) : drill.score;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950 dark:text-green-400">
          <CheckCircle2 className="h-8 w-8" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Drill complete</h1>
          <p className="text-sm text-muted-foreground">
            {drill.name} has ended and auto-scoring has run.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Elapsed</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">
              {elapsed(drill.startedAt, drill.endedAt)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Events</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold tabular-nums">{drill.events.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardDescription>Score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className={cn("text-2xl font-semibold tabular-nums", scoreColor(composite))}>
              {formatScore(composite)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Initial auto-scores</CardTitle>
          <CardDescription>
            Evaluator scoring may still be pending for quality/accuracy objectives.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {drill.objectives.map((o) => {
            const score = latest.get(o.id);
            return (
              <div key={o.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate">{o.description}</span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    score == null ? "text-muted-foreground" : scoreColor(score),
                  )}
                >
                  {score == null ? "pending" : Math.round(score)}
                </span>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href={`/drills/${drill.id}/report`}>
            <FileText className="h-4 w-4" />
            View Full Report
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/drills/${drill.id}?tab=scores`}>Scoring</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/drills">
            <Home className="h-4 w-4" />
            All drills
          </Link>
        </Button>
      </div>
    </div>
  );
}
