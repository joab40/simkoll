// Optional real Postgres/WASM check without touching the club database.
// SIMKOLL_TEST_PGLITE_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/storage-usage-sql.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('SQL 110 measures metadata, protects access, versions budgets and samples once per day', { skip: !process.env.SIMKOLL_TEST_PGLITE_MODULE && 'Set SIMKOLL_TEST_PGLITE_MODULE to run the isolated Postgres test' }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_TEST_PGLITE_MODULE)
  const db = new PGlite()
  try {
    // pg_cron is a host extension not available inside WASM. Stub only its job
    // registry/schedule; execute all our actual measurement/budget/RLS SQL.
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema storage;
      create table storage.buckets(id text primary key, public boolean);
      create table storage.objects(id integer primary key, bucket_id text, name text, metadata jsonb);
      create schema cron;
      create table cron.job(jobname text primary key, active boolean, schedule text, command text);
      create function cron.schedule(text,text,text) returns bigint language sql as $f$
        insert into cron.job values ($1,true,$2,$3) on conflict(jobname) do update set schedule=$2, command=$3 returning 1::bigint;
      $f$;
      create table public.responses(id integer, private_note text);
      insert into public.responses values (1, 'private swimmer reflection must stay private');
      insert into storage.buckets values ('goal-analysis-videos',false),('goal-analysis-images',false),('empty',false);
      insert into storage.objects values
        (1,'goal-analysis-videos','private-owner/incoming/clip.mp4','{"size":25000000,"mimetype":"video/mp4"}'),
        (2,'goal-analysis-videos','private-owner/poster.jpg','{"size":100000,"mimetype":"image/jpeg"}'),
        (3,'goal-analysis-images','private-owner/name.jpg','{"size":"broken","mimetype":"image/jpeg"}'),
        (4,'goal-analysis-images','private-owner/name.pdf','{"size":1000,"mimetype":"application/pdf"}');`)
    const migration = (await readFile(new URL('../supabase/migrations/110_storage_usage.sql', import.meta.url), 'utf8')).replace('create extension if not exists pg_cron;', '')
    await db.exec(migration)
    // Idempotent migration and named job must not duplicate rows/schedules.
    await db.exec(migration)
    const overview = (await db.query('select public.storage_admin_overview(false) as value')).rows[0].value
    assert.equal(overview.current.fileBytes, 25101000)
    assert.equal(overview.current.fileCount, 4)
    assert.equal(overview.current.unknownSizeCount, 1)
    assert.equal(overview.current.buckets.find((b) => b.id === 'empty').object_count, 0)
    assert.equal(overview.current.kinds.find((k) => k.kind === 'image').unknown_size_count, 1)
    assert.ok(overview.current.areas.some((a) => a.area === 'Simmarprofiler och incheckningar' && a.bytes > 0))
    assert.equal(overview.history.length, 1); assert.equal(overview.dailyScheduleEnabled, true)
    assert.equal(overview.settings.file_budget_bytes, null)
    assert.ok(overview.current.databaseBytes > 0)
    assert.doesNotMatch(JSON.stringify(overview), /private-owner|clip.mp4|private swimmer reflection/)
    assert.equal((await db.query('select count(*) from cron.job')).rows[0].count, 1)

    const settings = (await db.query('select public.set_storage_budgets($1,$2,$3) as value', [500000000, 1000000000, overview.settings.updated_at])).rows[0].value
    assert.equal(settings.file_budget_bytes, 1000000000)
    await assert.rejects(db.query('select public.set_storage_budgets($1,$2,$3)', [null, null, overview.settings.updated_at]), /STORAGE_BUDGET_CONFLICT/)
    await assert.rejects(db.query('select public.set_storage_budgets($1,$2,$3)', [-1, null, settings.updated_at]), /INVALID_STORAGE_BUDGET/)
    assert.equal((await db.query('select count(*) from public.storage_usage_events')).rows[0].count, 1)
    await db.query('select public.capture_storage_usage()')
    assert.equal((await db.query('select count(*) from public.storage_usage_snapshots')).rows[0].count, 1)

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      for (const query of ['select * from public.storage_usage_settings', 'select * from public.storage_usage_events', 'select * from public.storage_usage_snapshots', 'select public.measure_storage_usage()', 'select public.capture_storage_usage()', 'select public.storage_admin_overview(false)', 'select public.set_storage_budgets(null,null,now())']) await assert.rejects(db.query(query), /permission denied/)
      await db.exec('reset role')
    }
    await db.exec('set role service_role')
    assert.equal((await db.query('select public.storage_admin_overview(false) as value')).rows[0].value.current.fileCount, 4)
    await db.exec(`insert into public.storage_usage_events(action,bucket_id,success) values ('upload','test',false)`)
    await assert.rejects(db.query('delete from public.storage_usage_events'), /permission denied/)
    await db.exec('reset role')
  } finally { await db.close() }
})
