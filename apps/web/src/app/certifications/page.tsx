import { PageHeader } from "@/components/layout/page-header";
import { BAND_CLASSES } from "@/components/readiness/skill-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { getCurrentUser } from "@/lib/current-user";
import { getCertificationsOverview } from "@/lib/certifications";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Award, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Certifications" };

const BADGE_RING: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700 ring-blue-300 dark:bg-blue-950 dark:text-blue-300 dark:ring-blue-800",
  purple: "bg-purple-100 text-purple-700 ring-purple-300 dark:bg-purple-950 dark:text-purple-300 dark:ring-purple-800",
  green: "bg-green-100 text-green-700 ring-green-300 dark:bg-green-950 dark:text-green-300 dark:ring-green-800",
  gold: "bg-amber-100 text-amber-700 ring-amber-300 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-800",
};

export default async function CertificationsPage() {
  const { user, org } = await getCurrentUser();
  const certs = await getCertificationsOverview(org.id, user.id);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Certifications"
        description="Earn certifications by completing drills and building competency. Progress is tracked automatically."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        {certs.map((cert) => (
          <Card key={cert.id} className="flex flex-col">
            <CardHeader>
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full ring-2",
                    BADGE_RING[cert.badgeColor] ?? BADGE_RING.blue,
                  )}
                >
                  <Award className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-base">{cert.name}</CardTitle>
                  <CardDescription className="mt-1">{cert.description}</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col gap-4">
              {/* Current user's standing */}
              <div className="rounded-lg border p-3">
                {cert.self.status === "earned" ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-medium text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-4 w-4" />
                      Earned {cert.self.earnedAt ? formatDate(cert.self.earnedAt) : ""}
                    </span>
                    {cert.self.userCertId && (
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/certifications/${cert.id}/${user.id}`}>View certificate</Link>
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        {cert.self.status === "not_started" ? "Not started" : "In progress"}
                      </span>
                      <span className="tabular-nums">{Math.round(cert.self.progress * 100)}%</span>
                    </div>
                    <Progress value={cert.self.progress * 100} />
                  </div>
                )}
              </div>

              {/* Holders */}
              <div className="mt-auto">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  {cert.holders.length} holder{cert.holders.length === 1 ? "" : "s"}
                </p>
                {cert.holders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No one has earned this yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {cert.holders.map((h) => (
                      <li key={h.userId} className="flex items-center justify-between text-sm">
                        <Link href={`/certifications/${cert.id}/${h.userId}`} className="hover:underline">
                          {h.name}
                        </Link>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          {h.expiresAt && <span>exp. {formatDate(h.expiresAt)}</span>}
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 tabular-nums",
                              BAND_CLASSES[h.score != null && h.score >= 70 ? "green" : "yellow"],
                            )}
                          >
                            {h.score == null ? "—" : Math.round(h.score)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
