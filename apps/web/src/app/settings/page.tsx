import { PageHeader } from "@/components/layout/page-header";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";
import { SettingsForm, type SettingsValues } from "@/components/settings/settings-form";
import { getCurrentUser } from "@/lib/current-user";
import { listCompetencyAreas } from "@/lib/queries";
import { listApiKeys } from "@drillforce/core";
import { DEFAULT_PASS_THRESHOLD, type Sector } from "@drillforce/shared";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const { user, org } = await getCurrentUser();
  const competencies = await listCompetencyAreas();
  const apiKeys = await listApiKeys({ orgId: org.id, userId: user.id });
  const config = org.config as Record<string, unknown>;
  const notifications = (config.notifications as Record<string, boolean>) ?? {};
  const weights = (config.competencyWeights as Record<string, number>) ?? {};

  const initial: SettingsValues = {
    name: org.name,
    sector: org.sector as Sector,
    passThreshold: Number(config.passThreshold ?? DEFAULT_PASS_THRESHOLD),
    defaultDurationMinutes: Number(config.defaultDurationMinutes ?? 45),
    notifications: {
      drillScheduled: notifications.drillScheduled ?? true,
      drillCompleted: notifications.drillCompleted ?? true,
      actionAssigned: notifications.actionAssigned ?? true,
      actionOverdue: notifications.actionOverdue ?? true,
      certificationEarned: notifications.certificationEarned ?? true,
    },
    competencyWeights: Object.fromEntries(competencies.map((c) => [c.name, weights[c.name] ?? 1])),
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Configure your organization, scoring, and notifications." />
      <SettingsForm initial={initial} competencies={competencies.map((c) => c.name)} />
      <ApiKeysManager keys={apiKeys} />
    </div>
  );
}
