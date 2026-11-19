import { photoExtension, validatePhotoFile } from "@/lib/photo-upload";
import { demoAttributionReference, normalizeDemoFilename } from "@/lib/demo-download";
import type { ExtractionOutcome } from "@/components/dashboard/ExtractionResult";

// Fixed sample references for a manually named scenario-1 file. Not real records.
const samplePhotoId = "7f3c2a91-6b84-4d5e-9a27-c0e8f146b392";
export const DEMO_ATTRIBUTION = {
  v: 1,
  photo_id: samplePhotoId,
  photographer_id: "b8e149d2-3c67-4a90-8f25-6d0137a4ce58",
  photographer_name: "Wafa",
  photo_url: `https://padustock.vercel.app/photo/${samplePhotoId}`,
} as const;

// EDIT THESE VALUES to change the displayed text or special filenames.
// These fixed outputs never depend on the text entered in the upload form.
export const DEMO_EXTRACTION = {
  defaultPayload: "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.",
  noWatermarkFilename: "no-watermark-padustock.jpg",
  alternateFilename: "padustock-demo-padustock.jpg",
  alternatePayload: JSON.stringify(DEMO_ATTRIBUTION, null, 2),
  photographerName: DEMO_ATTRIBUTION.photographer_name,
  photoPageBaseUrl: "https://padustock.vercel.app/photo/",
  delayMs: 600,
} as const;

// This is a filename-driven simulation. It never reads or modifies image bytes.
export function resolveDemoExtraction(file: Pick<File, "name">): ExtractionOutcome {
  const filename = normalizeDemoFilename(file.name);
  const stem = filename.replace(/\.[^.]+$/, "");
  const noWatermarkStem = DEMO_EXTRACTION.noWatermarkFilename.replace(/\.[^.]+$/, "");
  const alternateStem = DEMO_EXTRACTION.alternateFilename.replace(/\.[^.]+$/, "");
  if (stem === noWatermarkStem && photoExtension(filename, "")) return { detected: false };
  const reference = demoAttributionReference(filename);
  const payload = reference ? JSON.stringify({
    v: 1,
    photo_id: reference.photoId,
    photographer_id: reference.photographerId,
    photographer_name: DEMO_EXTRACTION.photographerName,
    photo_url: `${DEMO_EXTRACTION.photoPageBaseUrl}${reference.photoId}`,
  }, null, 2) : stem === alternateStem && photoExtension(filename, "")
    ? DEMO_EXTRACTION.alternatePayload : DEMO_EXTRACTION.defaultPayload;
  return { payload, byteLength: new TextEncoder().encode(payload).byteLength };
}

export async function extractDemoPayload(file: File): Promise<ExtractionOutcome> {
  const error = validatePhotoFile(file);
  if (error) throw new Error(error);
  await new Promise<void>(resolve => setTimeout(resolve, DEMO_EXTRACTION.delayMs));
  return resolveDemoExtraction(file);
}
