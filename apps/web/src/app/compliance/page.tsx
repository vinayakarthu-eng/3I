import { PrintButton } from "@/components/certifications/print-button";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import { getComplianceOverview } from "@/lib/compliance";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { type ComplianceStatus } from "@drillforce/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Compliance" };

const BADGE: Record<ComplianceStatus, string> = {
  met: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300",
  partial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
  not_met: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};
const LABEL: Record<ComplianceStatus, string> = { met: "Met", partial: "Partial", not_met: "Not met" };

function scoreColor(score: number) {
  if (score >= 80) return "text-green-600 dark:text-green-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

export default async function CompliancePage() {
  const { org } = await getCurrentUser();
  const frameworks = await getComplianceOverview(org.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Compliance"
        description="Drill evidence mapped to regulatory frameworks. Updated automatically as drills are scored."
        actions={<PrintButton label="Export Report" />}
      />

      {frameworks.length === 0 ? (
        <div className="rounded-lg border border-dashed px-6 py-16 text-center text-sm text-muted-foreground">
          No compliance frameworks configured.
        </div>
      ) : (
        <Tabs defaultValue={frameworks[0].id} className="space-y-4">
          <TabsList className="flex-wrap">
            {frameworks.map((fw) => (
              <TabsTrigger key={fw.id} value={fw.id}>
                {fw.name}
              </TabsTrigger>
            ))}
          </TabsList>

          {frameworks.map((fw) => (
            <TabsContent key={fw.id} value={fw.id} className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div className="space-y-1">
                    <CardTitle className="text-base">
                      {fw.name} <span className="text-muted-foreground">· {fw.version}</span>
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">{fw.description}</p>
                  </div>
                  <div className="text-right">
                    <div className={cn("text-3xl font-semibold tabular-nums", scoreColor(fw.score))}>
                      {fw.score}%
                    </div>
                    <p className="text-xs text-muted-foreground">compliance</p>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="-mx-6 overflow-x-auto px-6">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th className="py-2 pr-3 font-medium">Clause</th>
                          <th className="px-3 py-2 font-medium">Requirement</th>
                          <th className="px-3 py-2 font-medium">Status</th>
                          <th className="px-3 py-2 font-medium">Last evidence</th>
                          <th className="px-3 py-2 text-right font-medium">Evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fw.requirements.map((r) => (
                          <tr key={r.id} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-3 font-mono text-xs">{r.clause}</td>
                            <td className="px-3 py-2">{r.description}</td>
                            <td className="px-3 py-2">
                              <Badge className={cn("border-transparent", BADGE[r.status])}>
                                {LABEL[r.status]}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground">
                              {r.lastEvidenceAt ? formatDate(r.lastEvidenceAt) : "—"}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                              {r.evidenceCount}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
