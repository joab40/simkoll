import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const sql = readFileSync(new URL('../supabase/migrations/112_daily_illness.sql', import.meta.url), 'utf8')

test('daily illness migration is additive, private and cascade-linked without rewriting responses', () => {
  assert.match(sql, /enable row level security/)
  assert.match(sql, /revoke all .* from anon, authenticated/)
  assert.match(sql, /references public.profiles\(id\) on delete cascade/)
  assert.match(sql, /primary key \(profile_id, activity_date\)/)
  assert.doesNotMatch(sql, /\b(update|delete from|drop|truncate)\b/i)
})

test('PostgreSQL validates private daily illness constraints, idempotency and profile erasure', { skip: !process.env.SIMKOLL_SQL_TEST_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.SIMKOLL_SQL_TEST_MODULE).href)
  const db = new PGlite(), owner = '11111111-1111-4111-8111-111111111111'
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls; create table public.profiles (id uuid primary key);')
    await db.exec(sql); await db.exec(sql)
    await db.query('insert into profiles values ($1)', [owner])
    const insert = (date, status, skipped = false) => db.query('insert into profile_daily_illness (profile_id,activity_date,status,skipped) values ($1,$2,$3,$4)', [owner, date, status, skipped])
    await insert('2026-11-01', 'none'); await insert('2026-11-02', null, true)
    await assert.rejects(insert('2026-11-01', 'mild'), /duplicate key/)
    await assert.rejects(insert('2026-11-03', 'sick', true), /check constraint/)
    await assert.rejects(insert('2026-11-03', null), /check constraint/)
    await assert.rejects(insert('2026-11-03', 'diagnosis'), /check constraint/)
    const privileges = (await db.query("select relrowsecurity, has_table_privilege('anon','profile_daily_illness','select') as anon_read, has_table_privilege('authenticated','profile_daily_illness','insert') as user_write from pg_class where oid='profile_daily_illness'::regclass")).rows[0]
    assert.deepEqual(privileges, { relrowsecurity: true, anon_read: false, user_write: false })
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from profile_daily_illness'), /permission denied/)
    await db.exec('reset role; set role service_role')
    assert.equal((await db.query('select count(*)::int as count from profile_daily_illness')).rows[0].count, 2)
    await db.exec('reset role')
    await db.query('delete from profiles where id=$1', [owner])
    assert.equal((await db.query('select count(*)::int as count from profile_daily_illness')).rows[0].count, 0)
  } finally { await db.close() }
})
