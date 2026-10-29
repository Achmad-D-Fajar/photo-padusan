import type { ReactNode } from "react";
import { documentDateLabel } from "@/lib/legal-documents";

export default function LegalDocument({ title, document, children }: {
  title: string; document: { version: string; revisedOn: string; publishedOn: string | null }; children: ReactNode;
}) {
  return <main className="container mx-auto px-4 py-12 max-w-4xl">
    <header className="mb-10 border-b-8 border-[#111111] pb-6">
      <h1 className="font-display text-3xl sm:text-5xl md:text-7xl font-bold uppercase tracking-tighter break-words mb-6">{title}</h1>
      <p className="font-bold bg-white border-4 border-[#111111] p-4 shadow-[4px_4px_0px_#111111]">{documentDateLabel(document)}<br />Versi: {document.version}</p>
    </header>
    <div className="bg-white border-4 border-[#111111] shadow-[8px_8px_0px_#111111] p-5 sm:p-10 space-y-8 text-base sm:text-lg font-bold leading-relaxed [&_h2]:text-xl [&_h2]:mb-3 [&_h2]:uppercase [&_a]:underline [&_section]:scroll-mt-24">{children}</div>
  </main>;
}
