import test from 'node:test'
import assert from 'node:assert/strict'
import { calendarActivityKey } from '../shared/planning-calendar.js'
process.env.SUPABASE_URL = 'https://calendar-visibility.invalid'
process.env.SUPABASE_SECRET_KEY = 'fixture'
process.env.COACH_SESSION_SECRET = 'visibility-fixture'
const { createCoachToken } = await import('../server/coach-auth.js')
const { default: handler } = await import('../api/workouts.js')
const code = createCoachToken({ id: '22222222-2222-4222-8222-222222222222', role: 'coach', email: 'coach@example.invalid' })
const date = '2026-11-15', item = { calendarId: 'junior', uid: 'one', date, time: '14:00', title: 'Träning', targetGroups: ['junior'] }
const key = calendarActivityKey(item), json = value => new Response(JSON.stringify(value))
const call = async (body, token = code, method = 'POST') => {
  const response = { setHeader() {}, status(code) { this.code = code; return this }, json(data) { this.data = data; return this } }
  await handler({ method, headers: { 'x-simkoll-code': token }, body: method === 'POST' ? body : undefined, query: method === 'GET' ? body : {} }, response)
  return response
}
test('coach can hide and restore an occurrence; planning and import lists respect persistent suppression', async () => {
  const original = globalThis.fetch, writes = []; let hidden = [], linked = false
  globalThis.fetch = async (raw, options = {}) => {
    const url = new URL(raw), table = url.pathname.split('/').at(-1), method = options.method || 'GET'
    if (url.hostname === 'visibility-feed.invalid') return new Response(['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:one', 'DTSTART:20261115T140000', 'DTEND:20261115T160000', 'SUMMARY:Träning', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n'))
    if (method !== 'GET') writes.push({ table, method })
    if (table === 'sportadmin_hidden_activities') {
      if (method === 'POST') hidden = JSON.parse(options.body)
      if (method === 'DELETE') hidden = []
      return json(hidden)
    }
    if (table === 'app_settings') return json([{ setting_value: { sportAdminCalendars: [{ id: 'junior', url: 'https://visibility-feed.invalid/feed', groups: ['junior'] }] } }])
    if (table === 'training_plans') return json(linked ? [{ id: 'plan', plan_date: date, activity_type: 'swim', title: 'Saved', target_groups: ['junior'], calendar_link: { mode: 'linked', key }, source_workout_id: 'published' }] : [])
    if (['daily_workouts', 'training_cycles', 'training_programs'].includes(table)) return json([])
    throw Error(`Unexpected ${table}`)
  }
  const body = { action: 'set-calendar-visibility', date, keys: [key], hidden: true }
  try {
    assert.equal((await call(body, '')).code, 403)
    assert.equal(writes.length, 0)
    linked = true
    const warning = await call(body)
    assert.equal(warning.code, 409); assert.equal(warning.data.needsConfirmation, true)
    assert.equal(writes.length, 0)
    assert.equal((await call({ ...body, confirmLinked: true })).code, 200)
    linked = false
    const planning = await call({ planning: 'true' }, code, 'GET')
    assert.equal(planning.code, 200); assert.equal(planning.data.sportAdminActivities.length, 0)
    assert.equal(planning.data.hiddenCalendarActivities[0].calendarKey, key)
    const importChoices = await call({ occasionChoices: 'true', includePlanning: 'true', date }, code, 'GET')
    assert.equal(importChoices.code, 200); assert.equal(importChoices.data.occasions.length, 0)
    assert.equal((await call({ ...body, hidden: false })).code, 200)
    assert.equal((await call({ planning: 'true' }, code, 'GET')).data.sportAdminActivities.length, 1)
    assert.ok(writes.every(write => write.table === 'sportadmin_hidden_activities'))
  } finally { globalThis.fetch = original }
})
