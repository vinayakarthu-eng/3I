import "server-only";
import {
  and,
  asc,
  awardCertifications,
  certifications,
  computeCertStats,
  db,
  desc,
  eq,
  userCertifications,
  users,
} from "@drillforce/db";
import {
  certProgress,
  type CertRequirements,
  type UserCertStats,
} from "@drillforce/shared";

export async function listCertifications() {
  return db.select().from(certifications).orderBy(asc(certifications.sortOrder));
}

export interface CertHolder {
  userId: string;
  name: string;
  earnedAt: Date;
  expiresAt: Date | null;
  score: number | null;
  status: string;
}

export interface CertOverviewItem {
  id: string;
  name: string;
  description: string;
  requirements: CertRequirements;
  badgeColor: string;
  validForMonths: number;
  holders: CertHolder[];
  /** current user's standing */
  self: { status: "earned" | "in_progress" | "not_started"; progress: number; earnedAt: Date | null; userCertId: string | null };
}

export async function getCertificationsOverview(orgId: string, currentUserId: string) {
  const [certs, holderRows, stats] = await Promise.all([
    listCertifications(),
    db
      .select({
        id: userCertifications.id,
        certificationId: userCertifications.certificationId,
        userId: userCertifications.userId,
        name: users.name,
        earnedAt: userCertifications.earnedAt,
        expiresAt: userCertifications.expiresAt,
        score: userCertifications.score,
        status: userCertifications.status,
      })
      .from(userCertifications)
      .innerJoin(users, eq(users.id, userCertifications.userId))
      .where(eq(users.orgId, orgId))
      .orderBy(desc(userCertifications.earnedAt)),
    computeCertStats(db, orgId),
  ]);

  const selfStats: UserCertStats = stats.get(currentUserId) ?? {
    drills: 0,
    icDrills: 0,
    avgScore: null,
    byCompetency: {},
  };

  const byCert = new Map<string, CertHolder[]>();
  for (const h of holderRows) {
    const list = byCert.get(h.certificationId) ?? [];
    list.push({
      userId: h.userId,
      name: h.name,
      earnedAt: new Date(h.earnedAt),
      expiresAt: h.expiresAt ? new Date(h.expiresAt) : null,
      score: h.score == null ? null : Number(h.score),
      status: h.status,
    });
    byCert.set(h.certificationId, list);
  }

  const items: CertOverviewItem[] = certs.map((cert) => {
    const holders = byCert.get(cert.id) ?? [];
    const own = holders.find((h) => h.userId === currentUserId && h.status === "active");
    const progress = certProgress(cert.requirements, selfStats);
    const ownRecord = holderRows.find(
      (h) => h.certificationId === cert.id && h.userId === currentUserId && h.status === "active",
    );
    return {
      id: cert.id,
      name: cert.name,
      description: cert.description,
      requirements: cert.requirements,
      badgeColor: cert.badgeColor,
      validForMonths: cert.validForMonths,
      holders,
      self: {
        status: own ? "earned" : progress > 0 ? "in_progress" : "not_started",
        progress,
        earnedAt: own?.earnedAt ?? null,
        userCertId: ownRecord?.id ?? null,
      },
    };
  });

  return items;
}

export interface CertificateView {
  certification: { id: string; name: string; description: string; badgeColor: string };
  user: { id: string; name: string };
  earnedAt: Date;
  expiresAt: Date | null;
  score: number | null;
  drillCount: number;
}

export async function getCertificate(
  orgId: string,
  certId: string,
  userId: string,
): Promise<CertificateView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return null;
  const [row] = await db
    .select({
      certId: certifications.id,
      certName: certifications.name,
      certDescription: certifications.description,
      badgeColor: certifications.badgeColor,
      userId: users.id,
      userName: users.name,
      earnedAt: userCertifications.earnedAt,
      expiresAt: userCertifications.expiresAt,
      score: userCertifications.score,
      drillIds: userCertifications.drillIds,
    })
    .from(userCertifications)
    .innerJoin(certifications, eq(certifications.id, userCertifications.certificationId))
    .innerJoin(users, eq(users.id, userCertifications.userId))
    .where(
      and(
        eq(userCertifications.certificationId, certId),
        eq(userCertifications.userId, userId),
        eq(users.orgId, orgId),
      ),
    );
  if (!row) return null;
  return {
    certification: {
      id: row.certId,
      name: row.certName,
      description: row.certDescription,
      badgeColor: row.badgeColor,
    },
    user: { id: row.userId, name: row.userName },
    earnedAt: new Date(row.earnedAt),
    expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    score: row.score == null ? null : Number(row.score),
    drillCount: (row.drillIds as string[]).length,
  };
}

/** Earned certifications for a single user (used on the readiness profile). */
export async function listUserCertifications(userId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return [];
  return db
    .select({
      id: userCertifications.id,
      certificationId: certifications.id,
      name: certifications.name,
      badgeColor: certifications.badgeColor,
      earnedAt: userCertifications.earnedAt,
      expiresAt: userCertifications.expiresAt,
      status: userCertifications.status,
    })
    .from(userCertifications)
    .innerJoin(certifications, eq(certifications.id, userCertifications.certificationId))
    .where(eq(userCertifications.userId, userId))
    .orderBy(asc(certifications.sortOrder));
}

/** Re-evaluate and award certifications for the org (idempotent). */
export async function evaluateCertifications(orgId: string) {
  return awardCertifications(db, orgId);
}
