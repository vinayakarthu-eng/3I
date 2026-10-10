import { PageHeader } from "@/components/layout/page-header";
import { DrillWizard } from "@/components/drills/wizard/drill-wizard";
import { getCurrentUser } from "@/lib/current-user";
import { emptyObjective, type DrillFormValues } from "@/lib/drill-form";
import { listOrgUsers } from "@/lib/queries";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New Drill" };

export default async function NewDrillPage() {
  const { org } = await getCurrentUser();
  const orgUsers = await listOrgUsers(org.id);

  const initialValues: DrillFormValues = {
    name: "",
    type: "",
    sector: org.sector,
    description: "",
    scheduledAt: "",
    scenario: null,
    templateId: null,
    objectives: [emptyObjective()],
    participants: [],
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader title="New Drill" description="Set up a drill in three steps." />
      <DrillWizard mode="create" initialValues={initialValues} orgUsers={orgUsers} />
    </div>
  );
}
