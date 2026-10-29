export const CC_LICENSE_URL = "https://creativecommons.org/licenses/by-nc-nd/4.0/";
export const OWNERSHIP_REPORT_URL = "https://github.com/Achmad-D-Fajar/photo-padusan/issues";
export const LEGAL_DOCUMENTS = {
  terms: { version: "terms-2", revisedOn: "2026-10-29", publishedOn: null as string | null, href: "/terms" },
  privacy: { version: "privacy-2", revisedOn: "2026-10-29", publishedOn: null as string | null, href: "/privacy" },
} as const;

export function documentDateLabel(document: { revisedOn: string; publishedOn: string | null }): string {
  const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
    .format(new Date(`${document.publishedOn ?? document.revisedOn}T00:00:00+07:00`));
  return document.publishedOn ? `Diterbitkan: ${date}` : `Revisi disiapkan: ${date} — belum diterbitkan`;
}

export function photoPageUrl(id: string): string {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://padustock.vercel.app";
  return `${site}/photo/${id}`;
}
