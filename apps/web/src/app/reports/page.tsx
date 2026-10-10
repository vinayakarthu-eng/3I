import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { FileBarChart } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Reports" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Reports" />
      <ComingSoon icon={FileBarChart} description="After-action reports and trend analysis will live here." />
    </div>
  );
}
