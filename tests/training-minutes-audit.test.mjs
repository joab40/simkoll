import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

const sql = readFileSync(new URL('../supabase/diagnostics/ebba11-training-minutes.sql', import.meta.url), 'utf8')
const executable = sql.replace(/--[^\n]*/g, '').replace(/'(?:''|[^'])*'/g, "''")

test('Ebba audit is one read-only statement, strictly scoped by username', () => {
  assert.doesNotMatch(executable, /\b(update|insert|delete|alter|drop|create|truncate|grant|revoke|call|do)\b/i)
  assert.equal(executable.split(';').filter(s => s.trim()).length, 1)
  assert.match(sql, /select 'ebba11'::text as username/)
  assert.match(sql, /and lower\(p\.username\) = lower\(ltrim\(btrim\(s\.username\), '@'\)\)/)
})

// Optional PostgreSQL/WASM validation, installed outside the application:
// SIMKOLL_SQL_TEST_MODULE=/absolute/path/to/@electric-sql/pglite/dist/index.js node --test tests/training-minutes-audit.test.mjs
test('PostgreSQL audit handles planned times and unresolved links without changing rows', {
  skip: !process.env.SIMKOLL_SQL_TEST_MODULE,
}, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.SIMKOLL_SQL_TEST_MODULE).href)
  const db = new PGlite()
  const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`
  let nextId = 100
  const ebba = uuid(1), other = uuid(2)
  const insert = async (table, row) => {
    const keys = Object.keys(row)
    await db.query(`insert into ${table} (${keys.join(',')}) values (${keys.map((_, i) => `$${i+1}`).join(',')})`, Object.values(row))
  }
  const report = async (date, extra = {}) => {
    const id = uuid(nextId++)
    await insert('responses', { id, profile_id: ebba, activity_date: date,
      created_at: `${date}T18:00:00Z`, activity_type: 'swim', session_slot: 'afternoon_swim',
      planned_completion: 'full', day_type: 'after', rpe: 5, ...extra })
    return id
  }
  const workout = async (date, minutes = 120, extra = {}) => {
    const id = uuid(nextId++)
    await insert('daily_workouts', {id, workout_date: date, duration_minutes: minutes,
      time_of_day: 'afternoon', target_groups: ['Junior'], ...extra})
    return id
  }
  try {
    await db.exec(`
      create table profiles (id uuid primary key, username text, display_name text, training_group text,
        active boolean default true, approval_status text default 'approved', is_test_profile boolean default false);
      create table responses (id uuid primary key, profile_id uuid, activity_date date, created_at timestamptz,
        activity_type text, session_slot text, planned_completion text, activity_minutes numeric,
        rpe numeric, workout_reference text, day_type text, competition boolean);
      create table daily_workouts (id uuid primary key, workout_date date, duration_minutes integer,
        time_of_day text, target_groups text[]);
      create table training_plans (id uuid primary key, plan_date date, activity_type text,
        duration_minutes integer, time_of_day text, target_groups text[], source_workout_id uuid, calendar_link jsonb);
    `)
    await insert('profiles', {id: ebba, username: 'ebba11', display_name: 'Fixture Ebba', training_group: 'Junior'})
    await insert('profiles', {id: other, username: 'other', display_name: 'Other', training_group: 'Junior'})
    await report('2020-01-01', {activity_minutes: 85}); await workout('2020-01-01')
    const selected = await workout('2020-01-02')
    await report('2020-01-02', {workout_reference: `workout:${selected}`})
    const linked = await workout('2020-01-03', 90)
    await report('2020-01-03')
    await insert('training_plans', {id: uuid(nextId++), plan_date: '2020-01-03', activity_type: 'swim',
      duration_minutes: 120, time_of_day: 'afternoon', target_groups: ['Junior'], source_workout_id: linked,
      calendar_link: {mode: 'linked'}})
    await report('2020-01-04'); await workout('2020-01-04'); await workout('2020-01-04')
    await report('2020-01-05'); await workout('2020-01-05', 90); await workout('2020-01-05')
    await report('2020-01-06', {planned_completion: 'partial'}); await workout('2020-01-06')
    await report('2020-01-07', {activity_type: 'strength'})
    await report('2020-01-08', {activity_type: null})
    await report('2020-01-09', {session_slot: null}); await workout('2020-01-09')
    await report('2020-01-10', {workout_reference: `workout:${uuid(9999)}`}); await workout('2020-01-10')
    await report('2020-01-11'); await workout('2020-01-11', 120, {target_groups: ['Other group']})
    const noTime = await workout('2020-01-12', null)
    await report('2020-01-12', {workout_reference: `workout:${noTime}`})
    await report('2020-01-13')
    await insert('training_plans', {id: uuid(nextId++), plan_date: '2020-01-13', activity_type: 'swim',
      duration_minutes: 120, time_of_day: 'afternoon', target_groups: ['Junior']})
    await report('2020-01-14'); await workout('2020-01-14', 120, {time_of_day: null})
    await report('2020-01-15', {planned_completion: null}); await workout('2020-01-15')
    await report('2020-01-16', {rpe: null}); await workout('2020-01-16')
    await report('2020-01-17'); await workout('2020-01-17')
    await report('2020-01-17', {planned_completion: 'no', created_at: '2020-01-17T19:00:00Z'})
    await report('2020-01-18', {activity_minutes: 45})
    await report('2020-01-18', {activity_minutes: 60, created_at: '2020-01-18T19:00:00Z'})
    await report('2020-01-19', {profile_id: other})
    await report('2020-01-20', {profile_id: null})
    await report('2020-01-21', {day_type: 'before'})
    await report('2020-01-22', {competition: true})
    await report('2099-01-01')
    const moved = await workout('2020-01-23')
    await report('2020-01-23')
    await insert('training_plans', {id: uuid(nextId++), plan_date: '2020-01-24', activity_type: 'swim',
      duration_minutes: 120, time_of_day: 'afternoon', target_groups: ['Junior'], source_workout_id: moved,
      calendar_link: {mode: 'linked'}})
    const snapshot = async () => (await db.query(`select jsonb_build_object(
      'profiles', (select jsonb_agg(p order by id) from profiles p),
      'responses', (select jsonb_agg(r order by id) from responses r),
      'workouts', (select jsonb_agg(w order by id) from daily_workouts w),
      'plans', (select jsonb_agg(p order by id) from training_plans p)) as data`)).rows[0].data
    const before = await snapshot()
    await db.exec('begin read only')
    const audit = (await db.query(sql)).rows[0].training_minutes_audit
    const rows = (await db.query(sql.slice(0, sql.lastIndexOf('select jsonb_build_object(')) + 'select * from classified order by activity_date')).rows
    const day = n => rows.find(r => new Date(r.activity_date).toISOString().startsWith(`2020-01-${String(n).padStart(2, '0')}`))
    assert.equal(audit.matchedProfileCount, 1)
    assert.equal(audit.perSwimmer.length, 1)
    assert.equal(audit.reportCount, 18)
    assert.equal(Number(day(1).reported_minutes), 85)
    for (const n of [2, 3, 4, 6, 13, 14, 15, 16]) assert.equal(Number(day(n).usable_planned_minutes), 120, `planned time day ${n}`)
    for (const n of [5, 7, 8, 9, 10, 11, 12, 23]) assert.equal(day(n).usable_planned_minutes, null, `unresolved day ${n}`)
    assert.equal(day(16).has_rpe, false)
    assert.equal(day(17), undefined)
    assert.equal(Number(day(18).reported_minutes), 60)
    assert.equal(audit.missingReportedButUsablePlannedTime, 8)
    assert.equal(audit.partialReportsWithUsablePlannedTime, 1)
    assert.equal(audit.partialPlannedTimeDetails[0].usable_planned_minutes, 120)
    assert.equal(audit.stillMissingUsableTime, 8)
    assert.equal(audit.needsReview.find(r => r.activity_date.startsWith('2020-01-05')).available_passes.length, 2)
    assert.equal(audit.needsReview.find(r => r.activity_date.startsWith('2020-01-09')).available_passes.length, 1)
    assert.deepEqual(await snapshot(), before)
    await db.exec('rollback')
  } finally {
    await db.close()
  }
})
