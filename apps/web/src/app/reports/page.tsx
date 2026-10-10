import { DrillTypeBadge } from "@/components/drills/drill-badges";
import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getCurrentUser } from "@/lib/current-user";
import { formatDateTime, formatScore, scoreColor } from "@/lib/format";
import { listReports } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage() {
  const { org } = await getCurrentUser();
  const reports = await listReports(org.id);

  return (
    <div className="space-y-6">
      <PageHeader title="Reports" description="After-Action Reports for your organization’s drills." />
      {reports.length === 0 ? (
        <ComingSoon
          icon={FileText}
          title="No reports yet"
          description="An After-Action Report is generated when a drill reaches Debriefing."
        />
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Drill</TableHead>
                <TableHead className="hidden sm:table-cell">Type</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Generated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <Link href={`/drills/${r.drillId}/aar`} className="hover:underline">
                      {r.drillName}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <DrillTypeBadge type={r.drillType} />
                  </TableCell>
                  <TableCell className={cn("font-semibold tabular-nums", scoreColor(r.composite))}>
                    {formatScore(r.composite)}
                    {r.passed != null && (
                      <span className="ml-2 text-xs font-medium text-muted-foreground">{r.passed ? "PASS" : "FAIL"}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {r.approvedAt ? (
                      <Badge className="border-transparent bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-950 dark:text-green-300">
                        Approved
                      </Badge>
                    ) : (
                      <Badge variant="outline">Draft</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                    {formatDateTime(r.generatedAt)}
                    <span className="block text-xs">{r.generatedBy === "template" ? "Template" : r.generatedBy}</span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
