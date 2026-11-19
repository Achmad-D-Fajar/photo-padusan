"use client";

import ExtractForm from "./ExtractForm";
import { extractDemoPayload } from "@/lib/demo-extraction";

export default function DemoExtractForm() {
  return <div className="space-y-8">
    <aside role="note" className="watermark-panel">
      <h2>Ekstrak Watermark </h2>
    </aside>
    <ExtractForm onExtract={extractDemoPayload} />
  </div>;
}
