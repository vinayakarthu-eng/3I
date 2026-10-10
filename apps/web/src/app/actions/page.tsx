import { ActionsBoard } from "@/components/actions/actions-board";
import { PageHeader } from "@/components/layout/page-header";
import { getCurrentUser } from "@/lib/current-user";
import { listImprovementActions, listOrgUsers } from "@/lib/queries";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Actions" };

export default async function ActionsPage({ searchParams }: { searchParams: { action?: string } }) {
  const { org } = await getCurrentUser();
  const [rows, orgUsers] = await Promise.all([listImprovementActions(org.id), listOrgUsers(org.id)]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Improvement Actions"
        description="Corrective actions from After-Action Reports, tracked until they’re verified."
      />
      <ActionsBoard
        rows={rows}
        orgUsers={orgUsers.map((u) => ({ id: u.id, name: u.name }))}
        initialActionId={rows.some((r) => r.action.id === searchParams.action) ? searchParams.action : undefined}
      />
    </div>
  );
}
