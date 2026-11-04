import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
const migration = readFileSync(new URL('../supabase/migrations/113_weekly_planning_import.sql', import.meta.url), 'utf8')
const dynamicGroups = readFileSync(new URL('../supabase/migrations/114_planning_import_dynamic_groups.sql', import.meta.url), 'utf8')

test('weekly import storage is private and never updates swimmer data', () => {
  assert.match(migration, /enable row level security/)
  assert.match(migration, /revoke all on function .* from public, anon, authenticated/)
  assert.match(migration, /before_state jsonb/)
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(responses|profiles|daily_workouts|session_attendance)\b/i)
  assert.match(dynamicGroups, /select id from public.training_groups where active is true/)
  assert.doesNotMatch(dynamicGroups, /array\['junior'/)
})
test('atomic SQL import protects other groups/published rows, rejects stale snapshots, rolls back and is idempotent', { skip: !process.env.SIMKOLL_SQL_TEST_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.SIMKOLL_SQL_TEST_MODULE).href), db = new PGlite()
  const id = '11111111-1111-4111-8111-111111111111', oldId = '22222222-2222-4222-8222-222222222222', protectedId = '33333333-3333-4333-8333-333333333333', insertId = '44444444-4444-4444-8444-444444444444'
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls;')
    await db.exec(readFileSync(new URL('../supabase/migrations/035_training_plans.sql', import.meta.url), 'utf8'))
    await db.exec(readFileSync(new URL('../supabase/migrations/039_training_groups.sql', import.meta.url), 'utf8'))
    await db.exec("insert into training_groups(id,name,active) values ('junior_elit','Junior Elit',true),('inactive_group','Inactive',false)")
    await db.exec('alter table training_plans add column time_of_day text, add column calendar_link jsonb, add column alternative_group_id uuid, add column source_competition_id uuid; grant select,insert,update,delete on training_plans to service_role;')
    await db.exec(migration); await db.exec(migration)
    await db.exec(dynamicGroups); await db.exec(dynamicGroups)
    await db.query("insert into training_plans(id,plan_date,activity_type,title,target_groups,updated_at) values ($1,'2026-11-09','swim','Old',array['junior','ungdom_orange'],'2026-11-01T00:00:00Z')", [oldId])
    await db.query("insert into training_plans(id,plan_date,activity_type,title,target_groups,source_workout_id,updated_at) values ($1,'2026-11-09','swim','Published',array['junior'],$1,'2026-11-01T00:00:00Z')", [protectedId])
    const snapshot = [{ id: oldId, updatedAt: '2026-11-01T00:00:00Z' }, { id: protectedId, updatedAt: '2026-11-01T00:00:00Z' }]
    const week = { monday: '2026-11-09', mode: 'replace', groups: ['junior'], expected: snapshot }
    const row = { id: insertId, plan_date: '2026-11-09', activity_type: 'swim', title: 'New', time_of_day: 'afternoon', target_groups: ['junior'], distance_meters: 3000, duration_minutes: 120, calendar_link: { mode: 'none' } }
    const call = (weeks = [week], rows = [row], requestId = id, digest = 'a'.repeat(64)) => db.query('select apply_weekly_planning_import($1,$2,$3::jsonb,$4::jsonb,$5::jsonb) as result', [requestId, digest, JSON.stringify(weeks), JSON.stringify(rows), JSON.stringify({ added: rows.length })])
    await db.exec('set role anon')
    await assert.rejects(call(), /permission denied/)
    await assert.rejects(db.query('select * from planning_import_batches'), /permission denied/)
    await db.exec('reset role; set role service_role')
    await assert.rejects(call([{ ...week, expected: [] }]), /Planning changed/)
    await assert.rejects(call([week], [{ ...row, plan_date: '2026-12-01' }]), /Invalid import row/)
    assert.equal((await db.query('select count(*)::int as n from training_plans')).rows[0].n, 2)
    await call()
    const plans = (await db.query('select id,target_groups,title from training_plans order by id')).rows
    assert.equal(plans.length, 3)
    assert.deepEqual(plans.find(plan => plan.id === oldId).target_groups, ['ungdom_orange'])
    assert.equal(plans.find(plan => plan.id === protectedId).title, 'Published')
    assert.equal(plans.find(plan => plan.id === insertId).title, 'New')
    const batch = (await db.query('select * from planning_import_batches')).rows[0]
    assert.equal(batch.before_state.length, 1); assert.equal(batch.before_state[0].title, 'Old')
    await call()
    assert.equal((await db.query('select count(*)::int as n from training_plans')).rows[0].n, 3)
    await assert.rejects(call([week], [row], id, 'b'.repeat(64)), /already used/)
    const dynamicId = '55555555-5555-4555-8555-555555555555'
    await call([{ ...week, groups: ['junior_elit'], expected: [] }], [{ ...row, id: dynamicId, target_groups: ['junior_elit'] }], dynamicId)
    assert.deepEqual((await db.query('select target_groups from training_plans where id=$1', [dynamicId])).rows[0].target_groups, ['junior_elit'])
    await assert.rejects(call([{ ...week, groups: ['inactive_group'], expected: [] }], [], '66666666-6666-4666-8666-666666666666'), /Invalid planning scope/)
  } finally { await db.close() }
})
