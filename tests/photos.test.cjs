const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");
const userId = "11111111-1111-4111-8111-111111111111";
const uploadPath = `${userId}/22222222-2222-4222-8222-222222222222.heic`;
const request = body => new Request("http://localhost/api/photos/draft", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

function draftHarness(failure) {
  const calls = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
    from: table => ({
      select() { return this; }, eq() { return this; }, insert(data) { calls.push(["insert", data]); return this; },
      single: async () => table === "profiles" ? { data: { display_name: "photographer" } } : { data: failure === "database" ? null : { id: "photo" }, error: failure === "database" ? new Error("Database error") : null },
    }),
    storage: { from: bucket => ({
      info: async () => ({ data: { size: failure === "oversize" ? 50 * 1024 * 1024 + 1 : 100 }, error: null }),
      download: async () => { calls.push(["download"]); return { data: new Blob(["test"]), error: null }; },
      upload: async path => { calls.push(["upload", bucket, path]); return { error: failure === "thumbnail" ? new Error("Upload failed") : null }; },
      move: async (source, destination) => { calls.push(["move", source, destination]); return { error: null }; },
      getPublicUrl: path => ({ data: { publicUrl: `https://example.test/storage/v1/object/public/${bucket}/${path}` } }),
      remove: async paths => { calls.push(["remove", bucket, paths]); return { error: null }; },
    }) },
  };
  const route = loadTs("src/app/api/photos/draft/route.ts", {
    "@/lib/supabase/server": { createClient: async () => supabase },
    "@/lib/supabase/admin": { createAdminClient: () => supabase },
    "@/lib/server/image-processing": { processImageForStorage: async () => {
      calls.push(["process"]);
      if (failure === "decode") throw new Error("Decode failed");
      return { watermarkedBuffer: Buffer.from("jpeg") };
    } },
    "@/lib/server/exif-writer": { embedMetadata: bytes => bytes },
  });
  return { calls, post: path => route.POST(request({ path, caption_en: "Field", caption_id: "Sawah", tags_en: [], tags_id: [], publish_directly: true })) };
}

test("draft rejects other users' upload references", async () => {
  const { calls, post } = draftHarness();
  assert.equal((await post(uploadPath.replace(userId, "another-user"))).status, 400);
  assert.equal(calls.length, 0);
});

test("stored size is checked before downloading or processing", async () => {
  const { calls, post } = draftHarness("oversize");
  assert.equal((await post(uploadPath)).status, 413);
  assert.ok(!calls.some(([name]) => name === "download" || name === "process" || name === "upload"));
  assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
});

test("decode failures create no permanent objects", async () => {
  const { calls, post } = draftHarness("decode");
  assert.equal((await post(uploadPath)).status, 500);
  assert.ok(!calls.some(([name]) => name === "upload" || name === "move"));
  assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
});

test("thumbnail upload failures clean the staged original", async () => {
  const { calls, post } = draftHarness("thumbnail");
  assert.equal((await post(uploadPath)).status, 502);
  assert.ok(calls.some(([name, bucket]) => name === "remove" && bucket === "photo-uploads"));
  assert.ok(!calls.some(([name]) => name === "move"));
});

test("database failures clean staging, thumbnail, and permanent original", async () => {
  const { calls, post } = draftHarness("database");
  assert.equal((await post(uploadPath)).status, 500);
  assert.deepEqual(calls.filter(([name]) => name === "remove").map(([, bucket]) => bucket).sort(), ["originals", "photo-uploads", "thumbnails"]);
});

test("successful publication retains the HEIC extension and free download state", async () => {
  const { calls, post } = draftHarness();
  assert.equal((await post(uploadPath)).status, 201);
  const photo = calls.find(([name]) => name === "insert")[1];
  assert.equal(photo.status, "published");
  assert.equal(photo.microstock_url, null);
  assert.match(photo.image_url, /\.heic$/);
  assert.ok(!calls.some(([name]) => name === "remove"));
});

for (const storageFailure of [false, true]) {
  test(`delete ${storageFailure ? "keeps the database row on storage error" : "removes both image objects before the row"}`, async () => {
    const calls = [];
    const supabase = {
      auth: { getUser: async () => ({ data: { user: { id: userId } }, error: null }) },
      from: () => ({ select() { return this; }, eq() { return this; }, delete() { calls.push("delete-row"); return this; }, single: async () => ({ data: { id: "photo", image_url: `https://example.test/storage/v1/object/public/originals/${userId}/original.heic`, thumbnail_url: `https://example.test/storage/v1/object/public/thumbnails/${userId}/preview.jpg` }, error: null }) }),
      storage: { from: bucket => ({ remove: async () => { calls.push(bucket); return { error: storageFailure ? new Error("Storage unavailable") : null }; } }) },
    };
    const route = loadTs("src/app/api/photos/[id]/route.ts", { "@/lib/supabase/server": { createClient: async () => supabase } });
    const response = await route.DELETE(new Request("http://localhost/api/photos/photo", { method: "DELETE" }), { params: Promise.resolve({ id: "photo" }) });
    assert.equal(response.status, storageFailure ? 500 : 200);
    assert.deepEqual(calls, storageFailure ? ["originals"] : ["originals", "thumbnails", "delete-row"]);
  });
}

test("large downloads redirect to storage with the original file extension", async () => {
  let signed;
  const admin = {
    from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { image_url: `https://example.test/storage/v1/object/public/originals/${userId}/original.heic` } }) }),
    storage: { from: () => ({ createSignedUrl: async (path, seconds, options) => { signed = { path, seconds, options }; return { data: { signedUrl: "https://example.test/download" }, error: null }; } }) },
  };
  const route = loadTs("src/app/api/photos/download/[id]/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ from: () => ({ select() { return this; }, eq() { return this; }, single: async () => ({ data: { id: "photo", user_id: userId, caption_id: "Sawah", microstock_url: null }, error: null }) }) }) },
    "@/lib/supabase/admin": { createAdminClient: () => admin },
  });
  const response = await route.GET(new Request("http://localhost"), { params: Promise.resolve({ id: "22222222-2222-4222-8222-222222222222" }) });
  assert.equal(response.status, 307);
  assert.equal(response.headers.get("location"), "https://example.test/download");
  assert.equal(signed.options.download, "sawah-padustock.heic");
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("editing a published free photo preserves its public status and null purchase URL", async () => {
  let payload;
  const component = loadTs("src/components/dashboard/EditPhotoForm.tsx", {
    react: { useState: initial => [initial, () => {}] },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/lib/supabase/client": { createClient: () => ({ from: () => ({ update: data => {
      payload = data;
      return { eq() { return this; }, select() { return this; }, single: async () => ({ data: { id: "photo" }, error: null }) };
    } }) }) },
  }).default;
  const tree = component({ photo: { id: "photo", user_id: userId, status: "published", caption_id: "Sawah", caption_en: "Field", tags_id: [], tags_en: [], microstock_url: null, thumbnail_url: null } });
  function nodes(value) {
    if (Array.isArray(value)) return value.flatMap(nodes);
    if (!value || typeof value !== "object") return [value];
    return [value, ...nodes(value.props?.children)];
  }
  const all = nodes(tree);
  assert.ok(all.includes("PUBLIK"));
  const publish = all.find(node => node?.type === "button" && node.props.children === "Publikasikan");
  assert.ok(publish);
  await publish.props.onClick();
  assert.equal(payload.status, "published");
  assert.equal(payload.microstock_url, null);
});
