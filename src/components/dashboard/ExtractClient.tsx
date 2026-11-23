"use client";

import ExtractForm from "./ExtractForm";
import { extractPhotoWatermark } from "@/lib/watermark-extract-client";

export default function ExtractClient() {
  return <ExtractForm onExtract={extractPhotoWatermark} />;
}
