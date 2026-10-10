import { PageHeader } from "@/components/layout/page-header";
import { ScenarioLibrary } from "@/components/scenarios/scenario-library";
import { listDrillTemplates } from "@/lib/queries";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Scenarios" };

export default async function ScenariosPage() {
  const templates = await listDrillTemplates();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scenario Library"
        description="Expert-designed scenarios and single-competency quick drills. Pick one to start a drill."
      />
      <ScenarioLibrary templates={templates} />
    </div>
  );
}
