import Link from "next/link";
import { CC_LICENSE_URL } from "@/lib/legal-documents";
import { licensePresentation, type PhotoLicenseHistory, type PhotoStatus } from "@/lib/photo-licensing";

interface PhotoLicenseProps {
  photo: { id: string; microstock_url: string | null; status?: PhotoStatus; license_history?: PhotoLicenseHistory | null };
}

export function LicenseHistoryNotice({ photo }: PhotoLicenseProps) {
  const { historyNotice } = licensePresentation(photo);
  return historyNotice ? <p className="text-sm font-bold leading-relaxed border-l-4 border-[#CC6677] pl-3">{historyNotice} <Link className="underline" href="/terms#riwayat-cc">Tentang riwayat CC</Link>.</p> : null;
}

export function PhotoLicenseAction({ photo }: PhotoLicenseProps) {
  const { kind, link } = licensePresentation(photo);
  return <div className="space-y-4" data-testid="photo-license">
    {kind !== "unpublished" && <a href={link ?? `/api/photos/download/${photo.id}`} download={kind === "free"}
      target={link ? "_blank" : undefined} rel={link ? "noopener noreferrer" : undefined}
      className={`btn w-full whitespace-normal h-auto min-h-16 p-4 border-4 border-[#111111] rounded-none font-bold text-xl uppercase shadow-[6px_6px_0px_#111111] ${kind === "free" ? "bg-[#117733] text-white" : "bg-[#332288] text-white"}`}>
      {kind === "free" ? "Download Resolusi Asli" : "Dapatkan Lisensi di Penyedia"}
    </a>}
    {kind === "free" ? <p className="font-bold leading-relaxed text-base">
      Foto ini ditawarkan dengan <a className="underline" href={CC_LICENSE_URL} target="_blank" rel="noopener noreferrer">CC BY-NC-ND 4.0</a>: berikan atribusi kepada fotografer beserta tautan foto dan lisensi, gunakan untuk tujuan nonkomersial, dan jangan membagikan hasil adaptasi. Pengecualian hukum yang berlaku tetap diakui. <Link className="underline" href="/terms#lisensi">Ketentuan penggunaan foto</Link>.
    </p> : kind === "external" ? <p className="font-bold leading-relaxed text-base">
      Pratinjau ini tidak dengan sendirinya memberi izin penggunaan ulang secara umum. Dapatkan lisensi melalui penyedia; izin, biaya, dan batas penggunaannya mengikuti ketentuan yang berlaku di penyedia tersebut. <Link className="underline" href="/terms#lisensi-eksternal">Tentang lisensi eksternal</Link>.
    </p> : <p className="font-bold">Foto draf atau arsip tidak tersedia untuk unduhan publik.</p>}
    <LicenseHistoryNotice photo={photo} />
  </div>;
}

export function OwnerLicenseGuidance({ external }: { external: boolean }) {
  return <div className="text-base font-bold leading-relaxed space-y-2" data-testid="owner-license-guidance">
    <p>{external
      ? "Jika dipublikasikan dengan tautan eksternal, pengunjung diarahkan untuk memperoleh lisensi sesuai ketentuan penyedia. Pratinjau bukan izin penggunaan ulang secara umum."
      : "Jika dipublikasikan tanpa tautan eksternal, foto ditawarkan untuk penggunaan nonkomersial dengan CC BY-NC-ND 4.0."} <a className="underline" href={CC_LICENSE_URL} target="_blank" rel="noopener noreferrer">Baca lisensi CC</a>.</p>
    <p>Menambahkan tautan pembelian, menyimpan sebagai draf, atau mengarsipkan foto tidak mencabut izin CC yang telah diberikan secara sah. <Link className="underline" href="/terms#riwayat-cc">Pelajari ketentuannya</Link>.</p>
  </div>;
}
