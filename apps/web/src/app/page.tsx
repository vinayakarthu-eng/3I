import { DrillsTable } from "@/components/drills/drills-table";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/current-user";
import { formatScore, scoreColor } from "@/lib/format";
import { getDashboardStats, listDrills } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { Activity, ArrowRight, ClipboardList, ListTodo, Target } from "lucide-react";
import Link from "next/link";

export default async function DashboardPage() {
  const { user, org } = await getCurrentUser();
  const [stats, recent] = await Promise.all([getDashboardStats(org.id), listDrills(org.id, 5)]);
  const firstName = user.name.split(" ")[0];

  const cards = [
    { label: "Total Drills", value: String(stats.totalDrills), icon: ClipboardList },
    { label: "Active Drills", value: String(stats.activeDrills), icon: Activity },
    {
      label: "Avg Score",
      value: formatScore(stats.avgScore),
      icon: Target,
      className: scoreColor(stats.avgScore),
    },
    { label: "Open Actions", value: String(stats.openActions), icon: ListTodo },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`Here’s what’s happening with drills at ${org.name}.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map(({ label, value, icon: Icon, className }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="text-sm font-medium">{label}</CardDescription>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className={cn("text-3xl font-semibold tabular-nums", className)}>{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle>Recent drills</CardTitle>
            <CardDescription>The five most recent drills in your organization.</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link href="/drills">
              View all <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          <DrillsTable drills={recent} />
        </CardContent>
      </Card>
    </div>
  );
}
