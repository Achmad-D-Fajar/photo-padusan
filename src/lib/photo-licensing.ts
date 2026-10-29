import { CC_LICENSE_URL } from "./legal-documents";

export interface PhotoLicenseHistory {
  photo_id: string;
  legacy_cc_possible: boolean;
  first_free_published_at: string | null;
}
export type PhotoStatus = "draft" | "published" | "archived";

export function externalLicenseLink(url: string | null | undefined): string | null {
  return url?.trim() || null;
}

export function licensePresentation(photo: { microstock_url: string | null; status?: PhotoStatus; license_history?: PhotoLicenseHistory | null }) {
  const link = externalLicenseLink(photo.microstock_url);
  const kind = photo.status && photo.status !== "published" ? "unpublished" : link ? "external" : "free";
  const history = photo.license_history;
  let historyNotice: string | null = null;
  if (history?.first_free_published_at) {
    const date = new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Jakarta" })
      .format(new Date(history.first_free_published_at));
    historyNotice = `Publikasi gratis tercatat pada ${date}. Izin CC terdahulu tetap berlaku apabila diberikan secara sah dan syarat lisensinya dipenuhi. Tanggal ini bukan kepastian tanggal pemberian izin yang paling awal.`;
  } else if (history?.legacy_cc_possible) {
    historyNotice = "Foto ini mungkin pernah ditawarkan dengan keterangan CC pada tampilan situs sebelumnya. Riwayat dan tanggal pemberiannya tidak dapat dipastikan. Izin CC terdahulu tetap berlaku apabila diberikan secara sah dan syarat lisensinya dipenuhi.";
  } else if (!history) {
    historyNotice = "Riwayat lisensi belum dapat dipastikan. Izin CC terdahulu tetap berlaku apabila pernah diberikan secara sah dan syarat lisensinya dipenuhi.";
  }
  return { kind, link, historyNotice, label: kind === "free" ? "Unduh gratis · CC BY-NC-ND 4.0" : kind === "external" ? "Lisensi melalui penyedia" : "Belum tersedia untuk publik" };
}

export function photoLicenseJsonLd(photo: Parameters<typeof licensePresentation>[0], canonicalUrl: string) {
  const presentation = licensePresentation(photo);
  return {
    ...(presentation.kind === "free" ? { license: CC_LICENSE_URL, acquireLicensePage: canonicalUrl }
      : presentation.kind === "external" ? { acquireLicensePage: presentation.link } : {}),
    usageInfo: `${new URL(canonicalUrl).origin}/terms#lisensi`,
    ...(presentation.historyNotice ? { description: presentation.historyNotice } : {}),
  };
}
