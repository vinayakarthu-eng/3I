import { DrillWizard } from "@/components/drills/wizard/drill-wizard";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { newKey, toLocalInputValue, type DrillFormValues } from "@/lib/drill-form";
import { getDrill, listOrgUsers } from "@/lib/queries";
import type { Sector } from "@drillforce/shared";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { id: string } };

export const metadata: Metadata = { title: "Edit Drill" };

export default async function EditDrillPage({ params }: Props) {
  const { org } = await getCurrentUser();
  const [drill, orgUsers] = await Promise.all([getDrill(org.id, params.id), listOrgUsers(org.id)]);
  if (!drill) notFound();

  const initialValues: DrillFormValues = {
    name: drill.name,
    type: drill.type,
    sector: (drill.config.sector as Sector | undefined) ?? org.sector,
    description: drill.description ?? "",
    // Formatted in the server's timezone. Fine while server and browser share a
    // machine; revisit (e.g. store a user timezone) before deploying.
    scheduledAt: toLocalInputValue(drill.scheduledAt),
    scenario: drill.scenario ?? null,
    templateId: (drill.config.templateId as string | undefined) ?? null,
    objectives: drill.objectives.map((o) => ({
      key: newKey(),
      id: o.id,
      description: o.description,
      criteriaType: o.criteriaType,
      targetValue: (o.targetValue as Record<string, unknown>) ?? {},
      weight: o.weight,
    })),
    participants: drill.participants.map((p) => ({
      key: newKey(),
      userId: p.userId,
      email: p.user.email,
      name: p.user.name,
      role: p.role,
    })),
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
        <Link href={`/drills/${drill.id}`}>
          <ArrowLeft className="h-4 w-4" />
          Back to drill
        </Link>
      </Button>
      <PageHeader title="Edit Drill" description={drill.name} />
      <DrillWizard mode="edit" drillId={drill.id} initialValues={initialValues} orgUsers={orgUsers} />
    </div>
  );
}
