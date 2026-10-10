"use client";

import { approveAar, createActionItem, generateReport } from "@/app/drills/[id]/aar/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAction } from "@/hooks/use-action";
import { useToast } from "@/hooks/use-toast";
import { formatDate, formatDateTime, formatScore, scoreColor } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AarContent } from "@drillforce/report-generator";
import { ACTION_STATUSES, type ActionSeverity, type ActionStatus } from "@drillforce/shared";
import {
  BadgeCheck,
  ChevronDown,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

export interface AarReportProps {
  id: string;
  content: AarContent & { meta: { fallbackReason?: string } };
  generatedBy: string | null;
  generatedAt: Date;
  approvedAt: Date | null;
  approverName: string | null;
}

export const SEVERITY_STYLES: Record<ActionSeverity, string> = {
  P1: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  P2: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  P3: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  P4: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

export function SeverityBadge({ severity }: { severity: ActionSeverity }) {
  return (
    <Badge variant="outline" className={cn("border-transparent font-semibold", SEVERITY_STYLES[severity])}>
      {severity}
    </Badge>
  );
}

const STATUS_LABEL: Record<ActionStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  completed: "Completed",
  verified: "Verified",
  deferred: "Deferred",
};

export function AarEmptyState({ drillId, canGenerate }: { drillId: string; canGenerate: boolean }) {
  const gen = useAction();
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
      <FileText className="mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="font-medium">No After-Action Report yet</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        {canGenerate
          ? "Reports are generated automatically when a drill reaches Debriefing. You can also generate one now; with Claude this can take a minute or two."
          : "An AAR can be generated once the drill has ended."}
      </p>
      {canGenerate && (
        <Button
          className="mt-6"
          disabled={gen.pending}
          onClick={() => gen.run(() => generateReport(drillId), { success: "After-Action Report generated" })}
        >
          {gen.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          {gen.pending ? "Generating…" : "Generate AAR"}
        </Button>
      )}
    </div>
  );
}

export function AarView({
  drillId,
  report,
  actionStatuses,
}: {
  drillId: string;
  report: AarReportProps;
  actionStatuses: Record<string, ActionStatus>;
}) {
  const { content } = report;
  const ref = useRef<HTMLDivElement>(null);
  const regen = useAction();
  const approve = useAction();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  async function exportPdf() {
    if (!ref.current) return;
    setExporting(true);
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas"), import("jspdf")]);
      const canvas = await html2canvas(ref.current, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        onclone: (doc) => {
          // Render the clone in light mode with every section expanded and controls hidden.
          doc.documentElement.classList.remove("dark");
          doc.querySelectorAll("[data-aar-body]").forEach((el) => el.classList.remove("hidden"));
          doc.querySelectorAll(".no-print").forEach((el) => ((el as HTMLElement).style.display = "none"));
        },
      });
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const margin = 10;
      const pageW = pdf.internal.pageSize.getWidth() - margin * 2;
      const pageH = pdf.internal.pageSize.getHeight() - margin * 2;
      // Slice the tall canvas into page-sized chunks.
      const pxPerMm = canvas.width / pageW;
      const slicePx = Math.floor(pageH * pxPerMm);
      for (let y = 0, page = 0; y < canvas.height; y += slicePx, page++) {
        const slice = document.createElement("canvas");
        slice.width = canvas.width;
        slice.height = Math.min(slicePx, canvas.height - y);
        slice.getContext("2d")!.drawImage(canvas, 0, y, canvas.width, slice.height, 0, 0, canvas.width, slice.height);
        if (page > 0) pdf.addPage();
        pdf.addImage(slice.toDataURL("image/jpeg", 0.85), "JPEG", margin, margin, pageW, slice.height / pxPerMm);
      }
      pdf.save(`AAR - ${content.meta.drillName}.pdf`);
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "PDF export failed", description: "Try Print → Save as PDF instead." });
    } finally {
      setExporting(false);
    }
  }

  const generatorLabel =
    content.meta.generator === "claude" ? `Claude (${content.meta.model ?? report.generatedBy})` : "Template";

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center justify-end gap-2 print:hidden">
        <Button
          variant="outline"
          size="sm"
          disabled={regen.pending}
          onClick={() => regen.run(() => generateReport(drillId), { success: "New AAR version generated" })}
        >
          {regen.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {regen.pending ? "Regenerating…" : "Regenerate"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="h-4 w-4" />
          Print
        </Button>
        <Button variant="outline" size="sm" onClick={exportPdf} disabled={exporting}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Export PDF
        </Button>
        {report.approvedAt ? null : (
          <Button
            size="sm"
            disabled={approve.pending}
            onClick={() => approve.run(() => approveAar(report.id), { success: "Report approved" })}
          >
            {approve.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />}
            Approve Report
          </Button>
        )}
      </div>

      <div ref={ref} className="space-y-4 bg-background">
        <Card>
          <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">After-Action Report</p>
              <h2 className="text-xl font-semibold tracking-tight">{content.meta.drillName}</h2>
              <p className="text-sm text-muted-foreground">
                Generated {formatDateTime(report.generatedAt)} · {generatorLabel}
                {content.meta.durationMinutes != null && <> · {content.meta.durationMinutes} min drill</>}
              </p>
              {report.approvedAt ? (
                <Badge className="border-transparent bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300">
                  <BadgeCheck className="mr-1 h-3.5 w-3.5" />
                  Approved by {report.approverName ?? "unknown"} on {formatDate(report.approvedAt)}
                </Badge>
              ) : (
                <Badge variant="outline">Draft — awaiting approval</Badge>
              )}
              {content.meta.fallbackReason && (
                <p className="no-print text-xs text-muted-foreground print:hidden">
                  Claude couldn’t generate this version ({content.meta.fallbackReason}); the template generator was used.
                </p>
              )}
            </div>
            <div className="text-left sm:text-right">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Composite score</p>
              <p className={cn("text-4xl font-semibold tabular-nums", scoreColor(content.meta.compositeScore))}>
                {formatScore(content.meta.compositeScore)}
              </p>
              {content.meta.passed != null && (
                <p className={cn("text-sm font-semibold", content.meta.passed ? "text-green-600" : "text-red-600")}>
                  {content.meta.passed ? "PASS" : "FAIL"} · threshold {content.meta.passThreshold}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Section title="Executive Summary">
          <div className="space-y-3 text-sm leading-relaxed">
            {content.executiveSummary.split(/\n\s*\n/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </Section>

        <Section title="Event Timeline" count={content.timeline.length}>
          <ol className="relative space-y-4 border-l pl-6">
            {content.timeline.map((t, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
                <div className="flex flex-wrap items-baseline gap-2 text-sm">
                  <span className="font-mono text-xs text-muted-foreground">T+{t.tPlusMinutes}m</span>
                  <span className="font-medium">{t.actor}</span>
                </div>
                <p className="text-sm">{t.event}</p>
                <p className="text-sm italic text-muted-foreground">{t.annotation}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="Objectives Analysis" count={content.objectivesAnalysis.length}>
          <div className="space-y-3">
            {content.objectivesAnalysis.map((o) => (
              <div key={o.objectiveId} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{o.objective}</p>
                  <span className={cn("text-xl font-semibold tabular-nums", scoreColor(o.score))}>{formatScore(o.score)}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">Evidence: </span>
                  {o.evidence}
                </p>
                <p className="mt-1 text-sm">
                  <span className="font-medium">Assessment: </span>
                  {o.assessment}
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Strengths" count={content.strengths.length}>
          <ul className="space-y-3">
            {content.strengths.map((s, i) => (
              <li key={i} className="text-sm">
                <p className="font-medium">
                  {s.tPlusMinutes != null && (
                    <span className="mr-2 font-mono text-xs text-muted-foreground">T+{s.tPlusMinutes}m</span>
                  )}
                  {s.title}
                </p>
                <p className="text-muted-foreground">{s.detail}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Areas for Improvement" count={content.improvements.length}>
          {content.improvements.length ? (
            <ul className="space-y-3">
              {content.improvements.map((s, i) => (
                <li key={i} className="flex gap-3 text-sm">
                  <SeverityBadge severity={s.severity} />
                  <div>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-muted-foreground">{s.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No significant gaps were identified.</p>
          )}
        </Section>

        <Section title="Root Cause Analysis" count={content.rootCauses.length}>
          {content.rootCauses.length ? (
            <ul className="space-y-3">
              {content.rootCauses.map((r, i) => (
                <li key={i} className="text-sm">
                  <p className="font-medium">{r.gap}</p>
                  <p className="text-muted-foreground">{r.cause}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No root causes recorded.</p>
          )}
        </Section>

        <Section title="Corrective Actions" count={content.correctiveActions.length}>
          {content.correctiveActions.length ? (
            <div className="grid gap-3 md:grid-cols-2">
              {content.correctiveActions.map((a, i) => (
                <CorrectiveActionCard
                  key={i}
                  index={i}
                  reportId={report.id}
                  action={a}
                  actionId={content.meta.actionIds?.[String(i)]}
                  status={actionStatuses[content.meta.actionIds?.[String(i)] ?? ""]}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No corrective actions were proposed.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="break-inside-avoid-page">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <h3 className="font-semibold">
          {title}
          {count != null && <span className="ml-2 text-sm font-normal text-muted-foreground">{count}</span>}
        </h3>
        <ChevronDown
          className={cn("no-print h-4 w-4 text-muted-foreground transition-transform print:hidden", open && "rotate-180")}
        />
      </button>
      <div data-aar-body className={cn("px-6 pb-6", !open && "hidden print:block")}>
        {children}
      </div>
    </Card>
  );
}

function CorrectiveActionCard({
  index,
  reportId,
  action,
  actionId,
  status,
}: {
  index: number;
  reportId: string;
  action: AarContent["correctiveActions"][number];
  actionId?: string;
  status?: ActionStatus;
}) {
  const create = useAction();
  return (
    <div className="flex flex-col rounded-lg border p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <SeverityBadge severity={action.severity} />
        <Badge variant="secondary" className="font-normal capitalize">
          {action.category}
        </Badge>
        {status && ACTION_STATUSES.includes(status) && (
          <Badge variant="outline" className="font-normal">
            {STATUS_LABEL[status]}
          </Badge>
        )}
      </div>
      <p className="text-sm font-medium">{action.action}</p>
      <p className="mt-1 text-xs text-muted-foreground">Gap: {action.gap}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <dt className="text-muted-foreground">Owner</dt>
          <dd className="font-medium">{action.owner}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Due</dt>
          <dd className="font-medium">in {action.dueInDays} days</dd>
        </div>
        <div className="col-span-2">
          <dt className="text-muted-foreground">Verification</dt>
          <dd>{action.verificationMethod}</dd>
        </div>
      </dl>
      <div className="no-print mt-4 print:hidden">
        {actionId ? (
          <Button asChild size="sm" variant="outline" className="w-full">
            <Link href={`/actions?action=${actionId}`}>
              <ExternalLink className="h-4 w-4" />
              View action item
            </Link>
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            disabled={create.pending}
            onClick={() => create.run(() => createActionItem(reportId, index), { success: "Action item created" })}
          >
            {create.pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create Action Item
          </Button>
        )}
      </div>
    </div>
  );
}
