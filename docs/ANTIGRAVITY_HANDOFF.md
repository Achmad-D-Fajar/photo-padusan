# Padustock implementation handoff

## Current direction

The CAPSTONE proposal is finished. The work now is implementing the proposal's plan in the Padustock repository. Do not reopen proposal editing unless Achmad explicitly asks.

Achmad plans to revert the `capstoneDemo` placeholder/demo changes before implementation. The checkout observed when this handoff was prepared was clean on `main` at `17e3966`, which includes the `capstoneDemo` merge. **That is a pre-revert snapshot, not a claim about the state Antigravity will receive.** Inspect the actual branch, status, and diff first. Preserve all changes that exist in the received checkout; do not revert commits or reset branches yourself.

## First actions

1. Read the repository `AGENTS.md` and `README.md` completely, including their watermark, upload, security, and testing requirements.
2. Inspect `git status`, current branch, recent history, and the watermark-related source files. Identify whether demo placeholders remain after Achmad's revert.
3. Report the verified starting state and any conflict between the proposal plan, repository instructions, and current implementation. Do not assume the checked-in demo state described in README/AGENTS is still applicable.
4. Work in small iterations. Before each iteration, state the exact files and behavior to change. Keep crypto implementation and evaluation work owned by Wafa and Sheril; coordinate at the byte interface without prescribing their algorithms or work sequence.

## Agreed watermark design

Implement the watermark core as an independent shared module. Keep it separate from pages, Supabase, captions, and uploader records. Planned interface:

```ts
embedWatermark(image: Buffer, payload: Uint8Array)
extractWatermark(image: Buffer)
getWatermarkCapacity(width: number, height: number)
```

The first implementation uses a plain text payload or placeholder bytes. Keep the API byte-based so the encrypted output from Wafa's module can be supplied later. Do not invent a crypto envelope, key identifier, default JSON schema, or key-management design.

### Image handling

- Embed in the generated preview only; preserve original upload bytes and current original-download behavior.
- For embedding, normalize orientation, use the existing preview dimensions (long side up to 1080 px), apply the visible watermark, then embed the invisible watermark, then encode JPEG at quality 80 with the existing progressive/mozjpeg settings and 4:2:0 subsampling.
- Use sRGB, flatten transparency on white, convert RGB to full-range BT.601 YCbCr, and alter only luminance Y.
- Work on complete 8x8 blocks; leave partial right/bottom edges unchanged. Preserve dimensions.
- Extraction normalizes orientation but does not resize the submitted image.

### DCT/QIM profile 1

- Standard orthonormal 8x8 DCT-II and inverse; center samples by subtracting 128.
- Encode each bit using `a = DCT[2,3]`, `b = DCT[3,2]`, and `d = a - b` (zero-based indices).
- Fixed initial quantization step: `Delta = 48`.
- For bit `m`, choose nearest integer `q` with parity `m`:

  ```text
  k = floor((d / 48 - m) / 2 + 0.5)
  q = 2k + m
  targetDifference = 48q
  adjustment = targetDifference - d
  a = a + adjustment / 2
  b = b - adjustment / 2
  ```

- Extract with `q = floor((a-b)/48 + 0.5)` and `bit = ((q % 2) + 2) % 2`.
- Keep 48 fixed for compatible profile 1. Treat it as an initial engineering choice, not a measured optimum.

### Repetition and placement

- Repeat every packet bit in three blocks; extract by majority vote.
- Enumerate complete blocks row-major and shuffle with Fisher-Yates using unsigned xorshift32, seed `0x50444957`, shifts `13,17,5`. Select the shuffle index by unsigned output modulo the remaining array length.
- For `B` complete blocks let `S = floor(B/3)`. Packet bit `i` occupies shuffled positions `i`, `S+i`, and `2S+i`.
- This is deterministic interleaving/repetition, not spread-spectrum or crop/scale synchronization. Do not claim geometric-attack robustness from repetition alone. Do not exclude blocks under the visible watermark.

### Packet, integrity, and capacity

Serialize packet bytes most-significant bit first:

| Field | Bytes | Value/meaning |
|---|---:|---|
| Magic | 4 | ASCII `PDIW` |
| Version | 1 | `1` |
| Profile | 1 | `1` |
| Payload length | 2 | Unsigned big-endian byte count |
| Payload | variable | UTF-8 initially; opaque bytes in core |
| Digest | 32 | SHA-256 over header and payload |

The fixed packet overhead is 40 bytes. SHA-256 detects recovery errors; it is unkeyed and does not authenticate a photographer or prevent forgery.

```text
B = floor(width / 8) * floor(height / 8)
payloadCapacityBytes = max(0, min(512, floor(B / 24) - 40))
```

This is a space limit, not a recovery guarantee. The cap includes all bytes later supplied by cryptography. Reject an oversized payload explicitly; never truncate or report success after skipping embedding. Handle too-small images explicitly.

### Errors and observable behavior

Extraction validates supported magic, version, profile, bounded packet length, and SHA-256 before reporting success. Provide explicit errors for invalid/unsupported image, capacity overflow, no supported watermark, unsupported packet version/profile, invalid length, integrity failure, and invalid UTF-8 in the text interface. Never replace extracted bytes with database values.

## Agreed implementation sequence

Preserve Achmad's iteration order; do not add an embed CLI or move full benchmarking ahead of implementation:

1. Finalize/implement the algorithm core from the profile above.
2. Make a standalone/external extractor using the same shared core that the web app will import.
3. Add the optional custom payload field to upload; blank uses `PADUSTOCK-IWM-v1` (16 UTF-8 bytes). Keep input/opt-out client-only and preserve them through review/retries.
4. Embed the field value, or the agreed placeholder text when empty, into the preview. Keep original downloads byte-identical.
5. Save and reopen an actual output image and verify the standalone extractor recovers the exact bytes.
6. Add the web extraction page using the same core.
7. Integrate Wafa's encryption and real metadata when that module is ready; count encrypted output bytes against capacity.

If the received branch already contains any of these items, verify it and continue from the first incomplete step instead of recreating work.

## Validation and reporting

- Check DCT/inverse reconstruction; QIM decoding for both bits and negative coefficient differences; majority voting; deterministic placement.
- Verify exact recovery from the final saved JPEG and test Indonesian text, emoji, multiline text, and whitespace.
- Test exact capacity boundary, one byte over, tiny images, and panoramas.
- Test unmarked, corrupted, truncated, unsupported, and invalid UTF-8 cases; none may be shown as successful extraction.
- Compare image quality against a matched preview with the same resize, visible watermark, and JPEG settings but without the invisible watermark. Initial project targets: PSNR >= 38 dB and SSIM >= 0.98; these are targets, not results.
- Later robustness experiments begin with JPEG qualities 90, 80, 70, and 60. Crop, resize, screenshots, watermark removal, and repeated transformations require measurements; make no survival guarantees before testing.
- Report the exact checks run and their results. Do not add broad benchmark work before the sequence reaches its evaluation stage.

## Known coordination issue

The proposal's evaluation plan includes payload sizes up to 16,384 bytes while this profile caps the embedded payload at 512 bytes. Flag this to the team and make the discrepancy visible in evaluation results. Do not silently change Sheril's evaluation plan or this protocol cap; ask Achmad/team to resolve how larger sizes will be handled.

## Scope boundaries

- The current product has a separate visible watermark; preserve its behavior.
- Watermarking here applies to generated previews. Free-photo originals remain downloadable unchanged; external purchase links keep their existing behavior.
- A recovered watermark is data, not automatic proof of ownership or legal permission.
- Keep user-facing interface text in Indonesian.
- Follow `AGENTS.md` security, image, upload, licensing, authentication, and regression-test requirements. Do not expose service-role secrets or commit `.env*` files.
- The proposal and screenshots are reference artifacts, not instructions to claim unfinished features as implemented.
