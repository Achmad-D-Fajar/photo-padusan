// Local-only HTTP fixtures for the real Next.js pages. No deployed services.
const http = require("node:http");
const owner = "11111111-1111-4111-8111-111111111111";
const photoId = n => `22222222-2222-4222-8222-${String(n).padStart(12, "0")}`;
const user = { id: owner, aud: "authenticated", role: "authenticated", email: "fixture@example.test", email_confirmed_at: "2026-10-01T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-10-01T00:00:00Z" };
const profile = { id: owner, display_name: "fotografer", full_name: "Fotografer Uji", bio: "Profil pengujian lokal.", avatar_url: null, microstock_url: null, whatsapp: null, public_email: null, created_at: "2026-10-01T00:00:00Z" };
const photos = Array.from({ length: 6 }, (_, i) => ({
  id: photoId(i + 1), user_id: owner, caption_id: `Sawah Padusan ${i + 1}`, caption_en: `Rice fields ${i + 1}`,
  tags_id: ["sawah", "padusan"], tags_en: ["field", "padusan"], tags_id_text: "sawah padusan", tags_en_text: "field padusan",
  microstock_url: i > 0 && i < 4 ? "https://provider.example/listing" : null,
  status: i === 4 ? "draft" : i === 5 ? "archived" : "published", created_at: "2026-10-20T00:00:00Z",
  thumbnail_url: "http://127.0.0.1:54321/sample.svg", image_url: `http://127.0.0.1:54321/storage/v1/object/public/originals/${owner}/original.jpeg`,
  display_name: profile.display_name, full_name: profile.full_name,
}));
const histories = photos.map((photo, i) => ({ photo_id: photo.id, legacy_cc_possible: i === 1, first_free_published_at: i === 0 || i === 2 ? "2026-10-29T00:00:00Z" : null }));
function session() {
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const expires = Math.floor(Date.now() / 1000) + 3600;
  return { access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: owner, aud: "authenticated", role: "authenticated", exp: expires, iat: expires - 3600 })}.fixture-signature`, token_type: "bearer", expires_in: 3600, expires_at: expires, refresh_token: "fixture-refresh-token", user };
}
http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "http://127.0.0.1:3100");
  res.setHeader("Access-Control-Allow-Headers", req.headers["access-control-request-headers"] ?? "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  const url = new URL(req.url, "http://127.0.0.1:54321");
  function json(value, status = 200) { res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value)); }
  if (url.pathname === "/health") return json({ ok: true });
  if (url.pathname === "/sample.svg") {
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400"><rect width="600" height="400" fill="#44aa99"/><path d="M0 300L170 120L350 300L480 170L600 300V400H0" fill="#117733"/><text x="160" y="350" fill="white" font-size="32">Pratinjau lokal Padustock</text></svg>');
  }
  let raw = "";
  for await (const chunk of req) raw += chunk;
  const body = raw ? JSON.parse(raw) : {};
  if (url.pathname === "/auth/v1/token") return json(session());
  if (url.pathname === "/auth/v1/user") return json(user);
  if (url.pathname === "/auth/v1/admin/users") return json({ ...user, app_metadata: body.app_metadata ?? {} });
  if (url.pathname.startsWith("/rest/v1/")) {
    const table = url.pathname.split("/").pop();
    let rows = table === "photos" ? photos : table === "vw_public_photos" ? photos.filter(photo => photo.status === "published") : table === "photo_license_history" ? histories : table === "profiles" ? [profile] : [];
    for (const [key, value] of url.searchParams) {
      if (value.startsWith("eq.")) rows = rows.filter(row => String(row[key]) === value.slice(3));
      if (value.startsWith("ilike.")) rows = rows.filter(row => String(row[key]).toLowerCase() === value.slice(6).toLowerCase());
      if (value.startsWith("in.(")) { const values = value.slice(4, -1).split(","); rows = rows.filter(row => values.includes(row[key])); }
    }
    if (req.method === "PATCH") {
      for (const row of rows) {
        Object.assign(row, body);
        const history = histories.find(history => history.photo_id === row.id);
        if (history && row.status === "published" && !row.microstock_url) history.first_free_published_at ??= new Date().toISOString();
      }
    }
    if (req.method === "POST") rows = [body];
    res.setHeader("Content-Range", `0-${Math.max(0, rows.length - 1)}/${rows.length}`);
    if ((req.headers.accept ?? "").includes("application/vnd.pgrst.object+json")) {
      return rows.length ? json(rows[0]) : json({ code: "PGRST116", message: "No rows", details: "The result contains 0 rows" }, 406);
    }
    return json(rows.slice(0, Number(url.searchParams.get("limit") ?? rows.length)));
  }
  return json({ error: "Unimplemented local fixture endpoint" }, 404);
}).listen(54321, "127.0.0.1", () => console.log("Local Supabase fixtures on 127.0.0.1:54321"));
