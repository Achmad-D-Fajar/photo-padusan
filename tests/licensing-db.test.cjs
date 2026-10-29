const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { PGlite } = require("@electric-sql/pglite");

test("licensing migration enforces history and RLS in local PostgreSQL", async t => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const other = "99999999-9999-4999-8999-999999999999";
  const id = number => `22222222-2222-4222-8222-${String(number).padStart(12, "0")}`;
  // This is a deliberately minimal TEST fixture, not a reconstruction of the
  // deployed view. The migration must leave this existing definition untouched.
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema public, auth to anon, authenticated;
    create table public.photos (id uuid primary key, user_id uuid not null, status text not null, microstock_url text);
    alter table public.photos enable row level security;
    grant select, insert, update, delete on public.photos to authenticated;
    create policy owner_photos on public.photos to authenticated
      using (user_id = auth.uid()) with check (user_id = auth.uid());
    create view public.vw_public_photos with (security_barrier = true) as
      select id, user_id, microstock_url from public.photos where status = 'published';
    grant select on public.vw_public_photos to anon, authenticated;
    insert into public.photos values
      ('${id(1)}', '${owner}', 'published', null),
      ('${id(2)}', '${owner}', 'published', 'https://provider.test/photo'),
      ('${id(3)}', '${owner}', 'draft', null),
      ('${id(4)}', '${other}', 'archived', null);
  `);
  const viewSettings = async () => (await db.query(`select pg_get_viewdef(oid) definition, reloptions,
    has_table_privilege('anon', oid, 'select') anon_read,
    has_table_privilege('authenticated', oid, 'select') authenticated_read
    from pg_class where oid = 'public.vw_public_photos'::regclass`)).rows;
  const before = await viewSettings();
  await db.exec(fs.readFileSync("supabase/migrations/202610290001_photo_licensing.sql", "utf8"));
  const history = async photo => (await db.query("select * from public.photo_license_history where photo_id = $1", [photo])).rows[0];
  async function asRole(role, user, run) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user ?? ""]);
    try { return await run(); }
    finally { await db.exec("reset role"); }
  }
  try {
    await t.test("legacy backfill has uncertainty and no invented timestamps or view changes", async () => {
      const rows = (await db.query("select * from public.photo_license_history")).rows;
      assert.equal(rows.length, 4);
      assert.ok(rows.every(row => row.legacy_cc_possible && row.first_free_published_at === null));
      assert.deepEqual(await viewSettings(), before);
      await db.query("update photos set microstock_url = null where id = $1", [id(1)]);
      assert.equal((await history(id(1))).first_free_published_at, null);
    });
    await t.test("public and owner reads follow existing visibility", async () => {
      const publicRows = await asRole("anon", null, async () => (await db.query("select photo_id from photo_license_history")).rows);
      assert.deepEqual(publicRows.map(row => row.photo_id).sort(), [id(1), id(2)]);
      const ownRows = await asRole("authenticated", owner, async () => (await db.query("select photo_id from photo_license_history")).rows);
      assert.ok(ownRows.some(row => row.photo_id === id(3)));
      assert.ok(!ownRows.some(row => row.photo_id === id(4)));
    });
    await t.test("rollout remains conservative until explicit activation", async () => {
      await db.query("insert into photos values ($1, $2, 'published', 'https://provider.test/old-ui')", [id(5), owner]);
      assert.equal((await history(id(5))).legacy_cc_possible, true);
      await db.exec(fs.readFileSync("scripts/activate-photo-licensing.sql", "utf8"));
      await db.query("insert into photos values ($1, $2, 'published', 'https://provider.test/new')", [id(6), owner]);
      assert.deepEqual(await history(id(6)), { photo_id: id(6), legacy_cc_possible: false, first_free_published_at: null });
      assert.equal((await history(id(5))).legacy_cc_possible, true);
      // Repeating activation must not reclassify new external listings as legacy.
      await db.exec(fs.readFileSync("scripts/activate-photo-licensing.sql", "utf8"));
      assert.equal((await history(id(6))).legacy_cc_possible, false);
    });
    await t.test("direct owner transitions record and preserve the first observed free publication", async () => {
      await asRole("authenticated", owner, async () => {
        await db.query("update photos set microstock_url = null where id = $1", [id(6)]);
      });
      const first = await history(id(6));
      assert.ok(first.first_free_published_at instanceof Date);
      assert.equal(first.legacy_cc_possible, false);
      for (const status of ["draft", "archived", "published"]) {
        await asRole("authenticated", owner, async () => {
          await db.query("update photos set status = $1, microstock_url = 'https://provider.test/new' where id = $2", [status, id(6)]);
        });
        assert.deepEqual(await history(id(6)), first);
      }
      await db.query("update photos set microstock_url = '' where id = $1", [id(6)]);
      assert.deepEqual(await history(id(6)), first);
      await db.query("insert into photos values ($1, $2, 'published', null)", [id(7), owner]);
      assert.ok((await history(id(7))).first_free_published_at);
    });
    await t.test("owners and anonymous callers cannot clear, forge, or delete history or activate policy", async () => {
      for (const role of ["authenticated", "anon"]) {
        for (const sql of [
          "update photo_license_history set legacy_cc_possible = false, first_free_published_at = null",
          "delete from photo_license_history",
          `insert into photo_license_history values ('${id(20)}', false, '2000-01-01')`,
          "update photo_licensing_policy set corrected_policy_active = false",
          "select * from photo_licensing_policy",
          "select public.track_photo_license_history()",
        ]) await asRole(role, owner, async () => {
          await assert.rejects(db.exec(sql), error => error.code === "42501");
        });
      }
    });
    await t.test("whitespace-only links match the browser and download interpretation", async () => {
      for (const [index, link] of ["\t\n", "\u00a0", "\ufeff", "\u2000\u3000"].entries()) {
        await db.query("insert into photos values ($1, $2, 'published', $3)", [id(30 + index), owner, link]);
        assert.ok((await history(id(30 + index))).first_free_published_at);
      }
    });
    await t.test("deletion retains only minimal evidence, hidden from public and former owner", async () => {
      const first = await history(id(7));
      await asRole("authenticated", owner, () => db.query("delete from photos where id = $1", [id(7)]));
      assert.deepEqual(await history(id(7)), first);
      assert.deepEqual(Object.keys(first).sort(), ["first_free_published_at", "legacy_cc_possible", "photo_id"]);
      for (const role of ["anon", "authenticated"]) {
        const rows = await asRole(role, owner, () => db.query("select * from photo_license_history where photo_id = $1", [id(7)]));
        assert.equal(rows.rows.length, 0);
      }
      await db.query("insert into photos values ($1, $2, 'published', 'https://provider.test/re-upload')", [id(7), owner]);
      assert.deepEqual(await history(id(7)), first);
    });
  } finally { await db.close(); }
});
