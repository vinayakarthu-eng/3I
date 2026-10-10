import { ComingSoon } from "@/components/layout/coming-soon";
import { PageHeader } from "@/components/layout/page-header";
import { Wand2 } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New Drill" };

export default function Page() {
  return (
    <div className="space-y-6">
      <PageHeader title="New Drill" />
      <ComingSoon icon={Wand2} description="The drill creation wizard is coming next." />
    </div>
  );
}
