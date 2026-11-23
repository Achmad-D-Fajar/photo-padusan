const assert = require("node:assert/strict");
const { test } = require("node:test");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { loadTs } = require("./helpers/load-ts.cjs");
const { watermarkPayload, DEFAULT_WATERMARK_PAYLOAD } = loadTs("src/lib/watermark-payload.ts");

test("payload defaults only for blank input and preserves nonblank text exactly", () => {
  for (const input of ["", " \n\t ", "\u00a0"]) {
    assert.equal(watermarkPayload(input).payload, DEFAULT_WATERMARK_PAYLOAD);
  }
  const original = "  Desa 🌿\nPadusan\t ";
  assert.equal(watermarkPayload(original).payload, original);
  assert.equal(watermarkPayload(original).byteLength, Buffer.byteLength(original, "utf8"));
});

test("payload enforces UTF-8 bytes without truncation at the 512-byte boundary", () => {
  for (const [value, valid] of [["a".repeat(512), true], ["a".repeat(513), false], ["🌿".repeat(128), true], ["🌿".repeat(129), false], ["é".repeat(256), true]]) {
    const result = watermarkPayload(value);
    assert.equal(result.payload, value);
    assert.equal(result.byteLength, Buffer.byteLength(value));
    assert.equal(result.valid, valid);
  }
});

test("compact watermark settings expose the default, explanation and opt-out link", () => {
  const { default: Field } = loadTs("src/components/dashboard/WatermarkPayloadField.tsx");
  const render = enabled => renderToStaticMarkup(React.createElement(Field, { value: "", enabled, onChange() {}, onEnabledChange() {} }));
  const output = render(true);
  assert.ok(!output.includes(DEFAULT_WATERMARK_PAYLOAD));
  assert.match(output, /watermark bawaan akan digunakan/);
  assert.match(output, /Edit watermark \(opsional\)/);
  assert.match(output, /rows="2"/);
  assert.match(output, /href="\/about\/hidden-watermark"/);
  assert.match(output, /href="\/about\/hidden-watermark#risiko"/);
  assert.match(output, /akan diterapkan/);
  assert.match(output, /resiko menonaktifkan/);
  assert.ok(!output.includes("Saat ini pengaturan belum diterapkan"));
  assert.ok(!output.includes("pilihan ini hanya untuk pratinjau"));
  assert.ok(!output.includes("<details open"));
  assert.match(render(false), /Teks tetap tersedia/);
  assert.match(render(false), /Aktifkan kembali/);
});

test("result states render honest notices and escaped plain payload text", () => {
  const { default: Result } = loadTs("src/components/dashboard/ExtractionResult.tsx");
  const render = props => renderToStaticMarkup(React.createElement(Result, props));
  assert.match(render({ state: { kind: "empty" } }), /Belum ada hasil/);
  assert.match(render({ state: { kind: "unavailable" } }), /Fitur ekstraksi belum terhubung/);
  assert.match(render({ state: { kind: "processing" } }), /aria-busy="true"/);
  assert.match(render({ state: { kind: "error", message: "Coba lagi" } }), /role="alert"/);
  const payload = "<script>🌿</script>\n  ";
  const byteLength = Buffer.byteLength(payload);
  const output = render({ state: { kind: "success", result: { payload, byteLength } }, copyState: "error", onCopy() {} });
  assert.ok(!output.includes("<script>"));
  assert.match(output, /&lt;script&gt;🌿&lt;\/script&gt;/);
  assert.ok(output.includes(`${byteLength} byte UTF-8`));
  assert.match(output, /salin secara manual/);
});

test("extraction route independently requires an authenticated server session", async () => {
  for (const error of [null, { message: "expired" }]) {
    const { default: page } = loadTs("src/app/dashboard/extract/page.tsx", {
      "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: error ? { id: "owner" } : null }, error }) } }) },
      "@/components/dashboard/ExtractClient": { default: () => null },
      "next/navigation": { redirect: location => { throw new Error(`redirect:${location}`); } },
    });
    await assert.rejects(page(), /redirect:\/login/);
  }
});
