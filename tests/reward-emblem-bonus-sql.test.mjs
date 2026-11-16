import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

test('SQL bonus is atomic, five per Stockholm day, retry safe and service-only', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async t => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE), db = new PGlite()
  const profile = randomUUID(), other = randomUUID(), inactive = randomUUID(), pending = randomUUID(), testProfile = randomUUID()
  const run = async (id = profile, attempt = null) => (await db.query('select public.reward_emblem_bonus($1::uuid, $2::uuid) as result', [id, attempt])).rows[0].result
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table profiles(id uuid primary key, active boolean default true, approval_status text default 'approved', is_test_profile boolean default false);
      create table point_events(id uuid primary key default gen_random_uuid(), profile_id uuid references profiles(id), event_type text, points integer check(points between 1 and 20), source_key text, unique(profile_id,event_type,source_key));
      insert into profiles(id) values('${profile}'),('${other}'),('${inactive}'),('${pending}'),('${testProfile}');
      update profiles set active=false where id='${inactive}'; update profiles set approval_status='pending' where id='${pending}'; update profiles set is_test_profile=true where id='${testProfile}';
      insert into point_events(profile_id,event_type,points,source_key) values('${profile}','daily_active',1,'original');`)
    const migration = await readFile(new URL('../supabase/migrations/129_reward_emblem_bonus.sql', import.meta.url), 'utf8')
    await db.exec(migration)
    await t.test('status is read-only and Swedish midnight including DST is explicit', async () => {
      const status = await run(); assert.equal(status.used, 0); assert.equal(status.total, 1)
      assert.equal(status.date, new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date()))
      assert.match(migration, /for update/); assert.match(migration, /clock_timestamp\(\) at time zone 'Europe\/Stockholm'/)
      const dates = await db.query(`select (t at time zone 'Europe/Stockholm')::date::text as day from unnest(array['2026-11-16 22:59:59Z'::timestamptz,'2026-11-16 23:00:00Z'::timestamptz,'2026-07-01 21:59:59Z'::timestamptz,'2026-07-01 22:00:00Z'::timestamptz]) t`)
      assert.deepEqual(dates.rows.map(row => row.day), ['2026-11-16','2026-11-17','2026-07-01','2026-07-02'])
    })
    const first = randomUUID()
    await t.test('first attempt and retry award exactly one point; database failures roll everything back', async () => {
      assert.equal((await run(profile, first)).awarded, 1)
      const retry = await run(profile, first); assert.equal(retry.awarded, 0); assert.equal(retry.replayed, true); assert.equal(retry.total, 2)
      await db.exec(`create function reject_tap() returns trigger language plpgsql as $$ begin raise exception 'write failure'; end; $$; create trigger reject_tap before insert on reward_emblem_taps for each row execute function reject_tap();`)
      await assert.rejects(run(profile, randomUUID()), /write failure/)
      assert.equal((await run()).total, 2); assert.equal((await run()).used, 1)
      await db.exec('drop trigger reject_tap on reward_emblem_taps')
    })
    await t.test('many queued requests share the five slots, independent of level and device', async () => {
      const results = await Promise.all(Array.from({ length: 20 }, () => run(profile, randomUUID())))
      assert.equal(results.reduce((sum, row) => sum + row.awarded, 0), 4)
      assert.equal((await run()).used, 5); assert.equal((await run()).total, 6)
      assert.equal((await run(other, randomUUID())).used, 1)
    })
    await t.test('a new calendar day resets quota but an old successful request never earns twice', async () => {
      await db.exec(`update reward_emblem_taps set bonus_date=bonus_date-1 where profile_id='${profile}'`)
      const replay = await run(profile, first); assert.equal(replay.used, 0); assert.equal(replay.awarded, 0); assert.equal(replay.replayed, true)
      assert.equal((await run(profile, randomUUID())).used, 1)
      assert.equal((await run()).total, 7)
    })
    await t.test('auth/test state rechecked inside SQL and direct client writes/execute rejected', async () => {
      for (const id of [inactive, pending, testProfile, randomUUID()]) await assert.rejects(run(id, randomUUID()), /Active non-test/)
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`)
        await assert.rejects(run(profile, randomUUID()), /permission denied/)
        await assert.rejects(db.query('select * from reward_emblem_taps'), /permission denied/)
        await db.exec('reset role')
      }
      await db.exec('set role service_role'); assert.equal((await run()).used, 1); await db.exec('reset role')
    })
  } finally { await db.close() }
})
