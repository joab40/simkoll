import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarActivityKey, calendarFormValues, explicitCalendarMatches } from '../shared/planning-calendar.js'
import { swimWorkoutOptions } from '../shared/swim-workout-options.js'
import { buildSwimmerPasses } from '../server/individual-analysis.js'

process.env.SUPABASE_URL = 'https://planning-calendar.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'calendar-fixture'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../api/workouts.js')
const code = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role: 'head_coach', email: 'coach@example.invalid' })
const date = '2026-10-29', id = '11111111-1111-4111-8111-111111111111'
const activity = { calendarId: 'junior', uid: 'training-29', date, time: '18:00', title: 'Träning', location: 'Himlabadet', targetGroups: ['junior'] }
const later = { ...activity, uid: 'camp-29', time: '22:00', title: 'Anmälan sportlovsläger', location: 'Grekland' }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status })
function fixture({ missingColumn = false, reordered = false } = {}) {
  const writes = []
  const event = (item) => ['BEGIN:VEVENT', `UID:${item.uid}`, `DTSTART:${item.date.replaceAll('-', '')}T${item.time.replace(':', '')}00`, `SUMMARY:${item.title}`, `LOCATION:${item.location}`, 'END:VEVENT'].join('\r\n')
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), method = options.method || 'GET'
    if (url.hostname === 'calendar-fixture.invalid') return new Response(['BEGIN:VCALENDAR', ...(reordered ? [later, { ...activity, title: 'Uppdaterad träning' }] : [activity, later]).map(event), 'END:VCALENDAR'].join('\r\n'))
    assert.equal(url.hostname, 'planning-calendar.invalid')
    const table = url.pathname.split('/').at(-1)
    if (method !== 'GET') writes.push({ table, method, body: JSON.parse(options.body) })
    if (table === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [{ id: 'junior', url: 'https://calendar-fixture.invalid/feed', groups: ['junior'] }] } }])
    if (table === 'training_plans' && method !== 'GET') return missingColumn ? json({ code: 'PGRST204' }, 400) : json([{ id, ...JSON.parse(options.body) }])
    throw Error(`Unexpected request ${table}`)
  }
  return writes
}
const body = (extra = {}) => ({ action: 'save-plan', date, activityType: 'swim', title: 'F2 Spec', distanceMeters: 5000, durationMinutes: 120, targetGroups: ['junior'], calendarLink: calendarFormValues(activity).calendarLink, ...extra })
async function call(value, token = code) {
  const response = { setHeader() {}, status(value) { this.code = value; return this }, json(value) { this.data = value; return this } }
  await handler({ method: 'POST', query: {}, body: value, headers: { 'x-simkoll-code': token } }, response)
  return response
}

test('explicit match chooses 18:00 even when there is another PM activity', () => {
  const plan = { date, calendarLink: calendarFormValues(activity).calendarLink }
  assert.deepEqual(explicitCalendarMatches(plan, [activity, later]), [activity])
  assert.deepEqual(explicitCalendarMatches(plan, [{ ...activity, calendarItems: [activity] }, later]).length, 1)
  assert.deepEqual(explicitCalendarMatches({ date, calendarLink: { mode: 'none' } }, [activity]), [])
  assert.equal(explicitCalendarMatches({ date }, [activity]), null)
  assert.deepEqual(explicitCalendarMatches(plan, [later]), [])
})
test('UID and fallback identities do not depend on feed order or display IDs', () => {
  assert.equal(calendarActivityKey(activity), calendarActivityKey({ ...activity, title: 'Nytt namn', time: '18:30', id: 'other-position' }))
  const fallback = { ...activity, uid: null }
  assert.equal(calendarActivityKey(fallback), calendarActivityKey({ ...fallback, id: 'another-index' }))
  assert.notEqual(calendarActivityKey(fallback), calendarActivityKey({ ...fallback, time: '22:00' }))
})
test('an explicit calendar link also determines the slot in check-in and diary', () => {
  const calendarLink = calendarFormValues(activity).calendarLink
  const [option] = swimWorkoutOptions([{ id, date, timeOfDay: '' }], [{ id: 'plan', sourceWorkoutId: id, calendarLink, timeOfDay: 'afternoon', activityType: 'swim' }])
  assert.equal(option.timeOfDay, 'afternoon')
  const [pass] = buildSwimmerPasses({ sessions: [{ session_date: date, activity_type: 'swim', session_slot: 'afternoon_swim' }], responses: [], workouts: [{ id, workout_date: date, time_of_day: 'morning', distance_meters: 5000 }], plans: [{ source_workout_id: id, calendar_link: calendarLink, time_of_day: 'afternoon' }] })
  assert.equal(pass.matchStatus, 'slot')
  assert.equal(pass.timeOfDay, 'afternoon')
  assert.equal(pass.distanceMeters, 5000)
})
test('saving derives canonical time and place and returns the persistent calendar link', async () => {
  const writes = fixture()
  const response = await call(body({ calendarLink: { ...calendarFormValues(activity).calendarLink, time: '22:00', location: 'Forged place' } }))
  assert.equal(response.code, 200)
  assert.equal(response.data.plan.time, '18:00')
  assert.equal(response.data.plan.location, 'Himlabadet')
  assert.equal(response.data.plan.timeOfDay, 'afternoon')
  assert.equal(response.data.plan.calendarLink.key, calendarActivityKey(activity))
  assert.equal(writes.find((item) => item.table === 'training_plans').body.calendar_link.time, '18:00')
})
test('saved key still resolves after feed reordering and event rename', async () => {
  fixture({ reordered: true })
  const response = await call(body({ id }))
  assert.equal(response.code, 200)
  assert.equal(response.data.plan.calendarLink.title, 'Uppdaterad träning')
})
test('none persists and legacy clients do not clear an existing explicit link', async () => {
  let writes = fixture()
  assert.equal((await call(body({ id, calendarLink: { mode: 'none' } }))).code, 200)
  assert.deepEqual(writes.find((item) => item.table === 'training_plans').body.calendar_link, { mode: 'none' })
  writes = fixture()
  const legacy = body(); delete legacy.calendarLink
  assert.equal((await call(legacy)).code, 200)
  assert.equal('calendar_link' in writes.find((item) => item.table === 'training_plans').body, false)
})
test('wrong date, missing event, invalid key and incompatible groups are rejected before writes', async () => {
  for (const extra of [{ date: '2026-10-30' }, { targetGroups: ['ungdom_orange'] }, { calendarLink: { mode: 'linked', key: 'gone' } }, { calendarLink: { mode: 'linked', key: 123 } }]) {
    const writes = fixture()
    assert.equal((await call(body(extra))).code, 400)
    assert.equal(writes.length, 0)
  }
})
test('unauthenticated writes are blocked and missing migration gets an actionable message', async () => {
  let writes = fixture()
  assert.equal((await call(body(), '')).code, 403)
  assert.equal(writes.length, 0)
  fixture({ missingColumn: true })
  const response = await call(body())
  assert.equal(response.code, 503)
  assert.match(response.data.error, /104_planning_calendar_link/)
})
