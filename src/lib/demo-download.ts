// capstoneDemo only: filenames carry scenario references, not image watermark data.
export const DEMO_ATTRIBUTION_CAPTION = "padustock-demo";

export function demoDownloadFilename(caption: string, extension: string, photoId: string, photographerId: string): string {
  const reference = caption === DEMO_ATTRIBUTION_CAPTION ? `-${photoId}-${photographerId}` : "";
  return `${caption}${reference}-padustock.${extension}`;
}

// Browser repeat downloads may add " (1)" before the extension.
export function normalizeDemoFilename(filename: string): string {
  return filename.toLowerCase().replace(/ \(\d+\)(?=\.[^.]+$)/, "");
}

const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const attributionFilename = new RegExp(`^${DEMO_ATTRIBUTION_CAPTION}-(${uuid})-(${uuid})-padustock\\.[a-z0-9]+$`);

export function demoAttributionReference(filename: string): { photoId: string; photographerId: string } | null {
  const match = attributionFilename.exec(normalizeDemoFilename(filename));
  return match ? { photoId: match[1], photographerId: match[2] } : null;
}
