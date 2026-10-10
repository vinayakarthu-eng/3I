import { PrintButton } from "@/components/certifications/print-button";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/current-user";
import { getCertificate } from "@/lib/certifications";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowLeft, Award, QrCode } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

type Props = { params: { certId: string; userId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { org } = await getCurrentUser();
  const cert = await getCertificate(org.id, params.certId, params.userId);
  return { title: cert ? `${cert.certification.name} · ${cert.user.name}` : "Certificate not found" };
}

const SEAL: Record<string, string> = {
  blue: "text-blue-600 border-blue-600",
  purple: "text-purple-600 border-purple-600",
  green: "text-green-600 border-green-600",
  gold: "text-amber-500 border-amber-500",
};

export default async function CertificatePage({ params }: Props) {
  const { org } = await getCurrentUser();
  const cert = await getCertificate(org.id, params.certId, params.userId);
  if (!cert) notFound();

  const seal = SEAL[cert.certification.badgeColor] ?? SEAL.blue;
  const verifyUrl = `https://drillforce.app/verify/${params.certId}/${params.userId}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm" className="-ml-3 text-muted-foreground">
          <Link href="/certifications">
            <ArrowLeft className="h-4 w-4" />
            Certifications
          </Link>
        </Button>
        <PrintButton />
      </div>

      {/* Certificate */}
      <div className="relative overflow-hidden rounded-lg border-[6px] border-double border-foreground/20 bg-card p-10 text-center shadow-sm print:border-foreground/40 print:shadow-none">
        <div className="pointer-events-none absolute inset-3 rounded border border-foreground/10" />

        <div className="relative space-y-6">
          <div className="flex justify-center">
            <span
              className={cn(
                "flex h-20 w-20 items-center justify-center rounded-full border-4",
                seal,
              )}
            >
              <Award className="h-10 w-10" />
            </span>
          </div>

          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
              Certificate of Achievement
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">{cert.certification.name}</h1>
          </div>

          <p className="text-sm text-muted-foreground">This certifies that</p>
          <p className="text-2xl font-medium">{cert.user.name}</p>
          <p className="mx-auto max-w-lg text-sm text-muted-foreground">
            {cert.certification.description}
          </p>

          <div className="flex items-center justify-center gap-10 pt-4 text-sm">
            <div>
              <p className="font-medium tabular-nums">{formatDate(cert.earnedAt)}</p>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Date earned</p>
            </div>
            {cert.expiresAt && (
              <div>
                <p className="font-medium tabular-nums">{formatDate(cert.expiresAt)}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Valid until</p>
              </div>
            )}
            {cert.score != null && (
              <div>
                <p className="font-medium tabular-nums">{Math.round(cert.score)}</p>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg score</p>
              </div>
            )}
          </div>

          <div className="flex items-end justify-between gap-6 pt-8">
            <div className="text-left">
              <div className="h-10 w-40 border-b border-foreground/30" />
              <p className="mt-1 text-xs text-muted-foreground">{org.name} · Drill Program Lead</p>
            </div>

            <div className="flex flex-col items-center gap-1">
              <span className="flex h-16 w-16 items-center justify-center rounded border border-foreground/20 bg-muted">
                <QrCode className="h-10 w-10 text-foreground/60" />
              </span>
              <p className="max-w-[10rem] break-all text-[9px] text-muted-foreground">{verifyUrl}</p>
            </div>

            <div className="text-right">
              <div className="h-10 w-40 border-b border-foreground/30" />
              <p className="mt-1 text-xs text-muted-foreground">DrillForce · Authorized Signature</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
