import { NextResponse } from "next/server";

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json({ success: false, error: error.message }, { status: error.status });
  }
  console.error("[photo-api]", error);
  return NextResponse.json({ success: false, error: "Kesalahan server internal." }, { status: 500 });
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  if (Number(request.headers.get("content-length")) > 16_384) throw new ApiError(413, "Permintaan terlalu besar.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "JSON tidak valid.");
  let text = "";
  let size = 0;
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16_384) { await reader.cancel(); throw new ApiError(413, "Permintaan terlalu besar."); }
      text += decoder.decode(value, { stream: true });
    }
    const body: unknown = JSON.parse(text + decoder.decode());
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "JSON tidak valid.");
  } finally { reader.releaseLock(); }
}
