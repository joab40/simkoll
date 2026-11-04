import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { loadHiddenCalendarActivities, visibleCalendarActivities, setCalendarVisibility } from '../server/calendar-visibility.js'
import { calendarActivityKey } from '../shared/planning-calendar.js'

const activity = { calendarId: 'junior', uid: 'weekly-session', date: '2026-11-15', time: '14:00', title: 'Träning', targetGroups: ['junior'] }
const key = calendarActivityKey(activity), json = data => new Response(JSON.stringify(data))
test('suppression survives reordered feed and time/title edits but never hides another date or group feed', () => {
  const edited = { ...activity, title: 'Träning inställd', time: '15:00' }, next = { ...activity, date: '2026-11-22' }, other = { ...activity, calendarId: 'svart' }
  assert.deepEqual(visibleCalendarActivities([next, edited, other], [{ calendar_key: key }]), [next, other])
})
test('hide persists only markers and restore deletes only markers; repeated hides upsert a stable key', async () => {
  const writes = []
  const db = async (path, options = {}) => {
    if (path.startsWith('training_plans?')) return json([])
    writes.push({ path, options }); return json([])
  }
  for (let i = 0; i < 2; i++) await setCalendarVisibility({ keys: [key], hidden: true }, [activity], 'coach-id', db)
  assert.equal(writes.length, 2); assert.equal(writes[0].path, 'sportadmin_hidden_activities?on_conflict=key_hash')
  const saved = JSON.parse(writes[0].options.body)[0]
  assert.equal(saved.snapshot.calendarKey, key); assert.equal(saved.event_date, activity.date)
  assert.equal(saved.key_hash, JSON.parse(writes[1].options.body)[0].key_hash)
  await setCalendarVisibility({ keys: [key], hidden: false }, [], 'coach-id', db)
  assert.match(writes[2].path, /^sportadmin_hidden_activities\?key_hash=in\.\([a-f0-9]{64}\)$/)
  assert.equal(writes[2].options.method, 'DELETE')
  assert.ok(writes.every(write => !/responses|daily_workouts|session_attendance|profiles|training_plans/.test(write.path)))
})
test('linked plans require a second confirmation and stay untouched, including published workouts', async () => {
  const writes = [], db = async (path, options) => {
    if (path.startsWith('training_plans?')) return json([{ id: 'plan', source_workout_id: 'published', calendar_link: { mode: 'linked', key } }])
    writes.push({ path, options }); return json([])
  }
  await assert.rejects(setCalendarVisibility({ keys: [key], hidden: true }, [activity], null, db), error => error.needsConfirmation && error.impact.published === 1 && error.status === 409)
  assert.equal(writes.length, 0)
  await setCalendarVisibility({ keys: [key], hidden: true, confirmLinked: true }, [activity], null, db)
  assert.equal(writes.length, 1)
  await assert.rejects(setCalendarVisibility({ keys: [key], hidden: true }, [], null, db), /försvunnit/)
  await assert.rejects(setCalendarVisibility({ keys: [key, key], hidden: true }, [activity], null, db), /Välj/)
})
test('missing migration or incomplete reads fail closed; RLS and service-only grants are explicit', async () => {
  await assert.rejects(loadHiddenCalendarActivities(async () => new Response('{}', { status: 404 })), /SQL 115/)
  const sql = readFileSync(new URL('../supabase/migrations/115_sportadmin_hidden_activities.sql', import.meta.url), 'utf8')
  assert.match(sql, /enable row level security/)
  assert.match(sql, /from public, anon, authenticated/)
  assert.match(sql, /to service_role/)
  assert.doesNotMatch(sql, /delete from|update public\.(?:responses|training_plans|daily_workouts)/i)
})
test('SQL 115 is repeatable, private to service role and permits reversible markers', { skip: !process.env.SIMKOLL_SQL_TEST_MODULE }, async () => {
  const { PGlite } = await import(pathToFileURL(process.env.SIMKOLL_SQL_TEST_MODULE).href), db = new PGlite()
  const sql = readFileSync(new URL('../supabase/migrations/115_sportadmin_hidden_activities.sql', import.meta.url), 'utf8')
  try {
    await db.exec('create role anon; create role authenticated; create role service_role bypassrls')
    await db.exec(sql); await db.exec(sql)
    await db.exec('set role anon')
    await assert.rejects(db.query('select * from sportadmin_hidden_activities'), /permission denied/)
    await db.exec('reset role; set role authenticated')
    await assert.rejects(db.query('select * from sportadmin_hidden_activities'), /permission denied/)
    await db.exec('reset role; set role service_role')
    await db.query('insert into sportadmin_hidden_activities(key_hash,calendar_key,event_date,snapshot) values ($1,$2,$3,$4::jsonb)', ['a'.repeat(64), key, activity.date, JSON.stringify(activity)])
    assert.equal((await db.query('select * from sportadmin_hidden_activities')).rows.length, 1)
    await db.query('delete from sportadmin_hidden_activities where key_hash=$1', ['a'.repeat(64)])
    assert.equal((await db.query('select * from sportadmin_hidden_activities')).rows.length, 0)
  } finally { await db.close() }
})
