import { DrillsTable } from "@/components/drills/drills-table";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { listDrills } from "@/lib/queries";
import { Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Drills" };

export default async function DrillsPage() {
  const { org } = await getCurrentUser();
  const drills = await listDrills(org.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Drills"
        description="Plan, run, and review exercises across your organization."
        actions={
          <Button asChild>
            <Link href="/drills/new">
              <Plus className="h-4 w-4" />
              New Drill
            </Link>
          </Button>
        }
      />
      <DrillsTable drills={drills} filterable />
    </div>
  );
}
