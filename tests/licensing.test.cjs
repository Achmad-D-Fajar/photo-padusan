const { test } = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const sharp = require("sharp");
const piexif = require("piexifjs");
const { loadTs } = require("./helpers/load-ts.cjs");
const { licensePresentation, photoLicenseJsonLd } = loadTs("src/lib/photo-licensing.ts");
const { LEGAL_DOCUMENTS, CC_LICENSE_URL } = loadTs("src/lib/legal-documents.ts");
const photoId = "22222222-2222-4222-8222-222222222222";
const history = { photo_id: photoId, legacy_cc_possible: false, first_free_published_at: null };
const acknowledgment = { accepted: true, termsVersion: LEGAL_DOCUMENTS.terms.version, privacyVersion: LEGAL_DOCUMENTS.privacy.version };

for (const value of [undefined, null, false, "yes", [], {}, { ...acknowledgment, accepted: false }, { ...acknowledgment, accepted: "true" }, { ...acknowledgment, termsVersion: 2 }, { ...acknowledgment, privacyVersion: null }]) {
  test(`registration rejects invalid legal acceptance ${JSON.stringify(value)}`, async () => {
    const route = loadTs("src/app/api/auth/register/route.ts", { "@/lib/supabase/admin": { createAdminClient: () => assert.fail("Must validate before creating accounts") } });
    const response = await route.POST(new Request("http://localhost/api/auth/register", { method: "POST", body: JSON.stringify({ email: "test@example.test", displayName: "tester", password: "password", legalAcknowledgment: value }) }));
    assert.equal(response.status, 400);
  });
}
test("registration rejects outdated versions before admin operations", async () => {
  const route = loadTs("src/app/api/auth/register/route.ts", { "@/lib/supabase/admin": { createAdminClient: () => assert.fail("Must reject stale version") } });
  for (const key of ["termsVersion", "privacyVersion"]) {
    const response = await route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ legalAcknowledgment: { ...acknowledgment, [key]: "old" } }) }));
    assert.equal(response.status, 409);
  }
});
for (const profileFails of [false, true]) {
  test(`registration stores protected server acknowledgment and ${profileFails ? "rolls it back" : "does not expose it publicly"}`, async () => {
    let created, rolledBack;
    const admin = {
      auth: { admin: { createUser: async input => { created = input; return { data: { user: { id: "user" } }, error: null }; }, deleteUser: async id => { rolledBack = id; return { error: null }; } } },
      from: () => ({ select() { return this; }, ilike() { return this; }, maybeSingle: async () => ({ data: null }), insert: async () => ({ error: profileFails ? { code: "23505", message: "Duplicate" } : null }) }),
    };
    const route = loadTs("src/app/api/auth/register/route.ts", { "@/lib/supabase/admin": { createAdminClient: () => admin, escapeLikePattern: x => x } });
    const start = Date.now();
    const response = await route.POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ email: "test@example.test", displayName: "tester", password: "password", legalAcknowledgment: { ...acknowledgment, accepted_at: "2000-01-01" }, app_metadata: { legal_acknowledgment: "forged" }, user_metadata: { legal_acknowledgment: "forged" } }) }));
    assert.equal(response.status, profileFails ? 409 : 201);
    const record = created.app_metadata.legal_acknowledgment;
    assert.equal(record.terms_version, LEGAL_DOCUMENTS.terms.version);
    assert.equal(record.privacy_version, LEGAL_DOCUMENTS.privacy.version);
    assert.ok(Date.parse(record.accepted_at) >= start && Date.parse(record.accepted_at) <= Date.now());
    assert.deepEqual(Object.keys(record).sort(), ["accepted_at", "privacy_version", "terms_version"]);
    assert.equal(created.user_metadata, undefined);
    assert.equal(rolledBack, profileFails ? "user" : undefined);
    assert.ok(!(await response.text()).includes("legal_acknowledgment"));
  });
}

test("licensing presentation and JSON-LD distinguish current state and historical uncertainty", () => {
  for (const link of [null, "", "   ", "\t\n", "\u00a0", "\ufeff", "\u2000\u3000"]) {
    const free = { microstock_url: link, license_history: history };
    assert.equal(licensePresentation(free).kind, "free");
    assert.equal(photoLicenseJsonLd(free, "https://example.test/photo/id").license, CC_LICENSE_URL);
  }
  for (const h of [history, null, { ...history, legacy_cc_possible: true }, { ...history, first_free_published_at: "2026-10-29T00:00:00Z" }]) {
    const paid = { microstock_url: "https://provider.test/listing", license_history: h };
    const json = photoLicenseJsonLd(paid, "https://example.test/photo/id");
    assert.equal(licensePresentation(paid).kind, "external");
    assert.ok(!Object.hasOwn(json, "license"));
    assert.equal(json.acquireLicensePage, paid.microstock_url);
    if (h?.legacy_cc_possible) assert.match(json.description, /mungkin.*tidak dapat dipastikan/);
    if (h?.first_free_published_at) assert.match(json.description, /29 Oktober 2026/);
    if (!h) assert.match(json.description, /belum dapat dipastikan/);
  }
  for (const status of ["draft", "archived"]) assert.equal(licensePresentation({ status, microstock_url: null }).kind, "unpublished");
});

test("public action component uses matching licensing and account-free download notices", () => {
  const { PhotoLicenseAction } = loadTs("src/components/shared/PhotoLicense.tsx");
  for (const external of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(PhotoLicenseAction, { photo: { id: photoId, microstock_url: external ? "https://provider.test/listing" : null, license_history: history } }));
    if (external) {
      assert.ok(html.includes("https://provider.test/listing"));
      assert.match(html, /tidak dengan sendirinya memberi izin/);
      assert.ok(!html.includes("/api/photos/download"));
    } else {
      assert.ok(html.includes(`/api/photos/download/${photoId}`));
      assert.ok(html.includes(CC_LICENSE_URL));
      assert.match(html, /atribusi.*nonkomersial.*adaptasi/);
      assert.ok(!html.includes('type="checkbox"'));
    }
  }
});

test("legacy notice has no invented date and failed history reads remain unknown", async t => {
  const legacy = licensePresentation({ microstock_url: "https://provider.test/listing", license_history: { ...history, legacy_cc_possible: true } });
  assert.match(legacy.historyNotice, /mungkin/);
  assert.ok(!/\d{4}/.test(legacy.historyNotice));
  t.mock.method(console, "error", () => {});
  const { attachLicenseHistory } = loadTs("src/lib/queries/photo-license-history.ts");
  const rows = await attachLicenseHistory({ from: () => ({ select() { return this; }, in: async () => ({ error: new Error("Unavailable") }) }) }, [{ id: photoId }]);
  assert.equal(rows[0].license_history, null);
  assert.match(licensePresentation({ ...rows[0], microstock_url: "https://provider.test" }).historyNotice, /belum dapat dipastikan/);
});

test("new JPEG preview metadata has attribution and its complete canonical reference without a license grant", async () => {
  const { embedMetadata } = loadTs("src/lib/server/exif-writer.ts");
  const input = await sharp({ create: { width: 10, height: 10, channels: 3, background: "white" } }).jpeg().toBuffer();
  const original = Buffer.from(input);
  const reference = `https://padustock.vercel.app/photo/${photoId}`;
  const output = embedMetadata(input, { artist: "Fotografer", copyright: "© 2026 Fotografer", caption: "Sawah 🌿 ".repeat(100), tags: ["padusan"], photoPageUrl: reference });
  assert.deepEqual(input, original);
  const exif = piexif.load(output.toString("binary"));
  assert.match(exif["0th"][piexif.ImageIFD.ImageDescription], new RegExp(reference));
  assert.equal(exif["0th"][piexif.ImageIFD.Artist], "Fotografer");
  assert.ok(output.includes(Buffer.from(reference)));
  assert.ok(!/All rights reserved|creativecommons.org/.test(output.toString("utf8")));
  assert.equal((await sharp(output).metadata()).format, "jpeg");
});

for (const scenario of ["draft", "archived", "external-with-history", "link-added-before-signing", "unpublished-before-signing", "free-jpeg"]) {
  test(`download server independently enforces ${scenario}`, async () => {
    const owner = "11111111-1111-4111-8111-111111111111";
    let signed = null;
    let sourceColumns = "";
    const published = !["draft", "archived"].includes(scenario);
    const publicPhoto = published ? { id: photoId, user_id: owner, caption_id: "Sawah", microstock_url: scenario === "external-with-history" ? "https://provider.test/listing" : null, license_history: { ...history, first_free_published_at: "2026-10-29T00:00:00Z" } } : null;
    const route = loadTs("src/app/api/photos/download/[id]/route.ts", {
      "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: publicPhoto, error: null }) }) }) },
      "@/lib/supabase/admin": { createAdminClient: () => {
        assert.ok(published && scenario !== "external-with-history");
        return {
          from: () => ({ select(columns) { sourceColumns = columns; return this; }, eq() { return this; }, single: async () => ({ data: scenario === "unpublished-before-signing" ? null : { image_url: `https://example.test/storage/v1/object/public/originals/${owner}/image.jpeg`, microstock_url: scenario === "link-added-before-signing" ? "https://provider.test/new" : null } }) }),
          storage: { from: bucket => ({ createSignedUrl: async (path, seconds, options) => { signed = { bucket, path, seconds, options }; return { data: { signedUrl: "https://example.test/signed-original" }, error: null }; } }) },
        };
      } },
    });
    const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: photoId }) });
    const expected = scenario === "free-jpeg" ? 307 : scenario === "external-with-history" || scenario === "link-added-before-signing" ? 403 : 404;
    assert.equal(response.status, expected);
    if (expected !== 307) assert.equal(signed, null);
    else {
      assert.match(sourceColumns, /microstock_url/);
      assert.equal(response.headers.get("location"), "https://example.test/signed-original");
      assert.equal(response.headers.get("cache-control"), "no-store");
      assert.equal(signed.bucket, "originals");
      assert.ok(signed.path.endsWith(".jpeg"));
      assert.equal(signed.options.download, "sawah-padustock.jpeg");
      assert.equal(signed.seconds, 60);
    }
  });
}
