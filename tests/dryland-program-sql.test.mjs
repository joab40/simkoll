import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('SQL 111 keeps land/strength separate, commits logs with one day and retains removed-day history', { skip: !process.env.SIMKOLL_TEST_PGLITE_MODULE && 'Set SIMKOLL_TEST_PGLITE_MODULE for isolated Postgres tests' }, async () => {
  const { PGlite } = await import(process.env.SIMKOLL_TEST_PGLITE_MODULE)
  const db = new PGlite(), owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222', land = '33333333-3333-4333-8333-333333333333', strength = '44444444-4444-4444-8444-444444444444', nextLand = '55555555-5555-4555-8555-555555555555'
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create table public.profiles(id uuid primary key, active boolean default true, approval_status text default 'approved');
      create table public.training_programs(id uuid primary key, program_type text, title text, active boolean default true, updated_at timestamptz default now());
      create table public.program_assignments(id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles on delete cascade, program_id uuid references public.training_programs on delete cascade, removed_at timestamptz, unique(program_id,profile_id));
      create table public.personal_training_sessions(id uuid primary key default gen_random_uuid(), profile_id uuid references public.profiles on delete cascade, activity_type text, session_slot text, session_date date, source text, unique(profile_id,session_date,session_slot));
      insert into public.profiles(id) values ('${owner}'),('${other}');
      insert into public.training_programs(id,program_type,title) values ('${land}','dryland','Land'),('${strength}','strength','Styrka'),('${nextLand}','dryland','Land B');
      insert into public.program_assignments(profile_id,program_id) values ('${owner}','${strength}');`)
    const sql = await readFile(new URL('../supabase/migrations/111_dryland_program_logs.sql', import.meta.url), 'utf8')
    await db.exec(sql); await db.exec(sql)
    await db.query('select public.assign_dryland_program($1,$2)', [owner, land])
    assert.equal((await db.query('select count(*) from program_assignments where removed_at is null')).rows[0].count, 2)
    const assignment = (await db.query('select id from program_assignments where program_id=$1', [land])).rows[0].id
    const version = (await db.query('select updated_at from training_programs where id=$1', [land])).rows[0].updated_at
    const day = (await db.query("select (now() at time zone 'Europe/Stockholm')::date::text as day")).rows[0].day
    const save = (pass = 1, profile = owner, data = {}) => db.query('select public.save_dryland_program_log($1,$2,$3,$4,$5,$6,$7,$8,$9)', [profile, assignment, pass, day, data, 'Kommentar', 'Balans', '1. Balans — 30 sek', version])
    // Already completed in the planner: repeated program saves add no day.
    await db.query("insert into personal_training_sessions(profile_id,activity_type,session_slot,session_date,source) values ($1,'dryland','dryland',$2,'manual')", [owner, day])
    await save(); await save(); await save(2)
    assert.equal((await db.query('select count(*) from personal_training_sessions')).rows[0].count, 1)
    assert.equal((await db.query('select count(*) from dryland_program_logs')).rows[0].count, 2)
    await assert.rejects(save(1, other), /DRYLAND_ASSIGNMENT_UNAVAILABLE/)
    await assert.rejects(save(6), /INVALID_DRYLAND_LOG/)
    // A failed log cannot leave a completed day behind (atomic transaction).
    await db.query('delete from personal_training_sessions')
    await assert.rejects(save(3, owner, []), /constraint/)
    assert.equal((await db.query('select count(*) from personal_training_sessions')).rows[0].count, 0)
    assert.equal((await db.query('select count(*) from dryland_program_logs')).rows[0].count, 2)
    // Program edits invalidate the server's previously read version.
    await db.query("update training_programs set updated_at=updated_at+interval '1 second' where id=$1", [land])
    await assert.rejects(save(), /DRYLAND_PROGRAM_CHANGED/)
    await db.query('select public.assign_dryland_program($1,$2)', [owner, nextLand])
    assert.equal((await db.query('select count(*) from program_assignments where removed_at is null')).rows[0].count, 2)
    assert.equal((await db.query('select count(*) from dryland_program_logs')).rows[0].count, 2)
    await assert.rejects(db.query('select public.assign_dryland_program($1,$2)', [owner, strength]), /DRYLAND_PROGRAM_UNAVAILABLE/)
    for (const role of ['anon', 'authenticated']) {
      await db.exec(`set role ${role}`)
      await assert.rejects(db.query('select * from dryland_program_logs'), /permission denied/)
      await assert.rejects(db.query('select public.assign_dryland_program($1,$2)', [owner, land]), /permission denied/)
      await assert.rejects(save(), /permission denied/)
      await db.exec('reset role')
    }
    // Full profile erasure can remove its logs and assignments together.
    await db.query('delete from profiles where id=$1', [owner])
    assert.equal((await db.query('select count(*) from dryland_program_logs')).rows[0].count, 0)
  } finally { await db.close() }
})
