// Frontend preparation only. This payload is never sent to an image/API writer.
export const DEFAULT_WATERMARK_PAYLOAD = "PADUSTOCK-IWM-v1";
export const MAX_WATERMARK_PAYLOAD_BYTES = 512;

export function watermarkPayload(input: string) {
  const payload = input.trim().length === 0 ? DEFAULT_WATERMARK_PAYLOAD : input;
  const byteLength = new TextEncoder().encode(payload).byteLength;
  return { payload, byteLength, valid: byteLength <= MAX_WATERMARK_PAYLOAD_BYTES };
}
