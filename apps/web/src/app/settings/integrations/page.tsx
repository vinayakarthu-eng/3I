import { PageHeader } from "@/components/layout/page-header";
import { WebhooksManager } from "@/components/integrations/webhooks-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { listRecentDeliveries, listWebhooks } from "@/lib/webhooks";
import { cn } from "@/lib/utils";
import {
  Activity,
  AlertCircle,
  BellRing,
  Database,
  GitBranch,
  LineChart,
  MessageSquare,
  Plug,
  Siren,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Integrations" };

interface IntegrationCard {
  name: string;
  description: string;
  icon: LucideIcon;
  status: "connected" | "not_connected" | "coming_soon";
  detail?: string;
}

export default async function IntegrationsPage() {
  const { org } = await getCurrentUser();
  const slackConnected = Boolean(process.env.SLACK_BOT_TOKEN);
  const slackWorkspace = process.env.SLACK_WORKSPACE ?? null;

  const [webhooks, deliveries] = await Promise.all([
    listWebhooks(org.id),
    listRecentDeliveries(org.id),
  ]);

  const integrations: IntegrationCard[] = [
    {
      name: "Slack",
      description: "Run the Incident Commander bot and relay drill comms into Slack.",
      icon: MessageSquare,
      status: slackConnected ? "connected" : "not_connected",
      detail: slackConnected ? (slackWorkspace ?? "Bot token configured") : undefined,
    },
    { name: "Microsoft Teams", description: "Bring drills into Teams channels.", icon: MessageSquare, status: "coming_soon" },
    { name: "PagerDuty", description: "Import on-call schedules and trigger test pages during drills.", icon: BellRing, status: "not_connected" },
    { name: "Rootly", description: "Sync incidents and import post-mortems as drill scenarios.", icon: Siren, status: "not_connected" },
    { name: "Datadog", description: "Push simulated metrics during drills (signal injection).", icon: Activity, status: "not_connected" },
    { name: "Grafana", description: "Push simulated dashboards during drills.", icon: LineChart, status: "not_connected" },
    { name: "Jira", description: "Create improvement-action tickets automatically.", icon: GitBranch, status: "not_connected" },
    { name: "Opsgenie", description: "Import on-call schedules and trigger test alerts.", icon: AlertCircle, status: "not_connected" },
    { name: "Statuspage", description: "Practice status-page updates during drills.", icon: Database, status: "not_connected" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="Integrations"
        description="Connect DrillForce to your incident toolchain."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/settings">Back to Settings</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {integrations.map((it) => (
          <Card key={it.name} className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-muted">
                  <it.icon className="h-5 w-5" />
                </span>
                <StatusBadge status={it.status} />
              </div>
              <CardTitle className="pt-2 text-base">{it.name}</CardTitle>
              <CardDescription>{it.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto">
              {it.name === "Slack" ? (
                <div className="space-y-2">
                  {it.detail && <p className="text-xs text-muted-foreground">{it.detail}</p>}
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <a
                      href="https://github.com/your-org/drillforce/tree/main/apps/slack-bot#readme"
                      target="_blank"
                      rel="noreferrer"
                    >
                      {it.status === "connected" ? "Manage" : "Set up Slack bot"}
                    </a>
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" disabled>
                  {it.status === "coming_soon" ? "Coming soon" : "Configure"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Plug className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-lg font-semibold tracking-tight">Webhooks</h2>
      </div>
      <WebhooksManager
        webhooks={webhooks.map((w) => ({
          id: w.id,
          name: w.name,
          url: w.url,
          events: w.events,
          secret: w.secret,
          active: w.active,
        }))}
        deliveries={deliveries}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: IntegrationCard["status"] }) {
  if (status === "connected") {
    return (
      <Badge className="border-transparent bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300">
        Connected
      </Badge>
    );
  }
  if (status === "coming_soon") {
    return <Badge variant="secondary">Coming soon</Badge>;
  }
  return (
    <Badge variant="outline" className={cn("text-muted-foreground")}>
      Not connected
    </Badge>
  );
}
