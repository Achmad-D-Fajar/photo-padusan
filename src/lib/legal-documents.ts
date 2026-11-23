export const CC_LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/";
export const OWNERSHIP_REPORT_URL = "https://github.com/Achmad-D-Fajar/photo-padusan/issues";
export const LEGAL_DOCUMENTS = {
  terms: { version: "terms-3", revisedOn: "2026-11-24", publishedOn: null as string | null, href: "/terms" },
  privacy: { version: "privacy-3", revisedOn: "2026-11-24", publishedOn: null as string | null, href: "/privacy" },
} as const;

export interface LegalAcknowledgmentInput {
  accepted: true;
  termsVersion: string;
  privacyVersion: string;
}

export function hasAuthorizedTermsAcceptance(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined,
  requiredTermsVersion: string = LEGAL_DOCUMENTS.terms.version,
  requiredPrivacyVersion: string = LEGAL_DOCUMENTS.privacy.version,
): boolean {
  const ack = user?.app_metadata?.legal_acknowledgment;
  if (!ack || typeof ack !== "object" || Array.isArray(ack)) return false;
  const record = ack as Record<string, unknown>;
  if ("accepted" in record && record.accepted !== true) return false;
  const termsVersion = record.terms_version;
  const privacyVersion = record.privacy_version;
  const acceptedAt = record.accepted_at;
  return (
    typeof termsVersion === "string" &&
    termsVersion === requiredTermsVersion &&
    typeof privacyVersion === "string" &&
    privacyVersion === requiredPrivacyVersion &&
    typeof acceptedAt === "string" &&
    acceptedAt.trim().length > 0 &&
    !Number.isNaN(Date.parse(acceptedAt))
  );
}

export function documentDateLabel(document: { revisedOn: string; publishedOn: string | null }): string {
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    .format(new Date(`${document.publishedOn ?? document.revisedOn}T00:00:00+07:00`));
  return document.publishedOn ? `Diterbitkan: ${date}` : `Revisi disiapkan: ${date} — belum diterbitkan`;
}

export function photoPageUrl(id: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://padustock.vercel.app";
  return `${site}/photo/${id}`;
}
