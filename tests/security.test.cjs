const { test } = require("node:test");
const assert = require("node:assert/strict");
const { loadTs } = require("./helpers/load-ts.cjs");

function jsonRequest(path, body) {
  return new Request(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

test("JSON-LD round-trips user text without creating script terminators", () => {
  const { serializeJsonLd } = loadTs("src/lib/json-ld.ts");
  const value = { name: '</script><script>alert(1)</script>', tags: ["<img onerror=alert(1)>"] };
  const serialized = serializeJsonLd(value);
  assert.ok(!serialized.includes("<"));
  assert.deepEqual(JSON.parse(serialized), value);
});

for (const valid of [false, true]) {
  test(`username login ${valid ? "sets a session" : "rejects bad credentials"} without returning email`, async () => {
    let credentials;
    const route = loadTs("src/app/api/auth/login/route.ts", {
      "@/lib/supabase/admin": {
        escapeLikePattern: x => x,
        createAdminClient: () => ({
          from: () => ({ select() { return this; }, ilike() { return this; }, maybeSingle: async () => ({ data: { id: "user" }, error: null }) }),
          auth: { admin: { getUserById: async () => ({ data: { user: { email: "private@example.test" } } }) } },
        }),
      },
      "@/lib/supabase/server": { createClient: async () => ({ auth: { signInWithPassword: async value => { credentials = value; return { error: valid ? null : new Error("Wrong password") }; } } }) },
    });
    const response = await route.POST(jsonRequest("/api/auth/login", { identifier: "photographer", password: "test-password" }));
    assert.equal(response.status, valid ? 200 : 401);
    assert.deepEqual(credentials, { email: "private@example.test", password: "test-password" });
    assert.ok(!(await response.text()).includes("private@example.test"));
  });
}

test("translation rejects unauthenticated callers before calling Gemini", async () => {
  let generated = false;
  const route = loadTs("src/app/api/photos/translate/route.ts", {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: null }, error: null }) } }) },
    "@google/generative-ai": { GoogleGenerativeAI: class { getGenerativeModel() { generated = true; throw new Error("Must not run"); } } },
  });
  const response = await route.POST(jsonRequest("/api/photos/translate", { caption_id: "Sawah", tags_id: [] }));
  assert.equal(response.status, 401);
  assert.equal(generated, false);
});

test("AI quota rejects exhausted requests and fails closed on database error", async () => {
  const { consumeAiRequest } = loadTs("src/lib/server/photo-upload.ts");
  await assert.rejects(consumeAiRequest({ rpc: async () => ({ data: false, error: null }) }), error => error.status === 429);
  await assert.rejects(consumeAiRequest({ rpc: async () => ({ data: null, error: new Error("Unavailable") }) }), error => error.status === 503);
});

test("request JSON size limit counts bytes without trusting Content-Length", async () => {
  const { readJson } = loadTs("src/lib/server/api-error.ts");
  await assert.rejects(readJson(jsonRequest("/api/photos/translate", { caption_id: "a".repeat(17000) })), error => error.status === 413);
});
