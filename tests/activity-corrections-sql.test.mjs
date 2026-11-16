import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { shiftActivityDay, stockholmActivityDay } from '../shared/activity-streak.js'

// Optional real PostgreSQL/PLpgSQL verification without a production connection
// or a new application dependency. Set this to an installed PGlite entry point.
test('PostgreSQL: migration permissions, duplicate safety and atomic audit rollback', { skip: !process.env.SIMKOLL_PGLITE_MODULE }, async t => {
  const { PGlite } = await import(process.env.SIMKOLL_PGLITE_MODULE)
  const db = new PGlite()
  const actor = '22222222-2222-4222-8222-222222222222', profile = '11111111-1111-4111-8111-111111111111', ordinary = '33333333-3333-4333-8333-333333333333'
  const today = stockholmActivityDay(), day = shiftActivityDay(today, -3)
  const correct = (date = day, who = actor, version = 2) => db.query('select public.correct_profile_activity_day($1::uuid, $2::integer, $3::uuid, $4::date, $5::text) as result', [who, version, profile, date, 'Saknad registrering vid testning.'])
  const count = async table => Number((await db.query(`select count(*) as total from public.${table}`)).rows[0].total)
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create table public.coach_accounts(id uuid primary key, display_name text, role text, status text, session_version integer);
      create table public.profiles(id uuid primary key, display_name text, username text, created_at timestamptz);
      create table public.profile_daily_activity(profile_id uuid references public.profiles(id), activity_date date, last_seen_at timestamptz not null default now(), primary key(profile_id, activity_date));
      create table public.audit_logs(id uuid primary key default gen_random_uuid(), event_type text, role text, profile_id uuid, status text, details jsonb);
      create table public.point_events(id uuid); create table public.responses(id uuid);
      insert into public.coach_accounts values('${actor}', 'Demo-admin', 'superadmin', 'active', 2), ('${ordinary}', 'Tränare', 'coach', 'active', 0);
      insert into public.profiles values('${profile}', 'Demo-simmare', 'demo', '2020-01-01T12:00:00Z');`)
    await db.exec(await readFile(new URL('../supabase/migrations/123_profile_activity_corrections.sql', import.meta.url), 'utf8'))
    await t.test('only service-role execution is granted; anonymous/client roles cannot access provenance', async () => {
      for (const role of ['anon', 'authenticated']) {
        await db.exec(`set role ${role}`)
        await assert.rejects(correct(), /permission denied/)
        await assert.rejects(db.query('select * from public.profile_activity_corrections'), /permission denied/)
        await db.exec('reset role')
      }
      await db.exec('set role service_role')
      assert.equal((await correct()).rows[0].result.added, true)
      await db.exec('reset role')
      assert.equal(await count('profile_daily_activity'), 1); assert.equal(await count('profile_activity_corrections'), 1); assert.equal(await count('audit_logs'), 1)
      const audit = (await db.query('select details from public.audit_logs')).rows[0].details
      assert.equal(audit.coachAccountId, actor); assert.equal(audit.activityDate, day)
      assert.equal(await count('point_events'), 0); assert.equal(await count('responses'), 0)
    })
    await t.test('existing registered/corrected dates remain unchanged on retries', async () => {
      const before = (await db.query('select last_seen_at from public.profile_daily_activity')).rows[0].last_seen_at
      assert.equal((await correct()).rows[0].result.added, false)
      assert.equal(await count('profile_activity_corrections'), 1); assert.equal(await count('audit_logs'), 1)
      assert.deepEqual((await db.query('select last_seen_at from public.profile_daily_activity')).rows[0].last_seen_at, before)
      await db.query('insert into public.profile_daily_activity values($1, $2, now())', [profile, today])
      assert.equal((await correct(today)).rows[0].result.added, false)
      assert.equal(await count('profile_activity_corrections'), 1)
    })
    await t.test('SQL independently rejects revoked version, wrong role and future/pre-profile dates', async () => {
      await assert.rejects(correct(day, actor, 1), /Superadmin session required/)
      await assert.rejects(correct(day, ordinary, 0), /Superadmin session required/)
      await assert.rejects(correct(shiftActivityDay(today, 1)), /Invalid activity date/)
      await assert.rejects(correct('2019-12-31'), /Invalid activity date/)
    })
    await t.test('an audit failure rolls back both activity insertion and provenance', async () => {
      await db.exec(`create function public.test_reject_audit() returns trigger language plpgsql as $$ begin raise exception 'Audit unavailable'; end; $$;
        create trigger test_reject_audit before insert on public.audit_logs for each row execute function public.test_reject_audit();`)
      const otherDay = shiftActivityDay(today, -2)
      await assert.rejects(correct(otherDay), /Audit unavailable/)
      assert.equal((await db.query('select * from public.profile_daily_activity where activity_date = $1', [otherDay])).rows.length, 0)
      assert.equal((await db.query('select * from public.profile_activity_corrections where activity_date = $1', [otherDay])).rows.length, 0)
      assert.equal(await count('audit_logs'), 1)
    })
  } finally { await db.close() }
})
