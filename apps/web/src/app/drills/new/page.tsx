import { PageHeader } from "@/components/layout/page-header";
import { DrillWizard } from "@/components/drills/wizard/drill-wizard";
import { getCurrentUser } from "@/lib/current-user";
import { emptyObjective, newKey, type DrillFormValues } from "@/lib/drill-form";
import { listDrillTemplates, listOrgUsers } from "@/lib/queries";
import type { DrillTemplate } from "@drillforce/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "New Drill" };

export default async function NewDrillPage({
  searchParams,
}: {
  searchParams: { template?: string };
}) {
  const { org } = await getCurrentUser();
  const [orgUsers, templateRows] = await Promise.all([listOrgUsers(org.id), listDrillTemplates()]);

  // Map DB rows to the shared template shape the wizard understands.
  const templates: DrillTemplate[] = templateRows.map((t) => ({
    id: t.id,
    name: t.name,
    sector: t.sector as DrillTemplate["sector"],
    type: t.type,
    description: t.description,
    estimatedDurationMinutes: t.estimatedDurationMinutes,
    difficulty: t.difficulty,
    basedOn: t.basedOn ?? "",
    isQuickDrill: t.isQuickDrill,
    competencyAreasTested: t.competencyAreasTested,
    scenario: t.scenario,
    objectives: t.objectives,
  }));

  const preset = searchParams.template
    ? templates.find((t) => t.id === searchParams.template)
    : undefined;

  const initialValues: DrillFormValues = {
    name: preset?.name ?? "",
    type: preset?.type ?? "",
    sector: preset && preset.sector !== "general" ? (preset.sector as DrillFormValues["sector"]) : org.sector,
    description: preset?.description ?? "",
    scheduledAt: "",
    scenario: preset?.scenario ?? null,
    templateId: preset?.id ?? null,
    objectives: preset
      ? preset.objectives.map((o) => ({
          key: newKey(),
          description: o.description,
          criteriaType: o.criteriaType,
          targetValue: structuredClone(o.targetValue),
          weight: o.weight,
        }))
      : [emptyObjective()],
    participants: [],
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="New Drill"
        description={preset ? `Starting from “${preset.name}”.` : "Set up a drill in three steps."}
      />
      <DrillWizard mode="create" initialValues={initialValues} orgUsers={orgUsers} templates={templates} />
    </div>
  );
}
