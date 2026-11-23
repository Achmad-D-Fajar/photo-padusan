const { test } = require("node:test");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const sharp = require("sharp");
const { loadTs } = require("./helpers/load-ts.cjs");

const core = loadTs("src/lib/watermark/core.ts");
const CLI_PATH = path.resolve("scripts/extract-watermark.mjs");

function createTexturedRgb(width, height, seed = 77) {
  const rgb = Buffer.alloc(width * height * 3);
  let s = seed >>> 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const noise = ((s >>> 24) - 128) * 0.08;
      const off = (y * width + x) * 3;
      rgb[off] = Math.min(255, Math.max(0, Math.round(50 + (150 * x) / width + 15 * Math.sin(x / 17) + noise)));
      rgb[off + 1] = Math.min(255, Math.max(0, Math.round(60 + (140 * y) / height + 15 * Math.cos(y / 19) + noise)));
      rgb[off + 2] = Math.min(255, Math.max(0, Math.round(70 + (120 * (width - x)) / width + noise)));
    }
  }
  return rgb;
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI_PATH, ...args], {
    encoding: options.raw ? undefined : "utf8",
    cwd: options.cwd,
  });
}

test("standalone CLI extracts default, Indonesian, emoji, multiline, and whitespace payloads from saved JPEGs", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "padustock-cli-"));
  try {
    const sourceJpeg = await sharp(createTexturedRgb(640, 480, 12), {
      raw: { width: 640, height: 480, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    // 1. Default payload in text and JSON modes (also test invoking from a different cwd)
    const defaultPath = path.join(tempDir, "default-wm.jpg");
    fs.writeFileSync(defaultPath, await core.embedWatermarkText(sourceJpeg, "PADUSTOCK-IWM-v1"));

    const textRun = runCli([defaultPath], { cwd: tempDir });
    assert.equal(textRun.status, 0, textRun.stderr);
    assert.match(textRun.stdout, /Watermark terdeteksi \(versi 1, profil 1, 16 byte UTF-8\)/);
    assert.ok(textRun.stdout.includes("Payload:\nPADUSTOCK-IWM-v1\n"));

    const jsonRun = runCli([defaultPath, "--json"], { cwd: tempDir });
    assert.equal(jsonRun.status, 0, jsonRun.stderr);
    const jsonOut = JSON.parse(jsonRun.stdout);
    assert.deepEqual(jsonOut, {
      ok: true,
      version: 1,
      profile: 1,
      byteLength: 16,
      validUtf8: true,
      payload: "PADUSTOCK-IWM-v1",
      payloadHex: Buffer.from("PADUSTOCK-IWM-v1", "utf8").toString("hex"),
      payloadBase64: Buffer.from("PADUSTOCK-IWM-v1", "utf8").toString("base64"),
    });

    // 2. Indonesian + emoji + multiline + whitespace payload
    const richText = "  Desa Padusan 🌿\nMojokerto, Jawa Timur\t ";
    const richPath = path.join(tempDir, "rich-wm.jpg");
    fs.writeFileSync(richPath, await core.embedWatermarkText(sourceJpeg, richText));

    const richJson = runCli([richPath, "--json"]);
    assert.equal(richJson.status, 0, richJson.stderr);
    const parsedRich = JSON.parse(richJson.stdout);
    assert.equal(parsedRich.payload, richText);
    assert.equal(parsedRich.byteLength, Buffer.byteLength(richText, "utf8"));

    const richRaw = runCli([richPath, "--raw"], { raw: true });
    assert.equal(richRaw.status, 0);
    assert.deepEqual(richRaw.stdout, Buffer.from(richText, "utf8"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("standalone CLI recovers opaque binary (non-UTF-8) bytes in --raw/--hex/--json and rejects in text mode", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "padustock-cli-bin-"));
  try {
    const sourceJpeg = await sharp(createTexturedRgb(640, 480, 34), {
      raw: { width: 640, height: 480, channels: 3 },
    })
      .jpeg({ quality: 92 })
      .toBuffer();

    const binaryPayload = Uint8Array.from([0x00, 0xff, 0xfe, 0x80, 0x41, 0x7f, 0x0a, 0xde, 0xad, 0xbe, 0xef]);
    const binPath = path.join(tempDir, "binary-wm.jpg");
    fs.writeFileSync(binPath, await core.embedWatermark(sourceJpeg, binaryPayload));

    // Default text mode must fail explicitly with INVALID_UTF8
    const textRun = runCli([binPath]);
    assert.equal(textRun.status, 1);
    assert.equal(textRun.stdout, "");
    assert.match(textRun.stderr, /\[INVALID_UTF8\]/);

    // --raw writes exact opaque bytes with no trailing newline
    const rawRun = runCli([binPath, "--raw"], { raw: true });
    assert.equal(rawRun.status, 0);
    assert.deepEqual(rawRun.stdout, Buffer.from(binaryPayload));

    // --hex writes exact lowercase hex
    const hexRun = runCli([binPath, "--hex"]);
    assert.equal(hexRun.status, 0, hexRun.stderr);
    assert.equal(hexRun.stdout.trim(), Buffer.from(binaryPayload).toString("hex"));

    // --json reports validUtf8: false, payload: null, and exact hex/base64
    const jsonRun = runCli([binPath, "--json"]);
    assert.equal(jsonRun.status, 0, jsonRun.stderr);
    const parsed = JSON.parse(jsonRun.stdout);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.validUtf8, false);
    assert.equal(parsed.payload, null);
    assert.equal(parsed.byteLength, binaryPayload.byteLength);
    assert.equal(parsed.payloadHex, Buffer.from(binaryPayload).toString("hex"));
    assert.equal(parsed.payloadBase64, Buffer.from(binaryPayload).toString("base64"));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("standalone CLI reports explicit errors for unmarked, corrupted, missing files, and bad CLI flags", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "padustock-cli-err-"));
  try {
    // Help flag exits 0
    const helpRun = runCli(["--help"]);
    assert.equal(helpRun.status, 0);
    assert.match(helpRun.stdout, /Penggunaan:/);

    // Missing path / bad flag exits 2
    assert.equal(runCli([]).status, 2);
    assert.equal(runCli(["--unknown"]).status, 2);
    assert.equal(runCli(["a.jpg", "--raw", "--hex"]).status, 2);

    // Nonexistent file exits 1 with FILE_NOT_FOUND
    const missing = runCli([path.join(tempDir, "does-not-exist.jpg"), "--json"]);
    assert.equal(missing.status, 1);
    assert.equal(missing.stdout, "");
    assert.equal(JSON.parse(missing.stderr).code, "FILE_NOT_FOUND");

    // Corrupted / non-image file exits 1 with INVALID_IMAGE
    const corruptPath = path.join(tempDir, "corrupt.jpg");
    fs.writeFileSync(corruptPath, "not an image");
    const corrupt = runCli([corruptPath, "--json"]);
    assert.equal(corrupt.status, 1);
    assert.equal(corrupt.stdout, "");
    assert.equal(JSON.parse(corrupt.stderr).code, "INVALID_IMAGE");

    // Unmarked JPEG exits 1 with NO_WATERMARK
    const unmarkedPath = path.join(tempDir, "unmarked.jpg");
    const unmarkedJpeg = await sharp(createTexturedRgb(640, 480, 91), {
      raw: { width: 640, height: 480, channels: 3 },
    })
      .jpeg({ quality: 80 })
      .toBuffer();
    fs.writeFileSync(unmarkedPath, unmarkedJpeg);

    const unmarkedText = runCli([unmarkedPath]);
    assert.equal(unmarkedText.status, 1);
    assert.equal(unmarkedText.stdout, "");
    assert.match(unmarkedText.stderr, /\[NO_WATERMARK\]/);

    const unmarkedJson = runCli([unmarkedPath, "--json"]);
    assert.equal(unmarkedJson.status, 1);
    assert.equal(unmarkedJson.stdout, "");
    assert.equal(JSON.parse(unmarkedJson.stderr).code, "NO_WATERMARK");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
