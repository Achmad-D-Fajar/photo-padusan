// SERVER-ONLY. Never import from Client Components.
// Uses piexifjs (pure JS binary string manipulation) and manual
// IPTC APP13 segment construction — no native binaries required,
// safe for Vercel Serverless Functions.

import piexif from "piexifjs";

export interface EmbedMetadataParams {
  caption: string;
  tags: string[];
  artist: string;       // photographer full_name || display_name
  copyright: string;    // e.g. "© 2025 Etalase Padusan. All rights reserved."
  software?: string;
  dateTime?: string;    // EXIF DateTime format: "YYYY:MM:DD HH:MM:SS"
}

// ─────────────────────────────────────────────────────────────────────────────
// EXIF injection via piexifjs
// ─────────────────────────────────────────────────────────────────────────────

// piexifjs works with ISO-8859-1 ("binary") strings. To preserve UTF-8
// content in EXIF string fields (which are technically ASCII-spec but
// read as UTF-8 by every modern viewer), we encode the UTF-8 bytes as a
// binary string so piexifjs passes them through without corruption.
function utf8AsBinaryString(str: string): string {
  return Buffer.from(str, "utf8").toString("binary");
}

// EXIF DateTime: "YYYY:MM:DD HH:MM:SS"
function nowExifDateTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getUTCFullYear()}:${pad(d.getUTCMonth() + 1)}:${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`
  );
}

function injectExif(jpegBuffer: Buffer, params: EmbedMetadataParams): Buffer {
  const binaryString = jpegBuffer.toString("binary");

  // Build a fresh EXIF object. We do NOT call piexif.load() because
  // Sharp strips all metadata — the input JPEG has no APP1 segment,
  // and piexif.load() throws when no APP1 is present.
  const exifObj: piexif.ExifObj = {
    "0th": {
      [piexif.ImageIFD.ImageDescription]: utf8AsBinaryString(
        params.caption.slice(0, 255)
      ),
      [piexif.ImageIFD.Artist]: utf8AsBinaryString(params.artist.slice(0, 255)),
      [piexif.ImageIFD.Copyright]: utf8AsBinaryString(
        params.copyright.slice(0, 255)
      ),
      [piexif.ImageIFD.Software]: utf8AsBinaryString(
        (params.software ?? "PaduPhoto").slice(0, 255)
      ),
      [piexif.ImageIFD.DateTime]: params.dateTime ?? nowExifDateTime(),
    },
    Exif: {
      [piexif.ExifIFD.DateTimeOriginal]: params.dateTime ?? nowExifDateTime(),
      [piexif.ExifIFD.DateTimeDigitized]: params.dateTime ?? nowExifDateTime(),
    },
    GPS: {},
    Interop: {},
    "1st": {},
    thumbnail: null,
  };

  const exifBytes = piexif.dump(exifObj);

  // piexif.insert() places the new APP1 segment immediately after the
  // SOI marker (FFD8), before any other APP segments. If the buffer
  // already contains an APP1, piexifjs removes it first.
  const newBinaryString = piexif.insert(exifBytes, binaryString);

  return Buffer.from(newBinaryString, "binary");
}

// ─────────────────────────────────────────────────────────────────────────────
// IPTC APP13 injection (pure Buffer manipulation, no external deps)
// ─────────────────────────────────────────────────────────────────────────────
//
// JPEG structure after EXIF injection:
//   FFD8 | FFE1 [EXIF/APP1] | [rest…]
//
// After IPTC injection (we insert right after SOI, piexifjs will have
// already placed EXIF right after SOI):
//   FFD8 | FFE1 [EXIF/APP1] | FFED [IPTC/APP13] | [rest…]
//
// ─── IPTC Record 2 Dataset numbers ───────────────────────────────────────────
//   0x05 (5)   = Object Name / Title      max 64 bytes
//   0x19 (25)  = Keywords                 max 64 bytes, one record per keyword
//   0x50 (80)  = By-Line (credit)         max 32 bytes
//   0x74 (116) = Copyright Notice         max 128 bytes
//   0x78 (120) = Caption / Abstract       max 2000 bytes
// ─────────────────────────────────────────────────────────────────────────────

function safeUtf8(value: string, maxBytes: number): Buffer {
  const buf = Buffer.from(value.trim(), "utf8");
  if (buf.length <= maxBytes) return buf;

  // Truncate at maxBytes without splitting a multi-byte UTF-8 sequence.
  let end = maxBytes;
  while (end > 0 && (buf[end] & 0xc0) === 0x80) end--;
  return buf.slice(0, end);
}

function makeIptcRecord(dataset: number, valueBuffer: Buffer): Buffer {
  // Each IPTC record: 0x1C | 0x02 | dataset | length (2 BE) | value
  const header = Buffer.allocUnsafe(5);
  header[0] = 0x1c;
  header[1] = 0x02;
  header[2] = dataset;
  header.writeUInt16BE(valueBuffer.length, 3);
  return Buffer.concat([header, valueBuffer]);
}

function buildIptcRecords(params: EmbedMetadataParams): Buffer {
  const records: Buffer[] = [];

  // Dataset 0x05 — Object Name / Title (max 64 bytes)
  records.push(makeIptcRecord(0x05, safeUtf8(params.caption, 64)));

  // Dataset 0x78 — Caption / Abstract (max 2000 bytes)
  records.push(makeIptcRecord(0x78, safeUtf8(params.caption, 2000)));

  // Dataset 0x19 — Keywords (one record per keyword, max 64 bytes each)
  // Up to 30 keywords; stock photo sites (Shutterstock, Getty, Adobe)
  // read every 0x19 record as a separate keyword.
  for (const tag of params.tags.slice(0, 30)) {
    const tagBuf = safeUtf8(tag, 64);
    if (tagBuf.length > 0) {
      records.push(makeIptcRecord(0x19, tagBuf));
    }
  }

  // Dataset 0x50 — By-Line / Credit (max 32 bytes)
  records.push(makeIptcRecord(0x50, safeUtf8(params.artist, 32)));

  // Dataset 0x74 — Copyright Notice (max 128 bytes)
  records.push(makeIptcRecord(0x74, safeUtf8(params.copyright, 128)));

  return Buffer.concat(records);
}

function buildApp13Segment(iptcData: Buffer): Buffer {
  // ── Photoshop 3.0 resource block ─────────────────────────────────────────
  // "Photoshop 3.0\0": 14 bytes
  const photoshopId = Buffer.from("Photoshop 3.0\x00", "binary");

  // Resource block header:
  //   "8BIM"              4 bytes
  //   Resource ID 0x0404  2 bytes  (IPTC-NAA)
  //   Pascal name ""      2 bytes  (0x00 length + 0x00 padding = even)
  //   Data length         4 bytes  (big-endian)
  const bimType = Buffer.from("8BIM");
  const resourceId = Buffer.from([0x04, 0x04]);
  const pascalName = Buffer.from([0x00, 0x00]);
  const dataLengthBuf = Buffer.allocUnsafe(4);
  dataLengthBuf.writeUInt32BE(iptcData.length, 0);

  // IPTC data must be padded to even length inside the resource block.
  const paddedIptcData =
    iptcData.length % 2 !== 0
      ? Buffer.concat([iptcData, Buffer.from([0x00])])
      : iptcData;

  const resourceBlock = Buffer.concat([
    bimType,
    resourceId,
    pascalName,
    dataLengthBuf,
    paddedIptcData,
  ]);

  const app13Payload = Buffer.concat([photoshopId, resourceBlock]);

  // ── APP13 segment header ─────────────────────────────────────────────────
  // Marker:  FF ED      (2 bytes)
  // Length:  2 + content_length   (2 bytes, big-endian)
  const segmentLength = 2 + app13Payload.length;
  const app13Header = Buffer.allocUnsafe(4);
  app13Header[0] = 0xff;
  app13Header[1] = 0xed;
  app13Header.writeUInt16BE(segmentLength, 2);

  return Buffer.concat([app13Header, app13Payload]);
}

function injectIptc(jpegBuffer: Buffer, params: EmbedMetadataParams): Buffer {
  if (jpegBuffer[0] !== 0xff || jpegBuffer[1] !== 0xd8) {
    throw new Error("Input is not a valid JPEG buffer.");
  }

  // Sharp strips all metadata, so there is no existing APP13 to worry about.
  // We insert the new APP13 segment immediately after the SOI (FFD8) marker.
  // Because piexifjs already placed APP1 (EXIF) right after SOI, the final
  // byte order will be:
  //   SOI | APP1 [EXIF] | APP13 [IPTC] | ...
  //
  // This is achieved by inserting APP13 at byte offset 2 (after SOI), while
  // piexifjs has already placed APP1 at offset 2 (pushing everything else
  // to offset 2 + sizeof(APP1)). Our insertion goes after the existing APP1:

  // Find the end of the first APP1 segment (if present) so we insert
  // APP13 right after EXIF, not before it.
  const soi = jpegBuffer.slice(0, 2); // FFD8

  let insertAt = 2; // default: right after SOI

  if (jpegBuffer[2] === 0xff && jpegBuffer[3] === 0xe1) {
    // APP1 present — skip over it so IPTC goes after EXIF
    const app1Length = jpegBuffer.readUInt16BE(4); // includes 2-byte length field
    insertAt = 2 + 2 + app1Length; // SOI + marker(2) + length+content
  }

  const app13Segment = buildApp13Segment(buildIptcRecords(params));

  return Buffer.concat([
    jpegBuffer.slice(0, insertAt),
    app13Segment,
    jpegBuffer.slice(insertAt),
  ]);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Takes a JPEG buffer produced by Sharp (no metadata) and returns a new
 * buffer with EXIF (APP1) and IPTC (APP13) metadata embedded in-memory.
 *
 * Final segment order:
 *   SOI | APP1 [EXIF] | APP13 [IPTC] | APP0 [JFIF, if present] | image data
 *
 * No intermediate files are written to disk — safe for Vercel Serverless.
 */
export function embedMetadata(
  jpegBuffer: Buffer,
  params: EmbedMetadataParams
): Buffer {
  // Step 1: inject EXIF (piexifjs inserts APP1 right after SOI)
  const withExif = injectExif(jpegBuffer, params);

  // Step 2: inject IPTC (we insert APP13 right after APP1)
  const withExifAndIptc = injectIptc(withExif, params);

  return withExifAndIptc;
}