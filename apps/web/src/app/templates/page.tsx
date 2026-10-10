import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { LayoutTemplate } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Templates" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Templates" />
      <ComingSoon icon={LayoutTemplate} description="Reusable drill templates and lifecycle configurations will live here." />
    </div>
  );
}
