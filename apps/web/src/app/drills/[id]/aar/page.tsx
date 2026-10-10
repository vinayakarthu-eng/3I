import { AarEmptyState, AarView, type AarReportProps } from "@/components/drills/aar/aar-view";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { getDrill } from "@/lib/queries";
import { db, improvementActions, inArray, users, eq } from "@drillforce/db";
import { latestAar, type AarContent } from "@drillforce/report-generator";
import type { ActionStatus } from "@drillforce/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill ? `AAR · ${drill.name}` : "Report not found" };
}

export default async function AarPage({ params }: Props) {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  if (!drill) notFound();

  const report = await latestAar(drill.id);
  let reportProps: AarReportProps | null = null;
  const actionStatuses: Record<string, ActionStatus> = {};

  if (report) {
    const content = report.content as unknown as AarReportProps["content"];
    const actionIds = Object.values((content as AarContent).meta.actionIds ?? {});
    if (actionIds.length) {
      const rows = await db
        .select({ id: improvementActions.id, status: improvementActions.status })
        .from(improvementActions)
        .where(inArray(improvementActions.id, actionIds));
      for (const r of rows) actionStatuses[r.id] = r.status;
    }
    const [approver] = report.approvedBy
      ? await db.select({ name: users.name }).from(users).where(eq(users.id, report.approvedBy))
      : [];
    reportProps = {
      id: report.id,
      content,
      generatedBy: report.generatedBy,
      generatedAt: report.generatedAt,
      approvedAt: report.approvedAt,
      approverName: approver?.name ?? null,
    };
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground print:hidden">
        <Link href={`/drills/${drill.id}?tab=scores`}>
          <ArrowLeft className="h-4 w-4" />
          Back to {drill.name}
        </Link>
      </Button>
      {reportProps ? (
        <AarView drillId={drill.id} report={reportProps} actionStatuses={actionStatuses} />
      ) : (
        <AarEmptyState drillId={drill.id} canGenerate={["scoring", "debriefing", "completed"].includes(drill.status)} />
      )}
    </div>
  );
}
