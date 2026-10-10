import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { Settings } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" />
      <ComingSoon icon={Settings} description="Organization, member, and integration settings will live here." />
    </div>
  );
}
