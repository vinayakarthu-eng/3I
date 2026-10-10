import {
  CriteriaBadge,
  DrillStatusBadge,
  DrillTypeBadge,
  ParticipantRoleBadge,
} from "@/components/drills/drill-badges";
import { ObjectiveTargetView } from "@/components/drills/objective-target";
import { ComingSoon } from "@/components/layout/coming-soon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getCurrentUser } from "@/lib/current-user";
import { formatDate, formatDateTime, formatScore, initials, scoreColor } from "@/lib/format";
import { getDrill } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { SECTOR_LABELS, type Sector } from "@drillforce/shared";
import { ArrowLeft, BarChart3, Radio } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

type Props = { params: { id: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  return { title: drill?.name ?? "Drill not found" };
}

export default async function DrillDetailPage({ params }: Props) {
  const { org } = await getCurrentUser();
  const drill = await getDrill(org.id, params.id);
  if (!drill) notFound();

  const scenario = drill.scenario ?? {};

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
        <Link href="/drills">
          <ArrowLeft className="h-4 w-4" />
          All drills
        </Link>
      </Button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">{drill.name}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <DrillTypeBadge type={drill.type} />
            <DrillStatusBadge status={drill.status} />
          </div>
        </div>
        {drill.score != null && (
          <div className="text-right">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Composite score</div>
            <div className={cn("text-3xl font-semibold tabular-nums", scoreColor(drill.score))}>
              {formatScore(drill.score)}
            </div>
          </div>
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <div className="overflow-x-auto">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="objectives">Objectives ({drill.objectives.length})</TabsTrigger>
            <TabsTrigger value="participants">Participants ({drill.participants.length})</TabsTrigger>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="scores">Scores</TabsTrigger>
          </TabsList>
        </div>

        {/* Overview */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Description</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                  {drill.description || "No description provided."}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="space-y-3 text-sm">
                  <InfoRow label="Scheduled">{formatDateTime(drill.scheduledAt)}</InfoRow>
                  {drill.startedAt && <InfoRow label="Started">{formatDateTime(drill.startedAt)}</InfoRow>}
                  {drill.endedAt && <InfoRow label="Ended">{formatDateTime(drill.endedAt)}</InfoRow>}
                  <InfoRow label="Sector">{SECTOR_LABELS[(drill.config.sector as Sector | undefined) ?? drill.organization.sector]}</InfoRow>
                  <InfoRow label="Created by">{drill.creator?.name ?? "—"}</InfoRow>
                  <InfoRow label="Created">{formatDate(drill.createdAt)}</InfoRow>
                </dl>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Scenario</CardTitle>
              {scenario.summary && <CardDescription>{scenario.summary}</CardDescription>}
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-2">
              <div>
                <h4 className="mb-2 text-sm font-medium">Injects</h4>
                {scenario.injects?.length ? (
                  <ol className="space-y-2">
                    {scenario.injects.map((inject, i) => (
                      <li key={i} className="flex gap-3 text-sm">
                        <span className="w-14 shrink-0 font-mono text-xs leading-5 text-muted-foreground">
                          T+{inject.at_minute}m
                        </span>
                        <span>{inject.description}</span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-muted-foreground">No injects defined.</p>
                )}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-medium">Expected actions</h4>
                {scenario.expected_actions?.length ? (
                  <ul className="list-inside list-disc space-y-1 text-sm">
                    {scenario.expected_actions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">No expected actions defined.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Objectives */}
        <TabsContent value="objectives">
          {drill.objectives.length === 0 ? (
            <ComingSoon title="No objectives yet" description="Objectives define how this drill is scored." />
          ) : (
            <div className="space-y-3">
              {drill.objectives.map((o, i) => (
                <Card key={o.id}>
                  <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                        <CriteriaBadge criteria={o.criteriaType} />
                      </div>
                      <p className="font-medium">{o.description}</p>
                      <div className="text-muted-foreground">
                        <ObjectiveTargetView target={o.targetValue} />
                      </div>
                    </div>
                    <div className="shrink-0 text-sm text-muted-foreground">
                      Weight <span className="font-medium text-foreground">{o.weight}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Participants */}
        <TabsContent value="participants">
          {drill.participants.length === 0 ? (
            <ComingSoon title="No participants yet" description="Participants will appear here once invited." />
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden sm:table-cell">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drill.participants.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-xs">{initials(p.user.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{p.user.name}</div>
                            <div className="text-xs text-muted-foreground">{p.user.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ParticipantRoleBadge role={p.role} />
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground sm:table-cell">
                        {p.joinedAt ? formatDateTime(p.joinedAt) : "Not joined"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="events">
          <ComingSoon
            icon={Radio}
            description="A live timeline of messages, actions, and injects will appear here once the Slack bot is connected."
          />
        </TabsContent>

        <TabsContent value="scores">
          <ComingSoon
            icon={BarChart3}
            description="Score breakdowns by objective and criteria are on the way."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}
